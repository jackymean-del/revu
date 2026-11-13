package papers

import (
	"bytes"
	"context"
	"errors"
	"html/template"
	"net/http"
	"regexp"
	"slices"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Item is one slot of a paper and the question in it.
type Item struct {
	ID       string    `json:"id"`
	Seq      int       `json:"seq"`
	Section  string    `json:"section"`
	Chapter  string    `json:"chapter"`
	LessonID string    `json:"lessonId,omitempty"`
	Level    string    `json:"level,omitempty"` // of the paper's taxonomy
	Marks    string    `json:"marks"`
	Locked   bool      `json:"locked"`
	Question *Question `json:"question,omitempty"`
}

// Gap is how a part of the paper stands against the blueprint.
type Gap struct {
	Key     string `json:"key"`
	Wanted  string `json:"wanted"` // marks the blueprint asks for
	Filled  string `json:"filled"` // marks of questions in place
	Missing int    `json:"missing"`
}

// Assignment is who sits a set, and when.
type Assignment struct {
	SectionID string `json:"sectionId"`
	StudentID string `json:"studentId,omitempty"`
	SitOn     string `json:"sitOn,omitempty"`
}

// Paper is one set of an assessment.
type Paper struct {
	ID               string       `json:"id"`
	AssessmentID     string       `json:"assessmentId"`
	Set              string       `json:"set"`
	Status           string       `json:"status"`
	Taxonomy         string       `json:"taxonomy"`
	BlueprintVersion int          `json:"blueprintVersion"`
	Instructions     string       `json:"instructions"`
	Items            []Item       `json:"items"`
	Filled           int          `json:"filled"`
	Total            string       `json:"total"`
	BySection        []Gap        `json:"bySection"`
	ByLevel          []Gap        `json:"byLevel"`
	Assignments      []Assignment `json:"assignments"`
}

func paperOf(c fiber.Ctx, tx pgx.Tx, id string, edit bool) (Paper, assessment, error) {
	var p Paper
	notFound := problem.New(http.StatusNotFound, "paper.not_found", "No paper has this id.")
	if !records.UUIDShape.MatchString(id) {
		return p, assessment{}, notFound
	}
	err := tx.QueryRow(c.Context(), `SELECT id::text, assessment_id::text, set_label, status, taxonomy, blueprint_version, instructions FROM papers WHERE id = $1::uuid`, id).
		Scan(&p.ID, &p.AssessmentID, &p.Set, &p.Status, &p.Taxonomy, &p.BlueprintVersion, &p.Instructions)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, assessment{}, notFound
	}
	if err != nil {
		return p, assessment{}, err
	}
	a, err := loadAssessment(c, tx, p.AssessmentID, edit)
	if err != nil {
		return p, a, err
	}
	return p, a, loadItems(c.Context(), tx, &p)
}

