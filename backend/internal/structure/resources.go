// Package structure serves the institution's structure: branches, years,
// periods, levels, sections, subjects, the subjects of each level, and who
// teaches what, each a short definition on the shared records engine.
package structure

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/records"
)

// Routes serves every structure resource inside a tenant-scoped router.
func Routes(g fiber.Router) {
	branches.Routes(g)
	years.Routes(g)
	periods.Routes(g)
	levels.Routes(g)
	sections.Routes(g)
	subjects.Routes(g)
	levelSubjects.Routes(g)
	teachingAssignments.Routes(g)
}

// term names dependants and parents in the organisation's words.
func term(key string) func(records.Words, int) string {
	return func(w records.Words, n int) string { return lowerFirst(w(key, n)) }
}

func one(key string) func(records.Words) string {
	return func(w records.Words) string { return lowerFirst(w(key, 1)) }
}

func lowerFirst(s string) string {
	r := []rune(s)
	if len(r) > 1 && r[1] >= 'a' && r[1] <= 'z' && r[0] >= 'A' && r[0] <= 'Z' {
		r[0] += 'a' - 'A'
	}
	return string(r)
}

func plain(one, many string) func(records.Words, int) string {
	return func(_ records.Words, n int) string {
		if n == 1 {
			return one
		}
		return many
	}
}

// dates checks both dates and their order; sameDayOK allows a one-day span.
func dates(f *records.Fields, start, end string, from, to *string, sameDayOK bool) (time.Time, time.Time) {
	s, err1 := time.Parse(time.DateOnly, *from)
	e, err2 := time.Parse(time.DateOnly, *to)
	if err1 != nil {
		f.Add(start, "date", "Use a date like 2026-04-01.")
	}
	if err2 != nil {
		f.Add(end, "date", "Use a date like 2027-03-31.")
	}
	if err1 == nil && err2 == nil && (e.Before(s) || (!sameDayOK && e.Equal(s))) {
		f.Add(end, "order", "End after the start.")
	}
	return s, e
}

// branchOfColumn reads the branch column of a stored row.
func branchOfColumn(table, column string) func(context.Context, pgx.Tx, string) (string, error) {
	return func(ctx context.Context, tx pgx.Tx, id string) (string, error) {
		var b string
		err := tx.QueryRow(ctx, `SELECT coalesce(`+column+`::text, '') FROM `+table+` WHERE id = $1::uuid`, id).Scan(&b)
		return b, err
	}
}

var branches = records.Resource[api.Branch, api.BranchInput]{
	Path: "branches", Table: "branches", Audited: "branches",
	SelectList: `id::text, name, coalesce(address, '')`,
	Scan: func(r pgx.CollectableRow) (b api.Branch, err error) {
		return b, r.Scan(&b.Id, &b.Name, &b.Address, &b.RemovedAt)
	},
	Order:   `lower(name)`,
	Columns: []records.Column{{Name: "name", Cast: ""}, {Name: "address", Cast: ""}},
	Values:  func(in api.BranchInput) []any { return []any{in.Name, nullIfEmpty(in.Address)} },
	Check: func(_ context.Context, _ pgx.Tx, in *api.BranchInput) ([]api.FieldError, error) {
		var f records.Fields
		f.Text("name", &in.Name, 1, 120)
		f.Text("address", &in.Address, 0, 300)
		return f, nil
	},
	// A branch administrator may change their own branch; adding one is organisation-wide.
	BranchOf:   func(_ context.Context, _ pgx.Tx, _ *api.BranchInput, id string) (string, error) { return id, nil },
	Dependants: []records.Dependant{{Table: "sections", Column: "branch_id", Word: term("group.section")}},
}

