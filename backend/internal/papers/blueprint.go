// Package papers serves the Blueprint Builder, the question bank and
// question papers with sets, and assigning papers to sections and students
// (pilot P0.9; blueprint v23 B3.2 to B3.4, B4.1). Totals are worked out by
// the database from the cells, exactly, and never stored or typed.
package papers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"slices"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/ai"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Options are what the papers routes need from outside.
type Options struct {
	AI ai.Drafter // nil when AI drafting is not set up
}

// Routes serves blueprints, questions, papers and their assignments.
func Routes(g fiber.Router, o Options) {
	g.Get("/assessments/:id/blueprint", getBlueprint)
	g.Put("/assessments/:id/blueprint", putBlueprint)
	g.Post("/assessments/:id/blueprint/:step", stepBlueprint)
	g.Get("/questions", listQuestions)
	g.Post("/questions", createQuestion)
	g.Post("/questions/draft", draftQuestions(o.AI))
	g.Put("/questions/:id", updateQuestion)
	g.Get("/assessments/:id/papers", listPapers)
	g.Post("/assessments/:id/papers", createPaper)
	g.Get("/papers/:id", getPaper)
	g.Put("/papers/:id/items/:item", putItem)
	g.Post("/papers/:id/items", addItem)
	g.Delete("/papers/:id/items/:item", deleteItem)
	g.Post("/papers/:id/sections", addSection)
	g.Put("/papers/:id/sections/:section", putSection)
	g.Delete("/papers/:id/sections/:section", deleteSection)
	g.Put("/papers/:id/order", putOrder)
	g.Post("/papers/:id/fill", fillPaper)
	g.Post("/papers/:id/duplicate", duplicatePaper)
	g.Post("/papers/:id/finalise", finalisePaper)
	g.Get("/papers/:id/html", paperHTML)
	g.Put("/papers/:id/assignments", putAssignments)
	g.Get("/paper-settings", getSettings)
	g.Put("/paper-settings", putSettings)
}

// QuestionTypes are the kinds offered when none is typed; any name may be used.
var QuestionTypes = []string{"Multiple choice", "Fill in the blanks", "True or false", "Match the following", "Very short answer", "Short answer", "Long answer",
	"Case based", "Assertion and reason", "Map or diagram", "Numerical", "Essay"}

// Cell is one taxonomy level of a row.
type Cell struct {
	Questions int    `json:"questions"`
	Marks     string `json:"marks"` // for each question
}

// Row is a chapter and question type of a blueprint.
type Row struct {
	ID       string          `json:"id,omitempty"`
	LessonID string          `json:"lessonId,omitempty"`
	Chapter  string          `json:"chapter"`
	QType    string          `json:"qtype"`
	Cells    map[string]Cell `json:"cells"` // by Bloom level, or "" with no taxonomy
	// Worked out:
	Questions int    `json:"questions"`
	Marks     string `json:"marks"`
}

// Total is questions and marks for one level or chapter.
type Total struct {
	Key       string `json:"key"`
	Questions int    `json:"questions"`
	Marks     string `json:"marks"`
	Weight    string `json:"weight"` // marks as a share of the maximum, whole percent
}

// Check is one validation finding.
type Check struct {
	Level   string `json:"level"` // error or warning
	Message string `json:"message"`
	Row     int    `json:"row,omitempty"` // 1-based, when it is one row's
}

// Blueprint is an assessment's blueprint with its totals and checks.
type Blueprint struct {
	AssessmentID string  `json:"assessmentId"`
	Taxonomy     string  `json:"taxonomy"`
	Status       string  `json:"status"`
	Version      int     `json:"version"`
	Comment      string  `json:"comment,omitempty"`
	Max          string  `json:"max"` // the assessment's maximum marks
	Rows         []Row   `json:"rows"`
	ByLevel      []Total `json:"byLevel"`
	ByChapter    []Total `json:"byChapter"`
	Questions    int     `json:"questions"`
	Allocated    string  `json:"allocated"`
	Remaining    string  `json:"remaining"` // negative when over
	Checks       []Check `json:"checks"`
	Exists       bool    `json:"exists"`
}

type assessment struct{ id, levelID, subjectID, title, max string }

