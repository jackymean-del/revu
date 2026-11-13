// Package assessment serves assessments and their entry grid (pilot P0.3).
// An assessment belongs to one period and subject and covers some sections
// of one level. Its parts are the entry columns: one for the total in Total
// marks mode, one per paper section in Section-wise mode. An additional
// part is a component such as a practical and carries its own code
// (AT-v2-02). Marks themselves change only through the evidence package.
package assessment

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/evidence"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/scheme"
	"github.com/jackymean-del/revu/internal/stale"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Routes serves assessments, their grid, row status and template.
func Routes(g fiber.Router) {
	g.Get("/assessments", list)
	g.Post("/assessments", create)
	g.Put("/assessments/:id", update)
	g.Delete("/assessments/:id", remove)
	g.Post("/assessments/:id/lock", lock)
	g.Post("/assessments/:id/unlock", unlock)
	g.Get("/assessments/:id/grid", grid)
	g.Put("/assessments/:id/participation/:studentId", participation)
	g.Get("/assessments/:id/template.xlsx", template)
}

var errNotFound = problem.New(http.StatusNotFound, "assessment.not_found", "No assessment has this id.")

// load reads an assessment with its sections and parts.
func load(ctx context.Context, tx pgx.Tx, id string) (api.Assessment, error) {
	if !records.UUIDShape.MatchString(id) {
		return api.Assessment{}, errNotFound
	}
	list, err := loadMany(ctx, tx, `id = $1::uuid`, id)
	if err != nil {
		return api.Assessment{}, err
	}
	if len(list) == 0 {
		return api.Assessment{}, errNotFound
	}
	return list[0], nil
}

// loadMany reads the live assessments matching where, newest first, with
// their sections and parts, in one round trip to the database.
func loadMany(ctx context.Context, tx pgx.Tx, where string, args ...any) ([]api.Assessment, error) {
	var b pgx.Batch
	b.Queue(`
		SELECT id::text, year_id::text, period_id::text, level_id::text, subject_id::text, title, kind, entry_mode, status::text, coalesce(held_on::text, ''),
		       coalesce((SELECT array_agg(section_id::text ORDER BY section_id) FROM assessment_scopes WHERE assessment_id = a.id), '{}')
		  FROM assessments a WHERE deleted_at IS NULL AND `+where+` ORDER BY created_at DESC LIMIT 200`, args...)
	b.Queue(`
		SELECT assessment_id::text, id::text, seq, name, kind::text, coalesce(component_code, ''), counts_in_total, max_marks::text
		  FROM assessment_parts
		 WHERE deleted_at IS NULL AND assessment_id IN (SELECT id FROM assessments a WHERE deleted_at IS NULL AND `+where+`)
		 ORDER BY assessment_id, seq`, args...)
	br := tx.SendBatch(ctx, &b)
	defer br.Close()
	rows, err := br.Query()
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (a api.Assessment, err error) {
		err = r.Scan(&a.Id, &a.YearId, &a.PeriodId, &a.LevelId, &a.SubjectId, &a.Title, &a.Kind, &a.EntryMode, &a.Status, &a.HeldOn, &a.SectionIds)
		a.Parts = []api.AssessmentPart{}
		return a, err
	})
	if err != nil {
		return nil, err
	}
	at := map[string]int{}
	for i, a := range list {
		at[a.Id] = i
	}
	rows, err = br.Query()
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var aid string
		var p api.AssessmentPart
		if err := rows.Scan(&aid, &p.Id, &p.Seq, &p.Name, &p.Kind, &p.ComponentCode, &p.CountsInTotal, &p.MaxMarks); err != nil {
			return nil, err
		}
		if i, ok := at[aid]; ok {
			list[i].Parts = append(list[i].Parts, p)
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return list, br.Close()
}

