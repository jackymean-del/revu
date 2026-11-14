package papers

import (
	"context"
	"net/http"
	"slices"
	"strconv"
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

// Section is a named part of a paper: its questions sit in it, in order.
// An extra section is not counted in the marks; one switched off for print
// stays in the paper but is left off the printed copy. A section may hold
// sub-sections, one level down; a section's count and marks take in its
// sub-sections', and whether it counts is the section's to say.
type Section struct {
	ID           string `json:"id"`
	ParentID     string `json:"parentId,omitempty"` // a sub-section names the section it sits in
	Seq          int    `json:"seq"`
	Title        string `json:"title"`
	Instructions string `json:"instructions"`
	Kind         string `json:"kind"`
	Print        bool   `json:"print"`
	Questions    int    `json:"questions"`
	Marks        string `json:"marks"`
}

func queueSections(b *pgx.Batch, p *Paper) {
	b.Queue(`
		SELECT s.id::text, coalesce(s.parent_id::text, ''), s.seq, s.title, s.instructions, s.kind, s.print,
		       (SELECT count(*) FROM paper_items i JOIN paper_sections x ON x.id = i.section_id WHERE x.id = s.id OR x.parent_id = s.id)::int,
		       (SELECT coalesce(sum(i.marks), 0) FROM paper_items i JOIN paper_sections x ON x.id = i.section_id WHERE x.id = s.id OR x.parent_id = s.id)::text
		  FROM paper_sections s WHERE s.paper_id = $1::uuid ORDER BY s.seq`, p.ID).Query(func(rows pgx.Rows) error {
		p.Sections = []Section{}
		for rows.Next() {
			var s Section
			if err := rows.Scan(&s.ID, &s.ParentID, &s.Seq, &s.Title, &s.Instructions, &s.Kind, &s.Print, &s.Questions, &s.Marks); err != nil {
				return err
			}
			s.Marks = trim(s.Marks)
			p.Sections = append(p.Sections, s)
		}
		return rows.Err()
	})
}

// renumber gives the paper's questions their numbers: section by section,
// in each section's order.
func renumber(ctx context.Context, tx pgx.Tx, paperID string) error {
	_, err := tx.Exec(ctx, `
		UPDATE paper_items i SET seq = x.n
		  FROM (SELECT i.id, row_number() OVER (ORDER BY s.seq, i.seq, i.id) AS n
		          FROM paper_items i JOIN paper_sections s ON s.id = i.section_id WHERE i.paper_id = $1::uuid) x
		 WHERE x.id = i.id AND i.seq <> x.n`, paperID)
	return err
}

// draft loads a paper for a change to its build: the person may edit it and
// it is not final.
func draft(c fiber.Ctx) (pgx.Tx, Paper, assessment, error) {
	tx, err := tenant.Tx(c)
	if err != nil {
		return nil, Paper{}, assessment{}, err
	}
	p, a, err := paperOf(c, tx, c.Params("id"), true)
	if err != nil {
		return nil, p, a, err
	}
	return tx, p, a, draftOnly(p)
}

func reply(c fiber.Ctx, tx pgx.Tx, p Paper, status int) error {
	if err := renumber(c.Context(), tx, p.ID); err != nil {
		return err
	}
	if err := loadItems(c.Context(), tx, &p); err != nil {
		return err
	}
	return c.Status(status).JSON(p)
}

type sectionIn struct {
	Title        *string `json:"title"`
	Instructions *string `json:"instructions"`
	Kind         *string `json:"kind"`
	Print        *bool   `json:"print"`
	ParentID     string  `json:"parentId"` // on adding: the section this sub-section sits in
}

func (in sectionIn) check() error {
	if in.Title != nil && (strings.TrimSpace(*in.Title) == "" || len(*in.Title) > 80) {
		return problem.Invalid(api.FieldError{Field: "title", Code: "required", Message: "Name the section, up to 80 characters."})
	}
	if in.Instructions != nil && len(*in.Instructions) > 500 {
		return problem.Invalid(api.FieldError{Field: "instructions", Code: "too_long", Message: "Instructions are up to 500 characters."})
	}
	if in.Kind != nil && *in.Kind != "core" && *in.Kind != "extra" {
		return problem.Invalid(api.FieldError{Field: "kind", Code: "unknown", Message: "A section is core or extra."})
	}
	return nil
}

// addSection adds a section at the end, or a sub-section at the end of the
// section named; with no title it takes the next letter (Section A, Section
// B, ...) or, for a sub-section, the next number (Part 1, Part 2, ...).
func addSection(c fiber.Ctx) error {
	tx, p, _, err := draft(c)
	if err != nil {
		return err
	}
	var in sectionIn
	_ = httpx.Decode(c, &in)
	if err := in.check(); err != nil {
		return err
	}
	tops, kids, at := 0, 0, len(p.Sections)+1
	for i, s := range p.Sections {
		switch {
		case s.ParentID == "":
			tops++
		case s.ParentID == in.ParentID:
			kids++
		}
		if in.ParentID != "" && (s.ID == in.ParentID || s.ParentID == in.ParentID) {
			at = i + 2
		}
	}
	title := "Section " + string(rune('A'+tops))
	if in.ParentID != "" {
		i := slices.IndexFunc(p.Sections, func(s Section) bool { return s.ID == in.ParentID && s.ParentID == "" })
		if i < 0 {
			return problem.Invalid(api.FieldError{Field: "parentId", Code: "unknown", Message: "A sub-section sits in a section of this paper."})
		}
		// Whether it counts is the section's to say.
		title, in.Kind = "Part "+strconv.Itoa(kids+1), &p.Sections[i].Kind
	}
	if tops >= 26 && in.ParentID == "" || kids >= 26 || len(p.Sections) >= 100 {
		return problem.New(http.StatusConflict, "paper.too_many_sections", "A paper has at most 26 sections, each with at most 26 sub-sections.")
	}
	if in.Title != nil {
		title = strings.TrimSpace(*in.Title)
	}
	m, _ := tenant.MemberFrom(c)
	if _, err := tx.Exec(c.Context(), `UPDATE paper_sections SET seq = seq + 1 WHERE paper_id = $1::uuid AND seq >= $2`, p.ID, at); err != nil {
		return err
	}
	if _, err := tx.Exec(c.Context(), `INSERT INTO paper_sections (org_id, paper_id, parent_id, seq, title, instructions, kind, print)
		VALUES ($1, $2::uuid, nullif($7, '')::uuid, $8, $3, coalesce($4, ''), coalesce($5, 'core'), coalesce($6, true))`,
		m.OrgID, p.ID, title, in.Instructions, in.Kind, in.Print, in.ParentID, at); err != nil {
		return err
	}
	return reply(c, tx, p, http.StatusCreated)
}

func putSection(c fiber.Ctx) error {
	tx, p, _, err := draft(c)
	if err != nil {
		return err
	}
	var in sectionIn
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if err := in.check(); err != nil {
		return err
	}
	sid := c.Params("section")
	i := slices.IndexFunc(p.Sections, func(s Section) bool { return s.ID == sid })
	if i < 0 {
		return problem.New(http.StatusNotFound, "section.not_found", "No such section in this paper.")
	}
	if in.Title != nil {
		t := strings.TrimSpace(*in.Title)
		in.Title = &t
	}
	if p.Sections[i].ParentID != "" {
		in.Kind = nil // a sub-section counts as its section does
	}
	if _, err := tx.Exec(c.Context(), `UPDATE paper_sections SET title = coalesce($2, title), instructions = coalesce($3, instructions), kind = coalesce($4, kind), print = coalesce($5, print)
		WHERE id = $1::uuid`, sid, in.Title, in.Instructions, in.Kind, in.Print); err != nil {
		return err
	}
	if in.Kind != nil {
		if _, err := tx.Exec(c.Context(), `UPDATE paper_sections SET kind = $2 WHERE parent_id = $1::uuid`, sid, *in.Kind); err != nil {
			return err
		}
	}
	return reply(c, tx, p, http.StatusOK)
}

// deleteSection removes a section, its sub-sections and their questions
// from the paper; the questions stay in the bank.
func deleteSection(c fiber.Ctx) error {
	tx, p, _, err := draft(c)
	if err != nil {
		return err
	}
	sid := c.Params("section")
	if !slices.ContainsFunc(p.Sections, func(s Section) bool { return s.ID == sid }) {
		return problem.New(http.StatusNotFound, "section.not_found", "No such section in this paper.")
	}
	if _, err := tx.Exec(c.Context(), `DELETE FROM paper_sections WHERE id = $1::uuid`, sid); err != nil {
		return err
	}
	if _, err := tx.Exec(c.Context(), `UPDATE paper_sections s SET seq = x.n FROM (SELECT id, row_number() OVER (ORDER BY seq) AS n FROM paper_sections WHERE paper_id = $1::uuid) x WHERE x.id = s.id`, p.ID); err != nil {
		return err
	}
	return reply(c, tx, p, http.StatusOK)
}

type addItemIn struct {
	SectionID  string      `json:"sectionId"`
	QuestionID string      `json:"questionId"` // a question of the bank, or
	Question   *questionIn `json:"question"`   // one typed here, which joins the bank
}

// addItem puts a question at the end of a section: one from the bank, or
// one typed here, of any type, which is saved to the bank as it is added.
func addItem(c fiber.Ctx) error {
	tx, p, a, err := draft(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	var in addItemIn
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if !slices.ContainsFunc(p.Sections, func(s Section) bool { return s.ID == in.SectionID }) {
		return problem.Invalid(api.FieldError{Field: "sectionId", Code: "unknown", Message: "Choose a section of this paper."})
	}
	if len(p.Items) >= 200 {
		return problem.New(http.StatusConflict, "paper.too_many_questions", "A paper has at most 200 questions.")
	}
	m, _ := tenant.MemberFrom(c)
	qid := in.QuestionID
	switch {
	case in.Question != nil:
		q := *in.Question
		q.LevelID, q.SubjectID = a.levelID, a.subjectID
		if err := q.valid(); err != nil {
			return err
		}
		saved, err := insertQuestion(c, q, m.OrgID, m.UserID)
		if err != nil {
			return err
		}
		qid = saved.ID
	case !records.UUIDShape.MatchString(qid):
		return problem.Invalid(api.FieldError{Field: "questionId", Code: "required", Message: "Choose a question or type one."})
	case slices.ContainsFunc(p.Items, func(i Item) bool { return i.Question != nil && i.Question.ID == qid }):
		return problem.Invalid(api.FieldError{Field: "questionId", Code: "repeated", Message: "That question is already in this paper."})
	}
	tag, err := tx.Exec(ctx, `
		INSERT INTO paper_items (org_id, paper_id, section_id, seq, section, chapter, lesson_id, level, marks, question_id, locked)
		SELECT $1, $2::uuid, $3::uuid, (SELECT coalesce(max(seq), 0) + 1 FROM paper_items WHERE section_id = $3::uuid), q.qtype,
		       coalesce((SELECT name FROM lessons WHERE id = q.lesson_id), ''), q.lesson_id, '', q.marks, q.id, true
		  FROM questions q WHERE q.id = $4::uuid AND q.level_id = $5::uuid AND q.subject_id = $6::uuid AND q.status <> 'retired'`,
		m.OrgID, p.ID, in.SectionID, qid, a.levelID, a.subjectID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return problem.Invalid(api.FieldError{Field: "questionId", Code: "mismatch", Message: "That question is not of this class and subject."})
	}
	return reply(c, tx, p, http.StatusCreated)
}

func deleteItem(c fiber.Ctx) error {
	tx, p, _, err := draft(c)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(c.Context(), `DELETE FROM paper_items WHERE id = $1 AND paper_id = $2::uuid`, c.Params("item"), p.ID); err != nil {
		return err
	}
	return reply(c, tx, p, http.StatusOK)
}

type orderIn struct {
	Sections []struct {
		ID      string   `json:"id"`
		ItemIDs []string `json:"itemIds"`
	} `json:"sections"`
}

// putOrder sets the order of everything at once: the sections, and the
// questions in each, which may move between sections. Every section and
// question of the paper is named exactly once, and a section's sub-sections
// follow it directly.
func putOrder(c fiber.Ctx) error {
	tx, p, _, err := draft(c)
	if err != nil {
		return err
	}
	var in orderIn
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	bad := problem.Invalid(api.FieldError{Field: "sections", Code: "invalid", Message: "Name every section and question of the paper once."})
	if len(in.Sections) != len(p.Sections) {
		return bad
	}
	seenS, seenI := map[string]bool{}, map[string]bool{}
	n := 0
	var b pgx.Batch
	top := ""
	for i, s := range in.Sections {
		at := slices.IndexFunc(p.Sections, func(x Section) bool { return x.ID == s.ID })
		if seenS[s.ID] || at < 0 {
			return bad
		}
		if parent := p.Sections[at].ParentID; parent == "" {
			top = s.ID
		} else if parent != top {
			return problem.Invalid(api.FieldError{Field: "sections", Code: "invalid", Message: "A sub-section stays in its section."})
		}
		seenS[s.ID] = true
		b.Queue(`UPDATE paper_sections SET seq = $2 WHERE id = $1::uuid`, s.ID, i+1)
		for _, id := range s.ItemIDs {
			if seenI[id] || !slices.ContainsFunc(p.Items, func(x Item) bool { return x.ID == id }) {
				return bad
			}
			seenI[id] = true
			n++
			b.Queue(`UPDATE paper_items SET section_id = $2::uuid, seq = $3 WHERE id = $1::uuid`, id, s.ID, n)
		}
	}
	if n != len(p.Items) {
		return bad
	}
	if err := tx.SendBatch(c.Context(), &b).Close(); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "reorder", Entity: "papers", EntityID: p.ID, After: map[string]any{"sections": len(in.Sections), "questions": n}}); err != nil {
		return err
	}
	return reply(c, tx, p, http.StatusOK)
}
