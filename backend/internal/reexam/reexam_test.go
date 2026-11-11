package reexam_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/reexam"
	"github.com/jackymean-del/revu/internal/server"
)

type headerAuth struct{}

func (headerAuth) UserID(c fiber.Ctx) (string, error) { return c.Get("X-Test-User"), nil }

type caller struct {
	t         *testing.T
	app       *fiber.App
	user, org string
}

func (c caller) on(t *testing.T) caller { c.t = t; return c }

func (c caller) json(code int, method, path string, body any, into any) {
	c.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", c.user)
	req.Header.Set("X-Org-Id", c.org)
	res, err := c.app.Test(req, fiber.TestConfig{Timeout: 0})
	if err != nil {
		c.t.Fatal(err)
	}
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode != code {
		c.t.Fatalf("%s %s: %d, want %d: %s", method, path, res.StatusCode, code, b)
	}
	if into != nil {
		if err := json.Unmarshal(b, into); err != nil {
			c.t.Fatalf("%s %s: %v", method, path, err)
		}
	}
}

func f(x float64) *float64 { return &x }

// From an assessment to a re-exam whose marks count under an approved
// policy; the original never changes (B7; AT-RE-01 to 03, 06 to 08).
func TestReexam(t *testing.T) {
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

	// Test 2, out of 50: Ravi 15 (30%), and five classmates.
	test := one(`INSERT INTO assessments (org_id, year_id, period_id, level_id, subject_id, title, entry_mode) VALUES ($1, $2, $3, $4, $5, 'Test 2', 'total') RETURNING id`,
		a.ID, a.YearID, a.PeriodID, a.LevelID, a.SubjectID)
	one(`INSERT INTO assessment_scopes (org_id, assessment_id, section_id) VALUES ($1, $2, $3) RETURNING section_id`, a.ID, test, a.SectionID)
	part := one(`INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks) VALUES ($1, $2, 1, 'Total', 50) RETURNING id`, a.ID, test)
	mark := func(assessment, part, student string, value any, state string) {
		one(`INSERT INTO evidence (org_id, student_id, assessment_id, part_id, value, state, source) VALUES ($1, $2, $3, $4, $5, $6::value_state, 'grid') RETURNING id`, a.ID, student, assessment, part, value, state)
	}
	mark(test, part, a.StudentID, 15, "scored")
	var mates []string
	for i, v := range []any{22, nil, 40, 35, 35} { // 44%, absent, 80%, 70%, 70%
		id := one(`INSERT INTO students (org_id, admission_no, name) VALUES ($1, $2, $3) RETURNING id`, a.ID, fmt.Sprintf("A-2%02d", i), fmt.Sprintf("Mate %d", i))
		one(`INSERT INTO enrolments (org_id, student_id, section_id, year_id, roll_no) VALUES ($1, $2, $3, $4, $5) RETURNING id`, a.ID, id, a.SectionID, a.YearID, fmt.Sprint(i+2))
		// Exempt from the seeded Unit test 1, as Ravi is, so Test 2 alone counts.
		one(`INSERT INTO assessment_participation (org_id, assessment_id, student_id, status) VALUES ($1, $2, $3, 'exempt') RETURNING student_id`, a.ID, a.AssessmentID, id)
		state := "scored"
		if v == nil {
			state = "absent"
		}
		mark(test, part, id, v, state)
		mates = append(mates, id)
	}

	t.Run("the rules pick students and say why", func(t *testing.T) {
		admin, teacher := admin.on(t), teacher.on(t)
		teacher.json(403, "POST", "/v1/reexams/preview", map[string]any{"sourceId": test}, nil)
		admin.json(422, "POST", "/v1/reexams/preview", map[string]any{"sourceId": test, "criteria": map[string]any{"from": 50, "to": 40}}, nil)
		var p reexam.Preview
		admin.json(200, "POST", "/v1/reexams/preview", map[string]any{"sourceId": test, "criteria": reexam.Criteria{Below: f(40), From: f(40), To: f(50), Absent: true}}, &p)
		reasons := map[string]string{}
		for _, x := range p.Sitters {
			if x.Suggested {
				reasons[x.Name] = x.Reason
			}
		}
		if len(p.Sitters) != 6 || len(reasons) != 3 || reasons["Ravi Kumar"] != "Below 40%: 30%" || reasons["Mate 0"] != "Between 40% and 50%: 44%" || reasons["Mate 1"] != "Absent" {
			t.Fatalf("suggested %v", reasons)
		}
	})

	var d reexam.Detail
	t.Run("a re-exam is a linked assessment; the original stays as it was", func(t *testing.T) {
		admin := admin.on(t)
		body := map[string]any{"sourceId": test, "criteria": reexam.Criteria{Below: f(40), Absent: true}, "heldOn": "2026-09-20",
			"students": []map[string]any{{"studentId": a.StudentID, "reason": "Below 40%: 30%"}, {"studentId": mates[1], "reason": "Absent"}, {"studentId": mates[0], "reason": "", "byHand": true}}}
		admin.json(422, "POST", "/v1/reexams", body, nil) // a student added by hand needs a reason
		body["students"].([]map[string]any)[2]["reason"] = "Asked for another chance"
		admin.json(201, "POST", "/v1/reexams", body, &d)
		if d.Title != "Test 2, re-exam" || d.Attempt != 2 || d.Sitting != 3 || d.Status != "draft" || d.Policy != "higher" || d.Marked != 0 {
			t.Fatalf("re-exam %+v", d.Summary)
		}
		got := one(`SELECT a.retake_of::text || ' ' || (SELECT count(*) FROM assessment_parts p WHERE p.assessment_id = a.id AND p.max_marks = 50)
			|| ' ' || (SELECT count(*) FROM assessment_participation ap WHERE ap.assessment_id = a.id AND ap.status = 'not_applicable')
			FROM assessments a WHERE a.id = $1`, d.ID)
		if got != test+" 1 3" {
			t.Fatalf("linked to %s, one part of 50, three classmates not sitting: %s", test, got)
		}
		admin.json(422, "POST", "/v1/reexams", map[string]any{"sourceId": d.ID, "students": []map[string]any{{"studentId": a.StudentID, "reason": "x"}}}, nil)
	})

	// The re-exam's marks: Ravi 25 (50%), Mate 0 18 (36%), Mate 1 absent again.
	rpart := one(`SELECT id FROM assessment_parts WHERE assessment_id = $1`, d.ID)
	mark(d.ID, rpart, a.StudentID, 25, "scored")
	mark(d.ID, rpart, mates[0], 18, "scored")
	mark(d.ID, rpart, mates[1], nil, "absent")

	outcome := func(d reexam.Detail, name string) (string, string) {
		for _, c := range d.Candidates {
			if c.Name == name {
				return c.Before.Pct + "/" + c.Before.State, c.After.Pct + "/" + c.After.State
			}
		}
		return "", ""
	}
	t.Run("the policy is previewed before anything changes", func(t *testing.T) {
		admin := admin.on(t)
		admin.json(200, "GET", "/v1/reexams/"+d.ID, nil, &d)
		if b, af := outcome(d, "Ravi Kumar"); b != "30/complete" || af != "50/complete" {
			t.Fatalf("higher of 30 and 50: %s -> %s", b, af)
		}
		if b, af := outcome(d, "Mate 0"); b != "44/complete" || af != "44/complete" {
			t.Fatalf("higher keeps 44 over 36: %s -> %s", b, af)
		}
		if _, af := outcome(d, "Mate 1"); af == "0/complete" || af == "/complete" {
			t.Fatalf("absent twice is never zero: %s", af)
		}
		if d.Changes.Up != 1 || d.Changes.Same != 1 || d.Changes.Pending != 1 {
			t.Fatalf("changes %+v", d.Changes)
		}
		admin.json(200, "PUT", "/v1/reexams/"+d.ID, map[string]string{"policy": "replace", "absentRule": "keep"}, &d)
		if _, af := outcome(d, "Mate 0"); af != "36/complete" || d.Changes.Down != 1 {
			t.Fatalf("replace takes 36: %s %+v", af, d.Changes)
		}
		admin.json(200, "PUT", "/v1/reexams/"+d.ID, map[string]string{"policy": "higher", "absentRule": "keep"}, &d)
		// Nothing is stored before the policy is applied.
		if n := one(`SELECT count(*) FROM computed_results WHERE student_id = $1 AND component_code = '_subject' AND pct = 50`, a.StudentID); n != "0" {
			t.Fatalf("a preview stored %s results", n)
		}
	})

	t.Run("approved, then applied, it counts in the stored result", func(t *testing.T) {
		admin, teacher := admin.on(t), teacher.on(t)
		admin.json(409, "POST", "/v1/reexams/"+d.ID+"/apply", nil, nil)
		teacher.json(403, "POST", "/v1/reexams/"+d.ID+"/approve", nil, nil)
		admin.json(200, "POST", "/v1/reexams/"+d.ID+"/approve", nil, &d)
		admin.json(200, "POST", "/v1/reexams/"+d.ID+"/apply", nil, &d)
		if d.Status != "applied" {
			t.Fatalf("status %s", d.Status)
		}
		admin.json(200, "POST", "/v1/results/recompute", map[string]string{"sectionId": a.SectionID, "periodId": a.PeriodID, "subjectId": a.SubjectID}, nil)
		if pct := one(`SELECT pct::float8::text FROM computed_results WHERE student_id = $1 AND period_id = $2 AND subject_id = $3 AND component_code = '_subject'`, a.StudentID, a.PeriodID, a.SubjectID); pct != "50" {
			t.Fatalf("Ravi's stored result %s, want 50", pct)
		}
		if v := one(`SELECT value::float8::text FROM evidence WHERE assessment_id = $1 AND student_id = $2`, test, a.StudentID); v != "15" {
			t.Fatalf("the original mark changed to %s", v)
		}
		// Changing the policy after it is applied sends it back to draft.
		admin.json(200, "PUT", "/v1/reexams/"+d.ID, map[string]string{"policy": "separate", "absentRule": "keep"}, &d)
		if d.Status != "draft" {
			t.Fatalf("status %s", d.Status)
		}
		var list []reexam.Summary
		admin.json(200, "GET", "/v1/reexams", nil, &list)
		if len(list) == 0 || list[0].ID != d.ID || list[0].Marked != 3 {
			t.Fatalf("list %+v", list)
		}
	})
}