// sectionTarget is what the policy needs about one section of an assessment.
func sectionTarget(ctx context.Context, tx pgx.Tx, sectionID, subjectID string) (policy.Target, error) {
	t := policy.Target{SectionID: sectionID, SubjectID: subjectID}
	err := tx.QueryRow(ctx, `SELECT branch_id::text FROM sections WHERE id = $1::uuid`, sectionID).Scan(&t.BranchID)
	return t, err
}

// visible says whether the person may see an assessment's marks: they may
// enter them, or read results there (Part 77: confidential by default).
// branch maps each section to its branch.
func visible(a policy.Actor, as api.Assessment, branch map[string]string) bool {
	for _, s := range as.SectionIds {
		t := policy.Target{BranchID: branch[s], SectionID: s, SubjectID: as.SubjectId}
		if policy.Decide(a, policy.EvidenceEnter, t) == policy.Full || policy.Decide(a, policy.ResultsRead, t) == policy.Full {
			return true
		}
	}
	return false
}

func list(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	where, args := []string{"true"}, []any{}
	for param, sql := range map[string]string{
		"sectionId": "id IN (SELECT assessment_id FROM assessment_scopes WHERE section_id = $%d::uuid)",
		"periodId":  "period_id = $%d::uuid",
	} {
		if v := c.Query(param); v != "" {
			if !records.UUIDShape.MatchString(v) {
				return problem.Invalid(api.FieldError{Field: param, Code: "unknown", Message: "Not an id."})
			}
			args = append(args, v)
			where = append(where, fmt.Sprintf(sql, len(args)))
		}
	}
	all, err := loadMany(ctx, tx, strings.Join(where, " AND "), args...)
	if err != nil {
		return err
	}
	rows, err := tx.Query(ctx, `SELECT id::text, branch_id::text FROM sections`)
	if err != nil {
		return err
	}
	branch := map[string]string{}
	for rows.Next() {
		var id, b string
		if err := rows.Scan(&id, &b); err != nil {
			return err
		}
		branch[id] = b
	}
	if err := rows.Err(); err != nil {
		return err
	}
	a, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	out := []api.Assessment{}
	for _, as := range all {
		if visible(a, as, branch) {
			out = append(out, as)
		}
	}
	return c.JSON(out)
}

