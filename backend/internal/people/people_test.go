package people_test

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/server"
	"github.com/xuri/excelize/v2"
)

type headerAuth struct{}

func (headerAuth) UserID(c fiber.Ctx) (string, error) { return c.Get("X-Test-User"), nil }

type caller struct {
	t         *testing.T
	app       *fiber.App
	user, org string
}

type reply struct {
	code int
	body []byte
	ct   string
}

func (r reply) into(v any) { _ = json.Unmarshal(r.body, v) }

func (r reply) problem() api.Problem {
	var p api.Problem
	r.into(&p)
	return p
}

func (c caller) send(method, path, contentType string, body io.Reader) reply {
	c.t.Helper()
	req := httptest.NewRequest(method, path, body)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.Header.Set("X-Test-User", c.user)
	req.Header.Set("X-Org-Id", c.org)
	res, err := c.app.Test(req, fiber.TestConfig{Timeout: 0})
	if err != nil {
		c.t.Fatal(err)
	}
	b, _ := io.ReadAll(res.Body)
	return reply{res.StatusCode, b, res.Header.Get("Content-Type")}
}

func (c caller) must(code int, method, path string, body any) reply {
	c.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	r := c.send(method, path, "application/json", &buf)
	if r.code != code {
		c.t.Fatalf("%s %s: status %d, want %d: %s", method, path, r.code, code, r.body)
	}
	return r
}

// upload sends a file to the import preview.
func (c caller) upload(code int, name string, data []byte, sectionID string) reply {
	c.t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, _ := w.CreateFormFile("file", name)
	_, _ = part.Write(data)
	if sectionID != "" {
		_ = w.WriteField("sectionId", sectionID)
	}
	_ = w.Close()
	r := c.send("POST", "/v1/students/import", w.FormDataContentType(), &buf)
	if r.code != code {
		c.t.Fatalf("import %s: status %d, want %d: %s", name, r.code, code, r.body)
	}
	return r
}

func setup(t *testing.T) (*pgxpool.Pool, dbtest.Org, caller, *fiber.App) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	app := server.New(config.Config{Version: "test"}, server.Deps{DB: appPool, Auth: headerAuth{}})
	return owner, a, caller{t, app, a.UserID, a.ID}, app
}

