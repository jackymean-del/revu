package results

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/evidence"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Routes serves results. Reads never compute: a stale result is shown with
// its marker until the recompute loop has replaced it.
func Routes(g fiber.Router) {
	g.Get("/results", section)
	g.Get("/results/explain", explain)
	g.Post("/results/recompute", recompute)
}

// Responses follow contracts/openapi.yaml. Optional objects are pointers,
// so an absent result is absent rather than an empty one.
type (
	cell struct {
		State  string `json:"state"`
		Reason string `json:"reason,omitempty"`
		Value  string `json:"value,omitempty"`
		Max    string `json:"max,omitempty"`
		Pct    string `json:"pct,omitempty"`
		Grade  string `json:"grade,omitempty"`
	}
	componentCell struct {
		Code   string `json:"code"`
		State  string `json:"state"`
		Reason string `json:"reason,omitempty"`
		Value  string `json:"value,omitempty"`
	}
	studentResult struct {
		StudentID   string          `json:"studentId"`
		Name        string          `json:"name"`
		AdmissionNo string          `json:"admissionNo"`
		RollNo      string          `json:"rollNo,omitempty"`
		Stale       bool            `json:"stale"`
		Result      *cell           `json:"result,omitempty"`
		Components  []componentCell `json:"components"`
	}
	sectionResults struct {
		Access     string             `json:"access"`
		Scheme     *api.SchemeRef     `json:"scheme,omitempty"`
		Components []api.ResultColumn `json:"components"`
		Counts     api.ResultCounts   `json:"counts"`
		Rows       []studentResult    `json:"rows"`
	}
	explanation struct {
		StudentID  string          `json:"studentId"`
		Name       string          `json:"name"`
		PeriodID   string          `json:"periodId"`
		SubjectID  string          `json:"subjectId"`
		Scheme     api.SchemeRef   `json:"scheme"`
		Stale      bool            `json:"stale"`
		ComputedAt string          `json:"computedAt"`
		Detail     json.RawMessage `json:"detail"`
	}
)

// Section is the facts the policy and the queries need about a section.
type Section struct{ ID, BranchID, LevelID, YearID string }

