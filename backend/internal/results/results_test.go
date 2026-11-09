package results_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/results"
	"github.com/jackymean-del/revu/internal/scheme"
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

func (c caller) send(method, path string, body any) reply {
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
	return reply{res.StatusCode, b}
}

func (c caller) must(code int, method, path string, body any) reply {
	c.t.Helper()
	r := c.send(method, path, body)
	if r.code != code {
		c.t.Fatalf("%s %s as %s: status %d, want %d: %s", method, path, c.user, r.code, code, r.body)
	}
	return r
}

func (c caller) problem(method, path string, body any) api.Problem {
	c.t.Helper()
	var p api.Problem
	c.send(method, path, body).into(&p)
	return p
}

var ops int

func (c caller) enter(student, part, state, value string) {
	c.t.Helper()
	ops++
	var res api.SyncResult
	c.must(200, "POST", "/v1/sync/evidence", api.SyncInput{DeviceId: "test", Ops: []api.EvidenceOp{
		{OpId: fmt.Sprintf("op-results-%06d", ops), StudentId: student, PartId: part, State: api.ValueState(state), Value: value, BaseVersion: -1}}}).into(&res)
	if res.Results[0].Outcome != "applied" {
		c.t.Fatalf("entering %s %s: %+v", state, value, res.Results[0])
	}
}

type row struct {
	StudentID string `json:"studentId"`
	Stale     bool   `json:"stale"`
	Result    *struct {
		State, Reason, Value, Max, Pct, Grade string
	} `json:"result"`
	Components []struct{ Code, State, Value string } `json:"components"`
}

type section struct {
	Access string `json:"access"`
	Scheme *struct {
		ID      string `json:"id"`
		Version int    `json:"version"`
	} `json:"scheme"`
	Counts api.ResultCounts `json:"counts"`
	Rows   []row            `json:"rows"`
}