// check validates an assessment and its parts, and the person's right to
// set it for every section it covers.
func check(c fiber.Ctx, tx pgx.Tx, in *api.AssessmentInput) (yearID string, err error) {
	ctx := c.Context()
	var f records.Fields
	f.Text("title", &in.Title, 1, 120)
	f.Text("kind", &in.Kind, 0, 40)
	if in.Kind == "" {
		in.Kind = "periodic_test"
	}
	if !slices.Contains(scheme.Kinds, in.Kind) {
		f.Add("kind", "unknown", "Choose the kind of assessment.")
	}
	for _, ref := range []struct{ field, table, id string }{{"periodId", "periods", in.PeriodId}, {"levelId", "levels", in.LevelId}, {"subjectId", "subjects", in.SubjectId}} {
		if err := f.Live(ctx, tx, ref.field, ref.table, ref.id); err != nil {
			return "", err
		}
	}
	if in.EntryMode != "total" && in.EntryMode != "sections" {
		f.Add("entryMode", "unknown", "Choose total marks or section-wise.")
	}
	if in.EntryMode == "total" && (len(in.Parts) != 1 || in.Parts[0].Kind == "additional") {
		f.Add("parts", "total", "Total marks takes exactly one column.")
	}
	if n := len(in.Parts); n < 1 || n > 200 {
		f.Add("parts", "length", "Use between 1 and 40 columns.")
	}
	for i := range in.Parts {
		p := &in.Parts[i]
		f.Text("parts.name", &p.Name, 1, 80)
		if p.Kind == "" {
			p.Kind = "main"
		}
		p.ComponentCode = strings.ToUpper(strings.TrimSpace(p.ComponentCode))
		if p.Kind == "additional" && p.ComponentCode == "" {
			f.Add("parts.componentCode", "required", "An additional part needs a component code, such as PRAC.") // AT-v2-02
		}
		if p.Kind != "main" && p.Kind != "additional" {
			f.Add("parts.kind", "unknown", "Choose main or additional.")
		}
		if !evidence.Decimal.MatchString(p.MaxMarks) || evidence.Hundredths(p.MaxMarks) == 0 {
			f.Add("parts.maxMarks", "decimal", "Use a maximum above 0, with up to 2 decimals.")
		}
	}
	if len(in.SectionIds) == 0 {
		f.Add("sectionIds", "required", "Choose at least one section.")
	}
	if len(f) > 0 {
		return "", problem.Invalid(f...)
	}
	if err := tx.QueryRow(ctx, `SELECT year_id::text FROM periods WHERE id = $1::uuid`, in.PeriodId).Scan(&yearID); err != nil {
		return "", err
	}
	a, err := tenant.Teaching(c)
	if err != nil {
		return "", err
	}
	for _, s := range in.SectionIds {
		var ok bool
		if !records.UUIDShape.MatchString(s) {
			return "", problem.Invalid(api.FieldError{Field: "sectionIds", Code: "unknown", Message: "Choose sections from the list."})
		}
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM sections WHERE id = $1::uuid AND deleted_at IS NULL AND level_id = $2::uuid AND year_id = $3::uuid)`,
			s, in.LevelId, yearID).Scan(&ok); err != nil {
			return "", err
		}
		if !ok {
			return "", problem.Invalid(api.FieldError{Field: "sectionIds", Code: "unknown", Message: "Choose sections of this level in the period's year."})
		}
		t, err := sectionTarget(ctx, tx, s, in.SubjectId)
		if err != nil {
			return "", err
		}
		if err := policy.Check(a, policy.AssessmentEdit, t); err != nil {
			return "", err
		}
	}
	return yearID, nil
}

func writeParts(c fiber.Ctx, tx pgx.Tx, assessmentID string, parts []api.AssessmentPartInput, existing []api.AssessmentPart) error {
	ctx := c.Context()
	m, _ := tenant.MemberFrom(c)
	keep := map[string]bool{}
	for i, p := range parts {
		if p.Id != "" {
			found := false
			for _, e := range existing {
				found = found || e.Id == p.Id
			}
			if !found {
				return problem.Invalid(api.FieldError{Field: "parts.id", Code: "unknown", Message: "A column of another assessment."})
			}
			keep[p.Id] = true
			var highest string
			if err := tx.QueryRow(ctx, `SELECT coalesce(max(value), 0)::text FROM evidence WHERE part_id = $1::uuid`, p.Id).Scan(&highest); err != nil {
				return err
			}
			if evidence.Hundredths(highest) > evidence.Hundredths(p.MaxMarks) {
				return problem.Invalid(api.FieldError{Field: "parts.maxMarks", Code: "below_marks", Message: p.Name + " already has a mark of " + highest + "; keep the maximum at least that."})
			}
			if _, err := tx.Exec(ctx, `
				UPDATE assessment_parts SET seq = $2, name = $3, kind = $4::part_kind, component_code = nullif($5, ''), counts_in_total = $6, max_marks = $7::numeric
				 WHERE id = $1::uuid`, p.Id, i+1, p.Name, p.Kind, p.ComponentCode, p.CountsInTotal, p.MaxMarks); err != nil {
				return err
			}
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO assessment_parts (org_id, assessment_id, seq, name, kind, component_code, counts_in_total, max_marks)
			VALUES ($1, $2::uuid, $3, $4, $5::part_kind, nullif($6, ''), $7, $8::numeric)`,
			m.OrgID, assessmentID, i+1, p.Name, p.Kind, p.ComponentCode, p.CountsInTotal, p.MaxMarks); err != nil {
			return err
		}
	}
	for _, e := range existing {
		if keep[e.Id] {
			continue
		}
		var used bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM evidence WHERE part_id = $1::uuid AND state <> 'pending')`, e.Id).Scan(&used); err != nil {
			return err
		}
		if used {
			return problem.New(http.StatusConflict, "assessment.part_in_use", e.Name+" holds marks. Keep it, or clear its marks first.")
		}
		if _, err := tx.Exec(ctx, `UPDATE assessment_parts SET deleted_at = now() WHERE id = $1::uuid`, e.Id); err != nil {
			return err
		}
	}
	return nil
}

func writeScopes(c fiber.Ctx, tx pgx.Tx, assessmentID string, sections, existing []string) error {
	ctx := c.Context()
	m, _ := tenant.MemberFrom(c)
	want := map[string]bool{}
	for _, s := range sections {
		want[s] = true
		if _, err := tx.Exec(ctx, `INSERT INTO assessment_scopes (org_id, assessment_id, section_id) VALUES ($1, $2::uuid, $3::uuid) ON CONFLICT DO NOTHING`,
			m.OrgID, assessmentID, s); err != nil {
			return err
		}
	}
	for _, s := range existing {
		if want[s] {
			continue
		}
		var used bool
		if err := tx.QueryRow(ctx, `
			SELECT EXISTS (SELECT 1 FROM evidence ev JOIN enrolments e ON e.student_id = ev.student_id AND e.section_id = $2::uuid AND e.deleted_at IS NULL
			                WHERE ev.assessment_id = $1::uuid AND ev.state <> 'pending')`, assessmentID, s).Scan(&used); err != nil {
			return err
		}
		if used {
			return problem.New(http.StatusConflict, "assessment.section_in_use", "A section you removed already has marks. Keep it.")
		}
		if _, err := tx.Exec(ctx, `DELETE FROM assessment_scopes WHERE assessment_id = $1::uuid AND section_id = $2::uuid`, assessmentID, s); err != nil {
			return err
		}
	}
	return nil
}

func create(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	var in api.AssessmentInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	year, err := check(c, tx, &in)
	if err != nil {
		return err
	}
	m, _ := tenant.MemberFrom(c)
	var id string
	if err := tx.QueryRow(c.Context(), `
		INSERT INTO assessments (org_id, year_id, period_id, level_id, subject_id, title, kind, entry_mode, held_on, created_by)
		VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8, nullif($9, '')::date, $10) RETURNING id::text`,
		m.OrgID, year, in.PeriodId, in.LevelId, in.SubjectId, in.Title, in.Kind, string(in.EntryMode), in.HeldOn, m.UserID).Scan(&id); err != nil {
		return err
	}
	if err := writeScopes(c, tx, id, in.SectionIds, nil); err != nil {
		return err
	}
	if err := writeParts(c, tx, id, in.Parts, nil); err != nil {
		return err
	}
	if err := stale.Assessment(c.Context(), tx, id); err != nil {
		return err
	}
	out, err := load(c.Context(), tx, id)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "create", Entity: "assessments", EntityID: id, After: out}); err != nil {
		return err
	}
	return c.Status(http.StatusCreated).JSON(out)
}

func update(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	before, err := load(ctx, tx, c.Params("id"))
	if err != nil {
		return err
	}
	var in api.AssessmentInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if in.SubjectId != before.SubjectId || in.LevelId != before.LevelId || in.PeriodId != before.PeriodId {
		return problem.Invalid(api.FieldError{Field: "subjectId", Code: "fixed", Message: "The period, level and subject of an assessment stay as created."})
	}
	if before.Status == "locked" {
		return problem.New(http.StatusConflict, "assessment.locked", "This assessment is locked. Open it again to change it.")
	}
	if _, err := check(c, tx, &in); err != nil {
		return err
	}
	// Results of students it covered before and after the change.
	if err := stale.Assessment(ctx, tx, before.Id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE assessments SET title = $2, kind = $3, entry_mode = $4, held_on = nullif($5, '')::date WHERE id = $1::uuid`,
		before.Id, in.Title, in.Kind, string(in.EntryMode), in.HeldOn); err != nil {
		return err
	}
	if err := writeScopes(c, tx, before.Id, in.SectionIds, before.SectionIds); err != nil {
		return err
	}
	if err := writeParts(c, tx, before.Id, in.Parts, before.Parts); err != nil {
		return err
	}
	if err := stale.Assessment(ctx, tx, before.Id); err != nil {
		return err
	}
	after, err := load(ctx, tx, before.Id)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "assessments", EntityID: before.Id, Before: before, After: after}); err != nil {
		return err
	}
	return c.JSON(after)
}