func loadItems(ctx context.Context, tx pgx.Tx, p *Paper) error {
	p.Items, p.BySection, p.ByLevel, p.Assignments = []Item{}, []Gap{}, []Gap{}, []Assignment{}
	p.Filled = 0
	var b pgx.Batch
	b.Queue(`
		SELECT i.id::text, i.seq, i.section, i.chapter, coalesce(i.lesson_id::text, ''), i.level, i.marks::text, i.locked, i.question_id IS NOT NULL,
		       `+questionCols+`
		  FROM paper_items i LEFT JOIN questions q ON q.id = i.question_id
		 WHERE i.paper_id = $1::uuid ORDER BY i.seq`, p.ID).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var it Item
			var has bool
			var q Question
			var qid, qlevel, qsubject, qlesson, qoutcome, qbloom, qsolo, qcustom, qtype, qmarks, qdiff, qtext, qanswer, qsource, qstatus *string
			var qopts []byte
			var qused *int
			if err := rows.Scan(&it.ID, &it.Seq, &it.Section, &it.Chapter, &it.LessonID, &it.Level, &it.Marks, &it.Locked, &has,
				&qid, &qlevel, &qsubject, &qlesson, &qoutcome, &qbloom, &qsolo, &qcustom, &qtype, &qmarks, &qdiff, &qtext, &qopts, &qanswer, &qsource, &qstatus, &qused); err != nil {
				return err
			}
			it.Marks = trim(it.Marks)
			if has {
				q = Question{ID: *qid, LevelID: *qlevel, SubjectID: *qsubject, LessonID: *qlesson, OutcomeID: *qoutcome, Bloom: *qbloom, Solo: *qsolo, Custom: *qcustom, QType: *qtype, Marks: trim(*qmarks),
					Difficulty: *qdiff, Text: *qtext, Answer: *qanswer, Source: *qsource, Status: *qstatus, Used: *qused, Options: []string{}}
				if len(qopts) > 0 {
					_ = jsonUnmarshal(qopts, &q.Options)
				}
				it.Question = &q
				p.Filled++
			}
			p.Items = append(p.Items, it)
		}
		return rows.Err()
	})
	gaps := func(by string, into *[]Gap) {
		b.Queue(`
			SELECT i.`+by+`, sum(i.marks)::text, coalesce(sum(q.marks), 0)::text, count(*) FILTER (WHERE i.question_id IS NULL)::int
			  FROM paper_items i LEFT JOIN questions q ON q.id = i.question_id WHERE i.paper_id = $1::uuid
			 GROUP BY i.`+by+` ORDER BY min(i.seq)`, p.ID).Query(func(rows pgx.Rows) error {
			for rows.Next() {
				var g Gap
				if err := rows.Scan(&g.Key, &g.Wanted, &g.Filled, &g.Missing); err != nil {
					return err
				}
				g.Wanted, g.Filled = trim(g.Wanted), trim(g.Filled)
				*into = append(*into, g)
			}
			return rows.Err()
		})
	}
	gaps("section", &p.BySection)
	gaps("level", &p.ByLevel)
	b.Queue(`SELECT coalesce(sum(marks), 0)::text FROM paper_items WHERE paper_id = $1::uuid`, p.ID).QueryRow(func(r pgx.Row) error { return r.Scan(&p.Total) })
	b.Queue(`SELECT section_id::text, coalesce(student_id::text, ''), coalesce(sit_on::text, '') FROM paper_assignments WHERE paper_id = $1::uuid ORDER BY created_at`, p.ID).
		Query(func(rows pgx.Rows) error {
			for rows.Next() {
				var x Assignment
				if err := rows.Scan(&x.SectionID, &x.StudentID, &x.SitOn); err != nil {
					return err
				}
				p.Assignments = append(p.Assignments, x)
			}
			return rows.Err()
		})
	if err := tx.SendBatch(ctx, &b).Close(); err != nil {
		return err
	}
	p.Total = trim(p.Total)
	return nil
}

// PaperSummary is one set in the list of an assessment's papers.
type PaperSummary struct {
	ID      string `json:"id"`
	Set     string `json:"set"`
	Status  string `json:"status"`
	Items   int    `json:"items"`
	Filled  int    `json:"filled"`
	Version int    `json:"blueprintVersion"`
}

func listPapers(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	a, err := loadAssessment(c, tx, c.Params("id"), false)
	if err != nil {
		return err
	}
	rows, err := tx.Query(c.Context(), `
		SELECT p.id::text, p.set_label, p.status, (SELECT count(*) FROM paper_items i WHERE i.paper_id = p.id)::int,
		       (SELECT count(*) FROM paper_items i WHERE i.paper_id = p.id AND i.question_id IS NOT NULL)::int, p.blueprint_version
		  FROM papers p WHERE p.assessment_id = $1::uuid ORDER BY p.created_at`, a.id)
	if err != nil {
		return err
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (PaperSummary, error) {
		var s PaperSummary
		return s, r.Scan(&s.ID, &s.Set, &s.Status, &s.Items, &s.Filled, &s.Version)
	})
	if err != nil {
		return err
	}
	if out == nil {
		out = []PaperSummary{}
	}
	return c.JSON(out)
}

type createIn struct {
	Fill bool   `json:"fill"` // fill the slots from the question bank
	Name string `json:"name"` // the set's name; the next of the institution's when empty
}

