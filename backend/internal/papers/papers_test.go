package papers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/ai"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/papers"
	"github.com/jackymean-del/revu/internal/server"
)

type headerAuth struct{}

func (headerAuth) UserID(c fiber.Ctx) (string, error) { return c.Get("X-Test-User"), nil }

type caller struct {
	t         *testing.T
	app       *fiber.App
	user, org string
}

// on is the caller reporting to a subtest.
func (c caller) on(t *testing.T) caller { c.t = t; return c }

func (c caller) raw(method, path string, body any) (int, []byte) {
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
	return res.StatusCode, b
}

func (c caller) json(code int, method, path string, body any, into any) {
	c.t.Helper()
	got, b := c.raw(method, path, body)
	if got != code {
		c.t.Fatalf("%s %s: %d, want %d: %s", method, path, got, code, b)
	}
	if into != nil {
		if err := json.Unmarshal(b, into); err != nil {
			c.t.Fatalf("%s %s: %v", method, path, err)
		}
	}
}

// From blueprint to a final paper in two sets, assigned (pilot P0.9;
// AT-QP-01 to AT-QP-08).
func TestBlueprintToPaper(t *testing.T) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	b := dbtest.SeedOrg(t, owner, "Org B")
	app := server.New(config.Config{Version: "test"}, server.Deps{DB: appPool, Auth: headerAuth{}})
	admin := caller{t, app, a.UserID, a.ID}
	other := caller{t, app, b.UserID, b.ID}
	ctx := context.Background()
	one := func(sql string, args ...any) string {
		t.Helper()
		var v string
		if err := owner.QueryRow(ctx, sql, args...).Scan(&v); err != nil {
			t.Fatalf("%v\n%s", err, sql)
		}
		return v
	}
	// A teacher who does not teach the subject.
	staff := one(`INSERT INTO staff (org_id, name) VALUES ($1, 'Tina') RETURNING id`, a.ID)
	one(`INSERT INTO memberships (org_id, clerk_user_id, role, staff_id) VALUES ($1, $2, 'teacher', $3) RETURNING id`, a.ID, "tina-"+a.UserID, staff)
	t.Cleanup(func() { _, _ = owner.Exec(ctx, `DELETE FROM memberships WHERE clerk_user_id = $1`, "tina-"+a.UserID) })
	teacher := caller{t, app, "tina-" + a.UserID, a.ID}

	// A fresh assessment of 20 marks with no marks entered.
	exam := one(`INSERT INTO assessments (org_id, year_id, period_id, level_id, subject_id, title, entry_mode) VALUES ($1, $2, $3, $4, $5, 'Unit test 2', 'total') RETURNING id`,
		a.ID, a.YearID, a.PeriodID, a.LevelID, a.SubjectID)
	one(`INSERT INTO assessment_scopes (org_id, assessment_id, section_id) VALUES ($1, $2, $3) RETURNING section_id`, a.ID, exam, a.SectionID)
	one(`INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks) VALUES ($1, $2, 1, 'Total', 20) RETURNING id`, a.ID, exam)
	lesson := one(`SELECT id FROM lessons WHERE org_id = $1`, a.ID)
	outcome := one(`SELECT id FROM learning_outcomes WHERE org_id = $1`, a.ID)
	base := "/v1/assessments/" + exam

	t.Run("blueprint: checked totals, then submitted and approved", func(t *testing.T) {
		admin, teacher, other := admin.on(t), teacher.on(t), other.on(t)
		_, _, _ = admin, teacher, other
		var bp papers.Blueprint
		admin.json(200, "GET", base+"/blueprint", nil, &bp)
		if bp.Exists || bp.Max != "20" || bp.Remaining != "20" {
			t.Fatalf("empty blueprint %+v", bp)
		}
		rows := []papers.Row{
			{LessonID: lesson, Chapter: "Fractions", QType: "Short answer", Cells: map[string]papers.Cell{"apply": {Questions: 2, Marks: "6"}, "understand": {Questions: 1, Marks: "4"}}},
			{Chapter: "Decimals", QType: "Multiple choice", Cells: map[string]papers.Cell{"remember": {Questions: 10, Marks: "12"}}},
		}
		teacher.json(403, "PUT", base+"/blueprint", map[string]any{"taxonomy": "bloom", "rows": rows}, nil)
		admin.json(422, "PUT", base+"/blueprint", map[string]any{"taxonomy": "bloom", "rows": []papers.Row{{Chapter: "X", QType: "Y", Cells: map[string]papers.Cell{"apply": {Questions: 0, Marks: "3"}}}}}, nil)
		admin.json(200, "PUT", base+"/blueprint", map[string]any{"taxonomy": "bloom", "rows": rows}, &bp)
		if bp.Allocated != "22" || bp.Remaining != "-2" || bp.Questions != 13 {
			t.Fatalf("over by two: %+v", bp)
		}
		admin.json(409, "POST", base+"/blueprint/submit", nil, nil)
		rows[1].Cells["remember"] = papers.Cell{Questions: 10, Marks: "10"}
		admin.json(200, "PUT", base+"/blueprint", map[string]any{"taxonomy": "bloom", "rows": rows}, &bp)
		if bp.Remaining != "0" || len(bp.ByLevel) != 3 || bp.ByLevel[0].Key != "remember" || bp.ByLevel[0].Weight != "50" {
			t.Fatalf("balanced: %+v", bp)
		}
		admin.json(409, "POST", base+"/papers", nil, nil) // not approved yet
		admin.json(409, "POST", base+"/blueprint/approve", nil, nil)
		admin.json(200, "POST", base+"/blueprint/submit", nil, nil)
		admin.json(422, "POST", base+"/blueprint/return", map[string]string{}, nil)
		admin.json(200, "POST", base+"/blueprint/approve", nil, &bp)
		if bp.Status != "approved" || bp.Version != 1 {
			t.Fatalf("approved: %+v", bp)
		}
	})

	var paper papers.Paper
	t.Run("questions fill the paper; a slot nothing fits stays empty", func(t *testing.T) {
		admin, teacher, other := admin.on(t), teacher.on(t), other.on(t)
		_, _, _ = admin, teacher, other
		q := func(bloom, qtype, marks, text string) papers.Question {
			var out papers.Question
			admin.json(201, "POST", "/v1/questions", map[string]any{"levelId": a.LevelID, "subjectId": a.SubjectID, "lessonId": lesson, "outcomeId": outcome,
				"bloom": bloom, "qtype": qtype, "marks": marks, "text": text, "answer": "Answer to " + text}, &out)
			return out
		}
		q("apply", "Short answer", "3", "Add 2/3 and 1/4.")
		q("apply", "Short answer", "3", "Subtract 1/6 from 3/4.")
		q("understand", "short answer", "4", "Explain why 2/4 equals 1/2.")
		for i := range 9 {
			q("remember", "Multiple choice", "1", "Which is larger? "+string(rune('a'+i)))
		}
		var ai papers.Question
		admin.json(201, "POST", "/v1/questions", map[string]any{"levelId": a.LevelID, "subjectId": a.SubjectID, "qtype": "Multiple choice", "marks": "1",
			"text": "Name the place value of 7 in 3.74.", "source": "ai"}, &ai)
		if ai.Status != "draft" || ai.Bloom == "" {
			t.Fatalf("an AI question is a draft until accepted: %+v", ai)
		}
		admin.json(201, "POST", base+"/papers", map[string]bool{"fill": true}, &paper)
		if paper.Set != "A" || len(paper.Items) != 13 || paper.Filled != 12 || paper.Total != "20" {
			t.Fatalf("set A: set %s, %d slots, %d filled, total %s", paper.Set, len(paper.Items), paper.Filled, paper.Total)
		}
		if paper.Items[0].Section != "Short answer" || paper.Items[3].Section != "Multiple choice" || len(paper.BySection) != 2 || paper.BySection[1].Missing != 1 {
			t.Fatalf("sections %+v", paper.BySection)
		}
		admin.json(409, "POST", "/v1/papers/"+paper.ID+"/finalise", nil, nil)

		empty := paper.Items[len(paper.Items)-1]
		if empty.Question != nil {
			t.Fatal("the last slot should be the empty one")
		}
		admin.json(422, "PUT", "/v1/papers/"+paper.ID+"/items/"+empty.ID, map[string]string{"questionId": paper.Items[0].Question.ID}, nil) // a 4 mark question in a 1 mark slot
		admin.json(200, "PUT", "/v1/questions/"+ai.ID, map[string]any{"levelId": a.LevelID, "subjectId": a.SubjectID, "qtype": "Multiple choice", "marks": "1",
			"bloom": "remember", "text": ai.Text, "source": "ai", "status": "approved", "answer": "Tenths"}, &ai)
		admin.json(200, "POST", "/v1/papers/"+paper.ID+"/fill", nil, &paper)
		if paper.Filled != 13 {
			t.Fatalf("the accepted question fills the slot: %d", paper.Filled)
		}
	})

	t.Run("print: the student copy has no answers, the key does", func(t *testing.T) {
		admin, teacher, other := admin.on(t), teacher.on(t), other.on(t)
		_, _, _ = admin, teacher, other
		code, body := admin.raw("GET", "/v1/papers/"+paper.ID+"/html", nil)
		if code != 200 || !strings.Contains(string(body), "Add 2/3 and 1/4.") || strings.Contains(string(body), "Answer to") {
			t.Fatalf("student copy %d", code)
		}
		code, body = admin.raw("GET", "/v1/papers/"+paper.ID+"/html?key=true", nil)
		if code != 200 || !strings.Contains(string(body), "Answer to Add 2/3 and 1/4.") || !strings.Contains(string(body), "Set A") {
			t.Fatalf("answer key %d", code)
		}
	})

	t.Run("finalise sets the parts, tagged with outcomes", func(t *testing.T) {
		admin, teacher, other := admin.on(t), teacher.on(t), other.on(t)
		_, _, _ = admin, teacher, other
		admin.json(200, "POST", "/v1/papers/"+paper.ID+"/finalise", nil, &paper)
		if paper.Status != "final" {
			t.Fatal("not final")
		}
		got := one(`SELECT string_agg(p.name || '=' || p.max_marks::int || ':' || (SELECT count(*) FROM part_tags t WHERE t.part_id = p.id), ', ' ORDER BY p.seq)
			FROM assessment_parts p WHERE p.assessment_id = $1 AND p.deleted_at IS NULL`, exam)
		if got != "Short answer (Q1-3)=10:1, Multiple choice (Q4-13)=10:1" {
			t.Fatalf("parts: %s", got)
		}
		if mode := one(`SELECT entry_mode FROM assessments WHERE id = $1`, exam); mode != "sections" {
			t.Fatalf("entry mode %s", mode)
		}
		admin.json(409, "PUT", "/v1/papers/"+paper.ID+"/items/"+paper.Items[0].ID, map[string]any{"locked": true}, nil)
		q := paper.Items[0].Question
		admin.json(409, "PUT", "/v1/questions/"+q.ID, map[string]any{"levelId": a.LevelID, "subjectId": a.SubjectID, "qtype": q.QType, "marks": q.Marks, "bloom": q.Bloom, "text": "Changed"}, nil)
	})

	t.Run("Set B is a copy; sections and students are assigned", func(t *testing.T) {
		admin, teacher, other := admin.on(t), teacher.on(t), other.on(t)
		_, _, _ = admin, teacher, other
		var setB papers.Paper
		admin.json(201, "POST", "/v1/papers/"+paper.ID+"/duplicate", nil, &setB)
		if setB.Set != "B" || setB.Status != "draft" || setB.Filled != 13 {
			t.Fatalf("set B %+v", setB)
		}
		admin.json(200, "PUT", "/v1/papers/"+paper.ID+"/assignments", map[string]any{"assignments": []papers.Assignment{{SectionID: a.SectionID, SitOn: "2026-11-20"}}}, &paper)
		admin.json(200, "PUT", "/v1/papers/"+setB.ID+"/assignments", map[string]any{"assignments": []papers.Assignment{{SectionID: a.SectionID, StudentID: a.StudentID}}}, &setB)
		if len(paper.Assignments) != 1 || paper.Assignments[0].SitOn != "2026-11-20" || len(setB.Assignments) != 1 || setB.Assignments[0].StudentID != a.StudentID {
			t.Fatalf("assignments %+v %+v", paper.Assignments, setB.Assignments)
		}
		admin.json(422, "PUT", "/v1/papers/"+paper.ID+"/assignments", map[string]any{"assignments": []papers.Assignment{{SectionID: b.SectionID}}}, nil)
		admin.json(422, "PUT", "/v1/papers/"+paper.ID+"/assignments", map[string]any{"assignments": []papers.Assignment{{SectionID: a.SectionID, SitOn: "20 Nov"}}}, nil)
		var list []papers.PaperSummary
		admin.json(200, "GET", base+"/papers", nil, &list)
		if len(list) != 2 || list[0].Status != "final" || list[1].Set != "B" {
			t.Fatalf("list %+v", list)
		}
	})

	t.Run("another organisation sees none of it", func(t *testing.T) {
		admin, teacher, other := admin.on(t), teacher.on(t), other.on(t)
		_, _, _ = admin, teacher, other
		other.json(404, "GET", "/v1/papers/"+paper.ID, nil, nil)
		other.json(404, "GET", base+"/blueprint", nil, nil)
		var qs []papers.Question
		other.json(200, "GET", "/v1/questions?levelId="+a.LevelID+"&subjectId="+a.SubjectID, nil, &qs)
		if len(qs) != 0 {
			t.Fatalf("leaked %d questions", len(qs))
		}
	})
}