var years = records.Resource[api.Year, api.YearInput]{
	Path: "years", Table: "academic_years", Audited: "academic_years",
	SelectList: `id::text, label, starts_on::text, ends_on::text`,
	Scan: func(r pgx.CollectableRow) (y api.Year, err error) {
		return y, r.Scan(&y.Id, &y.Label, &y.StartsOn, &y.EndsOn, &y.RemovedAt)
	},
	Order:   `starts_on DESC`,
	Columns: []records.Column{{Name: "label", Cast: ""}, {Name: "starts_on", Cast: "::date"}, {Name: "ends_on", Cast: "::date"}},
	Values:  func(in api.YearInput) []any { return []any{in.Label, in.StartsOn, in.EndsOn} },
	Check: func(_ context.Context, _ pgx.Tx, in *api.YearInput) ([]api.FieldError, error) {
		var f records.Fields
		f.Text("label", &in.Label, 1, 40)
		dates(&f, "startsOn", "endsOn", &in.StartsOn, &in.EndsOn, false)
		return f, nil
	},
	Dependants: []records.Dependant{
		{Table: "periods", Column: "year_id", Word: term("period.term")},
		{Table: "sections", Column: "year_id", Word: term("group.section")},
	},
}

var periods = records.Resource[api.Period, api.PeriodInput]{
	Path: "periods", Table: "periods", Audited: "periods",
	SelectList: `id::text, year_id::text, name, seq, kind, starts_on::text, ends_on::text`,
	Scan: func(r pgx.CollectableRow) (p api.Period, err error) {
		return p, r.Scan(&p.Id, &p.YearId, &p.Name, &p.Seq, &p.Kind, &p.StartsOn, &p.EndsOn, &p.RemovedAt)
	},
	Order:   `seq`,
	Filters: map[string]string{"yearId": "year_id"},
	Columns: []records.Column{{Name: "year_id", Cast: "::uuid"}, {Name: "name", Cast: ""}, {Name: "seq", Cast: ""}, {Name: "kind", Cast: ""}, {Name: "starts_on", Cast: "::date"}, {Name: "ends_on", Cast: "::date"}},
	Values: func(in api.PeriodInput) []any {
		return []any{in.YearId, in.Name, in.Seq, in.Kind, in.StartsOn, in.EndsOn}
	},
	Check: func(ctx context.Context, tx pgx.Tx, in *api.PeriodInput) ([]api.FieldError, error) {
		var f records.Fields
		f.Text("name", &in.Name, 1, 80)
		f.Text("kind", &in.Kind, 0, 40)
		if in.Kind == "" {
			in.Kind = "term"
		}
		if in.Seq < 1 {
			f.Add("seq", "range", "Use 1 or more.")
		}
		s, e := dates(&f, "startsOn", "endsOn", &in.StartsOn, &in.EndsOn, true)
		if err := f.Live(ctx, tx, "yearId", "academic_years", in.YearId); err != nil {
			return nil, err
		}
		if len(f) == 0 {
			var ys, ye time.Time
			if err := tx.QueryRow(ctx, `SELECT starts_on, ends_on FROM academic_years WHERE id = $1::uuid`, in.YearId).Scan(&ys, &ye); err != nil {
				return nil, err
			}
			if s.Before(ys) || e.After(ye) {
				f.Add("startsOn", "outside", "Keep the dates inside the year.")
			}
		}
		return f, nil
	},
	Parents: []records.Parent{{Column: "year_id", Table: "academic_years", Word: one("period.year")}},
}

var levels = records.Resource[api.Level, api.LevelInput]{
	Path: "levels", Table: "levels", Audited: "levels",
	SelectList: `id::text, name, seq, coalesce(stage, '')`,
	Scan: func(r pgx.CollectableRow) (l api.Level, err error) {
		return l, r.Scan(&l.Id, &l.Name, &l.Seq, &l.Stage, &l.RemovedAt)
	},
	Order:   `seq, lower(name)`,
	Columns: []records.Column{{Name: "name", Cast: ""}, {Name: "seq", Cast: ""}, {Name: "stage", Cast: ""}},
	Values:  func(in api.LevelInput) []any { return []any{in.Name, in.Seq, nullIfEmpty(in.Stage)} },
	Check: func(_ context.Context, _ pgx.Tx, in *api.LevelInput) ([]api.FieldError, error) {
		var f records.Fields
		f.Text("name", &in.Name, 1, 80)
		f.Text("stage", &in.Stage, 0, 60)
		if in.Seq < 0 {
			f.Add("seq", "range", "Use 0 or more.")
		}
		return f, nil
	},
	Dependants: []records.Dependant{
		{Table: "sections", Column: "level_id", Word: term("group.section")},
		{Table: "level_subjects", Column: "level_id", Word: term("course.subject")},
	},
}