// setName is the name asked for, checked, or the next free one.
func setName(c fiber.Ctx, tx pgx.Tx, assessmentID, asked string) (string, error) {
	ctx := c.Context()
	var n int
	if err := tx.QueryRow(ctx, `SELECT count(*) FROM papers WHERE assessment_id = $1::uuid`, assessmentID).Scan(&n); err != nil {
		return "", err
	}
	if n >= 26 {
		return "", problem.New(http.StatusConflict, "paper.too_many_sets", "An assessment has at most 26 sets.")
	}
	asked = strings.Join(strings.Fields(asked), " ")
	if asked == "" {
		return nextSetName(ctx, tx, assessmentID)
	}
	var taken bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM papers WHERE assessment_id = $1::uuid AND lower(set_label) = lower($2))`, assessmentID, asked).Scan(&taken); err != nil {
		return "", err
	}
	if len(asked) > 30 || taken {
		return "", problem.Invalid(api.FieldError{Field: "name", Code: "invalid", Message: "Give a name of up to 30 characters that no other set of this assessment has."})
	}
	return asked, nil
}

// createPaper lays out Set A as empty slots exactly as the approved
// blueprint asks: one slot per question, sections by question type, each
// cell's marks shared across its questions with any remainder on the last.
func createPaper(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	a, err := loadAssessment(c, tx, c.Params("id"), true)
	if err != nil {
		return err
	}
	var bpID, taxonomy string
	var version int
	err = tx.QueryRow(ctx, `SELECT id::text, version, taxonomy FROM blueprints WHERE assessment_id = $1::uuid AND status = 'approved'`, a.id).Scan(&bpID, &version, &taxonomy)
	if errors.Is(err, pgx.ErrNoRows) {
		return problem.New(http.StatusConflict, "blueprint.not_approved", "Papers are made from an approved blueprint; approve it first.")
	}
	if err != nil {
		return err
	}
	var in createIn
	_ = httpx.Decode(c, &in)
	m, _ := tenant.MemberFrom(c)
	set, err := setName(c, tx, a.id, in.Name)
	if err != nil {
		return err
	}
	levels, err := levelsOf(ctx, tx, taxonomy)
	if err != nil {
		return err
	}
	var p Paper
	if err := tx.QueryRow(ctx, `INSERT INTO papers (org_id, assessment_id, set_label, taxonomy, blueprint_version, created_by) VALUES ($1, $2::uuid, $3, $4, $5, $6) RETURNING id::text`,
		m.OrgID, a.id, set, taxonomy, version, m.UserID).Scan(&p.ID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO paper_items (org_id, paper_id, seq, section, chapter, lesson_id, level, marks)
		SELECT $1, $2::uuid, row_number() OVER (ORDER BY sec.first, r.seq, coalesce(array_position($4::text[], c.level), 0), g.n), r.qtype, r.chapter, r.lesson_id, c.level, c.marks_each
		  FROM blueprint_rows r
		  JOIN blueprint_cells c ON c.row_id = r.id
		  JOIN (SELECT qtype, min(seq) AS first FROM blueprint_rows WHERE blueprint_id = $3::uuid GROUP BY qtype) sec ON sec.qtype = r.qtype
		  CROSS JOIN LATERAL generate_series(1, c.questions) g(n)
		 WHERE r.blueprint_id = $3::uuid`, m.OrgID, p.ID, bpID, levels); err != nil {
		return err
	}
	if in.Fill {
		if _, err := fill(ctx, tx, a, p.ID, taxonomy); err != nil {
			return err
		}
	}
	p2, _, err := paperOf(c, tx, p.ID, true)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "create", Entity: "papers", EntityID: p.ID, After: map[string]any{"set": set, "blueprintVersion": version, "slots": len(p2.Items)}}); err != nil {
		return err
	}
	return c.Status(http.StatusCreated).JSON(p2)
}

func getPaper(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	p, _, err := paperOf(c, tx, c.Params("id"), false)
	if err != nil {
		return err
	}
	return c.JSON(p)
}