// loadAssessment checks the assessment exists and that the person may edit
// it (its subject's teacher, a coordinator or an administrator).
func loadAssessment(c fiber.Ctx, tx pgx.Tx, id string, edit bool) (assessment, error) {
	var a assessment
	notFound := problem.New(http.StatusNotFound, "assessment.not_found", "No assessment has this id.")
	if !records.UUIDShape.MatchString(id) {
		return a, notFound
	}
	err := tx.QueryRow(c.Context(), `
		SELECT a.id::text, a.level_id::text, a.subject_id::text, a.title,
		       coalesce((SELECT sum(max_marks) FROM assessment_parts p WHERE p.assessment_id = a.id AND p.deleted_at IS NULL AND p.kind = 'main' AND p.counts_in_total), 0)::text
		  FROM assessments a WHERE a.id = $1::uuid AND a.deleted_at IS NULL`, id).Scan(&a.id, &a.levelID, &a.subjectID, &a.title, &a.max)
	if errors.Is(err, pgx.ErrNoRows) {
		return a, notFound
	}
	if err != nil {
		return a, err
	}
	a.max = trim(a.max)
	actor, err := tenant.Teaching(c)
	if err != nil {
		return a, err
	}
	// The subject's teachers, coordinators and administrators work on its
	// blueprint and papers; those who approve blueprints may read them too.
	t := policy.Target{SubjectID: a.subjectID}
	may := policy.Decide(actor, policy.AssessmentEdit, t) != policy.None
	if !edit && !may {
		may = policy.Decide(actor, policy.BlueprintApprove, t) != policy.None
	}
	if !may {
		return a, problem.New(http.StatusForbidden, "auth.forbidden", "Only this subject's teachers, coordinators and administrators work on its papers.")
	}
	return a, nil
}