func count(t *testing.T, owner *pgxpool.Pool, sql string, args ...any) int {
	t.Helper()
	var n int
	if err := owner.QueryRow(context.Background(), sql, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

// AT-v1-06: 500 rows with 5 invalid ones create 495, the rejected rows
// download with reasons, and importing the same file again adds nobody.
func TestImportFiveHundredStudents(t *testing.T) {
	owner, a, admin, _ := setup(t)
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"Adm No", "Student Name", "Date of birth", "Section", "Roll No", "Parent name", "Mobile", "Favourite colour"})
	for i := 1; i <= 500; i++ {
		row := []string{fmt.Sprintf("B-%04d", i), fmt.Sprintf("Pupil %03d", i), "21-06-2014", "Grade 6 A", fmt.Sprint(i), "", "", "blue"}
		if i%3 == 0 {
			row[5], row[6] = fmt.Sprintf("Parent %03d", i), "+91 98765 43210"
		}
		switch i {
		case 50:
			row[1] = "" // no name
		case 100:
			row[2] = "31-02-2014" // not a date
		case 150:
			row[0] = "B-0149" // repeats row 149's number
		case 200:
			row[3] = "Grade 9 Z" // no such section
		case 250:
			row[5], row[6] = "", "98765 43210" // a phone with no contact name
		}
		_ = w.Write(row)
	}
	w.Flush()
	file := buf.Bytes()

	var p api.ImportPreview
	admin.upload(201, "class-6a.csv", file, "").into(&p)
	if p.Rows != 500 || p.Create != 495 || p.Rejected != 5 || len(p.Problems) != 5 {
		t.Fatalf("preview %+v", p)
	}
	if len(p.UnknownColumns) != 1 || p.UnknownColumns[0] != "Favourite colour" {
		t.Fatalf("unknown columns %v", p.UnknownColumns)
	}
	if n := count(t, owner, `SELECT count(*) FROM students WHERE org_id = $1`, a.ID); n != 1 {
		t.Fatalf("the preview changed %d students", n-1)
	}

	var job api.ImportJob
	admin.must(200, "POST", "/v1/import-jobs/"+p.Id+"/apply", nil).into(&job)
	if job.Status != "applied" || job.Summary["created"] != 495 {
		t.Fatalf("applied %+v", job)
	}
	if n := count(t, owner, `SELECT count(*) FROM students WHERE org_id = $1 AND admission_no LIKE 'B-%'`, a.ID); n != 495 {
		t.Fatalf("%d students created, want 495", n)
	}
	if n := count(t, owner, `SELECT count(*) FROM enrolments WHERE section_id = $1`, a.SectionID); n != 496 {
		t.Fatalf("%d placed in the section, want 495 and the seeded one", n)
	}
	if n := count(t, owner, `SELECT count(*) FROM guardians g JOIN students s ON s.id = g.student_id WHERE s.admission_no LIKE 'B-%' AND g.is_primary`); n != 165 {
		t.Fatalf("%d primary contacts, want 165", n)
	}
	if p := admin.must(409, "POST", "/v1/import-jobs/"+p.Id+"/apply", nil).problem(); p.Code != "import.applied" {
		t.Fatalf("%+v", p)
	}

	report := admin.send("GET", "/v1/import-jobs/"+p.Id+"/errors.csv", "", nil)
	lines, err := csv.NewReader(bytes.NewReader(bytes.TrimPrefix(report.body, []byte("\xef\xbb\xbf")))).ReadAll()
	if err != nil || report.code != 200 || !strings.HasPrefix(report.ct, "text/csv") || len(lines) != 6 {
		t.Fatalf("report %d %s: %d lines, %v", report.code, report.ct, len(lines), err)
	}
	reasons := map[string]string{}
	for _, l := range lines[1:] {
		reasons[l[0]] = l[3]
	}
	for row, want := range map[string]string{"51": "name is missing", "101": "not a date", "151": "row 150", "201": `no section "Grade 9 Z"`, "251": "needs a contact name"} {
		if !strings.Contains(reasons[row], want) {
			t.Errorf("row %s: %q, want it to say %q", row, reasons[row], want)
		}
	}

	// The same file again: nobody new, nothing changed.
	var again api.ImportPreview
	admin.upload(201, "class-6a.csv", file, "").into(&again)
	if again.Create != 0 || again.Unchanged != 495 || again.Update != 0 {
		t.Fatalf("second preview %+v", again)
	}
	admin.must(200, "POST", "/v1/import-jobs/"+again.Id+"/apply", nil).into(&job)
	if job.Summary["created"] != 0 || job.Summary["updated"] != 0 {
		t.Fatalf("second apply %+v", job.Summary)
	}
	if n := count(t, owner, `SELECT count(*) FROM students WHERE org_id = $1 AND admission_no LIKE 'B-%'`, a.ID); n != 495 {
		t.Fatalf("%d students after a second import, want 495", n)
	}
	if n := count(t, owner, `SELECT count(*) FROM guardians g JOIN students s ON s.id = g.student_id WHERE s.admission_no LIKE 'B-%'`); n != 165 {
		t.Fatalf("%d contacts after a second import, want 165", n)
	}
	if n := count(t, owner, `SELECT count(*) FROM audit_log WHERE org_id = $1 AND action = 'import'`, a.ID); n != 2 {
		t.Fatalf("%d import audit entries, want 2", n)
	}
}

// AT-P-02: an Excel class list works the same way, and a chosen section
// places every row.
func TestImportExcel(t *testing.T) {
	_, a, admin, _ := setup(t)
	x := excelize.NewFile()
	rows := [][]any{{"Admission number", "Name", "DOB"}, {"X-1", "Asha", "2014-01-02"}, {"X-2", "Bilal", "02/03/2014"}, {"X-3", "Chen", ""}}
	for i, r := range rows {
		_ = x.SetSheetRow("Sheet1", fmt.Sprintf("A%d", i+1), &r)
	}
	var buf bytes.Buffer
	_ = x.Write(&buf)
	var p api.ImportPreview
	admin.upload(201, "list.xlsx", buf.Bytes(), a.SectionID).into(&p)
	if p.Create != 3 || p.Rejected != 0 {
		t.Fatalf("preview %+v", p)
	}
	admin.must(200, "POST", "/v1/import-jobs/"+p.Id+"/apply", nil)
	var page api.StudentPage
	admin.must(200, "GET", "/v1/students?sectionId="+a.SectionID+"&q=bilal", nil).into(&page)
	if len(page.Items) != 1 || page.Items[0].Dob != "2014-03-02" || page.Items[0].Placement == nil || page.Items[0].Placement.SectionId != a.SectionID {
		t.Fatalf("%+v", page.Items)
	}
	if r := admin.upload(422, "notes.csv", []byte("Colour,Size\nred,3\n"), ""); !strings.Contains(r.problem().Errors[0].Message, "heading") {
		t.Fatalf("%s", r.body)
	}
}