// fill puts an eligible bank question in every empty, unlocked slot: same
// class, subject and marks, the slot's lesson and Bloom level when it has
// them, and its question type; approved, not already in the paper, the
// least used first. A slot nothing fits stays empty.
func fill(ctx context.Context, tx pgx.Tx, a assessment, paperID, taxonomy string) (int, error) {
	type slot struct{ id, section, lesson, level, marks string }
	type cand struct {
		id, lesson, level, qtype, marks string
		used                            int
	}
	var slots []slot
	var cands []cand
	used := map[string]bool{}
	var b pgx.Batch
	b.Queue(`SELECT id::text, section, coalesce(lesson_id::text, ''), level, marks::text FROM paper_items WHERE paper_id = $1::uuid AND question_id IS NULL AND NOT locked ORDER BY seq`, paperID).
		Query(func(rows pgx.Rows) error {
			for rows.Next() {
				var s slot
				if err := rows.Scan(&s.id, &s.section, &s.lesson, &s.level, &s.marks); err != nil {
					return err
				}
				slots = append(slots, s)
			}
			return rows.Err()
		})
	b.Queue(`SELECT question_id::text FROM paper_items WHERE paper_id = $1::uuid AND question_id IS NOT NULL`, paperID).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return err
			}
			used[id] = true
		}
		return rows.Err()
	})
	b.Queue(`
		SELECT q.id::text, coalesce(q.lesson_id::text, ''), CASE $3 WHEN 'bloom' THEN q.bloom WHEN 'solo' THEN coalesce(q.solo, '') WHEN 'custom' THEN coalesce(q.custom_level, '') ELSE '' END, lower(q.qtype), q.marks::text, (SELECT count(*) FROM paper_items i WHERE i.question_id = q.id)::int
		  FROM questions q WHERE q.level_id = $1::uuid AND q.subject_id = $2::uuid AND q.status = 'approved'
		 ORDER BY 6, q.created_at`, a.levelID, a.subjectID, taxonomy).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var x cand
			if err := rows.Scan(&x.id, &x.lesson, &x.level, &x.qtype, &x.marks, &x.used); err != nil {
				return err
			}
			cands = append(cands, x)
		}
		return rows.Err()
	})
	if err := tx.SendBatch(ctx, &b).Close(); err != nil {
		return 0, err
	}
	var put pgx.Batch
	for _, s := range slots {
		i := slices.IndexFunc(cands, func(x cand) bool {
			return !used[x.id] && x.qtype == strings.ToLower(s.section) && trim(x.marks) == trim(s.marks) &&
				(s.lesson == "" || x.lesson == s.lesson) && (s.level == "" || x.level == s.level)
		})
		if i < 0 {
			continue
		}
		used[cands[i].id] = true
		put.Queue(`UPDATE paper_items SET question_id = $2::uuid WHERE id = $1::uuid`, s.id, cands[i].id)
	}
	if put.Len() == 0 {
		return 0, nil
	}
	return put.Len(), tx.SendBatch(ctx, &put).Close()
}

func draftOnly(p Paper) error {
	if p.Status == "final" {
		return problem.New(http.StatusConflict, "paper.final", "This set is final; duplicate it to make changes.")
	}
	return nil
}

func fillPaper(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	p, a, err := paperOf(c, tx, c.Params("id"), true)
	if err != nil {
		return err
	}
	if err := draftOnly(p); err != nil {
		return err
	}
	if _, err := fill(c.Context(), tx, a, p.ID, p.Taxonomy); err != nil {
		return err
	}
	if err := loadItems(c.Context(), tx, &p); err != nil {
		return err
	}
	return c.JSON(p)
}

type itemIn struct {
	QuestionID *string `json:"questionId"` // empty clears the slot
	Locked     *bool   `json:"locked"`
}

