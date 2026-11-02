// Package people serves students, their family contacts, staff, placements
// (enrolments), memberships, the class-list import and the promotion
// preview. A student is one permanent identity; where they study each year
// is an enrolment, so promotion or a change of section never duplicates a
// student (blueprint Part 31.3).
package people

import (
	"context"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/records"
)

// Routes serves everything in this package inside a tenant-scoped router.
// Paths with a fixed last part come before /:id, so they are not read as ids.
func Routes(g fiber.Router) {
	g.Get("/students", listStudents)
	g.Post("/students/import", previewImport)
	g.Get("/import-jobs", listImportJobs)
	g.Post("/import-jobs/:id/apply", applyImport)
	g.Get("/import-jobs/:id/errors.csv", importErrors)
	g.Post("/enrolments/promote", previewPromotion)
	students.Writes(g)
	guardians.Routes(g)
	staff.Routes(g)
	enrolments.Routes(g)
	g.Get("/memberships", listMemberships)
	g.Post("/memberships", createMembership)
	g.Put("/memberships/:id", updateMembership)
	g.Delete("/memberships/:id", removeMembership)
}

func plain(one, many string) func(records.Words, int) string {
	return func(_ records.Words, n int) string {
		if n == 1 {
			return one
		}
		return many
	}
}

