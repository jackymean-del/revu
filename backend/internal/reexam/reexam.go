// Package reexam serves re-exams (blueprint v23 B7, first slice): finding
// the students from an assessment by rules or by hand, a re-exam as a new
// assessment linked to the original, and how its marks count, previewed,
// approved and applied. The original assessment and its marks never change.
package reexam

import (
	"context"
	"errors"
	"fmt"
	"math"
	"net/http"
	"slices"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Routes serves finding students, re-exams, and their policy.
func Routes(g fiber.Router) {
	g.Post("/reexams/preview", preview)
	g.Get("/reexams", list)
	g.Post("/reexams", create)
	g.Get("/reexams/:id", get)
	g.Put("/reexams/:id", setPolicy)
	g.Post("/reexams/:id/:step", step)
}

// Criteria pick students from an assessment; a student matching any of
// them is suggested.
type Criteria struct {
	Below      *float64 `json:"below,omitempty"` // percentage below this
	From       *float64 `json:"from,omitempty"`  // a range, from (inclusive)
	To         *float64 `json:"to,omitempty"`    // to (exclusive)
	Absent     bool     `json:"absent"`
	Incomplete bool     `json:"incomplete"`
}

// Sitter is a student of the assessment, how they did, and whether the
// rules suggest a re-exam, and why.
type Sitter struct {
	StudentID   string   `json:"studentId"`
	Name        string   `json:"name"`
	AdmissionNo string   `json:"admissionNo"`
	RollNo      string   `json:"rollNo"`
	SectionID   string   `json:"sectionId"`
	Section     string   `json:"section"`
	Pct         *float64 `json:"pct,omitempty"`
	State       string   `json:"state"` // scored, absent, incomplete, excused or none
	Suggested   bool     `json:"suggested"`
	Reason      string   `json:"reason"`
}

type source struct {
	id, title, kind, levelID, subjectID, periodID, yearID, entryMode, subject string
	sections                                                                  []string
}

func loadSource(ctx context.Context, tx pgx.Tx, id string) (source, error) {
	var s source
	notFound := problem.New(http.StatusNotFound, "assessment.not_found", "No assessment has this id.")
	if !records.UUIDShape.MatchString(id) {
		return s, notFound
	}
	err := tx.QueryRow(ctx, `
		SELECT a.id::text, a.title, a.kind, a.level_id::text, a.subject_id::text, a.period_id::text, a.year_id::text, a.entry_mode, sj.name,
		       coalesce((SELECT array_agg(section_id::text) FROM assessment_scopes WHERE assessment_id = a.id), '{}'),
		       a.retake_of IS NOT NULL
		  FROM assessments a JOIN subjects sj ON sj.id = a.subject_id WHERE a.id = $1::uuid AND a.deleted_at IS NULL`, id).
		Scan(&s.id, &s.title, &s.kind, &s.levelID, &s.subjectID, &s.periodID, &s.yearID, &s.entryMode, &s.subject, &s.sections, new(bool))
	if errors.Is(err, pgx.ErrNoRows) {
		return s, notFound
	}
	return s, err
}

// plannable is the source's sections this person may plan a re-exam for:
// administrators and coordinators, and the subject's teachers there.
func plannable(c fiber.Ctx, tx pgx.Tx, s source) ([]string, error) {
	actor, err := tenant.Teaching(c)
	if err != nil {
		return nil, err
	}
	rows, err := tx.Query(c.Context(), `SELECT id::text, branch_id::text FROM sections WHERE id = ANY($1::uuid[])`, s.sections)
	if err != nil {
		return nil, err
	}
	var out []string
	for rows.Next() {
		var id, branch string
		if err := rows.Scan(&id, &branch); err != nil {
			return nil, err
		}
		if policy.Decide(actor, policy.AssessmentEdit, policy.Target{BranchID: branch, SectionID: id, SubjectID: s.subjectID}) == policy.Full {
			out = append(out, id)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(out) == 0 {
		return nil, problem.New(http.StatusForbidden, "auth.forbidden", "Only this subject's teachers, coordinators and administrators plan its re-exams.")
	}
	return out, nil
}

// sitters is how each student of the sections did in an assessment: the
// share of the maximum of its counted parts. Absent, exempt and pending are
// never zero: a child absent for the whole assessment is absent, one with
// some parts unmarked is incomplete.
func sitters(ctx context.Context, tx pgx.Tx, assessmentID, yearID string, sections []string) ([]Sitter, error) {
	rows, err := tx.Query(ctx, `
		WITH parts AS (SELECT id, max_marks FROM assessment_parts WHERE assessment_id = $1::uuid AND deleted_at IS NULL AND kind = 'main' AND counts_in_total)
		SELECT st.id::text, st.name, st.admission_no, coalesce(e.roll_no, ''), e.section_id::text, l.name || ' ' || sec.name,
		       coalesce(ap.status, ''),
		       (SELECT count(*) FROM parts)::int,
		       (SELECT count(*) FROM evidence ev JOIN parts p ON p.id = ev.part_id WHERE ev.assessment_id = $1::uuid AND ev.student_id = st.id AND ev.state = 'scored')::int,
		       (SELECT count(*) FROM evidence ev JOIN parts p ON p.id = ev.part_id WHERE ev.assessment_id = $1::uuid AND ev.student_id = st.id AND ev.state = 'absent')::int,
		       (SELECT coalesce(sum(ev.value), 0) FROM evidence ev JOIN parts p ON p.id = ev.part_id WHERE ev.assessment_id = $1::uuid AND ev.student_id = st.id AND ev.state = 'scored')::float8,
		       (SELECT coalesce(sum(p.max_marks), 0) FROM parts p)::float8
		  FROM enrolments e
		  JOIN students st ON st.id = e.student_id AND st.deleted_at IS NULL
		  JOIN sections sec ON sec.id = e.section_id
		  JOIN levels l ON l.id = sec.level_id
		  LEFT JOIN assessment_participation ap ON ap.assessment_id = $1::uuid AND ap.student_id = st.id
		 WHERE e.section_id = ANY($3::uuid[]) AND e.year_id = $2::uuid AND e.deleted_at IS NULL
		 ORDER BY l.seq, sec.name, coalesce(e.roll_no, '') = '', length(coalesce(e.roll_no, '')), e.roll_no, st.name`, assessmentID, yearID, sections)
	if err != nil {
		return nil, err
	}
	var out []Sitter
	for rows.Next() {
		var x Sitter
		var status string
		var parts, scored, absent int
		var got, max float64
		if err := rows.Scan(&x.StudentID, &x.Name, &x.AdmissionNo, &x.RollNo, &x.SectionID, &x.Section, &status, &parts, &scored, &absent, &got, &max); err != nil {
			return nil, err
		}
		switch {
		case status == "absent" || (parts > 0 && absent == parts):
			x.State = "absent"
		case status != "":
			x.State = "excused" // exempt, not applicable or left
		case scored == 0:
			x.State = "none"
		case scored < parts:
			x.State = "incomplete"
		default:
			x.State = "scored"
		}
		if scored > 0 && max > 0 {
			pct := math.Round(got*1000/max) / 10
			x.Pct = &pct
		}
		out = append(out, x)
	}
	return out, rows.Err()
}

func pctText(f float64) string {
	return strings.TrimSuffix(strings.TrimSuffix(fmt.Sprintf("%.1f", f), "0"), ".") + "%"
}

// suggest marks who the criteria pick, and why.
func suggest(xs []Sitter, cr Criteria) {
	for i := range xs {
		x := &xs[i]
		switch {
		case cr.Absent && x.State == "absent":
			x.Suggested, x.Reason = true, "Absent"
		case cr.Incomplete && x.State == "incomplete":
			x.Suggested, x.Reason = true, "Some parts not marked"
		case x.State == "scored" && x.Pct != nil && cr.Below != nil && *x.Pct < *cr.Below:
			x.Suggested, x.Reason = true, fmt.Sprintf("Below %s: %s", pctText(*cr.Below), pctText(*x.Pct))
		case x.State == "scored" && x.Pct != nil && cr.From != nil && cr.To != nil && *x.Pct >= *cr.From && *x.Pct < *cr.To:
			x.Suggested, x.Reason = true, fmt.Sprintf("Between %s and %s: %s", pctText(*cr.From), pctText(*cr.To), pctText(*x.Pct))
		}
	}
}

func checkCriteria(cr Criteria) error {
	bad := func(p *float64) bool { return p != nil && (*p < 0 || *p > 100) }
	if bad(cr.Below) || bad(cr.From) || bad(cr.To) || (cr.From != nil) != (cr.To != nil) || (cr.From != nil && *cr.From >= *cr.To) {
		return problem.Invalid(api.FieldError{Field: "criteria", Code: "invalid", Message: "Percentages are from 0 to 100, and a range needs a from below its to."})
	}
	return nil
}

type previewIn struct {
	SourceID string   `json:"sourceId"`
	Criteria Criteria `json:"criteria"`
}

// Preview is everyone who sat the assessment in the sections this person
// plans for, the suggested first.
type Preview struct {
	SourceID string   `json:"sourceId"`
	Title    string   `json:"title"`
	Subject  string   `json:"subject"`
	Sitters  []Sitter `json:"sitters"`
}

func preview(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	var in previewIn
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if err := checkCriteria(in.Criteria); err != nil {
		return err
	}
	s, err := loadSource(c.Context(), tx, in.SourceID)
	if err != nil {
		return err
	}
	secs, err := plannable(c, tx, s)
	if err != nil {
		return err
	}
	xs, err := sitters(c.Context(), tx, s.id, s.yearID, secs)
	if err != nil {
		return err
	}
	suggest(xs, in.Criteria)
	if xs == nil {
		xs = []Sitter{}
	}
	return c.JSON(Preview{SourceID: s.id, Title: s.title, Subject: s.subject, Sitters: xs})
}

type pick struct {
	StudentID string `json:"studentId"`
	Reason    string `json:"reason"`
	ByHand    bool   `json:"byHand"`
}

type createIn struct {
	SourceID   string   `json:"sourceId"`
	Criteria   Criteria `json:"criteria"`
	Students   []pick   `json:"students"`
	Title      string   `json:"title"`
	HeldOn     string   `json:"heldOn"`
	Policy     string   `json:"policy"`
	AbsentRule string   `json:"absentRule"`
}

func validRule(p, a string) error {
	if !slices.Contains([]string{"replace", "higher", "separate"}, p) || !slices.Contains([]string{"keep", "pending"}, a) {
		return problem.Invalid(api.FieldError{Field: "policy", Code: "unknown", Message: "Choose how the new mark counts, and what an absence does."})
	}
	return nil
}

// create makes the re-exam: a new assessment of the same subject, period
// and parts, linked to the original as the next attempt, for the sections
// of the students chosen; everyone else there is not applicable, so the
// marks grid shows only those who sit it.
func create(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	var in createIn
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if err := checkCriteria(in.Criteria); err != nil {
		return err
	}
	if in.Policy == "" {
		in.Policy = "higher"
	}
	if in.AbsentRule == "" {
		in.AbsentRule = "keep"
	}
	if err := validRule(in.Policy, in.AbsentRule); err != nil {
		return err
	}
	src, err := loadSource(ctx, tx, in.SourceID)
	if err != nil {
		return err
	}
	var isRetake bool
	if err := tx.QueryRow(ctx, `SELECT retake_of IS NOT NULL FROM assessments WHERE id = $1::uuid`, src.id).Scan(&isRetake); err != nil {
		return err
	}
	if isRetake {
		return problem.Invalid(api.FieldError{Field: "sourceId", Code: "retake", Message: "Plan another re-exam from the original assessment, not from a re-exam."})
	}
	secs, err := plannable(c, tx, src)
	if err != nil {
		return err
	}
	xs, err := sitters(ctx, tx, src.id, src.yearID, secs)
	if err != nil {
		return err
	}
	in.Title = strings.TrimSpace(in.Title)
	if len(in.Students) == 0 || len(in.Students) > 500 || len(in.Title) > 120 {
		return problem.Invalid(api.FieldError{Field: "students", Code: "required", Message: "Choose at least one student, up to 500; the title is up to 120 characters."})
	}
	if in.HeldOn != "" && !dateShape.MatchString(in.HeldOn) {
		return problem.Invalid(api.FieldError{Field: "heldOn", Code: "invalid", Message: "Give the date as YYYY-MM-DD."})
	}
	sectionOf := map[string]string{}
	for _, x := range xs {
		sectionOf[x.StudentID] = x.SectionID
	}
	var sections []string
	seen := map[string]bool{}
	for _, p := range in.Students {
		sec, ok := sectionOf[p.StudentID]
		if !ok {
			return problem.Invalid(api.FieldError{Field: "students", Code: "not_in_scope", Message: "A student chosen did not sit this assessment in a section you plan for."})
		}
		if seen[p.StudentID] {
			return problem.Invalid(api.FieldError{Field: "students", Code: "repeated", Message: "A student is chosen twice."})
		}
		seen[p.StudentID] = true
		if strings.TrimSpace(p.Reason) == "" || len(p.Reason) > 200 {
			return problem.Invalid(api.FieldError{Field: "students", Code: "reason", Message: "Every student needs a reason, up to 200 characters; say why for anyone added by hand."})
		}
		if !slices.Contains(sections, sec) {
			sections = append(sections, sec)
		}
	}
	m, _ := tenant.MemberFrom(c)
	var attempt int
	if err := tx.QueryRow(ctx, `SELECT coalesce(max(attempt), 1) + 1 FROM assessments WHERE (id = $1::uuid OR retake_of = $1::uuid) AND deleted_at IS NULL`, src.id).Scan(&attempt); err != nil {
		return err
	}
	if attempt > 9 {
		return problem.New(http.StatusConflict, "reexam.too_many", "An assessment has at most eight re-exams.")
	}
	if in.Title == "" {
		in.Title = src.title + ", re-exam"
		if attempt > 2 {
			in.Title = fmt.Sprintf("%s, re-exam %d", src.title, attempt-1)
		}
	}
	var id string
	if err := tx.QueryRow(ctx, `
		INSERT INTO assessments (org_id, year_id, period_id, level_id, subject_id, title, kind, entry_mode, held_on, created_by, retake_of, attempt)
		SELECT org_id, year_id, period_id, level_id, subject_id, $2, kind, entry_mode, nullif($3, '')::date, $4, id, $5
		  FROM assessments WHERE id = $1::uuid RETURNING id::text`, src.id, in.Title, in.HeldOn, m.UserID, attempt).Scan(&id); err != nil {
		return err
	}
	var b pgx.Batch
	b.Queue(`INSERT INTO assessment_parts (org_id, assessment_id, seq, name, kind, component_code, counts_in_total, max_marks)
		SELECT org_id, $2::uuid, seq, name, kind, component_code, counts_in_total, max_marks FROM assessment_parts WHERE assessment_id = $1::uuid AND deleted_at IS NULL`, src.id, id)
	b.Queue(`INSERT INTO assessment_scopes (org_id, assessment_id, section_id) SELECT $1, $2::uuid, unnest($3::uuid[])`, m.OrgID, id, sections)
	b.Queue(`INSERT INTO reexams (assessment_id, org_id, source_id, policy, absent_rule, criteria, created_by) VALUES ($1::uuid, $2, $3::uuid, $4, $5, $6, $7)`,
		id, m.OrgID, src.id, in.Policy, in.AbsentRule, in.Criteria, m.UserID)
	ids := make([]string, 0, len(in.Students))
	for _, p := range in.Students {
		ids = append(ids, p.StudentID)
		b.Queue(`INSERT INTO reexam_candidates (org_id, assessment_id, student_id, reason, added_by_hand) VALUES ($1, $2::uuid, $3::uuid, $4, $5)`,
			m.OrgID, id, p.StudentID, strings.TrimSpace(p.Reason), p.ByHand)
	}
	// Everyone else in those sections does not sit it.
	b.Queue(`INSERT INTO assessment_participation (org_id, assessment_id, student_id, status, reason_code, set_by)
		SELECT $1, $2::uuid, e.student_id, 'not_applicable', 'not_retaking', $5
		  FROM enrolments e WHERE e.section_id = ANY($3::uuid[]) AND e.year_id = $6::uuid AND e.deleted_at IS NULL AND NOT (e.student_id = ANY($4::uuid[]))
		ON CONFLICT DO NOTHING`, m.OrgID, id, sections, ids, m.UserID, src.yearID)
	if err := tx.SendBatch(ctx, &b).Close(); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "create", Entity: "reexams", EntityID: id,
		After: map[string]any{"sourceId": src.id, "attempt": attempt, "students": len(in.Students), "policy": in.Policy, "absentRule": in.AbsentRule}}); err != nil {
		return err
	}
	d, err := detail(c, tx, id)
	if err != nil {
		return err
	}
	return c.Status(http.StatusCreated).JSON(d)
}