// putItem places a question in a slot (it must be of the class and subject,
// and carry the slot's marks), clears it, or locks it against refilling.
func putItem(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	p, a, err := paperOf(c, tx, c.Params("id"), true)
	if err != nil {
		return err
	}
	if err := draftOnly(p); err != nil {
		return err
	}
	itemID := c.Params("item")
	i := slices.IndexFunc(p.Items, func(x Item) bool { return x.ID == itemID })
	if i < 0 {
		return problem.New(http.StatusNotFound, "item.not_found", "No such slot in this paper.")
	}
	var in itemIn
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if in.QuestionID != nil && *in.QuestionID != "" {
		var ok bool
		if !records.UUIDShape.MatchString(*in.QuestionID) {
			return problem.Invalid(api.FieldError{Field: "questionId", Code: "unknown", Message: "Not a question."})
		}
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM questions WHERE id = $1::uuid AND level_id = $2::uuid AND subject_id = $3::uuid AND marks = $4::numeric AND status <> 'retired')`,
			*in.QuestionID, a.levelID, a.subjectID, p.Items[i].Marks).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return problem.Invalid(api.FieldError{Field: "questionId", Code: "mismatch", Message: "That question is not of this class and subject, or not worth this slot's marks."})
		}
	}
	if _, err := tx.Exec(ctx, `
		UPDATE paper_items SET question_id = CASE WHEN $2::text IS NULL THEN question_id ELSE nullif($2, '')::uuid END,
		       locked = coalesce($3, locked) WHERE id = $1::uuid`, itemID, in.QuestionID, in.Locked); err != nil {
		return err
	}
	if err := loadItems(ctx, tx, &p); err != nil {
		return err
	}
	return c.JSON(p)
}

// duplicatePaper makes the next set as an independent copy (B3.3).
func duplicatePaper(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	p, a, err := paperOf(c, tx, c.Params("id"), true)
	if err != nil {
		return err
	}
	m, _ := tenant.MemberFrom(c)
	var in createIn
	_ = httpx.Decode(c, &in)
	set, err := setName(c, tx, a.id, in.Name)
	if err != nil {
		return err
	}
	var id string
	if err := tx.QueryRow(ctx, `INSERT INTO papers (org_id, assessment_id, set_label, taxonomy, blueprint_version, instructions, created_by) VALUES ($1, $2::uuid, $3, $4, $5, $6, $7) RETURNING id::text`,
		m.OrgID, a.id, set, p.Taxonomy, p.BlueprintVersion, p.Instructions, m.UserID).Scan(&id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO paper_items (org_id, paper_id, seq, section, chapter, lesson_id, level, marks, question_id, locked)
		SELECT org_id, $2::uuid, seq, section, chapter, lesson_id, level, marks, question_id, locked FROM paper_items WHERE paper_id = $1::uuid`, p.ID, id); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "create", Entity: "papers", EntityID: id, After: map[string]any{"set": set, "from": p.Set}}); err != nil {
		return err
	}
	np, _, err := paperOf(c, tx, id, true)
	if err != nil {
		return err
	}
	return c.Status(http.StatusCreated).JSON(np)
}

