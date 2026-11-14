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
			{LessonID: lesson, Chapter: "Fractions", QType: "Short answer", Cells: map[string]papers.Cell{"apply": {Questions: 2, Marks: "3"}, "understand": {Questions: 1, Marks: "4"}}},
			{Chapter: "Decimals", QType: "Multiple choice", Cells: map[string]papers.Cell{"remember": {Questions: 10, Marks: "1.2"}}},
		}
		teacher.json(403, "PUT", base+"/blueprint", map[string]any{"taxonomy": "bloom", "rows": rows}, nil)
		admin.json(422, "PUT", base+"/blueprint", map[string]any{"taxonomy": "bloom", "rows": []papers.Row{{Chapter: "X", QType: "Y", Cells: map[string]papers.Cell{"apply": {Questions: 0, Marks: "3"}}}}}, nil)
		admin.json(200, "PUT", base+"/blueprint", map[string]any{"taxonomy": "bloom", "rows": rows}, &bp)
		if bp.Allocated != "22" || bp.Remaining != "-2" || bp.Questions != 13 {
			t.Fatalf("over by two: %+v", bp)
		}
		admin.json(409, "POST", base+"/blueprint/submit", nil, nil)
		rows[1].Cells["remember"] = papers.Cell{Questions: 10, Marks: "1"}
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
		if paper.Set != "Set A" || len(paper.Items) != 13 || paper.Filled != 12 || paper.Total != "20" {
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

	t.Run("answer space: ruled lines by marks, boxes for choices, none on the key", func(t *testing.T) {
		_, body := admin.raw("GET", "/v1/papers/"+paper.ID+"/html?space=true", nil)
		if n := strings.Count(string(body), `<div class="space">`); n != 3 {
			t.Fatalf("%d questions with lines, want the 3 written ones", n)
		}
		_, key := admin.raw("GET", "/v1/papers/"+paper.ID+"/html?space=true&key=true", nil)
		if strings.Contains(string(key), `<div class="space">`) {
			t.Fatal("the key has no answer lines")
		}
	})

	t.Run("finalise sets the parts, tagged with outcomes", func(t *testing.T) {
		admin, teacher, other := admin.on(t), teacher.on(t), other.on(t)
		_, _, _ = admin, teacher, other
		admin.json(200, "POST", "/v1/papers/"+paper.ID+"/finalise", nil, &paper)
		if paper.Status != "final" {
			t.Fatal("not final")
		}
		// Thirteen questions, thirteen parts, each with its own outcome tag.
		got := one(`SELECT count(*) || ' ' || sum(p.max_marks)::int || ' ' || min(p.name) || ' ' || (SELECT count(*) FROM part_tags t JOIN assessment_parts x ON x.id = t.part_id WHERE x.assessment_id = $1 AND t.paper_id = $2)
			FROM assessment_parts p WHERE p.assessment_id = $1 AND p.deleted_at IS NULL`, exam, paper.ID)
		if got != "13 20 Q1 12" {
			t.Fatalf("parts, marks, first, tags: %s", got)
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
		if setB.Set != "Set B" || setB.Status != "draft" || setB.Filled != 13 {
			t.Fatalf("set B %+v", setB)
		}
		admin.json(200, "PUT", "/v1/papers/"+paper.ID+"/assignments", map[string]any{"assignments": []papers.Assignment{{SectionID: a.SectionID, SitOn: "2026-11-20"}}}, &paper)
		admin.json(200, "PUT", "/v1/papers/"+setB.ID+"/assignments", map[string]any{"assignments": []papers.Assignment{{SectionID: a.SectionID, StudentID: a.StudentID}}}, &setB)
		if len(paper.Assignments) != 1 || paper.Assignments[0].SitOn != "2026-11-20" || len(setB.Assignments) != 1 || setB.Assignments[0].StudentID != a.StudentID {
			t.Fatalf("assignments %+v %+v", paper.Assignments, setB.Assignments)
		}
		admin.json(422, "PUT", "/v1/papers/"+paper.ID+"/assignments", map[string]any{"assignments": []papers.Assignment{{SectionID: b.SectionID}}}, nil)
		admin.json(422, "PUT", "/v1/papers/"+paper.ID+"/assignments", map[string]any{"assignments": []papers.Assignment{{SectionID: a.SectionID, SitOn: "20 Nov"}}}, nil)
		// Set B, finalised, tags the same parts for those who sit it; Ravi does.
		admin.json(200, "POST", "/v1/papers/"+setB.ID+"/finalise", nil, nil)
		if n := one(`SELECT count(*) FROM part_tags WHERE paper_id = $1`, setB.ID); n != "12" {
			t.Fatalf("set B tags %s", n)
		}
		if sat := one(`SELECT revu_paper_sat($1, $2)::text`, exam, a.StudentID); sat != setB.ID {
			t.Fatalf("Ravi sat %s, want set B", sat)
		}
		var list []papers.PaperSummary
		admin.json(200, "GET", base+"/papers", nil, &list)
		if len(list) != 2 || list[0].Status != "final" || list[1].Set != "Set B" || list[1].Status != "final" {
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

// SOLO and an institution's own levels, set names from Configuration.
func TestTaxonomiesAndSetNames(t *testing.T) {
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
	exam := one(`INSERT INTO assessments (org_id, year_id, period_id, level_id, subject_id, title, entry_mode) VALUES ($1, $2, $3, $4, $5, 'Quiz', 'total') RETURNING id`,
		a.ID, a.YearID, a.PeriodID, a.LevelID, a.SubjectID)
	one(`INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks) VALUES ($1, $2, 1, 'Total', 6) RETURNING id`, a.ID, exam)
	base := "/v1/assessments/" + exam

	var st papers.Settings
	admin.json(200, "GET", "/v1/paper-settings", nil, &st)
	if strings.Join(st.SetNames, ",") != "Set A,Set B,Set C,Set D" {
		t.Fatalf("default names %v", st.SetNames)
	}
	row := func(level string) []papers.Row {
		return []papers.Row{{Chapter: "Fractions", QType: "Short answer", Cells: map[string]papers.Cell{level: {Questions: 2, Marks: "3"}}}}
	}
	admin.json(422, "PUT", base+"/blueprint", map[string]any{"taxonomy": "custom", "rows": row("Deep")}, nil)
	admin.json(422, "PUT", "/v1/paper-settings", map[string]any{"setNames": []string{"Red", "red"}, "custom": map[string]any{"name": "", "levels": []string{}}}, nil)
	admin.json(200, "PUT", "/v1/paper-settings", map[string]any{"setNames": []string{"Red", "Blue"}, "custom": map[string]any{"name": "Depth of knowledge", "levels": []string{"Recall", "Skill", "Strategic", "Extended"}}}, &st)

	var bp papers.Blueprint
	admin.json(422, "PUT", base+"/blueprint", map[string]any{"taxonomy": "solo", "rows": row("apply")}, nil)
	admin.json(200, "PUT", base+"/blueprint", map[string]any{"taxonomy": "solo", "rows": row("relational")}, &bp)
	if bp.Allocated != "6" || bp.Remaining != "0" || bp.ByLevel[0].Key != "relational" {
		t.Fatalf("2 questions of 3 marks each are 6: %+v", bp)
	}
	admin.json(200, "PUT", base+"/blueprint", map[string]any{"taxonomy": "custom", "rows": row("Strategic")}, &bp)
	admin.json(200, "POST", base+"/blueprint/submit", nil, nil)
	admin.json(200, "POST", base+"/blueprint/approve", nil, nil)
	for _, text := range []string{"Plan how to share 3/4 of a pizza among 3.", "Design a fraction game for a friend."} {
		admin.json(201, "POST", "/v1/questions", map[string]any{"levelId": a.LevelID, "subjectId": a.SubjectID, "qtype": "Short answer", "marks": "3", "text": text, "customLevel": "Strategic", "solo": "extended"}, nil)
	}
	admin.json(201, "POST", "/v1/questions", map[string]any{"levelId": a.LevelID, "subjectId": a.SubjectID, "qtype": "Short answer", "marks": "3", "text": "Recall what a numerator is.", "customLevel": "Recall"}, nil)
	var p papers.Paper
	admin.json(201, "POST", base+"/papers", map[string]bool{"fill": true}, &p)
	if p.Set != "Red" || p.Taxonomy != "custom" || p.Filled != 2 || p.Items[0].Level != "Strategic" || p.Items[0].Marks != "3" {
		t.Fatalf("filled at the custom level only: %+v", p)
	}
	var blue, named papers.Paper
	admin.json(201, "POST", "/v1/papers/"+p.ID+"/duplicate", nil, &blue)
	admin.json(201, "POST", "/v1/papers/"+p.ID+"/duplicate", map[string]string{"name": "Makeup"}, &named)
	admin.json(422, "POST", "/v1/papers/"+p.ID+"/duplicate", map[string]string{"name": "makeup"}, nil)
	if blue.Set != "Blue" || named.Set != "Makeup" {
		t.Fatalf("names %q %q", blue.Set, named.Set)
	}
}

// A paper built freely: sections as cards, questions typed in, reordered,
// one section extra and one not printed; marks by section.
func TestFreePaper(t *testing.T) {
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
	exam := one(`INSERT INTO assessments (org_id, year_id, period_id, level_id, subject_id, title, entry_mode) VALUES ($1, $2, $3, $4, $5, 'Class test', 'total') RETURNING id`,
		a.ID, a.YearID, a.PeriodID, a.LevelID, a.SubjectID)
	one(`INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks) VALUES ($1, $2, 1, 'Total', 10) RETURNING id`, a.ID, exam)
	outcome := one(`SELECT id FROM learning_outcomes WHERE org_id = $1`, a.ID)

	var p papers.Paper
	admin.json(201, "POST", "/v1/assessments/"+exam+"/papers", map[string]any{"blank": true}, &p)
	if len(p.Sections) != 1 || p.Sections[0].Title != "Section A" || len(p.Items) != 0 {
		t.Fatalf("blank paper %+v", p.Sections)
	}
	base := "/v1/papers/" + p.ID
	admin.json(409, "POST", base+"/finalise", nil, nil) // nothing in it yet
	admin.json(201, "POST", base+"/sections", map[string]any{"title": "Think further", "kind": "extra"}, &p)
	admin.json(201, "POST", base+"/sections", nil, &p)
	if len(p.Sections) != 3 || p.Sections[2].Title != "Section C" || p.Sections[1].Kind != "extra" {
		t.Fatalf("sections %+v", p.Sections)
	}
	secA, extra, secC := p.Sections[0].ID, p.Sections[1].ID, p.Sections[2].ID
	typed := func(section, qtype, marks, text string, options ...string) {
		admin.json(201, "POST", base+"/items", map[string]any{"sectionId": section,
			"question": map[string]any{"qtype": qtype, "marks": marks, "text": text, "options": options, "answer": "Key: " + text, "outcomeId": outcome}}, &p)
	}
	admin.json(422, "POST", base+"/items", map[string]any{"sectionId": secA, "question": map[string]any{"qtype": "Short answer", "marks": "0", "text": "x"}}, nil)
	typed(secA, "Multiple choice", "1", "Which is a fraction?", "1/2", "2", "0.5", "5")
	typed(secA, "Match the following", "2", "Match each fraction to its decimal.", "1/2 = 0.5", "1/4 = 0.25")
	typed(secC, "Long answer", "5", "Explain equivalent fractions.")
	typed(secC, "True or false", "2", "1/2 is greater than 1/3.")
	typed(extra, "Essay", "10", "Write about fractions in daily life.")
	if len(p.Items) != 5 || p.Total != "10" || p.Items[4].Section != "Long answer" && p.Items[4].Seq != 5 {
		t.Fatalf("five questions, ten counted marks: total %s, %d items", p.Total, len(p.Items))
	}
	// The same question cannot be in the paper twice.
	admin.json(422, "POST", base+"/items", map[string]any{"sectionId": secC, "questionId": p.Items[0].Question.ID}, nil)

	// Reorder: Section C first, its two questions swapped; the match question moves to C.
	byText := func(text string) string {
		for _, it := range p.Items {
			if it.Question.Text == text {
				return it.ID
			}
		}
		t.Fatalf("no %q", text)
		return ""
	}
	order := map[string]any{"sections": []map[string]any{
		{"id": secC, "itemIds": []string{byText("1/2 is greater than 1/3."), byText("Explain equivalent fractions."), byText("Match each fraction to its decimal.")}},
		{"id": secA, "itemIds": []string{byText("Which is a fraction?")}},
		{"id": extra, "itemIds": []string{byText("Write about fractions in daily life.")}},
	}}
	admin.json(422, "PUT", base+"/order", map[string]any{"sections": order["sections"].([]map[string]any)[:2]}, nil)
	admin.json(200, "PUT", base+"/order", order, &p)
	if p.Sections[0].Title != "Section C" || p.Items[0].Question.Text != "1/2 is greater than 1/3." || p.Items[2].Question.QType != "Match the following" || p.Items[3].Seq != 4 {
		t.Fatalf("order %+v", p.Sections)
	}
	admin.json(200, "PUT", base+"/sections/"+secA, map[string]any{"title": "Warm up", "instructions": "Answer all.", "print": false}, &p)

	_, body := admin.raw("GET", base+"/html?space=true", nil)
	page := string(body)
	if strings.Contains(page, "Warm up") || !strings.Contains(page, "(not counted)") || !strings.Contains(page, `<table class="match">`) || !strings.Contains(page, "<li>True") {
		t.Fatalf("print: no unprinted section, extra marked, match as a table, true or false as choices")
	}
	if _, all := admin.raw("GET", base+"/html?all=true", nil); !strings.Contains(string(all), "Warm up") || !strings.Contains(string(all), "Answer all.") {
		t.Fatal("all=true prints every section with its instructions")
	}

	// Marks by section: one part a core section, tagged with its outcomes.
	// The paper is finalised with marks by question; how they are entered is
	// then the administrator's choice, until a mark is entered.
	var by papers.MarksBy
	admin.json(409, "PUT", "/v1/assessments/"+exam+"/marks-by", map[string]string{"marksBy": "sections"}, nil) // no final paper yet
	admin.json(200, "POST", base+"/finalise", nil, &p)
	admin.json(200, "GET", "/v1/assessments/"+exam+"/marks-by", nil, &by)
	if by.MarksBy != "questions" || !by.MayChange || by.Marked {
		t.Fatalf("after finalising: %+v", by)
	}
	admin.json(422, "PUT", "/v1/assessments/"+exam+"/marks-by", map[string]string{"marksBy": "pages"}, nil)
	admin.json(200, "PUT", "/v1/assessments/"+exam+"/marks-by", map[string]string{"marksBy": "sections"}, &by)
	got := one(`SELECT string_agg(p.name || '=' || p.max_marks::int || ':' || (SELECT count(*) FROM part_tags t WHERE t.part_id = p.id), ', ' ORDER BY p.seq)
		|| ' ' || (SELECT marks_by || '/' || entry_mode FROM assessments WHERE id = $1)
		FROM assessment_parts p WHERE p.assessment_id = $1 AND p.deleted_at IS NULL`, exam)
	if got != "Section C=9:1, Warm up=1:1 sections/sections" {
		t.Fatalf("parts by section: %s", got)
	}
	admin.json(409, "POST", base+"/sections", nil, nil) // final
}

// A paper at every level: sections, sub-sections, questions and their bits.
func TestPaperHierarchy(t *testing.T) {
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
	exam := one(`INSERT INTO assessments (org_id, year_id, period_id, level_id, subject_id, title, entry_mode) VALUES ($1, $2, $3, $4, $5, 'Class test', 'total') RETURNING id`,
		a.ID, a.YearID, a.PeriodID, a.LevelID, a.SubjectID)
	one(`INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks) VALUES ($1, $2, 1, 'Total', 10) RETURNING id`, a.ID, exam)
	outcome := one(`SELECT id FROM learning_outcomes WHERE org_id = $1`, a.ID)

	var p papers.Paper
	admin.json(201, "POST", "/v1/assessments/"+exam+"/papers", map[string]any{"blank": true}, &p)
	base := "/v1/papers/" + p.ID
	secA := p.Sections[0].ID
	admin.json(201, "POST", base+"/sections", nil, &p) // Section B
	secB := p.Sections[1].ID
	// Sub-sections land at the end of their own section, before the next one.
	admin.json(201, "POST", base+"/sections", map[string]any{"parentId": secA}, &p)
	admin.json(201, "POST", base+"/sections", map[string]any{"parentId": secA, "title": "Grammar"}, &p)
	if len(p.Sections) != 4 || p.Sections[1].Title != "Part 1" || p.Sections[2].Title != "Grammar" || p.Sections[2].ParentID != secA || p.Sections[3].ID != secB {
		t.Fatalf("sub-sections %+v", p.Sections)
	}
	part1, grammar := p.Sections[1].ID, p.Sections[2].ID
	admin.json(422, "POST", base+"/sections", map[string]any{"parentId": part1}, nil) // one level down only

	add := func(section string, q map[string]any) {
		q["outcomeId"] = outcome
		admin.json(201, "POST", base+"/items", map[string]any{"sectionId": section, "question": q}, &p)
	}
	add(secA, map[string]any{"qtype": "Short answer", "marks": "1", "text": "Name a noun."})
	add(part1, map[string]any{"qtype": "Long answer", "marks": "9", "text": "Read the passage and answer.", "bits": []map[string]any{
		{"text": "Who is the speaker?", "marks": "1.5", "answer": "The poet"},
		{"text": "What does the river stand for?", "marks": "2.5"},
	}})
	add(grammar, map[string]any{"qtype": "Short answer", "marks": "2", "text": "Correct the sentence."})
	add(secB, map[string]any{"qtype": "Essay", "marks": "4", "text": "Write a letter."})
	admin.json(422, "POST", base+"/items", map[string]any{"sectionId": secB, "question": map[string]any{"qtype": "Short answer", "marks": "1", "text": "x", "bits": []map[string]any{{"text": "y", "marks": "0"}}}}, nil)
	// With bits a question is worth what they add up to; a section's marks take in its sub-sections'.
	withBits := p.Items[1]
	if withBits.Marks != "4" || len(withBits.Question.Bits) != 2 || p.Sections[0].Marks != "7" || p.Sections[0].Questions != 3 || p.Sections[1].Marks != "4" || p.Total != "11" {
		t.Fatalf("marks: item %s, section A %s (%d), part 1 %s, total %s", withBits.Marks, p.Sections[0].Marks, p.Sections[0].Questions, p.Sections[1].Marks, p.Total)
	}

	// Changing a question in place: its bits, and so its marks, in the paper too.
	q := withBits.Question
	var changed papers.Question
	admin.json(200, "PUT", "/v1/questions/"+q.ID, map[string]any{"levelId": q.LevelID, "subjectId": q.SubjectID, "outcomeId": outcome, "qtype": q.QType, "marks": "1", "text": q.Text, "bits": []map[string]any{
		{"text": "Who is the speaker?", "marks": "2", "answer": "The poet"},
		{"text": "What does the river stand for?", "marks": "3"},
	}}, &changed)
	admin.json(200, "GET", base, nil, &p)
	if changed.Marks != "5" || p.Items[1].Marks != "5" || p.Total != "12" {
		t.Fatalf("after the change: question %s, item %s, total %s", changed.Marks, p.Items[1].Marks, p.Total)
	}

	// Order: a sub-section stays in its section; sections move with theirs.
	ids := func(section string) []string {
		out := []string{}
		for _, it := range p.Items {
			if it.SectionID == section {
				out = append(out, it.ID)
			}
		}
		return out
	}
	sec := func(id string) map[string]any { return map[string]any{"id": id, "itemIds": ids(id)} }
	admin.json(422, "PUT", base+"/order", map[string]any{"sections": []map[string]any{sec(secA), sec(part1), sec(secB), sec(grammar)}}, nil)
	admin.json(200, "PUT", base+"/order", map[string]any{"sections": []map[string]any{sec(secB), sec(secA), sec(grammar), sec(part1)}}, &p)
	if p.Sections[0].ID != secB || p.Sections[2].ID != grammar || p.Items[0].Question.Text != "Write a letter." || p.Items[3].Question.Text != "Read the passage and answer." {
		t.Fatalf("order %+v", p.Sections)
	}

	// Extra is the section's to say, and its sub-sections follow.
	admin.json(200, "PUT", base+"/sections/"+grammar, map[string]any{"kind": "extra", "print": false}, &p)
	if p.Sections[2].Kind != "core" || p.Sections[2].Print || p.Total != "12" {
		t.Fatalf("a sub-section counts as its section does: %+v total %s", p.Sections[2], p.Total)
	}
	_, body := admin.raw("GET", base+"/html?space=true", nil)
	page := string(body)
	if strings.Contains(page, "Grammar") || !strings.Contains(page, "<h3>Part 1") || !strings.Contains(page, `<span class="l">(b)</span>What does the river stand for?`) || !strings.Contains(page, "[3]") {
		t.Fatalf("print: sub-section headings, bits lettered with their marks, an unprinted sub-section left out\n%s", page)
	}
	if _, key := admin.raw("GET", base+"/html?key=true&all=true", nil); !strings.Contains(string(key), "The poet") || !strings.Contains(string(key), "Grammar") {
		t.Fatalf("the key carries each bit's answer")
	}
	admin.json(200, "PUT", base+"/sections/"+grammar, map[string]any{"print": true}, &p)

	// Bits all worth the same carry no marks of their own in print; the room
	// to answer is as set for the question.
	add(secB, map[string]any{"qtype": "Map or diagram", "marks": "1", "text": "Draw and label.", "spaceKind": "box", "spaceSize": 6, "bits": []map[string]any{
		{"text": "A leaf", "marks": "2"}, {"text": "A root", "marks": "2"}}})
	add(secB, map[string]any{"qtype": "Short answer", "marks": "1", "text": "Say it aloud.", "spaceKind": "none"})
	add(secB, map[string]any{"qtype": "Short answer", "marks": "1", "text": "Work it out.", "spaceKind": "blank", "spaceSize": 3})
	add(secB, map[string]any{"qtype": "Multiple choice", "marks": "1", "text": "Pick one and say why.", "options": []string{"a", "b"}, "spaceKind": "lines", "spaceSize": 5})
	admin.json(422, "POST", base+"/items", map[string]any{"sectionId": secB, "question": map[string]any{"qtype": "Short answer", "marks": "1", "text": "x", "spaceKind": "lines"}}, nil)
	_, body = admin.raw("GET", base+"/html?space=true", nil)
	page = string(body)
	for _, want := range []string{`[2 × 2 = 4]`, `<span class="l">(a)</span>A leaf<div class="draw" style="height:156px">`, `<div class="blank" style="height:78px">`, strings.Repeat("<div></div>", 5) + "</div></li>"} {
		if !strings.Contains(page, want) {
			t.Fatalf("print lacks %q in %s", want, page)
		}
	}
	for _, id := range ids(secB)[1:] {
		admin.json(200, "DELETE", base+"/items/"+id, nil, &p)
	}

	// A copy keeps the hierarchy.
	var dup papers.Paper
	admin.json(201, "POST", base+"/duplicate", nil, &dup)
	if len(dup.Sections) != 4 || dup.Sections[2].ParentID != dup.Sections[1].ID || dup.Sections[3].ParentID != dup.Sections[1].ID || dup.Sections[2].Title != "Grammar" {
		t.Fatalf("duplicate %+v", dup.Sections)
	}

	// Marks by section: a sub-section holding questions is a part of its own.
	admin.json(200, "POST", base+"/finalise", nil, &p)
	admin.json(200, "PUT", "/v1/assessments/"+exam+"/marks-by", map[string]string{"marksBy": "sections"}, nil)
	rows, err := owner.Query(ctx, `SELECT name || '=' || max_marks::text FROM assessment_parts WHERE assessment_id = $1 AND deleted_at IS NULL ORDER BY seq`, exam)
	if err != nil {
		t.Fatal(err)
	}
	var parts []string
	for rows.Next() {
		var s string
		_ = rows.Scan(&s)
		parts = append(parts, s)
	}
	if got := strings.Join(parts, ", "); got != "Section B=4.00, Section A=1.00, Section A: Grammar=2.00, Section A: Part 1=5.00" {
		t.Fatalf("parts %s", got)
	}
	if n := one(`SELECT count(*)::text FROM part_tags WHERE paper_id = $1`, p.ID); n != "4" {
		t.Fatalf("each part tagged with its outcome: %s", n)
	}
	// Removing a section takes its sub-sections with it.
	admin.json(200, "DELETE", "/v1/papers/"+dup.ID+"/sections/"+dup.Sections[1].ID, nil, &dup)
	if len(dup.Sections) != 1 || len(dup.Items) != 1 {
		t.Fatalf("after removing a section: %d sections, %d questions", len(dup.Sections), len(dup.Items))
	}
}