var sections = records.Resource[api.Section, api.SectionInput]{
	Path: "sections", Table: "sections", Audited: "sections",
	SelectList: `id::text, branch_id::text, level_id::text, year_id::text, name`,
	Scan: func(r pgx.CollectableRow) (s api.Section, err error) {
		return s, r.Scan(&s.Id, &s.BranchId, &s.LevelId, &s.YearId, &s.Name, &s.RemovedAt)
	},
	Order:   `(SELECT seq FROM levels l WHERE l.id = level_id), lower(name)`,
	Filters: map[string]string{"yearId": "year_id", "levelId": "level_id", "branchId": "branch_id"},
	Columns: []records.Column{{Name: "branch_id", Cast: "::uuid"}, {Name: "level_id", Cast: "::uuid"}, {Name: "year_id", Cast: "::uuid"}, {Name: "name", Cast: ""}},
	Values:  func(in api.SectionInput) []any { return []any{in.BranchId, in.LevelId, in.YearId, in.Name} },
	Check: func(ctx context.Context, tx pgx.Tx, in *api.SectionInput) ([]api.FieldError, error) {
		var f records.Fields
		f.Text("name", &in.Name, 1, 40)
		for _, ref := range []struct{ field, table, id string }{
			{"branchId", "branches", in.BranchId}, {"levelId", "levels", in.LevelId}, {"yearId", "academic_years", in.YearId},
		} {
			if err := f.Live(ctx, tx, ref.field, ref.table, ref.id); err != nil {
				return nil, err
			}
		}
		return f, nil
	},
	BranchOf: func(ctx context.Context, tx pgx.Tx, in *api.SectionInput, id string) (string, error) {
		if in != nil {
			return in.BranchId, nil
		}
		return branchOfColumn("sections", "branch_id")(ctx, tx, id)
	},
	Dependants: []records.Dependant{
		{Table: "enrolments", Column: "section_id", Word: term("person.student")},
		{Table: "teaching_assignments", Column: "section_id", Word: plain("teaching assignment", "teaching assignments")},
	},
	Parents: []records.Parent{
		{Column: "branch_id", Table: "branches", Word: one("org.branch")},
		{Column: "level_id", Table: "levels", Word: one("group.level")},
		{Column: "year_id", Table: "academic_years", Word: one("period.year")},
	},
}

var subjects = records.Resource[api.Subject, api.SubjectInput]{
	Path: "subjects", Table: "subjects", Audited: "subjects",
	SelectList: `id::text, name, coalesce(code, ''), kind`,
	Scan: func(r pgx.CollectableRow) (s api.Subject, err error) {
		return s, r.Scan(&s.Id, &s.Name, &s.Code, &s.Kind, &s.RemovedAt)
	},
	Order:   `kind, lower(name)`,
	Columns: []records.Column{{Name: "name", Cast: ""}, {Name: "code", Cast: ""}, {Name: "kind", Cast: ""}},
	Values:  func(in api.SubjectInput) []any { return []any{in.Name, nullIfEmpty(in.Code), string(in.Kind)} },
	Check: func(_ context.Context, _ pgx.Tx, in *api.SubjectInput) ([]api.FieldError, error) {
		var f records.Fields
		f.Text("name", &in.Name, 1, 120)
		f.Text("code", &in.Code, 0, 20)
		if in.Kind != "academic" && in.Kind != "co_curricular" {
			f.Add("kind", "unknown", "Choose academic or co-curricular.")
		}
		return f, nil
	},
	Dependants: []records.Dependant{
		{Table: "level_subjects", Column: "subject_id", Word: plain("level using it", "levels using it")},
		{Table: "teaching_assignments", Column: "subject_id", Word: plain("teaching assignment", "teaching assignments")},
	},
}

