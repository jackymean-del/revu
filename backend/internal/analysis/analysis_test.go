package analysis_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackymean-del/revu/internal/analysis"
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
}

func (r reply) into(v any) { _ = json.Unmarshal(r.body, v) }

func (c caller) must(code int, method, path string, body any) reply {
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
		c.t.Fatalf("%s %s as %s: status %d, want %d: %s", method, path, c.user, res.StatusCode, code, b)
	}
	return reply{res.StatusCode, b}
}

// The analysis pack and the reteach list on a real database (pilot P0.6;
// blueprint v23 B8.6.1, B8.7). Five students, two subjects, the bands of
// the pilot school's scale; every expected number below is a hand count.
func TestAnalysis(t *testing.T) {
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
	users := []string{}
	t.Cleanup(func() {
		for _, u := range users {
			_, _ = owner.Exec(ctx, `DELETE FROM memberships WHERE clerk_user_id = $1`, u)
		}
	})
	member := func(user, role, subject string) caller {
		staff := one(`INSERT INTO staff (org_id, name) VALUES ($1, $2) RETURNING id`, a.ID, user)
		if role != "principal" {
			one(`INSERT INTO teaching_assignments (org_id, staff_id, section_id, subject_id) VALUES ($1, $2, $3, nullif($4, '')::uuid) RETURNING id`, a.ID, staff, a.SectionID, subject)
		}
		one(`INSERT INTO memberships (org_id, clerk_user_id, role, staff_id) VALUES ($1, $2, $3, $4) RETURNING id`, a.ID, user+"-"+a.UserID, role, staff)
		users = append(users, user+"-"+a.UserID)
		return caller{t, app, user + "-" + a.UserID, a.ID}
	}

	// The scale of the pilot school's sheets, with inclusive lower edges.
	// Published schemes never change, so a new one with bands takes over.
	banded := one(`WITH n AS (SELECT uuidv7() AS id)
		INSERT INTO schemes (id, family_id, org_id, name, status, definition)
		SELECT n.id, n.id, $1, 'Banded scheme', 'published', s.definition || '{"grading": {"from": "rounded", "bands": [
			{"label": "A1", "min_pct": "90"}, {"label": "A2", "min_pct": "80"}, {"label": "B1", "min_pct": "70"},
			{"label": "B2", "min_pct": "60"}, {"label": "C", "min_pct": "0"}]}}'::jsonb
		FROM n, schemes s WHERE s.id = $2 RETURNING id`, a.ID, a.SchemeID)
	one(`UPDATE scheme_assignments SET family_id = $1 WHERE org_id = $2 RETURNING id`, banded, a.ID)
	// Hindi is a choice subject; this test is about two subjects everyone takes.
	one(`UPDATE level_subjects SET deleted_at = now() WHERE org_id = $1 AND subject_id <> $2 RETURNING id`, a.ID, a.SubjectID)
	one(`UPDATE assessments SET deleted_at = now() WHERE id = $1 RETURNING id`, a.AssessmentID)
	science := one(`INSERT INTO subjects (org_id, name) VALUES ($1, 'Science') RETURNING id`, a.ID)
	one(`INSERT INTO level_subjects (org_id, level_id, subject_id) VALUES ($1, $2, $3) RETURNING id`, a.ID, a.LevelID, science)

	student := func(no, name, roll string) string {
		id := one(`INSERT INTO students (org_id, admission_no, name) VALUES ($1, $2, $3) RETURNING id`, a.ID, no, name)
		one(`INSERT INTO enrolments (org_id, student_id, section_id, year_id, roll_no) VALUES ($1, $2, $3, $4, $5) RETURNING id`, a.ID, id, a.SectionID, a.YearID, roll)
		return id
	}
	ravi := a.StudentID
	kiran, leela, mira, nikhil := student("A-2", "Kiran Das", "2"), student("A-3", "Leela Rao", "3"), student("A-4", "Mira Sen", "4"), student("A-5", "Nikhil Jena", "5")
	everyone := []string{ravi, kiran, leela, mira, nikhil}

	assessment := func(subject, title, kind, mode, held string, parts ...string) (string, []string) {
		id := one(`INSERT INTO assessments (org_id, year_id, period_id, level_id, subject_id, title, kind, entry_mode, held_on) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
			a.ID, a.YearID, a.PeriodID, a.LevelID, subject, title, kind, mode, held)
		one(`INSERT INTO assessment_scopes (org_id, assessment_id, section_id) VALUES ($1, $2, $3) RETURNING section_id`, a.ID, id, a.SectionID)
		var ids []string
		for i, p := range parts {
			ids = append(ids, one(`INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks) VALUES ($1, $2, $3, $4, 20) RETURNING id`, a.ID, id, i+1, p))
		}
		return id, ids
	}
	marks := func(assessment, part string, values ...string) {
		for i, v := range values {
			if v == "AB" {
				one(`INSERT INTO evidence (org_id, student_id, assessment_id, part_id, state, source) VALUES ($1, $2, $3, $4, 'absent', 'grid') RETURNING id`, a.ID, everyone[i], assessment, part)
				continue
			}
			one(`INSERT INTO evidence (org_id, student_id, assessment_id, part_id, value, state, source) VALUES ($1, $2, $3, $4, $5, 'scored', 'grid') RETURNING id`, a.ID, everyone[i], assessment, part, v)
		}
	}
	// Mathematics, by part of the paper (each out of 20). Below 40% of a
	// part is below 8 marks: part A has Kiran and Leela below (2 of 5, 40%),
	// part B has Kiran only (1 of 5, 20%).
	paper, mathParts := assessment(a.SubjectID, "Paper 1", "periodic_test", "sections", "2026-05-01", "A", "B")
	marks(paper, mathParts[0], "18", "6", "7", "15", "16")
	marks(paper, mathParts[1], "16", "5", "9", "14", "12")
	// Mathematics percentages: 85, 27.5, 40, 72.5, 70.
	// Science, one total out of 20 counted as two parts of 20 would be
	// another test; here one part: 19, 10, 11, 13.5 and Nikhil absent
	// (withheld under the seeded wait-for-makeup policy).
	sci, sciParts := assessment(science, "Science test", "periodic_test", "total", "2026-05-02", "Total")
	marks(sci, sciParts[0], "19", "10", "11", "13.5", "AB")
	// Science percentages: 95, 50, 55, 67.5, withheld.
	// A later oral (not counted in the term result) with a part named "a ":
	// only Mira is below 8, so part A improves from 40% to 20%.
	oral, oralParts := assessment(a.SubjectID, "Oral", "oral", "sections", "2026-06-01", " a ", "b")
	marks(oral, oralParts[0], "10", "10", "10", "3", "10")
	marks(oral, oralParts[1], "10", "10", "10", "10", "10")

	admin := caller{t, app, a.UserID, a.ID}
	cara := member("cara", "class_teacher", "")
	tom := member("tom", "teacher", a.SubjectID)
	sita := member("sita", "teacher", science)
	priya := member("priya", "principal", "")
	outsider := caller{t, app, b.UserID, b.ID}
	admin.must(200, "POST", "/v1/results/recompute", map[string]string{"sectionId": a.SectionID, "periodId": a.PeriodID})

	// Two subjects only, so the undertaking needs both below 60%.
	var settings analysis.Settings
	admin.must(200, "GET", "/v1/analysis/settings", nil).into(&settings)
	if len(settings.Lists) != 2 || settings.Lists[0].AtLeast != 3 || settings.Lists[0].BelowPct != "60" || settings.Lists[1].BelowPct != "70" {
		t.Fatalf("default lists %+v", settings.Lists)
	}
	settings.Lists[0].AtLeast = 2
	tom.must(403, "PUT", "/v1/analysis/settings", settings)
	bad := settings
	bad.Ranges = []string{"50", "40"}
	admin.must(422, "PUT", "/v1/analysis/settings", bad)
	admin.must(200, "PUT", "/v1/analysis/settings", settings)

	q := "?sectionId=" + a.SectionID + "&periodId=" + a.PeriodID
	var s analysis.Summary
	cara.must(200, "GET", "/v1/analysis/summary"+q, nil).into(&s)
	subject := func(id string) analysis.SubjectSummary {
		for _, x := range s.Subjects {
			if x.ID == id {
				return x
			}
		}
		t.Fatalf("no subject %s in %+v", id, s.Subjects)
		return analysis.SubjectSummary{}
	}
	row := func(id string) analysis.StudentRow {
		for _, x := range s.Students {
			if x.ID == id {
				return x
			}
		}
		t.Fatalf("no student %s", id)
		return analysis.StudentRow{}
	}

	t.Run("the aggregate matches a hand count (AT-RP-11)", func(t *testing.T) {
		if s.Access != "full" || len(s.Students) != 5 || len(s.Bands) != 5 {
			t.Fatalf("access %s, %d students, %d bands", s.Access, len(s.Students), len(s.Bands))
		}
		m, sc := subject(a.SubjectID), subject(science)
		// (85 + 27.5 + 40 + 72.5 + 70) / 5 = 59; the middle of five is 70.
		if m.Average != "59.00" || m.Median != "70.00" || m.Highest != "85.00" || m.Lowest != "27.50" || m.Complete != 5 {
			t.Fatalf("mathematics %+v", m)
		}
		// (95 + 50 + 55 + 67.5) / 4 = 66.875, rounded half up; Nikhil is withheld, not zero.
		if sc.Average != "66.88" || sc.Median != "61.25" || sc.Complete != 4 || sc.Blocked != 1 || sc.Taking != 5 {
			t.Fatalf("science %+v", sc)
		}
		bands := func(x analysis.SubjectSummary) string {
			var out []string
			for _, b := range x.Bands {
				out = append(out, b.Label+"="+string(rune('0'+b.Count)))
			}
			return strings.Join(out, " ")
		}
		if bands(m) != "A2=1 B1=2 C=2" || bands(sc) != "A1=1 B2=1 C=2" {
			t.Fatalf("bands %q and %q", bands(m), bands(sc))
		}
		// Ravi: 85 + 95 of 200 = 90%, exactly on the A1 edge, so A1.
		if r := row(ravi); r.Total == nil || r.Total.Pct != "90.00" || r.Total.Band != "A1" || r.Subjects[a.SubjectID].Band != "A2" {
			t.Fatalf("ravi %+v", r.Total)
		}
		if r := row(nikhil); r.Total == nil || r.Total.State != "blocked" || r.Total.Pct != "" {
			t.Fatalf("nikhil's total is not withheld: %+v", r.Total)
		}
	})

	t.Run("the lists match a hand count and nobody is on two (AT-RP-17)", func(t *testing.T) {
		names := func(l analysis.List) string {
			var out []string
			for _, e := range l.Students {
				out = append(out, e.Name)
			}
			return strings.Join(out, ", ")
		}
		// Kiran (27.5, 50) and Leela (40, 55) have two below 60%. Mira has
		// Science at 67.5. Nikhil's withheld Science is not a low mark, and
		// his Mathematics is 70, so he is on neither.
		if len(s.Lists) != 2 || names(s.Lists[0]) != "Kiran Das, Leela Rao" || names(s.Lists[1]) != "Mira Sen" {
			t.Fatalf("lists %q and %q", names(s.Lists[0]), names(s.Lists[1]))
		}
		if got := s.Lists[1].Students[0].Subjects; len(got) != 1 || got[0] != science {
			t.Fatalf("mira is shown for %v", got)
		}
		// With the warning first, it takes everyone.
		swapped := settings
		swapped.Lists = []analysis.Rule{settings.Lists[1], settings.Lists[0]}
		admin.must(200, "PUT", "/v1/analysis/settings", swapped)
		var again analysis.Summary
		cara.must(200, "GET", "/v1/analysis/summary"+q, nil).into(&again)
		if names(again.Lists[0]) != "Kiran Das, Leela Rao, Mira Sen" || len(again.Lists[1].Students) != 0 {
			t.Fatalf("after swapping: %q and %q", names(again.Lists[0]), names(again.Lists[1]))
		}
		admin.must(200, "PUT", "/v1/analysis/settings", settings)
	})

	t.Run("each role sees only what it may", func(t *testing.T) {
		var mine analysis.Summary
		tom.must(200, "GET", "/v1/analysis/summary"+q, nil).into(&mine)
		if mine.Access != "partial" || len(mine.Students) != 5 || row2(mine, kiran).Total != nil {
			t.Fatalf("tom: access %s, total %+v", mine.Access, row2(mine, kiran).Total)
		}
		if _, ok := row2(mine, kiran).Subjects[science]; ok {
			t.Fatal("tom sees science marks")
		}
		var counts analysis.Summary
		priya.must(200, "GET", "/v1/analysis/summary"+q, nil).into(&counts)
		if counts.Access != "counts" || len(counts.Students) != 0 || len(counts.Lists) != 0 || counts.Subjects[0].Average != "" || counts.Subjects[0].Complete != 5 {
			t.Fatalf("principal sees more than counts: %+v", counts)
		}
		outsider.must(404, "GET", "/v1/analysis/summary"+q, nil)
	})

	t.Run("a component basis and the workbook", func(t *testing.T) {
		var comp analysis.Summary
		cara.must(200, "GET", "/v1/analysis/summary"+q+"&basis=T", nil).into(&comp)
		if comp.Basis != "T" || subject2(comp, a.SubjectID).Average != "59.00" {
			t.Fatalf("basis T: %+v", subject2(comp, a.SubjectID))
		}
		cara.must(404, "GET", "/v1/analysis/summary"+q+"&basis=nothing", nil)
		r := cara.must(200, "GET", "/v1/analysis/summary.xlsx"+q, nil)
		f, err := excelize.OpenReader(bytes.NewReader(r.body))
		if err != nil {
			t.Fatal(err)
		}
		if got := strings.Join(f.GetSheetList(), "|"); got != "Aggregate|Bands|1 Undertaking|2 Verbal warning" {
			t.Fatalf("sheets %s", got)
		}
		rows, _ := f.GetRows("Aggregate")
		all := ""
		for _, r := range rows {
			all += strings.Join(r, "|") + "\n"
		}
		for _, want := range []string{"Kiran Das|27.50|C|50.00|C", "Withheld", "|Average|59.00|", "Principal"} {
			if !strings.Contains(all, want) {
				t.Errorf("the aggregate sheet lacks %q:\n%s", want, all)
			}
		}
		var n int
		if err := owner.QueryRow(ctx, `SELECT count(*) FROM audit_log WHERE org_id = $1 AND entity = 'analysis_pack'`, a.ID).Scan(&n); err != nil || n != 1 {
			t.Fatalf("export logged %d times: %v", n, err)
		}
	})

	t.Run("the reteach list matches the golden count (AT-RP-13)", func(t *testing.T) {
		var v analysis.AssessmentView
		tom.must(200, "GET", "/v1/analysis/assessment?assessmentId="+paper+"&sectionId="+a.SectionID, nil).into(&v)
		if !v.Reteach.Available || len(v.Reteach.Items) != 2 || len(v.Students) != 5 || v.Students[0].Score.Pct != "85.00" {
			t.Fatalf("%+v", v)
		}
		pa, pb := v.Reteach.Items[0], v.Reteach.Items[1]
		if pa.Mastery.Below != 2 || pa.Mastery.SharePct != "40" || !pa.Mastery.Flagged || strings.Join(pa.Students, ", ") != "Kiran Das, Leela Rao" {
			t.Fatalf("part A %+v", pa)
		}
		if pb.Mastery.SharePct != "20" || pb.Mastery.Flagged {
			t.Fatalf("part B %+v", pb)
		}
		if pa.FollowUp == nil || pa.FollowUp.AssessmentID != oral || pa.FollowUp.SharePct != "20" || pa.FollowUp.Trend != "improved" {
			t.Fatalf("follow-up %+v", pa.FollowUp)
		}
		// Total-marks entry says why there is no list.
		var total analysis.AssessmentView
		sita.must(200, "GET", "/v1/analysis/assessment?assessmentId="+sci+"&sectionId="+a.SectionID, nil).into(&total)
		if total.Reteach.Available || total.Reteach.Reason != "total_marks" || total.Students[4].Score.State != "absent" {
			t.Fatalf("total marks: %+v", total.Reteach)
		}
		sita.must(403, "GET", "/v1/analysis/assessment?assessmentId="+paper+"&sectionId="+a.SectionID, nil)
		outsider.must(404, "GET", "/v1/analysis/assessment?assessmentId="+paper+"&sectionId="+a.SectionID, nil)

		mark := map[string]string{"assessmentId": paper, "sectionId": a.SectionID, "partId": mathParts[0], "status": "planned"}
		sita.must(403, "PUT", "/v1/analysis/reteach", mark)
		tom.must(200, "PUT", "/v1/analysis/reteach", mark)
		mark["status"] = "maybe"
		tom.must(422, "PUT", "/v1/analysis/reteach", mark)
		tom.must(200, "GET", "/v1/analysis/assessment?assessmentId="+paper+"&sectionId="+a.SectionID, nil).into(&v)
		if v.Reteach.Items[0].Status != "planned" {
			t.Fatalf("status %q", v.Reteach.Items[0].Status)
		}
		mark["status"] = ""
		tom.must(200, "PUT", "/v1/analysis/reteach", mark)
		var cleared analysis.AssessmentView
		tom.must(200, "GET", "/v1/analysis/assessment?assessmentId="+paper+"&sectionId="+a.SectionID, nil).into(&cleared)
		if cleared.Reteach.Items[0].Status != "" {
			t.Fatal("clearing left a status")
		}
	})

	t.Run("a page of analysis takes few round trips (D30)", func(t *testing.T) {
		cfg := appPool.Config()
		trips := &counter{}
		cfg.ConnConfig.Tracer = trips
		pool, err := pgxpool.NewWithConfig(ctx, cfg)
		if err != nil {
			t.Fatal(err)
		}
		defer pool.Close()
		traced := server.New(config.Config{Version: "test"}, server.Deps{DB: pool, Auth: headerAuth{}})
		as := caller{t, traced, cara.user, a.ID}
		as.must(200, "GET", "/v1/analysis/summary"+q, nil) // warm the connection
		trips.reset()
		as.must(200, "GET", "/v1/analysis/summary"+q, nil)
		n, sqls := trips.reset()
		t.Logf("summary: %d round trips", n)
		for _, s := range sqls {
			t.Logf("  %.110s", s)
		}
		if n > summaryTrips {
			t.Errorf("summary took %d round trips, over %d", n, summaryTrips)
		}
		tm := caller{t, traced, tom.user, a.ID}
		tm.must(200, "GET", "/v1/analysis/assessment?assessmentId="+paper+"&sectionId="+a.SectionID, nil)
		trips.reset()
		tm.must(200, "GET", "/v1/analysis/assessment?assessmentId="+paper+"&sectionId="+a.SectionID, nil)
		n, sqls = trips.reset()
		t.Logf("assessment: %d round trips", n)
		for _, s := range sqls {
			t.Logf("  %.110s", s)
		}
		if n > assessmentTrips {
			t.Errorf("assessment took %d round trips, over %d", n, assessmentTrips)
		}
	})
}

// The most round trips a page may take, whatever the number of subjects,
// students or paper parts.
const summaryTrips, assessmentTrips = 5, 6

func row2(s analysis.Summary, id string) analysis.StudentRow {
	for _, x := range s.Students {
		if x.ID == id {
			return x
		}
	}
	return analysis.StudentRow{}
}

func subject2(s analysis.Summary, id string) analysis.SubjectSummary {
	for _, x := range s.Subjects {
		if x.ID == id {
			return x
		}
	}
	return analysis.SubjectSummary{}
}
