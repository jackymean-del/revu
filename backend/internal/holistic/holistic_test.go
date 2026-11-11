package holistic_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/ai"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/holistic"
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

type fakeAI struct{ prompts []string }

func (f *fakeAI) Draft(_ context.Context, r ai.Request, out any) error {
	f.prompts = append(f.prompts, r.System+"\n"+r.Prompt)
	return json.Unmarshal([]byte(`{"note": "{name} solves problems with care. Keep practising number sense at home."}`), out)
}

// A child's levels match a hand calculation from tagged parts; absences and
// exemptions never count; under three marks says too little evidence
// (pilot P0.11 H2 to H5; AT-RP-18).
func TestHolisticReport(t *testing.T) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	b := dbtest.SeedOrg(t, owner, "Org B")
	fake := &fakeAI{}
	app := server.New(config.Config{Version: "test"}, server.Deps{DB: appPool, Auth: headerAuth{}, AI: fake})
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
	staff := one(`INSERT INTO staff (org_id, name) VALUES ($1, 'Tina') RETURNING id`, a.ID)
	one(`INSERT INTO memberships (org_id, clerk_user_id, role, staff_id) VALUES ($1, $2, 'teacher', $3) RETURNING id`, a.ID, "tina-"+a.UserID, staff)
	t.Cleanup(func() { _, _ = owner.Exec(ctx, `DELETE FROM memberships WHERE clerk_user_id = $1`, "tina-"+a.UserID) })
	teacher := caller{t, app, "tina-" + a.UserID, a.ID}

	// Five classmates, so class averages show.
	var mates []string
	for i := range 5 {
		id := one(`INSERT INTO students (org_id, admission_no, name) VALUES ($1, $2, $3) RETURNING id`, a.ID, fmt.Sprintf("A-1%02d", i), fmt.Sprintf("Mate %d", i))
		one(`INSERT INTO enrolments (org_id, student_id, section_id, year_id, roll_no) VALUES ($1, $2, $3, $4, $5) RETURNING id`, a.ID, id, a.SectionID, a.YearID, fmt.Sprint(i+2))
		mates = append(mates, id)
	}
	// A quiz of four parts: three test the seeded outcome (Problem solving,
	// Apply), one a new outcome (Number sense, Remember).
	quiz := one(`INSERT INTO assessments (org_id, year_id, period_id, level_id, subject_id, title, entry_mode) VALUES ($1, $2, $3, $4, $5, 'Quiz', 'sections') RETURNING id`,
		a.ID, a.YearID, a.PeriodID, a.LevelID, a.SubjectID)
	lo := one(`SELECT id FROM learning_outcomes WHERE org_id = $1`, a.ID)
	numberSense := one(`INSERT INTO competencies (org_id, subject_id, name) VALUES ($1, $2, 'Number sense') RETURNING id`, a.ID, a.SubjectID)
	lo2 := one(`INSERT INTO learning_outcomes (org_id, level_id, subject_id, competency_id, text, bloom) VALUES ($1, $2, $3, $4, 'Recall place values.', 'remember') RETURNING id`,
		a.ID, a.LevelID, a.SubjectID, numberSense)
	var parts []string
	for i, max := range []int{10, 10, 10, 20} {
		parts = append(parts, one(`INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks) VALUES ($1, $2, $3, $4, $5) RETURNING id`, a.ID, quiz, i+1, fmt.Sprintf("Q%d", i+1), max))
		tag := lo
		if i == 3 {
			tag = lo2
		}
		one(`INSERT INTO part_tags (org_id, part_id, outcome_id) VALUES ($1, $2, $3) RETURNING part_id`, a.ID, parts[i], tag)
	}
	mark := func(student, part string, value any, state string) {
		one(`INSERT INTO evidence (org_id, student_id, assessment_id, part_id, value, state, source) VALUES ($1, $2, $3, $4, $5, $6::value_state, 'grid') RETURNING id`, a.ID, student, quiz, part, value, state)
	}
	// Ravi: 8, 6 and 9 of 10 on Problem solving (23 of 30, 76.7%); absent
	// on Number sense. His seeded 31.5 of 40 in Unit test 1 is exempt.
	mark(a.StudentID, parts[0], 8, "scored")
	mark(a.StudentID, parts[1], 6, "scored")
	mark(a.StudentID, parts[2], 9, "scored")
	mark(a.StudentID, parts[3], nil, "absent")
	for _, m := range mates {
		for _, p := range parts[:3] {
			mark(m, p, 5, "scored")
		}
		mark(m, parts[3], 10, "scored") // one mark of Number sense: too little evidence
	}
	q := "?studentId=" + a.StudentID + "&periodId=" + a.PeriodID

	t.Run("levels from tagged marks, hand-calculated", func(t *testing.T) {
		admin, teacher := admin.on(t), teacher.on(t)
		teacher.json(403, "GET", "/v1/holistic/student"+q, nil, nil)
		var r holistic.Report
		admin.json(200, "GET", "/v1/holistic/student"+q, nil, &r)
		if len(r.Profile) != 1 || r.Profile[0].Subject != "Mathematics" || len(r.Profile[0].Competencies) != 1 {
			t.Fatalf("profile %+v", r.Profile)
		}
		c := r.Profile[0].Competencies[0]
		if c.Name != "Problem solving" || c.Pct != 76.7 || c.Marks != 3 || c.Level != 3 {
			t.Fatalf("Problem solving: 23 of 30 on 3 marks is Proficient (3): %+v", c)
		}
		var apply, remember *holistic.Bloom
		for i, bl := range r.Blooms {
			switch bl.Level {
			case "apply":
				apply = &r.Blooms[i]
			case "remember":
				remember = &r.Blooms[i]
			}
		}
		if apply == nil || apply.Pct == nil || *apply.Pct != 76.7 || apply.ClassPct == nil || *apply.ClassPct < 54 || *apply.ClassPct > 55 {
			t.Fatalf("apply %+v", apply)
		}
		if remember.Pct != nil || remember.ClassPct != nil {
			t.Fatalf("remember: no child has three marks, so nothing shows: %+v", remember)
		}
		if len(r.Strengths) != 1 || r.Strengths[0].Text != "Add fractions with unlike denominators." || r.Strengths[0].Tip == "" || len(r.Focus) != 0 {
			t.Fatalf("strengths %+v focus %+v", r.Strengths, r.Focus)
		}
		if len(r.Activities) != 1 || r.Activities[0].Name != "Singing" || r.Activities[0].Level != 3 {
			t.Fatalf("activities %+v", r.Activities)
		}
		if r.Voices.Ambition != "To be an astronaut." || r.Note.Status != "approved" || !r.CanEdit {
			t.Fatalf("voices %+v note %+v", r.Voices, r.Note)
		}
	})

	t.Run("a mate's single mark is too little evidence", func(t *testing.T) {
		var r holistic.Report
		admin.on(t).json(200, "GET", "/v1/holistic/student?studentId="+mates[0]+"&periodId="+a.PeriodID, nil, &r)
		for _, c := range r.Profile[0].Competencies {
			if c.Name == "Number sense" && (c.Level != 0 || c.Marks != 1) {
				t.Fatalf("one mark is too little evidence: %+v", c)
			}
		}
	})

	t.Run("the class teacher adds ratings, voices and the note", func(t *testing.T) {
		admin := admin.on(t)
		sing := one(`SELECT id FROM competencies WHERE org_id = $1 AND name = 'Singing'`, a.ID)
		admin.json(422, "PUT", "/v1/holistic/student", map[string]any{"studentId": a.StudentID, "periodId": a.PeriodID, "ratings": []map[string]any{{"competencyId": numberSense, "level": 2}}}, nil)
		admin.json(422, "PUT", "/v1/holistic/student", map[string]any{"studentId": a.StudentID, "periodId": a.PeriodID, "ratings": []map[string]any{{"competencyId": sing, "level": 9}}}, nil)
		var r holistic.Report
		admin.json(200, "PUT", "/v1/holistic/student", map[string]any{"studentId": a.StudentID, "periodId": a.PeriodID,
			"ratings": []map[string]any{{"competencyId": sing, "level": 4}},
			"voices":  map[string]string{"self": "I like  puzzles.", "ambition": ""},
			"note":    map[string]any{"text": "Ravi thinks problems through.", "approve": false}}, &r)
		if r.Activities[0].Level != 4 || r.Voices.Self != "I like puzzles." || r.Voices.Ambition != "" || r.Note.Status != "draft" {
			t.Fatalf("saved %+v %+v %+v", r.Activities, r.Voices, r.Note)
		}
	})

	t.Run("the AI drafts the note without the name, which is put in after", func(t *testing.T) {
		var out map[string]string
		admin.on(t).json(200, "POST", "/v1/holistic/note-draft", map[string]string{"studentId": a.StudentID, "periodId": a.PeriodID}, &out)
		if out["text"] != "Ravi solves problems with care. Keep practising number sense at home." {
			t.Fatalf("draft %q", out["text"])
		}
		p := fake.prompts[0]
		if !strings.Contains(p, "Problem solving Proficient") || !strings.Contains(p, "Singing Advanced") {
			t.Fatalf("the levels are sent in words:\n%s", p)
		}
		for _, private := range []string{"Ravi", "Kumar", "A-001", "puzzles", "astronaut", "76.7"} {
			if strings.Contains(p, private) {
				t.Fatalf("%q was sent to the AI", private)
			}
		}
	})

	t.Run("the class heatmap and the printable pages", func(t *testing.T) {
		admin := admin.on(t)
		var v holistic.ClassView
		admin.json(200, "GET", "/v1/holistic/class?sectionId="+a.SectionID+"&periodId="+a.PeriodID, nil, &v)
		ps := slices.IndexFunc(v.Competencies, func(c holistic.Column) bool { return c.Name == "Problem solving" })
		if len(v.Students) != 6 || len(v.Competencies) != 2 || v.Students[0].Student.Name != "Ravi Kumar" || ps < 0 || v.Cells[0][ps].Level != 3 || v.Summary[ps].Counts[2] != 5 {
			t.Fatalf("heatmap %+v %+v", v.Competencies, v.Cells)
		}
		code, body := admin.raw("GET", "/v1/holistic/html"+q, nil)
		page := string(body)
		if code != 200 || !strings.Contains(page, "Ravi Kumar") || !strings.Contains(page, "Problem solving") || !strings.Contains(page, "Proficient") || strings.Contains(page, "Teacher&#39;s note") {
			t.Fatalf("child page %d", code)
		}
		_, pack := admin.raw("GET", "/v1/holistic/html?sectionId="+a.SectionID+"&periodId="+a.PeriodID, nil)
		if n := strings.Count(string(pack), `<article class="report">`); n != 6 {
			t.Fatalf("the meeting pack has %d reports, want 6", n)
		}
		admin.json(503, "POST", "/v1/holistic/pdf", map[string]string{"studentId": a.StudentID, "periodId": a.PeriodID}, nil)
	})

	t.Run("the level scale is a setting", func(t *testing.T) {
		admin := admin.on(t)
		admin.json(422, "PUT", "/v1/holistic/settings", map[string]any{"levels": []map[string]any{{"name": "Stream", "min": 10}, {"name": "Sky", "min": 50}}}, nil)
		admin.json(200, "PUT", "/v1/holistic/settings", map[string]any{"levels": []map[string]any{{"name": "Stream", "min": 0}, {"name": "Mountain", "min": 50}, {"name": "Sky", "min": 75}}}, nil)
		var r holistic.Report
		admin.json(200, "GET", "/v1/holistic/student"+q, nil, &r)
		if r.Profile[0].Competencies[0].Level != 3 || r.Scale[2].Name != "Sky" {
			t.Fatalf("76.7%% is Sky on the new scale: %+v", r.Profile[0].Competencies[0])
		}
	})

	t.Run("another organisation sees none of it", func(t *testing.T) {
		other := other.on(t)
		other.json(404, "GET", "/v1/holistic/student"+q, nil, nil)
		other.json(404, "GET", "/v1/holistic/class?sectionId="+a.SectionID+"&periodId="+a.PeriodID, nil, nil)
	})
}