func loadBlueprint(ctx context.Context, tx pgx.Tx, a assessment) (Blueprint, error) {
	bp := Blueprint{AssessmentID: a.id, Taxonomy: "bloom", Status: "draft", Version: 1, Max: a.max, Rows: []Row{}, ByLevel: []Total{}, ByChapter: []Total{}, Checks: []Check{}}
	var id string
	err := tx.QueryRow(ctx, `SELECT id::text, taxonomy, status, version, coalesce(comment, '') FROM blueprints WHERE assessment_id = $1::uuid`, a.id).
		Scan(&id, &bp.Taxonomy, &bp.Status, &bp.Version, &bp.Comment)
	if errors.Is(err, pgx.ErrNoRows) {
		bp.Allocated, bp.Remaining = "0", a.max
		bp.Checks = append(bp.Checks, Check{Level: "warning", Message: "Nothing allocated yet."})
		return bp, nil
	}
	if err != nil {
		return bp, err
	}
	bp.Exists = true
	var b pgx.Batch
	b.Queue(`
		SELECT r.id::text, coalesce(r.lesson_id::text, ''), r.chapter, r.qtype, c.level, c.questions, c.marks_each::text
		  FROM blueprint_rows r LEFT JOIN blueprint_cells c ON c.row_id = r.id
		 WHERE r.blueprint_id = $1::uuid ORDER BY r.seq, c.level`, id).Query(func(rows pgx.Rows) error {
		at := map[string]int{}
		for rows.Next() {
			var rid, lesson, chapter, qtype string
			var level *string
			var q *int
			var m *string
			if err := rows.Scan(&rid, &lesson, &chapter, &qtype, &level, &q, &m); err != nil {
				return err
			}
			i, ok := at[rid]
			if !ok {
				i = len(bp.Rows)
				at[rid] = i
				bp.Rows = append(bp.Rows, Row{ID: rid, LessonID: lesson, Chapter: chapter, QType: qtype, Cells: map[string]Cell{}, Marks: "0"})
			}
			if level != nil {
				bp.Rows[i].Cells[*level] = Cell{Questions: *q, Marks: trim(*m)}
			}
		}
		return rows.Err()
	})
	// Every total from the cells, in exact numeric arithmetic.
	b.Queue(`
		SELECT r.id::text, sum(c.questions)::int, coalesce(sum(c.questions * c.marks_each), 0)::text
		  FROM blueprint_rows r LEFT JOIN blueprint_cells c ON c.row_id = r.id WHERE r.blueprint_id = $1::uuid GROUP BY r.id`, id).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var rid, marks string
			var q *int
			if err := rows.Scan(&rid, &q, &marks); err != nil {
				return err
			}
			for i := range bp.Rows {
				if bp.Rows[i].ID == rid {
					if q != nil {
						bp.Rows[i].Questions = *q
					}
					bp.Rows[i].Marks = trim(marks)
				}
			}
		}
		return rows.Err()
	})
	weight := `CASE WHEN $2::numeric > 0 THEN round(sum(c.questions * c.marks_each) * 100 / $2::numeric)::text ELSE '' END`
	b.Queue(`
		SELECT c.level, sum(c.questions)::int, sum(c.questions * c.marks_each)::text, `+weight+`
		  FROM blueprint_cells c JOIN blueprint_rows r ON r.id = c.row_id WHERE r.blueprint_id = $1::uuid GROUP BY c.level`, id, a.max).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var t Total
			if err := rows.Scan(&t.Key, &t.Questions, &t.Marks, &t.Weight); err != nil {
				return err
			}
			t.Marks = trim(t.Marks)
			bp.ByLevel = append(bp.ByLevel, t)
		}
		return rows.Err()
	})
	b.Queue(`
		SELECT r.chapter, coalesce(sum(c.questions), 0)::int, coalesce(sum(c.questions * c.marks_each), 0)::text, `+weight+`
		  FROM blueprint_rows r LEFT JOIN blueprint_cells c ON c.row_id = r.id WHERE r.blueprint_id = $1::uuid
		 GROUP BY r.chapter ORDER BY min(r.seq)`, id, a.max).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var t Total
			if err := rows.Scan(&t.Key, &t.Questions, &t.Marks, &t.Weight); err != nil {
				return err
			}
			t.Marks = trim(t.Marks)
			bp.ByChapter = append(bp.ByChapter, t)
		}
		return rows.Err()
	})
	b.Queue(`
		SELECT coalesce(sum(c.questions), 0)::int, coalesce(sum(c.questions * c.marks_each), 0)::text, ($2::numeric - coalesce(sum(c.questions * c.marks_each), 0))::text
		  FROM blueprint_cells c JOIN blueprint_rows r ON r.id = c.row_id WHERE r.blueprint_id = $1::uuid`, id, a.max).QueryRow(func(r pgx.Row) error {
		return r.Scan(&bp.Questions, &bp.Allocated, &bp.Remaining)
	})
	if err := tx.SendBatch(ctx, &b).Close(); err != nil {
		return bp, err
	}
	bp.Allocated, bp.Remaining = trim(bp.Allocated), trim(bp.Remaining)
	order, err := levelsOf(ctx, tx, bp.Taxonomy)
	if err != nil {
		return bp, err
	}
	slices.SortStableFunc(bp.ByLevel, func(x, y Total) int { return slices.Index(order, x.Key) - slices.Index(order, y.Key) })
	bp.Checks = check(bp)
	return bp, nil
}

// trim drops a decimal's needless zeros: 4.50 is 4.5, 4.00 is 4.
func trim(s string) string {
	if !strings.Contains(s, ".") {
		return s
	}
	s = strings.TrimRight(s, "0")
	return strings.TrimSuffix(s, ".")
}

// check is the one validation engine (B3.2): what blocks submission is an
// error, what only needs attention a warning.
func check(bp Blueprint) []Check {
	out := []Check{}
	if len(bp.Rows) == 0 {
		return append(out, Check{Level: "warning", Message: "Nothing allocated yet."})
	}
	seen := map[string]int{}
	for i, r := range bp.Rows {
		k := strings.ToLower(strings.TrimSpace(r.Chapter)) + "|" + strings.ToLower(strings.TrimSpace(r.QType))
		if j, ok := seen[k]; ok {
			out = append(out, Check{Level: "warning", Row: i + 1, Message: fmt.Sprintf("Same chapter and question type as row %d.", j)})
		}
		seen[k] = i + 1
		if r.Questions == 0 {
			out = append(out, Check{Level: "warning", Row: i + 1, Message: "This row allocates nothing."})
		}
	}
	switch {
	case strings.HasPrefix(bp.Remaining, "-"):
		out = append(out, Check{Level: "error", Message: fmt.Sprintf("%s marks over the maximum of %s.", strings.TrimPrefix(bp.Remaining, "-"), bp.Max)})
	case bp.Remaining != "0":
		out = append(out, Check{Level: "error", Message: fmt.Sprintf("%s of %s marks still to allocate.", bp.Remaining, bp.Max)})
	}
	if bp.Max == "0" {
		out = append(out, Check{Level: "error", Message: "The assessment has no maximum marks yet; set its parts in Create exam."})
	}
	return out
}