// may checks an action on every section of an assessment.
func may(c fiber.Ctx, tx pgx.Tx, as api.Assessment, act policy.Action) error {
	a, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	for _, s := range as.SectionIds {
		t, err := sectionTarget(c.Context(), tx, s, as.SubjectId)
		if err != nil {
			return err
		}
		if err := policy.Check(a, act, t); err != nil {
			return err
		}
	}
	return nil
}

func remove(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	as, err := load(ctx, tx, c.Params("id"))
	if err != nil {
		return err
	}
	if err := may(c, tx, as, policy.AssessmentEdit); err != nil {
		return err
	}
	var used bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM evidence WHERE assessment_id = $1::uuid AND state <> 'pending')`, as.Id).Scan(&used); err != nil {
		return err
	}
	if used {
		return problem.New(http.StatusConflict, "assessment.in_use", "This assessment holds marks, so it stays.")
	}
	if _, err := tx.Exec(ctx, `UPDATE assessments SET deleted_at = now() WHERE id = $1::uuid`, as.Id); err != nil {
		return err
	}
	if err := stale.Assessment(ctx, tx, as.Id); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "delete", Entity: "assessments", EntityID: as.Id, Before: as}); err != nil {
		return err
	}
	return c.SendStatus(http.StatusNoContent)
}

func setStatus(c fiber.Ctx, from, to, reason string) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	as, err := load(ctx, tx, c.Params("id"))
	if err != nil {
		return err
	}
	if err := may(c, tx, as, policy.AssessmentLock); err != nil {
		return err
	}
	if string(as.Status) != from {
		return problem.New(http.StatusConflict, "assessment.status", "This assessment is "+string(as.Status)+".")
	}
	m, _ := tenant.MemberFrom(c)
	if to == "locked" {
		_, err = tx.Exec(ctx, `UPDATE assessments SET status = 'locked', locked_by = $2, locked_at = now() WHERE id = $1::uuid`, as.Id, m.UserID)
	} else {
		_, err = tx.Exec(ctx, `UPDATE assessments SET status = 'open', locked_by = NULL, locked_at = NULL WHERE id = $1::uuid`, as.Id)
	}
	if err != nil {
		return err
	}
	after, err := load(ctx, tx, as.Id)
	if err != nil {
		return err
	}
	action := "lock"
	if to == "open" {
		action = "unlock"
	}
	if err := audit.Record(c, audit.Entry{Action: action, Entity: "assessments", EntityID: as.Id,
		Before: map[string]string{"status": string(as.Status)}, After: map[string]string{"status": to, "reason": reason}}); err != nil {
		return err
	}
	return c.JSON(after)
}

func lock(c fiber.Ctx) error { return setStatus(c, "open", "locked", "") }

func unlock(c fiber.Ctx) error {
	var in api.ReasonInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if strings.TrimSpace(in.Reason) == "" {
		return problem.Invalid(api.FieldError{Field: "reason", Code: "required", Message: "Say why it opens again."})
	}
	return setStatus(c, "locked", "open", strings.TrimSpace(in.Reason))
}