func word(key string) func(records.Words) string {
	return func(w records.Words) string { return strings.ToLower(w(key, 1)) }
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

var phoneShape = regexp.MustCompile(`^\+?[0-9 ()-]{6,20}$`)

func checkEmail(f *records.Fields, field string, s *string) {
	f.Text(field, s, 0, 200)
	if *s == "" {
		return
	}
	if a, err := mail.ParseAddress(*s); err != nil || a.Address != *s {
		f.Add(field, "format", "Use an email address like name@example.com.")
	}
}

func checkPhone(f *records.Fields, field string, s *string) {
	f.Text(field, s, 0, 30)
	if *s != "" && !phoneShape.MatchString(*s) {
		f.Add(field, "format", "Use digits, spaces and an optional + at the start.")
	}
}

// checkDOB accepts an empty date or a real one in the past.
func checkDOB(f *records.Fields, s *string) {
	*s = strings.TrimSpace(*s)
	if *s == "" {
		return
	}
	d, err := time.Parse(time.DateOnly, *s)
	if err != nil {
		f.Add("dob", "date", "Use a date like 2014-06-21.")
		return
	}
	if d.After(time.Now()) || d.Year() < 1900 {
		f.Add("dob", "range", "Use a date of birth in the past.")
	}
}

var students = records.Resource[api.Student, api.StudentInput]{
	Path: "students", Table: "students", Audited: "students",
	SelectList: `id::text, admission_no, name, coalesce(preferred_name, ''), coalesce(dob::text, ''), status`,
	Scan: func(r pgx.CollectableRow) (s api.Student, err error) {
		return s, r.Scan(&s.Id, &s.AdmissionNo, &s.Name, &s.PreferredName, &s.Dob, &s.Status, &s.RemovedAt)
	},
	Order: `lower(name), id`,
	Columns: []records.Column{
		{Name: "admission_no"}, {Name: "name"}, {Name: "preferred_name"}, {Name: "dob", Cast: "::date"}, {Name: "status"},
	},
	Values: func(in api.StudentInput) []any {
		return []any{in.AdmissionNo, in.Name, nullIfEmpty(in.PreferredName), nullIfEmpty(in.Dob), string(in.Status)}
	},
	Check: func(_ context.Context, _ pgx.Tx, in *api.StudentInput) ([]api.FieldError, error) {
		var f records.Fields
		f.Text("admissionNo", &in.AdmissionNo, 1, 40)
		f.Text("name", &in.Name, 1, 120)
		f.Text("preferredName", &in.PreferredName, 0, 80)
		checkDOB(&f, &in.Dob)
		switch in.Status {
		case "":
			in.Status = "active"
		case "active", "left", "graduated":
		default:
			f.Add("status", "unknown", "Choose active, left or graduated.")
		}
		return f, nil
	},
	Dependants: []records.Dependant{
		{Table: "enrolments", Column: "student_id", Word: plain("placement", "placements")},
	},
}

var guardians = records.Resource[api.Guardian, api.GuardianInput]{
	Path: "guardians", Table: "guardians", Audited: "guardians",
	SelectList: `id::text, student_id::text, name, coalesce(relation, ''), coalesce(phone, ''), coalesce(email, ''), language, coalesce(channel, ''), is_primary`,
	Scan: func(r pgx.CollectableRow) (g api.Guardian, err error) {
		return g, r.Scan(&g.Id, &g.StudentId, &g.Name, &g.Relation, &g.Phone, &g.Email, &g.Language, &g.Channel, &g.IsPrimary, &g.RemovedAt)
	},
	Order:   `is_primary DESC, lower(name)`,
	Filters: map[string]string{"studentId": "student_id"},
	Columns: []records.Column{
		{Name: "student_id", Cast: "::uuid"}, {Name: "name"}, {Name: "relation"}, {Name: "phone"}, {Name: "email"},
		{Name: "language"}, {Name: "channel"}, {Name: "is_primary"},
	},
	Values: func(in api.GuardianInput) []any {
		return []any{in.StudentId, in.Name, nullIfEmpty(in.Relation), nullIfEmpty(in.Phone), nullIfEmpty(in.Email),
			in.Language, nullIfEmpty(string(in.Channel)), in.IsPrimary}
	},
	Check: func(ctx context.Context, tx pgx.Tx, in *api.GuardianInput) ([]api.FieldError, error) {
		var f records.Fields
		f.Text("name", &in.Name, 1, 120)
		f.Text("relation", &in.Relation, 0, 40)
		checkPhone(&f, "phone", &in.Phone)
		checkEmail(&f, "email", &in.Email)
		f.Text("language", &in.Language, 0, 10)
		if in.Language == "" {
			in.Language = "en"
		}
		switch in.Channel {
		case "", "whatsapp", "sms", "email":
		default:
			f.Add("channel", "unknown", "Choose WhatsApp, SMS or email.")
		}
		if err := f.Live(ctx, tx, "studentId", "students", in.StudentId); err != nil {
			return nil, err
		}
		return f, nil
	},
	// A new primary contact takes over from the previous one.
	BeforeWrite: func(ctx context.Context, tx pgx.Tx, in *api.GuardianInput, id string) error {
		if !in.IsPrimary {
			return nil
		}
		_, err := tx.Exec(ctx, `UPDATE guardians SET is_primary = false WHERE student_id = $1::uuid AND is_primary AND id::text <> $2`, in.StudentId, id)
		return err
	},
	Parents: []records.Parent{{Column: "student_id", Table: "students", Word: word("person.student")}},
}

var staff = records.Resource[api.Staff, api.StaffInput]{
	Path: "staff", Table: "staff", Audited: "staff",
	SelectList: `id::text, name, coalesce(email, ''), coalesce(phone, ''), coalesce(employee_no, ''), coalesce(designation, '')`,
	Scan: func(r pgx.CollectableRow) (s api.Staff, err error) {
		return s, r.Scan(&s.Id, &s.Name, &s.Email, &s.Phone, &s.EmployeeNo, &s.Designation, &s.RemovedAt)
	},
	Order:   `lower(name)`,
	Columns: []records.Column{{Name: "name"}, {Name: "email"}, {Name: "phone"}, {Name: "employee_no"}, {Name: "designation"}},
	Values: func(in api.StaffInput) []any {
		return []any{in.Name, nullIfEmpty(in.Email), nullIfEmpty(in.Phone), nullIfEmpty(in.EmployeeNo), nullIfEmpty(in.Designation)}
	},
	Check: func(_ context.Context, _ pgx.Tx, in *api.StaffInput) ([]api.FieldError, error) {
		var f records.Fields
		f.Text("name", &in.Name, 1, 120)
		checkEmail(&f, "email", &in.Email)
		checkPhone(&f, "phone", &in.Phone)
		f.Text("employeeNo", &in.EmployeeNo, 0, 40)
		f.Text("designation", &in.Designation, 0, 80)
		return f, nil
	},
	Dependants: []records.Dependant{
		{Table: "teaching_assignments", Column: "staff_id", Word: plain("teaching assignment", "teaching assignments")},
	},
}

// An enrolment places a student in a section for the section's year; the
// year is taken from the section, so the two can never disagree.
var enrolments = records.Resource[api.Enrolment, api.EnrolmentInput]{
	Path: "enrolments", Table: "enrolments", Audited: "enrolments",
	SelectList: `id::text, student_id::text, section_id::text, year_id::text, coalesce(roll_no, '')`,
	Scan: func(r pgx.CollectableRow) (e api.Enrolment, err error) {
		return e, r.Scan(&e.Id, &e.StudentId, &e.SectionId, &e.YearId, &e.RollNo, &e.RemovedAt)
	},
	Order:   `nullif(regexp_replace(coalesce(roll_no, ''), '\D', '', 'g'), '')::bigint NULLS LAST, (SELECT lower(name) FROM students s WHERE s.id = student_id)`,
	Filters: map[string]string{"studentId": "student_id", "sectionId": "section_id", "yearId": "year_id"},
	Columns: []records.Column{
		{Name: "student_id", Cast: "::uuid"},
		{Name: "section_id", Cast: "::uuid"},
		{Name: "year_id", Cast: "::uuid", Wrap: "(SELECT year_id FROM sections WHERE id = %s)"},
		{Name: "roll_no"},
	},
	Values: func(in api.EnrolmentInput) []any {
		return []any{in.StudentId, in.SectionId, in.SectionId, nullIfEmpty(in.RollNo)}
	},
	Check: func(ctx context.Context, tx pgx.Tx, in *api.EnrolmentInput) ([]api.FieldError, error) {
		var f records.Fields
		f.Text("rollNo", &in.RollNo, 0, 20)
		if err := f.Live(ctx, tx, "studentId", "students", in.StudentId); err != nil {
			return nil, err
		}
		if err := f.Live(ctx, tx, "sectionId", "sections", in.SectionId); err != nil {
			return nil, err
		}
		return f, nil
	},
	BranchOf: func(ctx context.Context, tx pgx.Tx, in *api.EnrolmentInput, id string) (string, error) {
		var b string
		var err error
		if in != nil {
			err = tx.QueryRow(ctx, `SELECT branch_id::text FROM sections WHERE id = $1::uuid`, in.SectionId).Scan(&b)
		} else {
			err = tx.QueryRow(ctx, `SELECT s.branch_id::text FROM enrolments e JOIN sections s ON s.id = e.section_id WHERE e.id = $1::uuid`, id).Scan(&b)
		}
		return b, err
	},
	Parents: []records.Parent{
		{Column: "student_id", Table: "students", Word: word("person.student")},
		{Column: "section_id", Table: "sections", Word: word("group.section")},
	},
}
