package results_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/results"
)

// AT-v3-09: 2,000 students across 8 subjects recompute in under 60 seconds.
func TestRecomputeAtScale(t *testing.T) {
	if testing.Short() {
		t.Skip("short")
	}
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org scale")
	ctx := context.Background()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := owner.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%v\n%s", err, sql)
		}
	}
	exec(`UPDATE assessments SET deleted_at = now() WHERE id = $1`, a.AssessmentID)
	exec(`INSERT INTO students (org_id, admission_no, name) SELECT $1, 'S-' || g, 'Student ' || g FROM generate_series(1, 2000) g`, a.ID)
	exec(`INSERT INTO enrolments (org_id, student_id, section_id, year_id, roll_no)
		SELECT $1, id, $2, $3, substr(admission_no, 3) FROM students WHERE org_id = $1 AND admission_no LIKE 'S-%'`, a.ID, a.SectionID, a.YearID)
	exec(`INSERT INTO subjects (org_id, name) SELECT $1, 'Subject ' || g FROM generate_series(1, 7) g`, a.ID)
	exec(`INSERT INTO level_subjects (org_id, level_id, subject_id) SELECT $1, $2, id FROM subjects WHERE org_id = $1 AND name LIKE 'Subject %'`, a.ID, a.LevelID)
	// Eight subjects: Mathematics and the seven above. Hindi is a choice
	// and taken only by the seeded student, so it is left out here.
	exec(`INSERT INTO assessments (org_id, year_id, period_id, level_id, subject_id, title, kind, entry_mode)
		SELECT $1, $2, $3, $4, s.id, k.title, k.kind, 'total'
		  FROM subjects s CROSS JOIN (VALUES ('Test 1', 'periodic_test'), ('Test 2', 'periodic_test'), ('Exam', 'term_end')) k(title, kind)
		 WHERE s.org_id = $1 AND (s.name LIKE 'Subject %' OR s.id = $5)`, a.ID, a.YearID, a.PeriodID, a.LevelID, a.SubjectID)
	exec(`INSERT INTO assessment_scopes (org_id, assessment_id, section_id) SELECT $1, id, $2 FROM assessments WHERE org_id = $1 AND deleted_at IS NULL`, a.ID, a.SectionID)
	exec(`INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks)
		SELECT $1, id, 1, 'Total', CASE kind WHEN 'term_end' THEN 80 ELSE 40 END FROM assessments WHERE org_id = $1 AND deleted_at IS NULL`, a.ID)
	exec(`INSERT INTO evidence (org_id, student_id, assessment_id, part_id, value, state, source)
		SELECT $1, e.student_id, p.assessment_id, p.id, (abs(hashtext(e.student_id::text || p.id::text)) % (p.max_marks::int * 100 + 1)) / 100.0, 'scored', 'import'
		  FROM enrolments e CROSS JOIN assessment_parts p
		 WHERE e.org_id = $1 AND p.org_id = $1 AND e.student_id <> $2`, a.ID, a.StudentID)
	exec(`WITH n AS (SELECT uuidv7() AS id)
		INSERT INTO schemes (id, family_id, org_id, name, status, definition) SELECT n.id, n.id, $1, 'Scale', 'published', $2::jsonb FROM n`, a.ID,
		`{"schema": 1, "rounding": {"mode": "half_up", "places": 2, "at": "components"},
		  "components": [
		    {"code": "PT", "name": "Tests", "from": {"kinds": ["periodic_test"], "part_kind": "main"}, "aggregate": {"fn": "best_n", "n": 2}, "scale_to": "20", "on_absent": "wait_makeup"},
		    {"code": "TE", "name": "Exam", "from": {"kinds": ["term_end"], "part_kind": "main"}, "aggregate": {"fn": "sum"}, "scale_to": "80", "on_absent": "wait_makeup"}],
		  "subject": {"expr": "PT + TE", "max": "100"}}`)
	exec(`UPDATE scheme_assignments SET family_id = (SELECT id FROM schemes WHERE org_id = $1 AND name = 'Scale') WHERE org_id = $1`, a.ID)
	var hindi string
	if err := owner.QueryRow(ctx, `SELECT id FROM subjects WHERE org_id = $1 AND name = 'Hindi'`, a.ID).Scan(&hindi); err != nil {
		t.Fatal(err)
	}
	exec(`DELETE FROM result_stale_intents WHERE org_id = $1`, a.ID)
	exec(`INSERT INTO result_stale_intents (org_id, student_id, period_id, subject_id, marked_at)
		SELECT $1, e.student_id, $2, ls.subject_id, now() - interval '1 minute'
		  FROM enrolments e JOIN level_subjects ls ON ls.level_id = $3 AND ls.org_id = $1
		 WHERE e.org_id = $1 AND e.student_id <> $4 AND ls.subject_id <> $5
		ON CONFLICT DO NOTHING`, a.ID, a.PeriodID, a.LevelID, a.StudentID, hindi)

	start := time.Now()
	n, err := results.RunOnce(ctx, appPool, 0)
	took := time.Since(start)
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("recomputed %d results in %s", n, took)
	// Another recompute loop on the same database (a running server) may
	// share the work, so check what was stored, not who stored it.
	// Rows that loop holds are skipped here, so wait for it to finish them.
	var left int
	for deadline := time.Now().Add(30 * time.Second); ; time.Sleep(250 * time.Millisecond) {
		if err := owner.QueryRow(ctx, `SELECT count(*) FROM result_stale_intents WHERE org_id = $1`, a.ID).Scan(&left); err != nil {
			t.Fatal(err)
		}
		if left == 0 || time.Now().After(deadline) {
			break
		}
		if _, err := results.RunOnce(ctx, appPool, 0); err != nil {
			t.Fatal(err)
		}
	}
	if n == 0 || left != 0 {
		t.Fatalf("recomputed %d here, %d still waiting", n, left)
	}
	if took > 60*time.Second {
		t.Fatalf("took %s, over the 60 second target", took)
	}
	var complete int
	if err := owner.QueryRow(ctx, `SELECT count(*) FROM computed_results WHERE org_id = $1 AND student_id <> $2 AND component_code = '_subject' AND state = 'complete' AND NOT stale`, a.ID, a.StudentID).Scan(&complete); err != nil {
		t.Fatal(err)
	}
	if complete != 16000 {
		t.Fatalf("%d complete results", complete)
	}
}