// The pilot's results journey on a real database: a board pack becomes a
// published scheme, marks become results through the recompute loop, and
// every number explains itself (AT-P-04, AT-P-05 and AT-v3-02 to -11).
func TestResults(t *testing.T) {
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
		for _, u := range []string{"tara", "omar", "cora"} {
			_, _ = owner.Exec(ctx, `DELETE FROM memberships WHERE clerk_user_id = $1`, u+"-"+a.UserID)
		}
	})
	// The seeded unit test is left out, so only this test's assessments count.
	one(`UPDATE assessments SET deleted_at = now() WHERE id = $1 RETURNING id`, a.AssessmentID)
	kiran := one(`INSERT INTO students (org_id, admission_no, name) VALUES ($1, 'A-002', 'Kiran') RETURNING id`, a.ID)
	one(`INSERT INTO enrolments (org_id, student_id, section_id, year_id, roll_no) VALUES ($1, $2, $3, $4, '2') RETURNING id`, a.ID, kiran, a.SectionID, a.YearID)
	sectionB := one(`INSERT INTO sections (org_id, branch_id, level_id, year_id, name) VALUES ($1, $2, $3, $4, 'B') RETURNING id`, a.ID, a.BranchID, a.LevelID, a.YearID)
	member := func(user, role, section string) caller {
		staff := one(`INSERT INTO staff (org_id, name) VALUES ($1, $2) RETURNING id`, a.ID, user)
		if section != "" {
			one(`INSERT INTO teaching_assignments (org_id, staff_id, section_id, subject_id) VALUES ($1, $2, $3, $4) RETURNING id`, a.ID, staff, section, a.SubjectID)
		}
		one(`INSERT INTO memberships (org_id, clerk_user_id, role, staff_id) VALUES ($1, $2, $3, $4) RETURNING id`, a.ID, user+"-"+a.UserID, role, staff)
		return caller{t, app, user + "-" + a.UserID, a.ID}
	}
	admin := caller{t, app, a.UserID, a.ID}
	tara, omar, cora := member("tara", "teacher", a.SectionID), member("omar", "teacher", sectionB), member("cora", "coordinator", "")
	outsider := caller{t, app, b.UserID, b.ID}
	recompute := func() {
		t.Helper()
		if _, err := results.RunOnce(ctx, appPool, 0); err != nil {
			t.Fatal(err)
		}
	}
	resultsPath := "/v1/results?sectionId=" + a.SectionID + "&periodId=" + a.PeriodID + "&subjectId=" + a.SubjectID
	kiranOf := func(as caller) row {
		t.Helper()
		var s section
		as.must(200, "GET", resultsPath, nil).into(&s)
		for _, r := range s.Rows {
			if r.StudentID == kiran {
				return r
			}
		}
		t.Fatalf("Kiran has no row: %+v", s)
		return row{}
	}

	var pack struct {
		Scheme struct {
			ID, FamilyID, Status string
			Version              int
		} `json:"scheme"`
		Created bool `json:"created"`
	}
	t.Run("importing a board pack twice makes one draft", func(t *testing.T) {
		tara.must(403, "POST", "/v1/scheme-packs/example-secondary@1/import", nil)
		admin.must(200, "POST", "/v1/scheme-packs/example-secondary@1/import", nil).into(&pack)
		var again struct {
			Scheme  struct{ ID string } `json:"scheme"`
			Created bool                `json:"created"`
		}
		admin.must(200, "POST", "/v1/scheme-packs/example-secondary@1/import", nil).into(&again)
		if !pack.Created || again.Created || again.Scheme.ID != pack.Scheme.ID || pack.Scheme.Status != "draft" {
			t.Fatalf("first %+v, again %+v", pack, again)
		}
		var packs []api.SchemePack
		admin.must(200, "GET", "/v1/scheme-packs", nil).into(&packs)
		if len(packs) != 1 || packs[0].SchemeId != pack.Scheme.ID {
			t.Fatalf("packs %+v", packs)
		}
		admin.must(404, "POST", "/v1/scheme-packs/nope@1/import", nil)
	})

	var def map[string]any
	t.Run("a draft refuses a function outside the whitelist and names the line", func(t *testing.T) {
		var s struct {
			Name       string         `json:"name"`
			Definition map[string]any `json:"definition"`
		}
		admin.must(200, "GET", "/v1/schemes/"+pack.Scheme.ID, nil).into(&s)
		def = s.Definition
		bad := map[string]any{}
		for k, v := range def {
			bad[k] = v
		}
		bad["subject"] = map[string]any{"expr": "pow(PT, 2) + NB + TE", "max": "100"}
		p := admin.problem("PUT", "/v1/schemes/"+pack.Scheme.ID, map[string]any{"name": s.Name, "definition": bad})
		if p.Code != "validation.failed" || len(p.Errors) == 0 || p.Errors[0].Field != "definition.subject.expr" || !strings.Contains(p.Errors[0].Message, "not an allowed function") {
			t.Fatalf("%+v", p)
		}
		admin.must(200, "PUT", "/v1/schemes/"+pack.Scheme.ID, map[string]any{"name": "Our scheme", "definition": def})
	})

	t.Run("publishing and assigning applies the scheme", func(t *testing.T) {
		cora.must(200, "POST", "/v1/schemes/"+pack.Scheme.ID+"/publish", nil)
		var ch struct {
			Assignment api.SchemeAssignment `json:"assignment"`
		}
		admin.must(200, "POST", "/v1/scheme-assignments", api.SchemeAssignmentInput{FamilyId: pack.Scheme.FamilyID, LevelId: a.LevelID, SubjectId: a.SubjectID}).into(&ch)
		if ch.Assignment.PublishedVersion != 1 {
			t.Fatalf("%+v", ch)
		}
		var s section
		admin.must(200, "GET", resultsPath, nil).into(&s)
		if s.Scheme == nil || s.Scheme.ID != pack.Scheme.ID {
			t.Fatalf("the subject-and-level assignment did not win over the level one: %+v", s.Scheme)
		}
	})

	assessment := func(title, kind, held string, parts ...api.AssessmentPartInput) api.Assessment {
		var as api.Assessment
		admin.must(201, "POST", "/v1/assessments", api.AssessmentInput{PeriodId: a.PeriodID, LevelId: a.LevelID, SubjectId: a.SubjectID, Title: title, Kind: kind,
			HeldOn: held, EntryMode: "sections", SectionIds: []string{a.SectionID}, Parts: parts}).into(&as)
		return as
	}
	withNB := []api.AssessmentPartInput{{Name: "Total", MaxMarks: "40", CountsInTotal: true}, {Name: "Notebook", Kind: "additional", ComponentCode: "NB", MaxMarks: "10"}}
	p1 := assessment("Periodic test 1", "periodic_test", "2026-05-01", withNB...)
	p2 := assessment("Periodic test 2", "periodic_test", "2026-06-01", withNB...)
	te := assessment("Term exam", "term_end", "2026-09-20", api.AssessmentPartInput{Name: "Total", MaxMarks: "80", CountsInTotal: true})

	// AT-v3-02: absent under wait_makeup is blocked with no number.
	t.Run("absent in the term exam blocks the result until the makeup", func(t *testing.T) {
		tara.enter(kiran, p1.Parts[0].Id, "scored", "32")
		tara.enter(kiran, p1.Parts[1].Id, "scored", "8")
		tara.enter(kiran, p2.Parts[0].Id, "scored", "36")
		tara.enter(kiran, p2.Parts[1].Id, "scored", "9")
		tara.enter(kiran, te.Parts[0].Id, "absent", "")
		recompute()
		r := kiranOf(admin)
		if r.Result == nil || r.Result.State != "blocked" || r.Result.Value != "" || r.Result.Reason != "component_blocked:TE" || r.Stale {
			t.Fatalf("%+v", r.Result)
		}
	})

	// AT-v3-06: a mark marks the result stale in its own transaction; the
	// loop makes it fresh well within 10 seconds.
	t.Run("a makeup mark makes the result stale, then fresh and complete", func(t *testing.T) {
		start := time.Now()
		tara.enter(kiran, te.Parts[0].Id, "scored", "62")
		var stale bool
		if err := owner.QueryRow(ctx, `SELECT stale FROM computed_results WHERE student_id = $1 AND subject_id = $2 AND component_code = '_subject'`, kiran, a.SubjectID).Scan(&stale); err != nil || !stale {
			t.Fatalf("not stale after the write: %v %v", stale, err)
		}
		if r := kiranOf(admin); !r.Stale || r.Result.State != "blocked" {
			t.Fatalf("a read computed something: %+v", r)
		}
		recompute()
		if d := time.Since(start); d > 10*time.Second {
			t.Fatalf("fresh after %s", d)
		}
		// 8.50 + 8.50 + 62.00 = 79.00, grade B1.
		r := kiranOf(admin)
		if r.Stale || r.Result.State != "complete" || r.Result.Value != "79.00" || r.Result.Pct != "79.00" || r.Result.Grade != "B1" || len(r.Components) != 3 {
			t.Fatalf("%+v", r)
		}
	})

	// AT-v3-10 and AT-P-05.
	t.Run("the explanation lists every input and adds up", func(t *testing.T) {
		path := "/v1/results/explain?studentId=" + kiran + "&periodId=" + a.PeriodID + "&subjectId=" + a.SubjectID
		var e struct {
			Scheme struct{ Version int } `json:"scheme"`
			Detail scheme.Result         `json:"detail"`
		}
		tara.must(200, "GET", path, nil).into(&e)
		if e.Scheme.Version != 1 || e.Detail.Value != "79.00" || e.Detail.Rounding.Places != 2 || len(e.Detail.Working) == 0 {
			t.Fatalf("%+v", e)
		}
		sum := 0
		for _, c := range e.Detail.Components {
			var whole, frac int
			fmt.Sscanf(c.Value, "%d.%d", &whole, &frac)
			sum += whole*100 + frac
			if len(c.Events) == 0 {
				t.Errorf("%s lists no inputs", c.Code)
			}
		}
		if sum != 7900 {
			t.Fatalf("components add to %d hundredths", sum)
		}
		omar.must(403, "GET", path, nil)
		outsider.must(404, "GET", path, nil)
	})

	t.Run("roles see what Part 77 allows", func(t *testing.T) {
		var s section
		cora.must(200, "GET", resultsPath, nil).into(&s)
		if s.Access != "counts" || len(s.Rows) != 0 || s.Counts.Complete != 1 {
			t.Fatalf("coordinator: %+v", s)
		}
		omar.must(403, "GET", resultsPath, nil)
		if r := kiranOf(tara); r.Result.Value != "79.00" {
			t.Fatalf("teacher: %+v", r)
		}
	})

	// AT-v3-07 and AT-v3-08.
	t.Run("a published scheme never changes; version 2 is dry-run, then applied", func(t *testing.T) {
		if p := admin.problem("PUT", "/v1/schemes/"+pack.Scheme.ID, map[string]any{"name": "Changed", "definition": def}); p.Code != "scheme.immutable" {
			t.Fatalf("edited a published scheme: %+v", p)
		}
		if _, err := owner.Exec(ctx, `UPDATE schemes SET definition = '{}' WHERE id = $1`, pack.Scheme.ID); err == nil || !strings.Contains(err.Error(), "scheme.immutable") {
			t.Fatalf("the database let a published scheme change: %v", err)
		}
		var v2 struct {
			ID      string `json:"id"`
			Version int    `json:"version"`
		}
		admin.must(200, "POST", "/v1/schemes/"+pack.Scheme.ID+"/versions", nil).into(&v2)
		if v2.Version != 2 {
			t.Fatalf("%+v", v2)
		}
		// Version 2 keeps the highest periodic test only: 9.00 + 8.50 + 62.00.
		changed := map[string]any{}
		for k, v := range def {
			changed[k] = v
		}
		raw, _ := json.Marshal(def["components"])
		var comps []map[string]any
		_ = json.Unmarshal(raw, &comps)
		comps[0]["aggregate"] = map[string]any{"fn": "max"}
		changed["components"] = comps
		admin.must(200, "PUT", "/v1/schemes/"+v2.ID, map[string]any{"name": "Our scheme", "definition": changed})

		var dry api.DryRun
		admin.must(200, "POST", "/v1/schemes/"+v2.ID+"/dry-run", api.DryRunInput{SectionId: a.SectionID, PeriodId: a.PeriodID, SubjectId: a.SubjectID}).into(&dry)
		if dry.Changed != 1 || dry.NowBlocked != 0 || len(dry.Rows) == 0 {
			t.Fatalf("%+v", dry)
		}
		for _, r := range dry.Rows {
			if r.StudentId == kiran && (r.After.Value != "79.50" || r.Before.Value != "79.00" || r.Delta != "+0.50") {
				t.Fatalf("%+v", r)
			}
		}
		if r := kiranOf(admin); r.Result.Value != "79.00" || r.Stale {
			t.Fatalf("the dry run applied something: %+v", r)
		}

		admin.must(200, "POST", "/v1/schemes/"+v2.ID+"/publish", nil)
		var version int
		_ = owner.QueryRow(ctx, `SELECT scheme_version FROM computed_results WHERE student_id = $1 AND subject_id = $2 AND component_code = '_subject'`, kiran, a.SubjectID).Scan(&version)
		if r := kiranOf(admin); version != 1 || !r.Stale {
			t.Fatalf("before the recompute: version %d, %+v", version, r)
		}
		recompute()
		_ = owner.QueryRow(ctx, `SELECT scheme_version FROM computed_results WHERE student_id = $1 AND subject_id = $2 AND component_code = '_subject'`, kiran, a.SubjectID).Scan(&version)
		if r := kiranOf(admin); version != 2 || r.Result.Value != "79.50" {
			t.Fatalf("after: version %d, %+v", version, r)
		}
		var status string
		_ = owner.QueryRow(ctx, `SELECT status FROM schemes WHERE id = $1`, pack.Scheme.ID).Scan(&status)
		if status != "retired" {
			t.Fatalf("version 1 is %s", status)
		}
	})

	t.Run("a row status takes effect on the next recompute", func(t *testing.T) {
		admin.must(200, "PUT", "/v1/assessments/"+te.Id+"/participation/"+kiran, api.ParticipationInput{Status: "left"})
		recompute()
		// Left before the exam: 9.00 + 8.50 = 17.50 of 20, scaled to 100.
		if r := kiranOf(admin); r.Result.State != "complete" || r.Result.Value != "87.50" {
			t.Fatalf("%+v", r.Result)
		}
	})

	t.Run("recomputing on request is idempotent", func(t *testing.T) {
		var done api.RecomputeDone
		admin.must(200, "POST", "/v1/results/recompute", api.RecomputeInput{SectionId: a.SectionID, PeriodId: a.PeriodID}).into(&done)
		before := one(`SELECT detail::text FROM computed_results WHERE student_id = $1 AND subject_id = $2 AND component_code = '_subject'`, kiran, a.SubjectID)
		admin.must(200, "POST", "/v1/results/recompute", api.RecomputeInput{SectionId: a.SectionID, PeriodId: a.PeriodID, SubjectId: a.SubjectID})
		after := one(`SELECT detail::text FROM computed_results WHERE student_id = $1 AND subject_id = $2 AND component_code = '_subject'`, kiran, a.SubjectID)
		if done.Computed == 0 || before != after {
			t.Fatalf("computed %d; detail changed:\n%s\n%s", done.Computed, before, after)
		}
		omar.must(403, "POST", "/v1/results/recompute", api.RecomputeInput{SectionId: a.SectionID, PeriodId: a.PeriodID, SubjectId: a.SubjectID})
	})

	t.Run("another institution sees none of it", func(t *testing.T) {
		var list []map[string]any
		outsider.must(200, "GET", "/v1/schemes", nil).into(&list)
		for _, s := range list {
			if s["id"] == pack.Scheme.ID {
				t.Fatal("another institution lists this scheme")
			}
		}
		outsider.must(404, "GET", "/v1/schemes/"+pack.Scheme.ID, nil)
		outsider.must(404, "GET", resultsPath, nil)
	})
}