var levelSubjects = records.Resource[api.LevelSubject, api.LevelSubjectInput]{
	Path: "level-subjects", Table: "level_subjects", Audited: "level_subjects",
	SelectList: `id::text, level_id::text, subject_id::text, optional`,
	Scan: func(r pgx.CollectableRow) (ls api.LevelSubject, err error) {
		return ls, r.Scan(&ls.Id, &ls.LevelId, &ls.SubjectId, &ls.Optional, &ls.RemovedAt)
	},
	Order:   `(SELECT seq FROM levels l WHERE l.id = level_id), (SELECT lower(name) FROM subjects s WHERE s.id = subject_id)`,
	Filters: map[string]string{"levelId": "level_id"},
	Columns: []records.Column{{Name: "level_id", Cast: "::uuid"}, {Name: "subject_id", Cast: "::uuid"}, {Name: "optional", Cast: ""}},
	Values:  func(in api.LevelSubjectInput) []any { return []any{in.LevelId, in.SubjectId, in.Optional} },
	Check: func(ctx context.Context, tx pgx.Tx, in *api.LevelSubjectInput) ([]api.FieldError, error) {
		var f records.Fields
		if err := f.Live(ctx, tx, "levelId", "levels", in.LevelId); err != nil {
			return nil, err
		}
		if err := f.Live(ctx, tx, "subjectId", "subjects", in.SubjectId); err != nil {
			return nil, err
		}
		return f, nil
	},
	Parents: []records.Parent{
		{Column: "level_id", Table: "levels", Word: one("group.level")},
		{Column: "subject_id", Table: "subjects", Word: one("course.subject")},
	},
}

var teachingAssignments = records.Resource[api.TeachingAssignment, api.TeachingAssignmentInput]{
	Path: "teaching-assignments", Table: "teaching_assignments", Audited: "teaching_assignments",
	SelectList: `id::text, staff_id::text, section_id::text, coalesce(subject_id::text, '')`,
	Scan: func(r pgx.CollectableRow) (a api.TeachingAssignment, err error) {
		return a, r.Scan(&a.Id, &a.StaffId, &a.SectionId, &a.SubjectId, &a.RemovedAt)
	},
	Order:   `(SELECT lower(name) FROM staff s WHERE s.id = staff_id), subject_id NULLS FIRST`,
	Filters: map[string]string{"sectionId": "section_id", "staffId": "staff_id"},
	Columns: []records.Column{{Name: "staff_id", Cast: "::uuid"}, {Name: "section_id", Cast: "::uuid"}, {Name: "subject_id", Cast: "::uuid"}},
	Values: func(in api.TeachingAssignmentInput) []any {
		return []any{in.StaffId, in.SectionId, nullIfEmpty(in.SubjectId)}
	},
	Check: func(ctx context.Context, tx pgx.Tx, in *api.TeachingAssignmentInput) ([]api.FieldError, error) {
		var f records.Fields
		if err := f.Live(ctx, tx, "staffId", "staff", in.StaffId); err != nil {
			return nil, err
		}
		if err := f.Live(ctx, tx, "sectionId", "sections", in.SectionId); err != nil {
			return nil, err
		}
		if in.SubjectId != "" {
			if err := f.Live(ctx, tx, "subjectId", "subjects", in.SubjectId); err != nil {
				return nil, err
			}
		}
		return f, nil
	},
	BranchOf: func(ctx context.Context, tx pgx.Tx, in *api.TeachingAssignmentInput, id string) (string, error) {
		if in != nil {
			return branchOfColumn("sections", "branch_id")(ctx, tx, in.SectionId)
		}
		var b string
		err := tx.QueryRow(ctx, `SELECT s.branch_id::text FROM teaching_assignments a JOIN sections s ON s.id = a.section_id WHERE a.id = $1::uuid`, id).Scan(&b)
		return b, err
	},
	Parents: []records.Parent{
		{Column: "staff_id", Table: "staff", Word: plain1("staff record")},
		{Column: "section_id", Table: "sections", Word: one("group.section")},
		{Column: "subject_id", Table: "subjects", Word: one("course.subject")},
	},
}

func plain1(word string) func(records.Words) string {
	return func(records.Words) string { return word }
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}