type fakeAI struct{ prompts []string }

func (f *fakeAI) Draft(_ context.Context, r ai.Request, out any) error {
	f.prompts = append(f.prompts, r.System+"\n"+r.Prompt)
	return json.Unmarshal([]byte(`{"questions": [
		{"text": "Which fraction is larger, 2/3 or 3/5?", "options": [], "answer": "2/3; 1 mark for comparing", "bloom": "analyse", "difficulty": "easy"},
		{"text": "Order 1/2, 1/3 and 3/4.", "options": [], "answer": "1/3, 1/2, 3/4", "bloom": "apply", "difficulty": "medium"},
		{"text": "", "options": [], "answer": "", "bloom": "apply", "difficulty": "easy"}]}`), out)
}

// AI drafts land in the bank as drafts, and only the curriculum is sent.
func TestDraftQuestions(t *testing.T) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	fake := &fakeAI{}
	app := server.New(config.Config{Version: "test"}, server.Deps{DB: appPool, Auth: headerAuth{}, AI: fake})
	off := server.New(config.Config{Version: "test"}, server.Deps{DB: appPool, Auth: headerAuth{}})
	admin := caller{t, app, a.UserID, a.ID}
	var lesson string
	if err := owner.QueryRow(context.Background(), `SELECT id FROM lessons WHERE org_id = $1`, a.ID).Scan(&lesson); err != nil {
		t.Fatal(err)
	}
	body := map[string]any{"levelId": a.LevelID, "subjectId": a.SubjectID, "lessonId": lesson, "qtype": "Short answer", "bloom": "apply", "marks": "2", "count": 2}
	caller{t, off, a.UserID, a.ID}.json(503, "POST", "/v1/questions/draft", body, nil)
	var made []papers.Question
	admin.json(201, "POST", "/v1/questions/draft", body, &made)
	if len(made) != 2 || made[0].Status != "draft" || made[0].Source != "ai" || made[0].Bloom != "apply" || made[0].Marks != "2" || made[0].LessonID != lesson {
		t.Fatalf("drafts %+v", made)
	}
	p := fake.prompts[0]
	if !strings.Contains(p, "Lesson: Fractions") || !strings.Contains(p, "Add fractions with unlike denominators.") || !strings.Contains(p, "Add 1/2 and 1/3.") {
		t.Fatalf("the curriculum and the bank are sent:\n%s", p)
	}
	for _, private := range []string{"Ravi Kumar", "A-001", "Meena", "Asha Rao"} {
		if strings.Contains(p, private) {
			t.Fatalf("%q was sent to the AI", private)
		}
	}
	admin.json(422, "POST", "/v1/questions/draft", map[string]any{"levelId": a.LevelID, "subjectId": a.SubjectID, "qtype": "Short answer", "marks": "0"}, nil)
}