func getBlueprint(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	a, err := loadAssessment(c, tx, c.Params("id"), false)
	if err != nil {
		return err
	}
	bp, err := loadBlueprint(c.Context(), tx, a)
	if err != nil {
		return err
	}
	return c.JSON(bp)
}

type blueprintIn struct {
	Taxonomy string `json:"taxonomy"`
	Rows     []Row  `json:"rows"`
}

var marksShape = regexp.MustCompile(`^\d{1,4}(\.\d{1,2})?$`)

// putBlueprint saves the draft. An approved blueprint, once changed, is the
// next version and goes back to draft; nothing approved is overwritten
// silently.
func putBlueprint(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	a, err := loadAssessment(c, tx, c.Params("id"), true)
	if err != nil {
		return err
	}
	var in blueprintIn
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if !slices.Contains([]string{"bloom", "solo", "custom", "none"}, in.Taxonomy) {
		return problem.Invalid(api.FieldError{Field: "taxonomy", Code: "unknown", Message: "Choose Bloom, SOLO, your own levels or none."})
	}
	if len(in.Rows) > 200 {
		return problem.Invalid(api.FieldError{Field: "rows", Code: "too_many", Message: "A blueprint has at most 200 rows."})
	}
	levels, err := levelsOf(ctx, tx, in.Taxonomy)
	if err != nil {
		return err
	}
	if len(levels) == 0 {
		return problem.Invalid(api.FieldError{Field: "taxonomy", Code: "unknown", Message: "Your own levels are not set yet; an administrator sets them in Configuration."})
	}
	for i, r := range in.Rows {
		where := fmt.Sprintf("Row %d", i+1)
		if strings.TrimSpace(r.Chapter) == "" || strings.TrimSpace(r.QType) == "" {
			return problem.Invalid(api.FieldError{Field: "rows", Code: "required", Message: where + " needs a chapter and a question type."})
		}
		if r.LessonID != "" && !records.UUIDShape.MatchString(r.LessonID) {
			return problem.Invalid(api.FieldError{Field: "rows", Code: "unknown", Message: where + ": not a lesson."})
		}
		for level, cell := range r.Cells {
			if !slices.Contains(levels, level) {
				return problem.Invalid(api.FieldError{Field: "rows", Code: "level", Message: fmt.Sprintf("%s: %q is not a level of this taxonomy.", where, level)})
			}
			if cell.Questions < 0 || !marksShape.MatchString(cell.Marks) {
				return problem.Invalid(api.FieldError{Field: "rows", Code: "marks", Message: where + ": counts and marks are positive numbers, marks with up to two decimals."})
			}
			if (cell.Questions == 0) != (strings.Trim(cell.Marks, "0.") == "") {
				return problem.Invalid(api.FieldError{Field: "rows", Code: "inconsistent", Message: where + ": marks need questions, and questions need marks."})
			}
		}
	}
	m, _ := tenant.MemberFrom(c)
	var id, status string
	var version int
	err = tx.QueryRow(ctx, `SELECT id::text, status, version FROM blueprints WHERE assessment_id = $1::uuid`, a.id).Scan(&id, &status, &version)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		if err := tx.QueryRow(ctx, `INSERT INTO blueprints (org_id, assessment_id, taxonomy, created_by) VALUES ($1, $2::uuid, $3, $4) RETURNING id::text`,
			m.OrgID, a.id, in.Taxonomy, m.UserID).Scan(&id); err != nil {
			return err
		}
	case err != nil:
		return err
	default:
		if status == "approved" {
			version++
		}
		if _, err := tx.Exec(ctx, `UPDATE blueprints SET taxonomy = $2, status = 'draft', version = $3, updated_at = now() WHERE id = $1::uuid`, id, in.Taxonomy, version); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `DELETE FROM blueprint_rows WHERE blueprint_id = $1::uuid`, id); err != nil {
			return err
		}
	}
	var b pgx.Batch
	for i, r := range in.Rows {
		rid := newID()
		b.Queue(`INSERT INTO blueprint_rows (id, org_id, blueprint_id, seq, lesson_id, chapter, qtype) VALUES ($1::uuid, $2, $3::uuid, $4, nullif($5, '')::uuid, $6, $7)`,
			rid, m.OrgID, id, i+1, r.LessonID, strings.TrimSpace(r.Chapter), strings.TrimSpace(r.QType))
		for level, cell := range r.Cells {
			if cell.Questions == 0 {
				continue // a blank cell is not stored
			}
			b.Queue(`INSERT INTO blueprint_cells (org_id, row_id, level, questions, marks_each) VALUES ($1, $2::uuid, $3, $4, $5::numeric)`, m.OrgID, rid, level, cell.Questions, cell.Marks)
		}
	}
	if b.Len() > 0 {
		if err := tx.SendBatch(ctx, &b).Close(); err != nil {
			return err
		}
	}
	bp, err := loadBlueprint(ctx, tx, a)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "blueprints", EntityID: id, After: map[string]any{"version": bp.Version, "rows": len(bp.Rows), "allocated": bp.Allocated}}); err != nil {
		return err
	}
	return c.JSON(bp)
}

