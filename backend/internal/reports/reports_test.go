package reports_test

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/reports"
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
	code        int
	body        []byte
	contentType string
}

func (c caller) raw(method, path, contentType string, body io.Reader) reply {
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
	r := c.raw(method, path, "application/json", &buf)
	if r.code != code {
		c.t.Fatalf("%s %s as %s: status %d, want %d: %s", method, path, c.user, r.code, code, r.body)
	}
	return r
}

func logo(t *testing.T) []byte {
	img := image.NewRGBA(image.Rect(0, 0, 8, 8))
	img.Set(1, 1, color.RGBA{104, 93, 188, 255})
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

// The report card journey on a real database: a template and branding are
// saved as versions, a class teacher previews and downloads the section's
// reports and marksheet, and the PDF pads every report to an even number
// of pages (pilot P0.5; blueprint v23 B8).
func TestReports(t *testing.T) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	b := dbtest.SeedOrg(t, owner, "Org B")
	gotenberg := os.Getenv("GOTENBERG_URL")
	app := server.New(config.Config{Version: "test", GotenbergURL: gotenberg, AppURL: "http://app.test"}, server.Deps{DB: appPool, Auth: headerAuth{}})
	ctx := context.Background()
	one := func(sql string, args ...any) string {
		t.Helper()
		var id string
		if err := owner.QueryRow(ctx, sql, args...).Scan(&id); err != nil {
			t.Fatalf("%v\n%s", err, sql)
		}
		return id
	}
	t.Cleanup(func() {
		for _, u := range []string{"cara", "tom"} {
			_, _ = owner.Exec(ctx, `DELETE FROM memberships WHERE clerk_user_id = $1`, u+"-"+a.UserID)
		}
	})
	member := func(user, role, subject string) caller {
		staff := one(`INSERT INTO staff (org_id, name) VALUES ($1, $2) RETURNING id`, a.ID, user)
		one(`INSERT INTO teaching_assignments (org_id, staff_id, section_id, subject_id) VALUES ($1, $2, $3, nullif($4, '')::uuid) RETURNING id`, a.ID, staff, a.SectionID, subject)
		one(`INSERT INTO memberships (org_id, clerk_user_id, role, staff_id) VALUES ($1, $2, $3, $4) RETURNING id`, a.ID, user+"-"+a.UserID, role, staff)
		return caller{t, app, user + "-" + a.UserID, a.ID}
	}
	admin := caller{t, app, a.UserID, a.ID}
	cara := member("cara", "class_teacher", "")  // class teacher of the section
	tom := member("tom", "teacher", a.SubjectID) // teaches Mathematics there
	outsider := caller{t, app, b.UserID, b.ID}

	// Two more students; the seeded unit test (Ravi exempt) is left out.
	one(`UPDATE assessments SET deleted_at = now() WHERE id = $1 RETURNING id`, a.AssessmentID)
	student := func(no, name, roll string) string {
		id := one(`INSERT INTO students (org_id, admission_no, name) VALUES ($1, $2, $3) RETURNING id`, a.ID, no, name)
		one(`INSERT INTO enrolments (org_id, student_id, section_id, year_id, roll_no) VALUES ($1, $2, $3, $4, $5) RETURNING id`, a.ID, id, a.SectionID, a.YearID, roll)
		return id
	}
	kiran, leela := student("A-002", "Kiran Das", "2"), student("A-003", "Leela Rao", "3")
	test := one(`INSERT INTO assessments (org_id, year_id, period_id, level_id, subject_id, title, kind, entry_mode) VALUES ($1, $2, $3, $4, $5, 'Test', 'periodic_test', 'total') RETURNING id`,
		a.ID, a.YearID, a.PeriodID, a.LevelID, a.SubjectID)
	one(`INSERT INTO assessment_scopes (org_id, assessment_id, section_id) VALUES ($1, $2, $3) RETURNING section_id`, a.ID, test, a.SectionID)
	part := one(`INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks) VALUES ($1, $2, 1, 'Total', 40) RETURNING id`, a.ID, test)
	for s, v := range map[string]string{kiran: "32", leela: "20", a.StudentID: "36"} {
		one(`INSERT INTO evidence (org_id, student_id, assessment_id, part_id, value, state, source) VALUES ($1, $2, $3, $4, $5, 'scored', 'grid') RETURNING id`, a.ID, s, test, part, v)
	}
	q := "?sectionId=" + a.SectionID + "&periodId=" + a.PeriodID
	admin.must(200, "POST", "/v1/results/recompute", map[string]string{"sectionId": a.SectionID, "periodId": a.PeriodID})

	var hindi string
	_ = owner.QueryRow(ctx, `SELECT id FROM subjects WHERE org_id = $1 AND name = 'Hindi'`, a.ID).Scan(&hindi)

	t.Run("the template and branding save as versions", func(t *testing.T) {
		var tpl struct {
			Version int            `json:"version"`
			Config  reports.Config `json:"config"`
		}
		cara.must(200, "GET", "/v1/report-template", nil).into(&tpl)
		tpl.Config.SubjectOrder = []string{hindi, a.SubjectID}
		tpl.Config.QR = true
		cara.must(403, "PUT", "/v1/report-template", map[string]any{"config": tpl.Config})
		var saved struct{ Version int }
		admin.must(200, "PUT", "/v1/report-template", map[string]any{"config": tpl.Config}).into(&saved)
		if saved.Version != tpl.Version+1 {
			t.Fatalf("version %d after %d", saved.Version, tpl.Version)
		}
		bad := tpl.Config
		bad.Paper.Size = "B9"
		admin.must(422, "PUT", "/v1/report-template", map[string]any{"config": bad})

		var br reports.Branding
		admin.must(200, "PUT", "/v1/branding", map[string]string{"displayName": "Hill View School", "address": "Bhubaneswar"}).into(&br)
		var body bytes.Buffer
		w := multipart.NewWriter(&body)
		f, _ := w.CreateFormFile("logo", "logo.png")
		_, _ = f.Write(logo(t))
		_ = w.Close()
		r := admin.raw("PUT", "/v1/branding/logo", w.FormDataContentType(), &body)
		var withLogo reports.Branding
		_ = json.Unmarshal(r.body, &withLogo)
		if r.code != 200 || !withLogo.HasLogo || withLogo.Version != br.Version+1 || withLogo.DisplayName != "Hill View School" {
			t.Fatalf("logo: %d %s", r.code, r.body)
		}
		if got := admin.raw("GET", "/v1/branding/logo", "", nil); got.code != 200 || got.contentType != "image/png" {
			t.Fatalf("logo read back: %d %s", got.code, got.contentType)
		}
	})

	t.Run("only the class teacher and administrators build reports", func(t *testing.T) {
		tom.must(403, "GET", "/v1/reports/status"+q, nil)
		outsider.must(404, "GET", "/v1/reports/status"+q, nil)
		var st struct {
			Students []reports.Student `json:"students"`
		}
		cara.must(200, "GET", "/v1/reports/status"+q, nil).into(&st)
		if len(st.Students) != 3 || st.Students[0].Name != "Ravi Kumar" || st.Students[1].Name != "Kiran Das" {
			t.Fatalf("roster %+v", st.Students)
		}
	})

	t.Run("the preview shows each subject in the template's order", func(t *testing.T) {
		r := cara.must(200, "GET", "/v1/reports/html"+q+"&studentId="+kiran, nil)
		h := string(r.body)
		if !strings.HasPrefix(r.contentType, "text/html") || !strings.Contains(h, "Kiran Das") || strings.Contains(h, "Leela Rao") {
			t.Fatalf("not Kiran's report alone")
		}
		// 32 of 40 under the seeded scheme is 80 of 100. Kiran chose no
		// second language, so Hindi is withheld and so is the overall.
		for _, want := range []string{"Hill View School", "Mathematics", "80 / 100", "Withheld", "data:image/png;base64,", "QR code<br>on the PDF"} {
			if !strings.Contains(h, want) {
				t.Errorf("the preview lacks %q", want)
			}
		}
		if strings.Index(h, "Hindi") > strings.Index(h, "Mathematics") {
			t.Error("subjects are not in the template's order")
		}
	})

	t.Run("the marksheet lists every student", func(t *testing.T) {
		r := cara.must(200, "GET", "/v1/marksheets.xlsx"+q, nil)
		f, err := excelize.OpenReader(bytes.NewReader(r.body))
		if err != nil {
			t.Fatal(err)
		}
		rows, _ := f.GetRows("Results")
		if len(rows) != 4 || !strings.Contains(strings.Join(rows[2], "|"), "Kiran Das|") || !strings.Contains(strings.Join(rows[2], "|"), "80.00") {
			t.Fatalf("rows %v", rows)
		}
		sum, _ := f.GetRows("Summary")
		// (90 + 80 + 50) / 3 = 73.33 for Mathematics.
		found := false
		for _, row := range sum {
			if len(row) > 2 && row[0] == "Mathematics" && row[2] == "73.33" {
				found = true
			}
		}
		if !found {
			t.Fatalf("summary %v", sum)
		}
	})

	t.Run("a PDF pads each report to an even page count", func(t *testing.T) {
		if gotenberg == "" {
			noPDF := server.New(config.Config{Version: "test"}, server.Deps{DB: appPool, Auth: headerAuth{}})
			r := caller{t, noPDF, a.UserID, a.ID}.must(503, "POST", "/v1/reports/pdf", map[string]string{"sectionId": a.SectionID, "periodId": a.PeriodID})
			if !strings.Contains(string(r.body), "pdf.unavailable") {
				t.Fatal(string(r.body))
			}
			t.Skip("GOTENBERG_URL not set")
		}
		r := cara.must(200, "POST", "/v1/reports/pdf", map[string]string{"sectionId": a.SectionID, "periodId": a.PeriodID})
		if r.contentType != "application/pdf" {
			t.Fatalf("content type %s", r.contentType)
		}
		n, err := reports.Pages(r.body)
		if err != nil || n == 0 || n%2 != 0 {
			t.Fatalf("%d pages: %v", n, err)
		}
		var items, pages int
		if err := owner.QueryRow(ctx, `SELECT count(*), sum(pages) FROM report_run_items WHERE org_id = $1 AND facts ? 'student'`, a.ID).Scan(&items, &pages); err != nil || items != 3 || pages != n {
			t.Fatalf("stored %d items of %d pages, the PDF has %d: %v", items, pages, n, err)
		}
		item := one(`SELECT i.id FROM report_run_items i WHERE i.org_id = $1 AND i.student_id = $2 ORDER BY i.created_at DESC LIMIT 1`, a.ID, kiran)
		h := string(cara.must(200, "GET", "/v1/report-items/"+item+"/html", nil).body)
		if !strings.Contains(h, "Kiran Das") || !strings.Contains(h, `alt="QR code to view this report"`) {
			t.Fatal("the stored report does not show again with its QR code")
		}
		outsider.must(404, "GET", "/v1/report-items/"+item+"/html", nil)
		tom.must(403, "GET", "/v1/report-items/"+item+"/html", nil)
	})
}

func (r reply) into(v any) { _ = json.Unmarshal(r.body, v) }