// finalisePaper fixes a set once every slot has a question. The first set
// finalised also sets how the assessment's marks are entered: one part per
// question, worth its marks and tagged with its learning outcome (per set,
// since another set may ask another question), so marks feed the holistic
// report question by question. That happens only
// while no mark has been entered.
func finalisePaper(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	p, a, err := paperOf(c, tx, c.Params("id"), true)
	if err != nil {
		return err
	}
	if err := draftOnly(p); err != nil {
		return err
	}
	if p.Filled < len(p.Items) || len(p.Items) == 0 {
		return problem.New(http.StatusConflict, "paper.incomplete", "Put a question in every slot first.")
	}
	m, _ := tenant.MemberFrom(c)
	var marked, partsSet bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM evidence WHERE assessment_id = $1::uuid AND state <> 'pending'),
		EXISTS (SELECT 1 FROM papers WHERE assessment_id = $1::uuid AND status = 'final')`, a.id).Scan(&marked, &partsSet); err != nil {
		return err
	}
	if !marked && !partsSet {
		if _, err := tx.Exec(ctx, `UPDATE assessment_parts SET deleted_at = now() WHERE assessment_id = $1::uuid AND deleted_at IS NULL`, a.id); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE assessments SET entry_mode = 'sections', updated_at = now() WHERE id = $1::uuid`, a.id); err != nil {
			return err
		}
		// One part per question, in paper order.
		if _, err := tx.Exec(ctx, `
			INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks)
			SELECT $1, $3::uuid, seq, 'Q' || seq, marks FROM paper_items WHERE paper_id = $2::uuid ORDER BY seq`, m.OrgID, p.ID, a.id); err != nil {
			return err
		}
	}
	// Each question's outcome tags its part, for those who sit this set;
	// only where the parts are this paper's questions, slot for slot.
	if _, err := tx.Exec(ctx, `
		INSERT INTO part_tags (org_id, part_id, outcome_id, paper_id)
		SELECT $1, ap.id, q.outcome_id, $2::uuid
		  FROM paper_items i
		  JOIN questions q ON q.id = i.question_id AND q.outcome_id IS NOT NULL
		  JOIN assessment_parts ap ON ap.assessment_id = $3::uuid AND ap.deleted_at IS NULL AND ap.seq = i.seq AND ap.max_marks = i.marks AND ap.name = 'Q' || i.seq
		 WHERE i.paper_id = $2::uuid
		ON CONFLICT DO NOTHING`, m.OrgID, p.ID, a.id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE papers SET status = 'final', finalised_by = $2, finalised_at = now() WHERE id = $1::uuid`, p.ID, m.UserID); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "finalise", Entity: "papers", EntityID: p.ID, After: map[string]any{"set": p.Set, "partsSet": !marked && !partsSet}}); err != nil {
		return err
	}
	if err := loadItems(ctx, tx, &p); err != nil {
		return err
	}
	p.Status = "final"
	return c.JSON(p)
}

var dateShape = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

type assignIn struct {
	Assignments []Assignment `json:"assignments"`
}

// putAssignments sets which sections, or single students, sit this set and
// when (B4.1). A section can sit one set; a student given another set sits
// that one instead.
func putAssignments(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	p, a, err := paperOf(c, tx, c.Params("id"), true)
	if err != nil {
		return err
	}
	var in assignIn
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if len(in.Assignments) > 500 {
		return problem.Invalid(api.FieldError{Field: "assignments", Code: "too_many", Message: "Up to 500 at a time."})
	}
	for _, x := range in.Assignments {
		if x.SitOn != "" && !dateShape.MatchString(x.SitOn) {
			return problem.Invalid(api.FieldError{Field: "assignments", Code: "invalid", Message: "Give the date as YYYY-MM-DD."})
		}
		if !records.UUIDShape.MatchString(x.SectionID) || (x.StudentID != "" && !records.UUIDShape.MatchString(x.StudentID)) {
			return problem.Invalid(api.FieldError{Field: "assignments", Code: "unknown", Message: "Not a section or student."})
		}
		var covered bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM assessment_scopes WHERE assessment_id = $1::uuid AND section_id = $2::uuid)`, a.id, x.SectionID).Scan(&covered); err != nil {
			return err
		}
		if !covered {
			return problem.Invalid(api.FieldError{Field: "assignments", Code: "not_in_scope", Message: "That section does not sit this assessment."})
		}
	}
	m, _ := tenant.MemberFrom(c)
	if _, err := tx.Exec(ctx, `DELETE FROM paper_assignments WHERE paper_id = $1::uuid`, p.ID); err != nil {
		return err
	}
	var b pgx.Batch
	for _, x := range in.Assignments {
		if x.StudentID == "" {
			// A whole section sits one set: take it off the others.
			b.Queue(`DELETE FROM paper_assignments WHERE section_id = $1::uuid AND student_id IS NULL AND paper_id IN (SELECT id FROM papers WHERE assessment_id = $2::uuid)`, x.SectionID, a.id)
		} else {
			b.Queue(`DELETE FROM paper_assignments WHERE student_id = $1::uuid AND paper_id IN (SELECT id FROM papers WHERE assessment_id = $2::uuid)`, x.StudentID, a.id)
		}
		b.Queue(`INSERT INTO paper_assignments (org_id, paper_id, section_id, student_id, sit_on, created_by) VALUES ($1, $2::uuid, $3::uuid, nullif($4, '')::uuid, nullif($5, '')::date, $6)
			ON CONFLICT DO NOTHING`, m.OrgID, p.ID, x.SectionID, x.StudentID, x.SitOn, m.UserID)
	}
	if b.Len() > 0 {
		if err := tx.SendBatch(ctx, &b).Close(); err != nil {
			return err
		}
	}
	if err := audit.Record(c, audit.Entry{Action: "assign", Entity: "papers", EntityID: p.ID, After: map[string]any{"set": p.Set, "assignments": len(in.Assignments)}}); err != nil {
		return err
	}
	if err := loadItems(ctx, tx, &p); err != nil {
		return err
	}
	return c.JSON(p)
}

