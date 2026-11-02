package choices_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/server"
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
}

func (r reply) into(v any) { _ = json.Unmarshal(r.body, v) }

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
	return reply{res.StatusCode, b}
}

func (c caller) must(code int, method, path string, body any) reply {
	c.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	r := c.send(method, path, "application/json", &buf)
	if r.code != code {
		c.t.Fatalf("%s %s as %s: status %d, want %d: %s", method, path, c.user, r.code, code, r.body)
	}
	return r
}

func (c caller) code(method, path string, body any) string {
	c.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	var p api.Problem
	c.send(method, path, "application/json", &buf).into(&p)
	return p.Code
}

func (c caller) upload(file string, apply bool) api.ChoiceImportReport {
	c.t.Helper()
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	part, _ := w.CreateFormFile("file", "choices.csv")
	_, _ = part.Write([]byte(file))
	if apply {
		_ = w.WriteField("apply", "true")
	}
	_ = w.Close()
	r := c.send("POST", "/v1/subject-choices/import", w.FormDataContentType(), &buf)
	if r.code != 200 {
		c.t.Fatalf("import: %d %s", r.code, r.body)
	}
	var rep api.ChoiceImportReport
	r.into(&rep)
	return rep
}

// chosen maps student id to the subject ids in force on the day, for a group.
func (c caller) chosen(section, group, on string) map[string][]string {
	c.t.Helper()
	var list []api.SubjectChoice
	path := "/v1/subject-choices?sectionId=" + section
	if on != "" {
		path += "&on=" + on
	}
	c.must(200, "GET", path, nil).into(&list)
	out := map[string][]string{}
	for _, ch := range list {
		if ch.GroupId == group {
			out[ch.StudentId] = append(out[ch.StudentId], ch.SubjectId)
		}
	}
	return out
}

func (c caller) missing(section string) map[string][]string {
	c.t.Helper()
	var cc api.ChoiceCompleteness
	c.must(200, "GET", "/v1/sections/"+section+"/choice-completeness", nil).into(&cc)
	out := map[string][]string{}
	for _, g := range cc.Groups {
		out[g.Name] = []string{}
		for _, m := range g.Missing {
			out[g.Name] = append(out[g.Name], m.Name)
		}
	}
	return out
}