// LoadSection reads a section and checks the period is in its year.
func LoadSection(ctx context.Context, tx pgx.Tx, sectionID, periodID string) (Section, error) {
	s := Section{ID: sectionID}
	for field, v := range map[string]string{"sectionId": sectionID, "periodId": periodID} {
		if !records.UUIDShape.MatchString(v) {
			return s, problem.Invalid(api.FieldError{Field: field, Code: "unknown", Message: "Not an id."})
		}
	}
	err := tx.QueryRow(ctx, `SELECT branch_id::text, level_id::text, year_id::text FROM sections WHERE id = $1::uuid AND deleted_at IS NULL`, sectionID).
		Scan(&s.BranchID, &s.LevelID, &s.YearID)
	if errors.Is(err, pgx.ErrNoRows) {
		return s, problem.New(http.StatusNotFound, "section.not_found", "No section has this id.")
	}
	if err != nil {
		return s, err
	}
	var inYear bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM periods WHERE id = $1::uuid AND year_id = $2::uuid AND deleted_at IS NULL)`, periodID, s.YearID).Scan(&inYear); err != nil {
		return s, err
	}
	if !inYear {
		return s, problem.Invalid(api.FieldError{Field: "periodId", Code: "unknown", Message: "This period is not in the section's year."})
	}
	return s, nil
}

// Student is one student of a section, and whether they take a subject.
type Student struct {
	ID, Name, AdmissionNo, RollNo string
	Takes, ChoiceMissing          bool
}

// Students lists a section's students in roll order, with whether each
// takes the subject in the period (Part 74.1).
func Students(ctx context.Context, tx pgx.Tx, s Section, periodID, subjectID string) ([]Student, error) {
	rows, err := tx.Query(ctx, `
		SELECT st.id::text, st.name, st.admission_no, coalesce(e.roll_no, ''),
		       `+fmt.Sprintf(evidence.Applicable, "("+evidence.Selected+")", "st.id")+`, `+choiceMissing+`
		  FROM enrolments e
		  JOIN students st ON st.id = e.student_id AND st.deleted_at IS NULL
		  CROSS JOIN LATERAL (SELECT $2::uuid AS level_id, $4::uuid AS subject_id, $3::uuid AS year_id, $5::uuid AS period_id) a
		  CROSS JOIN LATERAL (SELECT st.id AS s) k
		 WHERE e.section_id = $1::uuid AND e.year_id = $3::uuid AND e.deleted_at IS NULL
		 ORDER BY e.roll_no IS NULL, lpad(e.roll_no, 12, '0'), st.name`, s.ID, s.LevelID, s.YearID, subjectID, periodID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Student, error) {
		var x Student
		return x, r.Scan(&x.ID, &x.Name, &x.AdmissionNo, &x.RollNo, &x.Takes, &x.ChoiceMissing)
	})
}

func ids(c fiber.Ctx, names ...string) (map[string]string, error) {
	out := map[string]string{}
	for _, n := range names {
		v := c.Query(n)
		if !records.UUIDShape.MatchString(v) {
			return nil, problem.Invalid(api.FieldError{Field: n, Code: "required", Message: "Give an id."})
		}
		out[n] = v
	}
	return out, nil
}

func section(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	q, err := ids(c, "sectionId", "periodId", "subjectId")
	if err != nil {
		return err
	}
	s, err := LoadSection(ctx, tx, q["sectionId"], q["periodId"])
	if err != nil {
		return err
	}
	actor, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	access := policy.Decide(actor, policy.ResultsRead, policy.Target{BranchID: s.BranchID, SectionID: s.ID, SubjectID: q["subjectId"]})
	if access == policy.None {
		return problem.New(http.StatusForbidden, "auth.forbidden", "Your role does not show these results.")
	}
	out := sectionResults{Access: "full", Components: []api.ResultColumn{}, Rows: []studentResult{}}
	if access == policy.Counts {
		out.Access = "counts"
	}
	schemes, err := LoadSchemes(ctx, tx)
	if err != nil {
		return err
	}
	if applied, ok := schemes.For(s.LevelID, q["periodId"], q["subjectId"]); ok {
		out.Scheme = &api.SchemeRef{Id: applied.ID, Name: applied.Name, Version: applied.Version}
		for _, comp := range applied.Definition.Components {
			out.Components = append(out.Components, api.ResultColumn{Code: comp.Code, Name: comp.Name, Max: trimDec(string(comp.ScaleTo))})
		}
	}
	students, err := Students(ctx, tx, s, q["periodId"], q["subjectId"])
	if err != nil {
		return err
	}
	var studentIDs []string
	for _, st := range students {
		studentIDs = append(studentIDs, st.ID)
	}
	type stored struct {
		cell
		stale bool
	}
	got := map[[2]string]stored{}
	rows, err := tx.Query(ctx, `
		SELECT student_id::text, component_code, state::text, coalesce(reason, ''), coalesce(value::text, ''), coalesce(max::text, ''),
		       coalesce(pct::text, ''), coalesce(grade, ''), stale
		  FROM computed_results WHERE period_id = $1::uuid AND subject_id = $2::uuid AND student_id = ANY($3::uuid[])`,
		q["periodId"], q["subjectId"], studentIDs)
	if err != nil {
		return err
	}
	for rows.Next() {
		var student, code string
		var x stored
		if err := rows.Scan(&student, &code, &x.State, &x.Reason, &x.Value, &x.Max, &x.Pct, &x.Grade, &x.stale); err != nil {
			return err
		}
		x.Max = trimDec(x.Max)
		got[[2]string{student, code}] = x
	}
	if err := rows.Err(); err != nil {
		return err
	}
	waiting := map[string]bool{}
	rows, err = tx.Query(ctx, `SELECT student_id::text FROM result_stale_intents WHERE period_id = $1::uuid AND subject_id = $2::uuid AND student_id = ANY($3::uuid[])`,
		q["periodId"], q["subjectId"], studentIDs)
	if err != nil {
		return err
	}
	pending, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	for _, id := range pending {
		waiting[id] = true
	}

	for _, st := range students {
		if !st.Takes && !st.ChoiceMissing {
			continue // no result for a subject the student does not take
		}
		row := studentResult{StudentID: st.ID, Name: st.Name, AdmissionNo: st.AdmissionNo, RollNo: st.RollNo, Components: []componentCell{}, Stale: waiting[st.ID]}
		if r, ok := got[[2]string{st.ID, "_subject"}]; ok && out.Scheme != nil {
			c := r.cell
			row.Result, row.Stale = &c, row.Stale || r.stale
			for _, col := range out.Components {
				if x, ok := got[[2]string{st.ID, col.Code}]; ok {
					row.Components = append(row.Components, componentCell{Code: col.Code, State: x.State, Reason: x.Reason, Value: x.Value})
				}
			}
		}
		switch {
		case row.Result == nil:
			out.Counts.NotAssessed++
		case row.Result.State == "complete":
			out.Counts.Complete++
		case row.Result.State == "provisional":
			out.Counts.Provisional++
		case row.Result.State == "blocked":
			out.Counts.Blocked++
		default:
			out.Counts.NotAssessed++
		}
		if row.Stale {
			out.Counts.Stale++
		}
		if access == policy.Full {
			out.Rows = append(out.Rows, row)
		}
	}
	return c.JSON(out)
}

// trimDec writes 100.00 as 100, as a maximum reads best.
func trimDec(s string) string {
	for i := 0; i < len(s); i++ {
		if s[i] == '.' {
			frac := s[i+1:]
			for _, ch := range frac {
				if ch != '0' {
					return s
				}
			}
			return s[:i]
		}
	}
	return s
}

// studentSection is the section a student sits in during a period's year.
func studentSection(ctx context.Context, tx pgx.Tx, studentID, periodID string) (Section, string, error) {
	var s Section
	var name string
	err := tx.QueryRow(ctx, `
		SELECT sec.id::text, sec.branch_id::text, sec.level_id::text, sec.year_id::text, st.name
		  FROM periods p
		  JOIN enrolments e ON e.year_id = p.year_id AND e.student_id = $1::uuid AND e.deleted_at IS NULL
		  JOIN sections sec ON sec.id = e.section_id AND sec.deleted_at IS NULL
		  JOIN students st ON st.id = e.student_id AND st.deleted_at IS NULL
		 WHERE p.id = $2::uuid ORDER BY e.created_at DESC LIMIT 1`, studentID, periodID).
		Scan(&s.ID, &s.BranchID, &s.LevelID, &s.YearID, &name)
	if errors.Is(err, pgx.ErrNoRows) {
		return s, "", problem.New(http.StatusNotFound, "result.not_found", "This student is in no section in that period's year.")
	}
	return s, name, err
}

func explain(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	q, err := ids(c, "studentId", "periodId", "subjectId")
	if err != nil {
		return err
	}
	s, name, err := studentSection(ctx, tx, q["studentId"], q["periodId"])
	if err != nil {
		return err
	}
	actor, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	if err := policy.Check(actor, policy.ResultsRead, policy.Target{BranchID: s.BranchID, SectionID: s.ID, SubjectID: q["subjectId"]}); err != nil {
		return err
	}
	out := explanation{StudentID: q["studentId"], Name: name, PeriodID: q["periodId"], SubjectID: q["subjectId"]}
	err = tx.QueryRow(ctx, `
		SELECT r.detail, r.stale, to_char(r.computed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), s.id::text, s.name, r.scheme_version
		  FROM computed_results r JOIN schemes s ON s.id = r.scheme_id
		 WHERE r.student_id = $1::uuid AND r.period_id = $2::uuid AND r.subject_id = $3::uuid AND r.component_code = '_subject'`,
		q["studentId"], q["periodId"], q["subjectId"]).
		Scan(&out.Detail, &out.Stale, &out.ComputedAt, &out.Scheme.Id, &out.Scheme.Name, &out.Scheme.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return problem.New(http.StatusNotFound, "result.not_found", "There is no result to explain yet.")
	}
	if err != nil {
		return err
	}
	return c.JSON(out)
}

// SectionKeys are the results of a section in a period: one subject, or
// every subject the level teaches.
func SectionKeys(ctx context.Context, tx pgx.Tx, s Section, periodID, subjectID string) ([]Key, error) {
	rows, err := tx.Query(ctx, `
		SELECT DISTINCT e.student_id::text, $2::text, ls.subject_id::text
		  FROM enrolments e
		  JOIN level_subjects ls ON ls.level_id = $3::uuid AND ls.deleted_at IS NULL
		 WHERE e.section_id = $1::uuid AND e.year_id = $4::uuid AND e.deleted_at IS NULL
		   AND ($5 = '' OR ls.subject_id::text = $5)`, s.ID, periodID, s.LevelID, s.YearID, subjectID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(r pgx.CollectableRow) (Key, error) {
		var k Key
		return k, r.Scan(&k.StudentID, &k.PeriodID, &k.SubjectID)
	})
}

func recompute(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	var in api.RecomputeInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if in.SubjectId != "" && !records.UUIDShape.MatchString(in.SubjectId) {
		return problem.Invalid(api.FieldError{Field: "subjectId", Code: "unknown", Message: "Not an id."})
	}
	s, err := LoadSection(ctx, tx, in.SectionId, in.PeriodId)
	if err != nil {
		return err
	}
	actor, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	if err := policy.Check(actor, policy.ResultsRead, policy.Target{BranchID: s.BranchID, SectionID: s.ID, SubjectID: in.SubjectId}); err != nil {
		return err
	}
	keys, err := SectionKeys(ctx, tx, s, in.PeriodId, in.SubjectId)
	if err != nil {
		return err
	}
	n, err := Recompute(ctx, tx, keys)
	if err != nil {
		return err
	}
	return c.JSON(api.RecomputeDone{Computed: n})
}