var paperPage = template.Must(template.New("paper").Parse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>{{.Title}}</title>
<style>
body{font-family:system-ui,sans-serif;color:#13111e;margin:0;padding:24px;max-width:780px;margin:auto;font-size:14px;line-height:1.5}
header{text-align:center;border-bottom:2px solid #13111e;padding-bottom:8px;margin-bottom:12px}
h1{font-size:18px;margin:0}h2{font-size:15px;margin:18px 0 6px;border-bottom:1px solid #ccc}
.meta{display:flex;justify-content:space-between;font-size:13px;margin-top:6px}
ol{padding-left:22px}li{margin:8px 0}.m{float:right;font-weight:600}.opts{list-style:lower-alpha;margin:4px 0 0}
.key{background:#f6f5fb;border:1px solid #ddd;padding:4px 8px;margin-top:4px;font-size:13px}
.space{margin-top:6px}.space div{border-bottom:1px solid #bbb;height:26px}
.box{display:inline-block;width:18px;height:14px;border:1px solid #888;margin-left:8px;vertical-align:middle}
.pending{color:#a16207;font-style:italic}
@media print{body{padding:0}}
</style></head><body>
<header><h1>{{.School}}</h1><div>{{.Title}}{{if .Key}} : answer key{{end}}</div>
<div class="meta"><span>{{.Class}} · {{.Subject}}</span><span>{{.Set}}</span><span>Maximum marks: {{.Max}}</span></div></header>
{{if .Instructions}}<p>{{.Instructions}}</p>{{end}}
{{range .Sections}}<h2>{{.Name}} <span class="m">{{.Marks}} marks</span></h2><ol start="{{.Start}}">
{{range .Items}}<li><span class="m">[{{.Marks}}]</span>{{if .Pending}}<span class="pending">{{.Text}}</span>{{else}}{{.Text}}{{end}}{{if .Options}}<ol class="opts">{{range .Options}}<li>{{.}}{{if $.Space}}<span class="box"></span>{{end}}</li>{{end}}</ol>{{end}}
{{if $.Key}}<div class="key">{{.Answer}}</div>{{else if and $.Space .Lines}}<div class="space">{{range .Lines}}<div></div>{{end}}</div>{{end}}</li>{{end}}</ol>{{end}}
</body></html>`))

// paperHTML is the printable paper: for students without answers, mappings
// or notes; with ?key=true the answer key for staff; with ?space=true
// ruled lines to answer on, more for more marks, none for choice questions.
func paperHTML(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	key, space := c.Query("key") == "true", c.Query("space") == "true"
	p, a, err := paperOf(c, tx, c.Params("id"), key)
	if err != nil {
		return err
	}
	type pi struct {
		Text, Marks, Answer string
		Options             []string
		Lines               []int
		Pending             bool
	}
	type sec struct {
		Name, Marks string
		Start       int
		Items       []pi
	}
	var view struct {
		School, Title, Class, Subject, Set, Max, Instructions string
		Key, Space                                            bool
		Sections                                              []*sec
	}
	view.Set, view.Key, view.Space, view.Instructions, view.Title = p.Set, key, space, p.Instructions, a.title
	if err := tx.QueryRow(ctx, `
		SELECT coalesce((SELECT display_name FROM branding_versions ORDER BY version DESC LIMIT 1), (SELECT name FROM orgs WHERE id = app_org_id())),
		       (SELECT name FROM levels WHERE id = $1::uuid), (SELECT name FROM subjects WHERE id = $2::uuid)`, a.levelID, a.subjectID).
		Scan(&view.School, &view.Class, &view.Subject); err != nil {
		return err
	}
	view.Max = p.Total
	marks := map[string]string{}
	for _, g := range p.BySection {
		marks[g.Key] = g.Wanted
	}
	for i, it := range p.Items {
		if len(view.Sections) == 0 || view.Sections[len(view.Sections)-1].Name != it.Section {
			view.Sections = append(view.Sections, &sec{Name: it.Section, Marks: marks[it.Section], Start: i + 1})
		}
		s := view.Sections[len(view.Sections)-1]
		x := pi{Marks: it.Marks, Text: "Question still to choose", Pending: true}
		if it.Question != nil {
			x.Text, x.Options, x.Answer, x.Pending = it.Question.Text, it.Question.Options, it.Question.Answer, false
		}
		if len(x.Options) == 0 && !choice(it.Section) {
			x.Lines = make([]int, answerLines(it.Marks))
		}
		s.Items = append(s.Items, x)
	}
	var buf bytes.Buffer
	if err := paperPage.Execute(&buf, view); err != nil {
		return err
	}
	c.Set(fiber.HeaderContentType, "text/html; charset=utf-8")
	return c.Send(buf.Bytes())
}

// answerLines is how many ruled lines a question gets to answer on: two a
// mark, at least two and at most twenty.
func answerLines(marks string) int {
	whole, _, _ := strings.Cut(marks, ".")
	n := 0
	for _, r := range whole {
		n = n*10 + int(r-'0')
	}
	return min(max(2, n*2), 20)
}

// choice says whether a question type is answered by choosing, not writing.
func choice(qtype string) bool {
	t := strings.ToLower(qtype)
	return strings.Contains(t, "choice") || strings.Contains(t, "true or false") || strings.Contains(t, "match")
}