// Grade 6 A of the seeded organisation holds Ravi (Hindi in Second
// language, seeded), Kiran and Leela. Tara is its class teacher, Omar
// teaches it Mathematics.
func TestSubjectChoices(t *testing.T) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	b := dbtest.SeedOrg(t, owner, "Org B")
	app := server.New(config.Config{Version: "test"}, server.Deps{DB: appPool, Auth: headerAuth{}})
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
		for _, u := range []string{"tara", "omar", "viewer"} {
			_, _ = owner.Exec(ctx, `DELETE FROM memberships WHERE clerk_user_id = $1`, u+"-"+a.UserID)
		}
	})
	subject := func(name string) string {
		return one(`INSERT INTO subjects (org_id, name) VALUES ($1, $2) RETURNING id`, a.ID, name)
	}
	hindi := one(`SELECT id FROM subjects WHERE org_id = $1 AND name = 'Hindi'`, a.ID)
	odia := subject("Odia")
	student := func(no, name, section, year string) string {
		id := one(`INSERT INTO students (org_id, admission_no, name) VALUES ($1, $2, $3) RETURNING id`, a.ID, no, name)
		one(`INSERT INTO enrolments (org_id, student_id, section_id, year_id) VALUES ($1, $2, $3, $4) RETURNING id`, a.ID, id, section, year)
		return id
	}
	kiran, leela := student("A-002", "Kiran", a.SectionID, a.YearID), student("A-003", "Leela", a.SectionID, a.YearID)
	staff := func(name string) string {
		return one(`INSERT INTO staff (org_id, name) VALUES ($1, $2) RETURNING id`, a.ID, name)
	}
	tara, omar := staff("Tara"), staff("Omar")
	one(`INSERT INTO teaching_assignments (org_id, staff_id, section_id) VALUES ($1, $2, $3) RETURNING id`, a.ID, tara, a.SectionID)
	one(`INSERT INTO teaching_assignments (org_id, staff_id, section_id, subject_id) VALUES ($1, $2, $3, $4) RETURNING id`, a.ID, omar, a.SectionID, a.SubjectID)
	member := func(user, role, staffID string) caller {
		one(`INSERT INTO memberships (org_id, clerk_user_id, role, staff_id) VALUES ($1, $2, $3, nullif($4, '')::uuid) RETURNING id`, a.ID, user+"-"+a.UserID, role, staffID)
		return caller{t, app, user + "-" + a.UserID, a.ID}
	}
	taraC, omarC, viewer := member("tara", "class_teacher", tara), member("omar", "teacher", omar), member("viewer", "viewer", "")
	admin := caller{t, app, a.UserID, a.ID}
	lang := a.GroupID
	admin.must(201, "POST", "/v1/subject-group-options", api.SubjectGroupOptionInput{GroupId: lang, SubjectId: odia})
	assign := func(c caller, code int, subjectID, from string, students ...string) api.ChoiceResult {
		t.Helper()
		var res api.ChoiceResult
		c.must(code, "POST", "/v1/subject-choices", api.SubjectChoiceInput{GroupId: lang, SubjectId: subjectID, StudentIds: students, EffectiveFrom: from}).into(&res)
		return res
	}

	var activities api.SubjectGroup
	t.Run("groups state their rule and the level teaches their options", func(t *testing.T) {
		if code := admin.code("POST", "/v1/subject-groups", api.SubjectGroupInput{LevelId: a.LevelID, Name: "Activities", Rule: "range", MinChoices: 3, MaxChoices: 2}); code != "validation.failed" {
			t.Fatalf("a minimum above the maximum: %q", code)
		}
		admin.must(201, "POST", "/v1/subject-groups", api.SubjectGroupInput{LevelId: a.LevelID, Name: "Activities", Rule: "range", MinChoices: 1, MaxChoices: 2}).into(&activities)
		var exact api.SubjectGroup
		admin.must(201, "POST", "/v1/subject-groups", api.SubjectGroupInput{LevelId: a.LevelID, Name: "Third language", Rule: "exactly_one", MinChoices: 0, MaxChoices: 5}).into(&exact)
		if exact.MinChoices != 1 || exact.MaxChoices != 1 {
			t.Fatalf("exactly one stored as %d to %d", exact.MinChoices, exact.MaxChoices)
		}
		admin.must(204, "DELETE", "/v1/subject-groups/"+exact.Id, nil)
		for _, name := range []string{"Art", "Music", "Dance"} {
			admin.must(201, "POST", "/v1/subject-group-options", api.SubjectGroupOptionInput{GroupId: activities.Id, SubjectId: subject(name)})
		}
		if code := admin.code("POST", "/v1/subject-group-options", api.SubjectGroupOptionInput{GroupId: activities.Id, SubjectId: hindi}); code != "validation.failed" {
			t.Fatalf("Hindi offered by two groups of one level: %q", code)
		}
		var ls []api.LevelSubject
		admin.must(200, "GET", "/v1/level-subjects?levelId="+a.LevelID, nil).into(&ls)
		modes := map[string]string{}
		for _, x := range ls {
			modes[x.SubjectId] = string(x.Applicability)
		}
		if len(ls) != 6 || modes[a.SubjectID] != "all" || modes[hindi] != "selected" {
			t.Fatalf("level subjects %v", modes)
		}
		hindiAtLevel := ls[slices.IndexFunc(ls, func(x api.LevelSubject) bool { return x.SubjectId == hindi })].Id
		if code := admin.code("DELETE", "/v1/level-subjects/"+hindiAtLevel, nil); code != "structure.in_use" {
			t.Fatalf("removing a subject a group offers: %q", code)
		}
		if code := admin.code("DELETE", "/v1/subject-groups/"+lang, nil); code != "structure.in_use" {
			t.Fatalf("removing a group with running choices: %q", code)
		}
	})

	// AT-AP-02: a class with an unassigned choice is listed, never guessed.
	t.Run("completeness lists who has not chosen", func(t *testing.T) {
		got := admin.missing(a.SectionID)
		if !slices.Equal(got["Second language"], []string{"Kiran", "Leela"}) || !slices.Equal(got["Activities"], []string{"Kiran", "Leela", "Ravi Kumar"}) {
			t.Fatalf("missing %v", got)
		}
	})

	t.Run("two students choose different languages", func(t *testing.T) {
		if res := assign(admin, 200, odia, "", kiran); res.Assigned != 1 {
			t.Fatalf("%+v", res)
		}
		if res := assign(taraC, 200, hindi, "", leela, a.StudentID); res.Assigned != 1 || res.Unchanged != 1 {
			t.Fatalf("the class teacher: %+v", res)
		}
		got := admin.chosen(a.SectionID, lang, "2026-04-01")
		if !slices.Equal(got[kiran], []string{odia}) || !slices.Equal(got[leela], []string{hindi}) {
			t.Fatalf("a first choice applies from the start of the year: %v", got)
		}
		if got := admin.missing(a.SectionID); len(got["Second language"]) != 0 {
			t.Fatalf("still missing %v", got["Second language"])
		}
	})

	// AT-AP-09: a change mid-year takes a date and keeps the old choice in history.
	t.Run("a change mid-year keeps the earlier choice", func(t *testing.T) {
		if res := assign(admin, 200, hindi, "2026-10-01", kiran); res.Changed != 1 {
			t.Fatalf("%+v", res)
		}
		if got := admin.chosen(a.SectionID, lang, "2026-09-30")[kiran]; !slices.Equal(got, []string{odia}) {
			t.Fatalf("on 30 September %v", got)
		}
		if got := admin.chosen(a.SectionID, lang, "2026-10-01")[kiran]; !slices.Equal(got, []string{hindi}) {
			t.Fatalf("on 1 October %v", got)
		}
		var n int
		if err := owner.QueryRow(ctx, `SELECT count(*) FROM audit_log WHERE org_id = $1 AND entity = 'student_subject_choices' AND action = 'update'`, a.ID).Scan(&n); err != nil || n != 1 {
			t.Fatalf("%d audited changes, %v", n, err)
		}
		if code := admin.code("POST", "/v1/subject-choices", api.SubjectChoiceInput{GroupId: lang, SubjectId: odia, StudentIds: []string{kiran}, EffectiveFrom: "2027-06-01"}); code != "validation.failed" {
			t.Fatalf("a date outside the year: %q", code)
		}
	})

	t.Run("a correction on the first day replaces, and ending withdraws", func(t *testing.T) {
		assign(admin, 200, odia, "2026-04-01", leela)
		if got := admin.chosen(a.SectionID, lang, "2026-04-01")[leela]; !slices.Equal(got, []string{odia}) {
			t.Fatalf("corrected %v", got)
		}
		var list []api.SubjectChoice
		admin.must(200, "GET", "/v1/subject-choices?sectionId="+a.SectionID, nil).into(&list)
		i := slices.IndexFunc(list, func(c api.SubjectChoice) bool { return c.StudentId == leela })
		admin.must(204, "DELETE", "/v1/subject-choices/"+list[i].Id+"?on=2026-11-02", nil)
		if got := admin.chosen(a.SectionID, lang, "2026-11-01")[leela]; !slices.Equal(got, []string{odia}) {
			t.Fatalf("the day before it ended %v", got)
		}
		if got := admin.chosen(a.SectionID, lang, "2026-11-02")[leela]; len(got) != 0 {
			t.Fatalf("after it ended %v", got)
		}
		admin.must(404, "DELETE", "/v1/subject-choices/"+list[i].Id, nil)
	})

	t.Run("a range group refuses more than its maximum", func(t *testing.T) {
		var opts []api.SubjectGroupOption
		admin.must(200, "GET", "/v1/subject-group-options?groupId="+activities.Id, nil).into(&opts)
		for i, o := range opts {
			want := 200
			if i == 2 {
				want = 409
			}
			admin.must(want, "POST", "/v1/subject-choices", api.SubjectChoiceInput{GroupId: activities.Id, SubjectId: o.SubjectId, StudentIds: []string{kiran}})
		}
		if got := admin.chosen(a.SectionID, activities.Id, ""); len(got[kiran]) != 2 {
			t.Fatalf("Kiran's activities %v", got[kiran])
		}
	})

	t.Run("who may change and who may read", func(t *testing.T) {
		if code := omarC.code("POST", "/v1/subject-choices", api.SubjectChoiceInput{GroupId: lang, SubjectId: hindi, StudentIds: []string{leela}}); code != "auth.forbidden" {
			t.Fatalf("a subject teacher changed a choice: %q", code)
		}
		omarC.must(200, "GET", "/v1/sections/"+a.SectionID+"/choice-completeness", nil)
		viewer.must(403, "GET", "/v1/sections/"+a.SectionID+"/choice-completeness", nil)
		viewer.must(403, "GET", "/v1/subject-choices?sectionId="+a.SectionID, nil)
	})

	t.Run("last year's choices carry over where the new level offers them", func(t *testing.T) {
		last := one(`INSERT INTO academic_years (org_id, label, starts_on, ends_on) VALUES ($1, '2025-26', '2025-04-01', '2026-03-31') RETURNING id`, a.ID)
		g5 := one(`INSERT INTO levels (org_id, name, seq) VALUES ($1, 'Grade 5', 5) RETURNING id`, a.ID)
		s5 := one(`INSERT INTO sections (org_id, branch_id, level_id, year_id, name) VALUES ($1, $2, $3, $4, 'A') RETURNING id`, a.ID, a.BranchID, g5, last)
		mira := student("A-004", "Mira", s5, last)
		one(`INSERT INTO enrolments (org_id, student_id, section_id, year_id) VALUES ($1, $2, $3, $4) RETURNING id`, a.ID, mira, a.SectionID, a.YearID)
		group := func(name string, subjects ...string) string {
			id := one(`INSERT INTO subject_groups (org_id, level_id, name, rule, min_choices, max_choices) VALUES ($1, $2, $3, 'exactly_one', 1, 1) RETURNING id`, a.ID, g5, name)
			for _, s := range subjects {
				one(`INSERT INTO subject_group_options (org_id, group_id, subject_id) VALUES ($1, $2, $3) RETURNING id`, a.ID, id, s)
			}
			return id
		}
		french := subject("French")
		for gid, s := range map[string]string{group("Second language", hindi): hindi, group("Third language", french): french} {
			one(`INSERT INTO student_subject_choices (org_id, student_id, year_id, group_id, subject_id, effective_from, source) VALUES ($1, $2, $3, $4, $5, '2025-04-01', 'manual') RETURNING id`, a.ID, mira, last, gid, s)
		}
		var res api.ChoiceResult
		admin.must(200, "POST", "/v1/subject-choices/copy", api.ChoiceCopyInput{SectionId: a.SectionID}).into(&res)
		if res.Assigned != 1 || res.Skipped != 1 {
			t.Fatalf("copy %+v", res)
		}
		if got := admin.chosen(a.SectionID, lang, "")[mira]; !slices.Equal(got, []string{hindi}) {
			t.Fatalf("Mira's language %v", got)
		}
		admin.must(200, "POST", "/v1/subject-choices/copy", api.ChoiceCopyInput{SectionId: a.SectionID}).into(&res)
		if res.Assigned != 0 || res.Unchanged != 1 {
			t.Fatalf("copying again %+v", res)
		}
	})

	t.Run("an import shows what it would change, then applies once", func(t *testing.T) {
		file := "Adm No,Name,Second language,Activities\nA-001,Ravi Kumar,Odia,Art\nA-404,Nobody,Hindi,\nA-003,Leela,Sanskrit,\n"
		rep := admin.upload(file, false)
		if rep.Rows != 3 || rep.Change != 1 || rep.Assign != 1 || len(rep.Problems) != 2 || rep.Applied {
			t.Fatalf("preview %+v", rep)
		}
		if got := admin.chosen(a.SectionID, lang, "")[a.StudentID]; !slices.Equal(got, []string{hindi}) {
			t.Fatalf("the preview changed Ravi: %v", got)
		}
		admin.upload(file, true)
		if got := admin.chosen(a.SectionID, lang, "")[a.StudentID]; !slices.Equal(got, []string{odia}) {
			t.Fatalf("Ravi after the import %v", got)
		}
		if again := admin.upload(file, false); again.Unchanged != 2 || again.Assign != 0 || again.Change != 0 {
			t.Fatalf("the same file again %+v", again)
		}
	})

	// AT-AP-11: another institution cannot read or change these.
	t.Run("another organisation sees none of it", func(t *testing.T) {
		other := caller{t, app, b.UserID, b.ID}
		var gs []api.SubjectGroup
		other.must(200, "GET", "/v1/subject-groups", nil).into(&gs)
		if len(gs) != 1 || gs[0].Id != b.GroupID {
			t.Fatalf("B sees %+v", gs)
		}
		other.must(404, "GET", "/v1/sections/"+a.SectionID+"/choice-completeness", nil)
		other.must(404, "GET", "/v1/subject-choices?sectionId="+a.SectionID, nil)
		if code := other.code("POST", "/v1/subject-choices", api.SubjectChoiceInput{GroupId: lang, SubjectId: hindi, StudentIds: []string{kiran}}); code != "validation.failed" {
			t.Fatalf("B assigning with A's group: %q", code)
		}
	})
}