func TestStudentsAndContacts(t *testing.T) {
	owner, a, admin, app := setup(t)
	ctx := context.Background()

	t.Run("editing a name writes one audit entry with before and after (AT-v1-07)", func(t *testing.T) {
		admin.must(200, "PUT", "/v1/students/"+a.StudentID, api.StudentInput{AdmissionNo: "A-001", Name: "Ravi K. Kumar"})
		var before, after string
		err := owner.QueryRow(ctx, `SELECT before->>'name', after->>'name' FROM audit_log WHERE entity = 'students' AND entity_id = $1::uuid AND action = 'update'`, a.StudentID).Scan(&before, &after)
		if err != nil || before != "Ravi Kumar" || after != "Ravi K. Kumar" {
			t.Fatalf("%q -> %q, %v", before, after, err)
		}
	})

	t.Run("pages, search and placement", func(t *testing.T) {
		for _, n := range []string{"Anaya", "Bhavna", "Chirag", "Dev"} {
			admin.must(201, "POST", "/v1/students", api.StudentInput{AdmissionNo: "P-" + n, Name: n})
		}
		var page api.StudentPage
		admin.must(200, "GET", "/v1/students?limit=2", nil).into(&page)
		seen := []string{}
		for {
			for _, s := range page.Items {
				seen = append(seen, s.Name)
			}
			if page.NextCursor == "" {
				break
			}
			cursor := page.NextCursor
			page = api.StudentPage{}
			admin.must(200, "GET", "/v1/students?limit=2&cursor="+cursor, nil).into(&page)
		}
		if strings.Join(seen, ",") != "Anaya,Bhavna,Chirag,Dev,Ravi K. Kumar" {
			t.Fatalf("pages gave %v", seen)
		}
		admin.must(200, "GET", "/v1/students?q=A-00", nil).into(&page)
		if len(page.Items) != 1 || page.Items[0].Placement == nil || page.Items[0].Placement.SectionId != a.SectionID {
			t.Fatalf("search by admission number: %+v", page.Items)
		}
	})

	t.Run("a student can be placed once a year, in the section's year", func(t *testing.T) {
		var s api.Student
		admin.must(201, "POST", "/v1/students", api.StudentInput{AdmissionNo: "E-1", Name: "Esha"}).into(&s)
		var e api.Enrolment
		admin.must(201, "POST", "/v1/enrolments", api.EnrolmentInput{StudentId: s.Id, SectionId: a.SectionID, RollNo: "12"}).into(&e)
		if e.YearId != a.YearID {
			t.Fatalf("year %s, want the section's %s", e.YearId, a.YearID)
		}
		admin.must(409, "POST", "/v1/enrolments", api.EnrolmentInput{StudentId: s.Id, SectionId: a.SectionID})
		if p := admin.must(409, "DELETE", "/v1/students/"+s.Id, nil).problem(); !strings.Contains(p.Detail, "1 placement") {
			t.Fatalf("%+v", p)
		}
	})

	t.Run("a new primary contact takes over", func(t *testing.T) {
		var g api.Guardian
		admin.must(201, "POST", "/v1/guardians", api.GuardianInput{StudentId: a.StudentID, Name: "Suresh Kumar", Phone: "+91 90000 00000", IsPrimary: true}).into(&g)
		var list []api.Guardian
		admin.must(200, "GET", "/v1/guardians?studentId="+a.StudentID, nil).into(&list)
		primaries := 0
		for _, x := range list {
			if x.IsPrimary {
				primaries++
				if x.Id != g.Id {
					t.Fatalf("old contact still primary")
				}
			}
		}
		if primaries != 1 || len(list) != 2 {
			t.Fatalf("%+v", list)
		}
		if p := admin.must(422, "POST", "/v1/guardians", api.GuardianInput{StudentId: a.StudentID, Name: "X", Email: "not-an-email"}).problem(); p.Errors[0].Field != "email" {
			t.Fatalf("%+v", p)
		}
	})

	t.Run("staff numbers are unique", func(t *testing.T) {
		admin.must(201, "POST", "/v1/staff", api.StaffInput{Name: "Mira Das", EmployeeNo: "E-77", Designation: "TGT"})
		if p := admin.must(409, "POST", "/v1/staff", api.StaffInput{Name: "Another", EmployeeNo: "E-77"}).problem(); p.Code != "structure.name_taken" {
			t.Fatalf("%+v", p)
		}
	})

	t.Run("a viewer cannot import or manage people", func(t *testing.T) {
		if _, err := owner.Exec(ctx, `INSERT INTO memberships (org_id, clerk_user_id, role) VALUES ($1, $2, 'viewer')`, a.ID, a.UserID+"_v"); err != nil {
			t.Fatal(err)
		}
		viewer := caller{t, app, a.UserID + "_v", a.ID}
		viewer.upload(403, "x.csv", []byte("Admission number,Name\nV-1,Vee\n"), "")
		viewer.must(403, "GET", "/v1/memberships", nil)
		viewer.must(403, "POST", "/v1/staff", api.StaffInput{Name: "No"})
		viewer.must(200, "GET", "/v1/students", nil)
	})
}

