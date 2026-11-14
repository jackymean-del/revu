package papers

import (
	"context"
	"net/http"
	"slices"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/tenant"
)

// A paper always gives each question its marks. How those marks are then
// entered for an assessment (one a question, one a bit, one a section, or
// the total only) is the administrator's choice on Evaluate exam, made before any
// mark is entered; until they choose, it is one a question.

// partName names the part marks are entered in for a section: its title,
// after its own section's when it is a sub-section.
const partName = `CASE WHEN ps.id IS NULL THEN s.title ELSE left(ps.title || ': ' || s.title, 80) END`

// layParts sets the parts an assessment's marks are entered in from a final
// paper: one a question, one a bit (a question with no bits is still one
// part), one a section (a sub-section holding questions is a part of its
// own), or one total. Only core sections count.
func layParts(ctx context.Context, tx pgx.Tx, orgID, assessmentID, paperID, marksBy string) error {
	if _, err := tx.Exec(ctx, `DELETE FROM part_tags WHERE part_id IN (SELECT id FROM assessment_parts WHERE assessment_id = $1::uuid) AND paper_id IS NOT NULL`, assessmentID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE assessment_parts SET deleted_at = now() WHERE assessment_id = $1::uuid AND deleted_at IS NULL`, assessmentID); err != nil {
		return err
	}
	mode := "sections"
	if marksBy == "total" {
		mode = "total"
	}
	if _, err := tx.Exec(ctx, `UPDATE assessments SET entry_mode = $2, marks_by = $3, updated_at = now() WHERE id = $1::uuid`, assessmentID, mode, marksBy); err != nil {
		return err
	}
	parts := `SELECT $1, $3::uuid, i.seq, 'Q' || i.seq, i.marks FROM paper_items i JOIN paper_sections s ON s.id = i.section_id AND s.kind = 'core'
		 WHERE i.paper_id = $2::uuid ORDER BY i.seq`
	switch marksBy {
	case "bits":
		parts = `SELECT $1, $3::uuid, (row_number() OVER (ORDER BY x.seq, x.ord))::int, x.name, x.marks FROM (
			SELECT i.seq, coalesce(b.ord, 0) AS ord, 'Q' || i.seq || CASE WHEN b.ord IS NULL THEN '' ELSE '(' || chr(96 + b.ord::int) || ')' END AS name,
			       CASE WHEN b.ord IS NULL THEN i.marks ELSE (b.bit->>'marks')::numeric END AS marks
			  FROM paper_items i JOIN paper_sections s ON s.id = i.section_id AND s.kind = 'core'
			  LEFT JOIN questions q ON q.id = i.question_id
			  LEFT JOIN LATERAL jsonb_array_elements(coalesce(q.bits, '[]'::jsonb)) WITH ORDINALITY AS b(bit, ord) ON true
			 WHERE i.paper_id = $2::uuid) x WHERE x.marks > 0`
	case "sections":
		parts = `SELECT $1, $3::uuid, s.seq, ` + partName + `, sum(i.marks) FROM paper_items i JOIN paper_sections s ON s.id = i.section_id AND s.kind = 'core'
		 LEFT JOIN paper_sections ps ON ps.id = s.parent_id
		 WHERE i.paper_id = $2::uuid GROUP BY s.id, s.seq, s.title, ps.id, ps.title ORDER BY s.seq`
	case "total":
		parts = `SELECT $1, $3::uuid, 1, 'Total', sum(i.marks) FROM paper_items i JOIN paper_sections s ON s.id = i.section_id AND s.kind = 'core'
		 WHERE i.paper_id = $2::uuid HAVING sum(i.marks) > 0`
	}
	_, err := tx.Exec(ctx, `INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks) `+parts, orgID, paperID, assessmentID)
	return err
}

// tagParts gives each question's learning outcome to the part its marks are
// entered in, for those who sit this set: its own part, each of its bits',
// its section's, or the total.
func tagParts(ctx context.Context, tx pgx.Tx, orgID, assessmentID, paperID, marksBy string) error {
	match := map[string]string{
		"questions": `ap.seq = i.seq AND ap.max_marks = i.marks AND ap.name = 'Q' || i.seq`,
		"bits":      `(ap.name = 'Q' || i.seq OR ap.name LIKE 'Q' || i.seq || '(%')`,
		"sections":  `ap.seq = s.seq AND ap.name = ` + partName,
		"total":     `ap.name = 'Total'`,
	}[marksBy]
	if match == "" {
		return nil
	}
	_, err := tx.Exec(ctx, `
		INSERT INTO part_tags (org_id, part_id, outcome_id, paper_id)
		SELECT DISTINCT $1::uuid, ap.id, q.outcome_id, $2::uuid
		  FROM paper_items i
		  JOIN paper_sections s ON s.id = i.section_id AND s.kind = 'core'
		  LEFT JOIN paper_sections ps ON ps.id = s.parent_id
		  JOIN questions q ON q.id = i.question_id AND q.outcome_id IS NOT NULL
		  JOIN assessment_parts ap ON ap.assessment_id = $3::uuid AND ap.deleted_at IS NULL AND `+match+`
		 WHERE i.paper_id = $2::uuid
		ON CONFLICT DO NOTHING`, orgID, paperID, assessmentID)
	return err
}

// MarksBy is how an assessment's marks are entered, and whether that can
// still be changed, and by this person.
type MarksBy struct {
	MarksBy   string `json:"marksBy"`   // questions, bits, sections or total; empty with no final paper
	Marked    bool   `json:"marked"`    // a mark has been entered: it is fixed
	MayChange bool   `json:"mayChange"` // an administrator, with a final paper and no mark yet
}

func loadMarksBy(c fiber.Ctx, tx pgx.Tx, assessmentID string) (MarksBy, []string, error) {
	var out MarksBy
	var finals []string
	err := tx.QueryRow(c.Context(), `
		SELECT coalesce(a.marks_by, ''), EXISTS (SELECT 1 FROM evidence e WHERE e.assessment_id = a.id AND e.state <> 'pending'),
		       coalesce((SELECT array_agg(p.id::text ORDER BY p.finalised_at) FROM papers p WHERE p.assessment_id = a.id AND p.status = 'final'), '{}')
		  FROM assessments a WHERE a.id = $1::uuid`, assessmentID).Scan(&out.MarksBy, &out.Marked, &finals)
	if err != nil {
		return out, nil, err
	}
	if len(finals) == 0 {
		out.MarksBy = ""
	}
	actor, err := tenant.Teaching(c)
	if err != nil {
		return out, nil, err
	}
	out.MayChange = len(finals) > 0 && !out.Marked && policy.Check(actor, policy.StructureWrite, policy.Target{}) == nil
	return out, finals, nil
}

func getMarksBy(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	out, _, err := loadMarksBy(c, tx, c.Params("id"))
	if err != nil {
		return err
	}
	return c.JSON(out)
}

// putMarksBy is the administrator's choice of how an assessment's marks are
// entered. It lays the parts again from the first final set and tags them
// for every final set, so it is refused once a mark has been entered.
func putMarksBy(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	actor, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	if err := policy.Check(actor, policy.StructureWrite, policy.Target{}); err != nil {
		return err
	}
	a, err := loadAssessment(c, tx, c.Params("id"), false)
	if err != nil {
		return err
	}
	var in struct {
		MarksBy string `json:"marksBy"`
	}
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if !slices.Contains([]string{"questions", "bits", "sections", "total"}, in.MarksBy) {
		return problem.Invalid(api.FieldError{Field: "marksBy", Code: "unknown", Message: "Marks are entered by question, by bit, by section, or as one total."})
	}
	was, finals, err := loadMarksBy(c, tx, a.id)
	if err != nil {
		return err
	}
	switch {
	case len(finals) == 0:
		return problem.New(http.StatusConflict, "marks_by.no_paper", "Finalise the question paper first; until then marks are entered as the assessment was set up.")
	case was.Marked:
		return problem.New(http.StatusConflict, "marks_by.marked", "Marks have been entered, so how they are entered can no longer change.")
	}
	m, _ := tenant.MemberFrom(c)
	if err := layParts(ctx, tx, m.OrgID, a.id, finals[0], in.MarksBy); err != nil {
		return err
	}
	for _, paperID := range finals {
		if err := tagParts(ctx, tx, m.OrgID, a.id, paperID, in.MarksBy); err != nil {
			return err
		}
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "assessments", EntityID: a.id, Before: map[string]any{"marksBy": was.MarksBy}, After: map[string]any{"marksBy": in.MarksBy}}); err != nil {
		return err
	}
	out, _, err := loadMarksBy(c, tx, a.id)
	if err != nil {
		return err
	}
	return c.JSON(out)
}