type stepIn struct {
	Comment string `json:"comment"`
}

// stepBlueprint moves a blueprint along its route: submit (every error
// fixed), approve, or return with a comment.
func stepBlueprint(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	step := c.Params("step")
	if !slices.Contains([]string{"submit", "approve", "return"}, step) {
		return problem.New(http.StatusNotFound, "route.not_found", "No such step.")
	}
	a, err := loadAssessment(c, tx, c.Params("id"), step == "submit")
	if err != nil {
		return err
	}
	bp, err := loadBlueprint(ctx, tx, a)
	if err != nil {
		return err
	}
	if !bp.Exists {
		return problem.New(http.StatusConflict, "blueprint.empty", "Allocate the blueprint first.")
	}
	if step != "submit" {
		actor, err := tenant.Teaching(c)
		if err != nil {
			return err
		}
		if err := policy.Check(actor, policy.BlueprintApprove, policy.Target{SubjectID: a.subjectID}); err != nil {
			return err
		}
	}
	var in stepIn
	_ = httpx.Decode(c, &in)
	m, _ := tenant.MemberFrom(c)
	switch step {
	case "submit":
		if slices.ContainsFunc(bp.Checks, func(x Check) bool { return x.Level == "error" }) {
			return problem.New(http.StatusConflict, "blueprint.invalid", "Fix what the checks list before submitting.")
		}
		_, err = tx.Exec(ctx, `UPDATE blueprints SET status = 'submitted', submitted_by = $2, submitted_at = now(), comment = NULL WHERE assessment_id = $1::uuid`, a.id, m.UserID)
	case "approve":
		if bp.Status != "submitted" {
			return problem.New(http.StatusConflict, "blueprint.not_submitted", "Only a submitted blueprint can be approved.")
		}
		_, err = tx.Exec(ctx, `UPDATE blueprints SET status = 'approved', approved_by = $2, approved_at = now(), comment = nullif($3, '') WHERE assessment_id = $1::uuid`, a.id, m.UserID, in.Comment)
	case "return":
		if strings.TrimSpace(in.Comment) == "" {
			return problem.Invalid(api.FieldError{Field: "comment", Code: "required", Message: "Say what to change."})
		}
		_, err = tx.Exec(ctx, `UPDATE blueprints SET status = 'returned', comment = $2 WHERE assessment_id = $1::uuid`, a.id, in.Comment)
	}
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: step, Entity: "blueprints", EntityID: a.id, After: map[string]any{"version": bp.Version, "comment": in.Comment}}); err != nil {
		return err
	}
	bp, err = loadBlueprint(ctx, tx, a)
	if err != nil {
		return err
	}
	return c.JSON(bp)
}