func TestMemberships(t *testing.T) {
	owner, a, admin, _ := setup(t)
	ctx := context.Background()
	var list []api.Membership
	admin.must(200, "GET", "/v1/memberships", nil).into(&list)
	if len(list) != 1 || list[0].StaffName != "Asha Rao" {
		t.Fatalf("%+v", list)
	}
	only := list[0].Id

	if p := admin.must(409, "DELETE", "/v1/memberships/"+only, nil).problem(); p.Code != "membership.last_admin" {
		t.Fatalf("%+v", p)
	}
	if p := admin.must(409, "PUT", "/v1/memberships/"+only, api.MembershipInput{ClerkUserId: a.UserID, Role: "teacher"}).problem(); p.Code != "membership.last_admin" {
		t.Fatalf("%+v", p)
	}
	var second api.Membership
	admin.must(201, "POST", "/v1/memberships", api.MembershipInput{ClerkUserId: "user_second", Role: "admin"}).into(&second)
	admin.must(200, "PUT", "/v1/memberships/"+only, api.MembershipInput{ClerkUserId: a.UserID, Role: "teacher", StaffId: a.StaffID})
	admin.must(422, "POST", "/v1/memberships", api.MembershipInput{ClerkUserId: "someone", Role: "admin"})

	var synced string
	if err := owner.QueryRow(ctx, `INSERT INTO memberships (org_id, clerk_user_id, role, source) VALUES ($1, 'user_synced', 'viewer', 'clerk') RETURNING id::text`, a.ID).Scan(&synced); err != nil {
		t.Fatal(err)
	}
	secondAdmin := caller{t, admin.app, "user_second", a.ID}
	if p := secondAdmin.must(409, "DELETE", "/v1/memberships/"+synced, nil).problem(); p.Code != "membership.from_sign_in" {
		t.Fatalf("%+v", p)
	}
	secondAdmin.must(200, "PUT", "/v1/memberships/"+synced, api.MembershipInput{ClerkUserId: "user_synced", Role: "viewer", StaffId: a.StaffID})
}

func TestPromotionPreview(t *testing.T) {
	_, a, admin, _ := setup(t)
	var next api.Year
	admin.must(201, "POST", "/v1/years", api.YearInput{Label: "2027-28", StartsOn: "2027-04-01", EndsOn: "2028-03-31"}).into(&next)
	var g7 api.Level
	admin.must(201, "POST", "/v1/levels", api.LevelInput{Name: "Grade 7", Seq: 7}).into(&g7)
	admin.must(201, "POST", "/v1/sections", api.SectionInput{BranchId: a.BranchID, LevelId: g7.Id, YearId: next.Id, Name: "A"})
	admin.must(201, "POST", "/v1/sections", api.SectionInput{BranchId: a.BranchID, LevelId: a.LevelID, YearId: a.YearID, Name: "B"})
	admin.must(201, "POST", "/v1/sections", api.SectionInput{BranchId: a.BranchID, LevelId: g7.Id, YearId: a.YearID, Name: "A"})

	var out api.PromotionPreview
	admin.must(200, "POST", "/v1/enrolments/promote", api.PromotionRequest{FromYearId: a.YearID, ToYearId: next.Id}).into(&out)
	got := map[string]string{}
	for _, m := range out.Moves {
		got[m.FromName] = string(m.Outcome) + ":" + m.ToName
	}
	want := map[string]string{"Grade 6 A": "promote:Grade 7 A", "Grade 6 B": "no_match:", "Grade 7 A": "leaving:"}
	for k, v := range want {
		if got[k] != v {
			t.Errorf("%s: %q, want %q (all %v)", k, got[k], v, got)
		}
	}
	if out.Students != 1 {
		t.Errorf("%d students, want the seeded one", out.Students)
	}
	admin.must(422, "POST", "/v1/enrolments/promote", api.PromotionRequest{FromYearId: next.Id, ToYearId: a.YearID})
}
