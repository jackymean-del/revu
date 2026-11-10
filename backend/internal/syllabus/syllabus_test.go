package syllabus_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/server"
	"github.com/jackymean-del/revu/internal/syllabus"
	"github.com/xuri/excelize/v2"
)

type headerAuth struct{}

func (headerAuth) UserID(c fiber.Ctx) (string, error) { return c.Get("X-Test-User"), nil }

type caller struct {
	t         *testing.T
	app       *fiber.App
	user, org string
}

func (c caller) do(method, path, contentType string, body io.Reader) (int, []byte) {
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
	return res.StatusCode, b
}

func (c caller) json(code int, method, path string, body any, into any) {
	c.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	got, b := c.do(method, path, "application/json", &buf)
	if got != code {
		c.t.Fatalf("%s %s: %d, want %d: %s", method, path, got, code, b)
	}
	if into != nil {
		_ = json.Unmarshal(b, into)
	}
}

// upload sends a file to the import with the given form fields.
func (c caller) upload(code int, name string, data []byte, fields map[string]string) syllabus.Report {
	c.t.Helper()
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	f, _ := w.CreateFormFile("file", name)
	_, _ = f.Write(data)
	for k, v := range fields {
		_ = w.WriteField(k, v)
	}
	_ = w.Close()
	got, b := c.do("POST", "/v1/syllabus/import", w.FormDataContentType(), &body)
	if got != code {
		c.t.Fatalf("import %s: %d, want %d: %s", name, got, code, b)
	}
	var r syllabus.Report
	_ = json.Unmarshal(b, &r)
	return r
}

