package structure

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Routes serves every structure resource, and the staff list used to choose
// who teaches what, inside a tenant-scoped router.
func Routes(g fiber.Router) {
	branches.routes(g)
	years.routes(g)
	periods.routes(g)
	levels.routes(g)
	sections.routes(g)
	subjects.routes(g)
	levelSubjects.routes(g)
	teachingAssignments.routes(g)
	g.Get("/staff", listStaff)
}

// term names dependants and parents in the organisation's words.
func term(key string) func(wordsFn, int) string {
	return func(w wordsFn, n int) string { return lowerFirst(w(key, n)) }
}

func one(key string) func(wordsFn) string {
	return func(w wordsFn) string { return lowerFirst(w(key, 1)) }
}

func lowerFirst(s string) string {
	r := []rune(s)
	if len(r) > 1 && r[1] >= 'a' && r[1] <= 'z' && r[0] >= 'A' && r[0] <= 'Z' {
		r[0] += 'a' - 'A'
	}
	return string(r)
}

func plain(one, many string) func(wordsFn, int) string {
	return func(_ wordsFn, n int) string {
		if n == 1 {
			return one
		}
		return many
	}
}

// dates checks both dates and their order; sameDayOK allows a one-day span.
func (f *fields) dates(start, end string, from, to *string, sameDayOK bool) (time.Time, time.Time) {
	s, err1 := time.Parse(time.DateOnly, *from)
	e, err2 := time.Parse(time.DateOnly, *to)
	if err1 != nil {
		f.add(start, "date", "Use a date like 2026-04-01.")
	}
	if err2 != nil {
		f.add(end, "date", "Use a date like 2027-03-31.")
	}
	if err1 == nil && err2 == nil && (e.Before(s) || (!sameDayOK && e.Equal(s))) {
		f.add(end, "order", "End after the start.")
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

var branches = resource[api.Branch, api.BranchInput]{
	path: "branches", table: "branches", audited: "branches",
	selectList: `id::text, name, coalesce(address, '')`,
	scan: func(r pgx.CollectableRow) (b api.Branch, err error) {
		return b, r.Scan(&b.Id, &b.Name, &b.Address, &b.RemovedAt)
	},
	order:   `lower(name)`,
	columns: []column{{"name", ""}, {"address", ""}},
	values:  func(in api.BranchInput) []any { return []any{in.Name, nullIfEmpty(in.Address)} },
	check: func(_ context.Context, _ pgx.Tx, in *api.BranchInput) ([]api.FieldError, error) {
		var f fields
		f.text("name", &in.Name, 1, 120)
		f.text("address", &in.Address, 0, 300)
		return f, nil
	},
	// A branch administrator may change their own branch; adding one is organisation-wide.
	branchOf:   func(_ context.Context, _ pgx.Tx, _ *api.BranchInput, id string) (string, error) { return id, nil },
	dependants: []dependant{{"sections", "branch_id", term("group.section")}},
}

var years = resource[api.Year, api.YearInput]{
	path: "years", table: "academic_years", audited: "academic_years",
	selectList: `id::text, label, starts_on::text, ends_on::text`,
	scan: func(r pgx.CollectableRow) (y api.Year, err error) {
		return y, r.Scan(&y.Id, &y.Label, &y.StartsOn, &y.EndsOn, &y.RemovedAt)
	},
	order:   `starts_on DESC`,
	columns: []column{{"label", ""}, {"starts_on", "::date"}, {"ends_on", "::date"}},
	values:  func(in api.YearInput) []any { return []any{in.Label, in.StartsOn, in.EndsOn} },
	check: func(_ context.Context, _ pgx.Tx, in *api.YearInput) ([]api.FieldError, error) {
		var f fields
		f.text("label", &in.Label, 1, 40)
		f.dates("startsOn", "endsOn", &in.StartsOn, &in.EndsOn, false)
		return f, nil
	},
	dependants: []dependant{
		{"periods", "year_id", term("period.term")},
		{"sections", "year_id", term("group.section")},
	},
}

var periods = resource[api.Period, api.PeriodInput]{
	path: "periods", table: "periods", audited: "periods",
	selectList: `id::text, year_id::text, name, seq, kind, starts_on::text, ends_on::text`,
	scan: func(r pgx.CollectableRow) (p api.Period, err error) {
		return p, r.Scan(&p.Id, &p.YearId, &p.Name, &p.Seq, &p.Kind, &p.StartsOn, &p.EndsOn, &p.RemovedAt)
	},
	order:   `seq`,
	filters: map[string]string{"yearId": "year_id"},
	columns: []column{{"year_id", "::uuid"}, {"name", ""}, {"seq", ""}, {"kind", ""}, {"starts_on", "::date"}, {"ends_on", "::date"}},
	values: func(in api.PeriodInput) []any {
		return []any{in.YearId, in.Name, in.Seq, in.Kind, in.StartsOn, in.EndsOn}
	},
	check: func(ctx context.Context, tx pgx.Tx, in *api.PeriodInput) ([]api.FieldError, error) {
		var f fields
		f.text("name", &in.Name, 1, 80)
		f.text("kind", &in.Kind, 0, 40)
		if in.Kind == "" {
			in.Kind = "term"
		}
		if in.Seq < 1 {
			f.add("seq", "range", "Use 1 or more.")
		}
		s, e := f.dates("startsOn", "endsOn", &in.StartsOn, &in.EndsOn, true)
		if err := f.live(ctx, tx, "yearId", "academic_years", in.YearId); err != nil {
			return nil, err
		}
		if len(f) == 0 {
			var ys, ye time.Time
			if err := tx.QueryRow(ctx, `SELECT starts_on, ends_on FROM academic_years WHERE id = $1::uuid`, in.YearId).Scan(&ys, &ye); err != nil {
				return nil, err
			}
			if s.Before(ys) || e.After(ye) {
				f.add("startsOn", "outside", "Keep the dates inside the year.")
			}
		}
		return f, nil
	},
	parents: []parent{{"year_id", "academic_years", one("period.year")}},
}

var levels = resource[api.Level, api.LevelInput]{
	path: "levels", table: "levels", audited: "levels",
	selectList: `id::text, name, seq, coalesce(stage, '')`,
	scan: func(r pgx.CollectableRow) (l api.Level, err error) {
		return l, r.Scan(&l.Id, &l.Name, &l.Seq, &l.Stage, &l.RemovedAt)
	},
	order:   `seq, lower(name)`,
	columns: []column{{"name", ""}, {"seq", ""}, {"stage", ""}},
	values:  func(in api.LevelInput) []any { return []any{in.Name, in.Seq, nullIfEmpty(in.Stage)} },
	check: func(_ context.Context, _ pgx.Tx, in *api.LevelInput) ([]api.FieldError, error) {
		var f fields
		f.text("name", &in.Name, 1, 80)
		f.text("stage", &in.Stage, 0, 60)
		if in.Seq < 0 {
			f.add("seq", "range", "Use 0 or more.")
		}
		return f, nil
	},
	dependants: []dependant{
		{"sections", "level_id", term("group.section")},
		{"level_subjects", "level_id", term("course.subject")},
	},
}

var sections = resource[api.Section, api.SectionInput]{
	path: "sections", table: "sections", audited: "sections",
	selectList: `id::text, branch_id::text, level_id::text, year_id::text, name`,
	scan: func(r pgx.CollectableRow) (s api.Section, err error) {
		return s, r.Scan(&s.Id, &s.BranchId, &s.LevelId, &s.YearId, &s.Name, &s.RemovedAt)
	},
	order:   `(SELECT seq FROM levels l WHERE l.id = level_id), lower(name)`,
	filters: map[string]string{"yearId": "year_id", "levelId": "level_id", "branchId": "branch_id"},
	columns: []column{{"branch_id", "::uuid"}, {"level_id", "::uuid"}, {"year_id", "::uuid"}, {"name", ""}},
	values:  func(in api.SectionInput) []any { return []any{in.BranchId, in.LevelId, in.YearId, in.Name} },
	check: func(ctx context.Context, tx pgx.Tx, in *api.SectionInput) ([]api.FieldError, error) {
		var f fields
		f.text("name", &in.Name, 1, 40)
		for _, ref := range []struct{ field, table, id string }{
			{"branchId", "branches", in.BranchId}, {"levelId", "levels", in.LevelId}, {"yearId", "academic_years", in.YearId},
		} {
			if err := f.live(ctx, tx, ref.field, ref.table, ref.id); err != nil {
				return nil, err
			}
		}
		return f, nil
	},
	branchOf: func(ctx context.Context, tx pgx.Tx, in *api.SectionInput, id string) (string, error) {
		if in != nil {
			return in.BranchId, nil
		}
		return branchOfColumn("sections", "branch_id")(ctx, tx, id)
	},
	dependants: []dependant{
		{"enrolments", "section_id", term("person.student")},
		{"teaching_assignments", "section_id", plain("teaching assignment", "teaching assignments")},
	},
	parents: []parent{
		{"branch_id", "branches", one("org.branch")},
		{"level_id", "levels", one("group.level")},
		{"year_id", "academic_years", one("period.year")},
	},
}

var subjects = resource[api.Subject, api.SubjectInput]{
	path: "subjects", table: "subjects", audited: "subjects",
	selectList: `id::text, name, coalesce(code, ''), kind`,
	scan: func(r pgx.CollectableRow) (s api.Subject, err error) {
		return s, r.Scan(&s.Id, &s.Name, &s.Code, &s.Kind, &s.RemovedAt)
	},
	order:   `kind, lower(name)`,
	columns: []column{{"name", ""}, {"code", ""}, {"kind", ""}},
	values:  func(in api.SubjectInput) []any { return []any{in.Name, nullIfEmpty(in.Code), string(in.Kind)} },
	check: func(_ context.Context, _ pgx.Tx, in *api.SubjectInput) ([]api.FieldError, error) {
		var f fields
		f.text("name", &in.Name, 1, 120)
		f.text("code", &in.Code, 0, 20)
		if in.Kind != "academic" && in.Kind != "co_curricular" {
			f.add("kind", "unknown", "Choose academic or co-curricular.")
		}
		return f, nil
	},
	dependants: []dependant{
		{"level_subjects", "subject_id", plain("level using it", "levels using it")},
		{"teaching_assignments", "subject_id", plain("teaching assignment", "teaching assignments")},
	},
}

var levelSubjects = resource[api.LevelSubject, api.LevelSubjectInput]{
	path: "level-subjects", table: "level_subjects", audited: "level_subjects",
	selectList: `id::text, level_id::text, subject_id::text, optional`,
	scan: func(r pgx.CollectableRow) (ls api.LevelSubject, err error) {
		return ls, r.Scan(&ls.Id, &ls.LevelId, &ls.SubjectId, &ls.Optional, &ls.RemovedAt)
	},
	order:   `(SELECT seq FROM levels l WHERE l.id = level_id), (SELECT lower(name) FROM subjects s WHERE s.id = subject_id)`,
	filters: map[string]string{"levelId": "level_id"},
	columns: []column{{"level_id", "::uuid"}, {"subject_id", "::uuid"}, {"optional", ""}},
	values:  func(in api.LevelSubjectInput) []any { return []any{in.LevelId, in.SubjectId, in.Optional} },
	check: func(ctx context.Context, tx pgx.Tx, in *api.LevelSubjectInput) ([]api.FieldError, error) {
		var f fields
		if err := f.live(ctx, tx, "levelId", "levels", in.LevelId); err != nil {
			return nil, err
		}
		if err := f.live(ctx, tx, "subjectId", "subjects", in.SubjectId); err != nil {
			return nil, err
		}
		return f, nil
	},
	parents: []parent{
		{"level_id", "levels", one("group.level")},
		{"subject_id", "subjects", one("course.subject")},
	},
}

var teachingAssignments = resource[api.TeachingAssignment, api.TeachingAssignmentInput]{
	path: "teaching-assignments", table: "teaching_assignments", audited: "teaching_assignments",
	selectList: `id::text, staff_id::text, section_id::text, coalesce(subject_id::text, '')`,
	scan: func(r pgx.CollectableRow) (a api.TeachingAssignment, err error) {
		return a, r.Scan(&a.Id, &a.StaffId, &a.SectionId, &a.SubjectId, &a.RemovedAt)
	},
	order:   `(SELECT lower(name) FROM staff s WHERE s.id = staff_id), subject_id NULLS FIRST`,
	filters: map[string]string{"sectionId": "section_id", "staffId": "staff_id"},
	columns: []column{{"staff_id", "::uuid"}, {"section_id", "::uuid"}, {"subject_id", "::uuid"}},
	values: func(in api.TeachingAssignmentInput) []any {
		return []any{in.StaffId, in.SectionId, nullIfEmpty(in.SubjectId)}
	},
	check: func(ctx context.Context, tx pgx.Tx, in *api.TeachingAssignmentInput) ([]api.FieldError, error) {
		var f fields
		if err := f.live(ctx, tx, "staffId", "staff", in.StaffId); err != nil {
			return nil, err
		}
		if err := f.live(ctx, tx, "sectionId", "sections", in.SectionId); err != nil {
			return nil, err
		}
		if in.SubjectId != "" {
			if err := f.live(ctx, tx, "subjectId", "subjects", in.SubjectId); err != nil {
				return nil, err
			}
		}
		return f, nil
	},
	branchOf: func(ctx context.Context, tx pgx.Tx, in *api.TeachingAssignmentInput, id string) (string, error) {
		if in != nil {
			return branchOfColumn("sections", "branch_id")(ctx, tx, in.SectionId)
		}
		var b string
		err := tx.QueryRow(ctx, `SELECT s.branch_id::text FROM teaching_assignments a JOIN sections s ON s.id = a.section_id WHERE a.id = $1::uuid`, id).Scan(&b)
		return b, err
	},
	parents: []parent{
		{"staff_id", "staff", plain1("staff record")},
		{"section_id", "sections", one("group.section")},
		{"subject_id", "subjects", one("course.subject")},
	},
}

func plain1(word string) func(wordsFn) string { return func(wordsFn) string { return word } }

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func listStaff(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	rows, err := tx.Query(c.Context(), `SELECT id::text, name, coalesce(email, '') FROM staff WHERE deleted_at IS NULL ORDER BY lower(name)`)
	if err != nil {
		return err
	}
	staff, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (s api.StaffSummary, err error) {
		return s, r.Scan(&s.Id, &s.Name, &s.Email)
	})
	if err != nil {
		return err
	}
	if staff == nil {
		staff = []api.StaffSummary{}
	}
	return c.JSON(staff)
}