// The three shapes institutions export, previewed, saved, and saved again
// with no change (pilot P0.11 H1; AT-RP-20).
func TestImport(t *testing.T) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	app := server.New(config.Config{Version: "test"}, server.Deps{DB: appPool, Auth: headerAuth{}})
	admin := caller{t, app, a.UserID, a.ID}
	ctx := context.Background()
	one := func(sql string, args ...any) string {
		t.Helper()
		var v string
		if err := owner.QueryRow(ctx, sql, args...).Scan(&v); err != nil {
			t.Fatalf("%v\n%s", err, sql)
		}
		return v
	}
	staff := one(`INSERT INTO staff (org_id, name) VALUES ($1, 'Tina') RETURNING id`, a.ID)
	one(`INSERT INTO memberships (org_id, clerk_user_id, role, staff_id) VALUES ($1, $2, 'teacher', $3) RETURNING id`, a.ID, "tina-"+a.UserID, staff)
	t.Cleanup(func() { _, _ = owner.Exec(ctx, `DELETE FROM memberships WHERE clerk_user_id = $1`, "tina-"+a.UserID) })
	teacher := caller{t, app, "tina-" + a.UserID, a.ID}

	competencies := []byte(`competency,description,subject
"Disciplinary Knowledge","Defines and explains key concepts.",Mathematics
"PROBLEM SOLVING","Solves problems.",Mathematics
"Instrumental Technique","Correct posture and grip.","Drums - Plays drum patterns with correct posture"
"Disciplinary Knowledge","Said twice.",Mathematics
`)
	t.Run("competencies: unknown subjects are named, then made on request", func(t *testing.T) {
		teacher.upload(403, "competencies.csv", competencies, nil)
		r := admin.upload(200, "competencies.csv", competencies, nil)
		// Problem solving is seeded; its capitals do not make it new.
		if r.Shape != "competencies" || r.Rows != 4 || r.Created.Competencies != 1 || r.Applied || strings.Join(r.UnknownSubjects, ",") != "Drums" {
			t.Fatalf("preview %+v", r)
		}
		r = admin.upload(200, "competencies.csv", competencies, map[string]string{"apply": "true", "createSubjects": "true"})
		if !r.Applied || r.Created.Subjects != 1 || r.Created.Competencies != 2 {
			t.Fatalf("apply %+v", r)
		}
		var kind string
		if err := owner.QueryRow(ctx, `SELECT kind FROM subjects WHERE org_id = $1 AND name = 'Drums'`, a.ID).Scan(&kind); err != nil || kind != "co_curricular" {
			t.Fatalf("drums is %q: %v", kind, err)
		}
		again := admin.upload(200, "competencies.csv", competencies, map[string]string{"apply": "true", "createSubjects": "true"})
		if again.Created != (syllabus.Counts{}) || again.Repeated != 4 {
			t.Fatalf("a second import changed something: %+v", again)
		}
	})

	outcomes := []byte(`learning_outcome,competency,lesson_name
"Identify proper and improper fractions.","Disciplinary Knowledge","Fractions"
"Compare fractions with unlike denominators.","Problem Solving","Fractions"
"Solve word problems on fractions.","Mental Maths","Fractions"
"Recall the times tables to 12.",,"Tables"
"Identify proper and improper fractions.","Disciplinary Knowledge","Fractions"
`)
	t.Run("outcomes: for a chosen class and subject, with Bloom suggested", func(t *testing.T) {
		admin.upload(422, "outcomes.csv", outcomes, nil)
		fields := map[string]string{"levelId": a.LevelID, "subjectId": a.SubjectID, "apply": "true"}
		r := admin.upload(200, "outcomes.csv", outcomes, fields)
		// Fractions is seeded, Tables is new; Mental Maths is a new
		// competency; one row has none; the last row repeats the first.
		if r.Created.Outcomes != 4 || r.Created.Lessons != 1 || r.Created.Competencies != 1 || r.NoCompetency != 1 || r.Repeated != 1 {
			t.Fatalf("%+v", r)
		}
		if again := admin.upload(200, "outcomes.csv", outcomes, fields); again.Created != (syllabus.Counts{}) || again.Repeated != 5 {
			t.Fatalf("a second import changed something: %+v", again)
		}
		var s syllabus.Syllabus
		admin.json(200, "GET", "/v1/syllabus?levelId="+a.LevelID+"&subjectId="+a.SubjectID, nil, &s)
		blooms := map[string]string{}
		for _, l := range s.Lessons {
			for _, o := range l.Outcomes {
				blooms[o.Text] = o.Bloom
			}
		}
		if s.Kind != "academic" || len(s.Lessons) != 2 || blooms["Compare fractions with unlike denominators."] != "analyse" || blooms["Solve word problems on fractions."] != "apply" ||
			blooms["Recall the times tables to 12."] != "remember" {
			t.Fatalf("lessons %d, blooms %v", len(s.Lessons), blooms)
		}
	})

	t.Run("an outcomes workbook across classes, with ids and review notes", func(t *testing.T) {
		f := excelize.NewFile()
		rows := [][]any{
			{"Book/Product", "Grade", "Subject", "Lesson No", "Lesson Name", "OutcomeID", "Learning Outcome", "Comments / Modifications recommended"},
			{"Mothers", "Grade 6", "Mathematics", 3, "Decimals", 501, "Convert a fraction to a decimal.", "Add an example"},
			{"Mothers", "Grade 6", "Mathematics", 3, "Decimals", 502, "Justify the place of a decimal point.", ""},
			{"Mothers", "Grade 9", "Mathematics", 1, "Algebra", 900, "Solve linear equations.", ""},
			{"Mothers", "Grade 6", "Social Studies", 1, "Maps", 700, "Locate places on a map.", ""},
		}
		for i, r := range rows {
			cell, _ := excelize.CoordinatesToCellName(1, i+1)
			_ = f.SetSheetRow("Sheet1", cell, &r)
		}
		buf, _ := f.WriteToBuffer()
		r := admin.upload(200, "outcomes.xlsx", buf.Bytes(), map[string]string{"apply": "true"})
		if r.Shape != "workbook" || r.Created.Outcomes != 2 || r.Created.Lessons != 1 || strings.Join(r.UnknownLevels, ",") != "Grade 9" ||
			strings.Join(r.UnknownSubjects, ",") != "Social Studies" || r.NoCompetency != 2 {
			t.Fatalf("%+v", r)
		}
		var note, code string
		if err := owner.QueryRow(ctx, `SELECT coalesce(note, ''), code FROM learning_outcomes WHERE org_id = $1 AND text = 'Convert a fraction to a decimal.'`, a.ID).Scan(&note, &code); err != nil || note != "Add an example" || code != "501" {
			t.Fatalf("note %q code %q: %v", note, code, err)
		}
		if again := admin.upload(200, "outcomes.xlsx", buf.Bytes(), map[string]string{"apply": "true"}); again.Created.Outcomes != 0 {
			t.Fatalf("a second import added %d outcomes", again.Created.Outcomes)
		}
	})

	t.Run("a teacher's Bloom level stays theirs; a competency must be the subject's", func(t *testing.T) {
		id := one(`SELECT id FROM learning_outcomes WHERE org_id = $1 AND text = 'Recall the times tables to 12.'`, a.ID)
		var o syllabus.Outcome
		teacher.json(403, "PUT", "/v1/learning-outcomes/"+id, map[string]string{"bloom": "apply"}, nil)
		admin.json(422, "PUT", "/v1/learning-outcomes/"+id, map[string]string{"bloom": "memorise"}, nil)
		admin.json(200, "PUT", "/v1/learning-outcomes/"+id, map[string]string{"bloom": "apply"}, &o)
		if o.Bloom != "apply" || o.BloomBy != "teacher" {
			t.Fatalf("%+v", o)
		}
		drums := one(`SELECT k.id FROM competencies k JOIN subjects s ON s.id = k.subject_id WHERE k.org_id = $1 AND s.name = 'Drums'`, a.ID)
		admin.json(422, "PUT", "/v1/learning-outcomes/"+id, map[string]string{"competencyId": drums}, nil)
		var places []syllabus.Place
		admin.json(200, "GET", "/v1/syllabus/summary", nil, &places)
		found := false
		for _, p := range places {
			if p.LevelID == a.LevelID && p.SubjectID == a.SubjectID && p.Outcomes == 7 && p.Lessons == 3 {
				found = true
			}
		}
		if !found {
			t.Fatalf("summary %+v", places)
		}
	})
}
