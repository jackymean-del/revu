package seed_test

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"testing"

	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/seed"
)

// AT for v1.11: two demo organisations with different presets, full of
// structure and people, and a second run changes nothing.
func TestDemoSeed(t *testing.T) {
	owner, _ := dbtest.Open(t)
	ctx := context.Background()
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	suffix := " test " + hex.EncodeToString(b)
	user := "user_seed_" + hex.EncodeToString(b)

	first, err := seed.RunWith(ctx, owner, user, suffix)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, r := range first {
			for _, table := range []string{"report_run_items", "report_runs", "report_templates", "computed_results", "result_stale_intents", "evidence", "scheme_assignments", "schemes", "branding_versions", "assessment_parts", "assessment_scopes", "assessments", "student_subject_choices", "subject_group_options", "subject_groups", "audit_log", "guardians", "enrolments", "teaching_assignments", "students", "memberships", "staff",
				"level_subjects", "subjects", "sections", "levels", "periods", "academic_years", "branches", "terminology"} {
				_, _ = owner.Exec(ctx, `DELETE FROM `+table+` WHERE org_id = $1`, r.OrgID)
			}
			_, _ = owner.Exec(ctx, `DELETE FROM orgs WHERE id = $1`, r.OrgID)
		}
	})

	want := []seed.Result{
		// Every eleventh student is left without a language: 6 of 72.
		{Sections: 6, Staff: 8, Students: 72, TeachingAssignments: 6 * 5, Guards: 72, Choices: 66, Assessments: 3},
		{Sections: 4, Staff: 5, Students: 40, TeachingAssignments: 4 * 5, Guards: 40, Assessments: 2},
		// iKids: Classes 1 to 5 take 4 subjects and 6 to 10 take 5, each with
		// Hindi or Odia; a class teacher and a teacher per subject in each of
		// 20 sections; three exams in every subject of every class.
		{Sections: 20, Staff: 30, Students: 400, TeachingAssignments: 10*(1+4+2) + 10*(1+5+2), Guards: 400, Choices: 400 - 400/11, Assessments: 5*6*3 + 5*7*3 + 3 + 64}, // and Class 6 Mathematics' Unit tests 3 and 4 and re-exam, and a Unit test 3 in each of the other 64 classes and subjects
	}
	for i, r := range first {
		w := want[i]
		w.OrgID = r.OrgID
		if r != w {
			t.Errorf("%s: got %+v, want %+v", seed.Demos[i].Name, r, w)
		}
	}

	var presets []string
	for _, r := range first {
		var p string
		if err := owner.QueryRow(ctx, `SELECT preset FROM orgs WHERE id = $1`, r.OrgID).Scan(&p); err != nil {
			t.Fatal(err)
		}
		presets = append(presets, p)
	}
	if presets[0] != "school" || presets[1] != "university" {
		t.Fatalf("presets %v", presets)
	}

	var orgs, primaries, periods int
	if err := owner.QueryRow(ctx, `SELECT count(*) FROM revu_my_orgs($1)`, user).Scan(&orgs); err != nil || orgs != 3 {
		t.Fatalf("the seed user administers %d organisations, %v", orgs, err)
	}
	if err := owner.QueryRow(ctx, `SELECT count(*) FROM guardians WHERE org_id = $1 AND is_primary`, first[0].OrgID).Scan(&primaries); err != nil || primaries != 72 {
		t.Fatalf("%d primary contacts, %v", primaries, err)
	}
	if err := owner.QueryRow(ctx, `SELECT count(*) FROM periods WHERE org_id = $1`, first[1].OrgID).Scan(&periods); err != nil || periods != 2 {
		t.Fatalf("%d semesters, %v", periods, err)
	}

	// iKids has a term's work: marks for every student in every subject they
	// take, some absences (never zero), a published scheme and every result
	// queued for the server to work out.
	ik := first[2].OrgID
	var scored, absent, absentWithValue, schemes, queued, takers int
	if err := owner.QueryRow(ctx, `
		SELECT count(*) FILTER (WHERE state = 'scored'), count(*) FILTER (WHERE state = 'absent'), count(*) FILTER (WHERE state = 'absent' AND value IS NOT NULL),
		       (SELECT count(*) FROM schemes WHERE org_id = $1 AND status = 'published'),
		       (SELECT count(*) FROM result_stale_intents WHERE org_id = $1),
		       (SELECT count(DISTINCT student_id) FROM evidence WHERE org_id = $1)
		  FROM evidence WHERE org_id = $1`, ik).Scan(&scored, &absent, &absentWithValue, &schemes, &queued, &takers); err != nil {
		t.Fatal(err)
	}
	// Seven cells a subject: three parts in each periodic test and one half-yearly total.
	if scored < 14000 || absent == 0 || absentWithValue != 0 || schemes != 1 || takers != 400 {
		t.Fatalf("iKids marks: %d scored, %d absent (%d with a value), %d schemes, %d students with marks", scored, absent, absentWithValue, schemes, takers)
	}
	// 200 students take 4 subjects and a language, 200 take 5 and a language.
	// And Class 6 Mathematics in the second term, for Unit test 3.
	// And the second term's Unit test 3, for those who sat it: every subject
	// of the class, and the language each of 364 chose.
	if queued != 200*(4+2)+200*(5+2)+200*4+200*5+364 {
		t.Fatalf("%d results queued", queued)
	}
	// Every class and subject is carried through every step: two final sets
	// of 13 questions, each given to a section, marked question by question.
	var flow string
	if err := owner.QueryRow(ctx, `SELECT concat_ws(' ',
		(SELECT count(*) FROM papers WHERE org_id = $1 AND status = 'final'),
		(SELECT count(*) FROM paper_items i JOIN papers p ON p.id = i.paper_id WHERE p.org_id = $1 AND i.question_id IS NULL),
		(SELECT count(*) FROM assessment_parts ap JOIN assessments a ON a.id = ap.assessment_id WHERE a.org_id = $1 AND a.title = 'Unit test 3' AND ap.deleted_at IS NULL),
		(SELECT count(DISTINCT paper_id) FROM part_tags WHERE org_id = $1 AND paper_id IS NOT NULL),
		(SELECT count(*) FROM paper_assignments WHERE org_id = $1),
		(SELECT status FROM reexams WHERE org_id = $1),
		(SELECT count(*) > 0 FROM reexam_candidates WHERE org_id = $1),
		(SELECT count(*) FROM holistic_notes WHERE org_id = $1 AND status = 'approved'))`, ik).Scan(&flow); err != nil || flow != "130 0 845 130 130 applied t 3" {
		t.Fatalf("flow: %q %v (final sets, empty slots, question parts, tagged sets, assignments, re-exam, candidates, notes)", flow, err)
	}
	var outOfRange int
	if err := owner.QueryRow(ctx, `SELECT count(*) FROM evidence e JOIN assessment_parts p ON p.id = e.part_id WHERE e.org_id = $1 AND (e.value < 0 OR e.value > p.max_marks)`, ik).Scan(&outOfRange); err != nil || outOfRange != 0 {
		t.Fatalf("%d marks outside 0 to the maximum: %v", outOfRange, err)
	}

	// The whole syllabus: every class and subject has its chapters, outcomes
	// tied to competencies, and a bank; a language's marks only for those who chose it.
	var school string
	if err := owner.QueryRow(ctx, `SELECT concat_ws(' ',
		(SELECT count(DISTINCT (level_id, subject_id)) FROM lessons WHERE org_id = $1),
		(SELECT count(*) FROM learning_outcomes WHERE org_id = $1 AND competency_id IS NOT NULL) >= 64 * 12,
		(SELECT count(*) FROM questions WHERE org_id = $1) >= 64 * 24,
		(SELECT count(*) FROM evidence e JOIN assessments a ON a.id = e.assessment_id AND a.title = 'Unit test 3'
		  WHERE e.org_id = $1 AND EXISTS (SELECT 1 FROM subject_group_options o WHERE o.subject_id = a.subject_id AND o.deleted_at IS NULL)
		    AND NOT EXISTS (SELECT 1 FROM student_subject_choices c WHERE c.student_id = e.student_id AND c.subject_id = a.subject_id AND c.effective_to IS NULL)))`, ik).Scan(&school); err != nil || school != "65 t t 0" {
		t.Fatalf("school: %q %v (classes and subjects with chapters, outcomes, bank, marks in a language not chosen)", school, err)
	}

	// Results worked out and a first-term report run for each section; a
	// second time makes no more.
	for range 2 {
		if err := seed.GenerateReports(ctx, owner, ik); err != nil {
			t.Fatal(err)
		}
	}
	var reportsMade string
	if err := owner.QueryRow(ctx, `SELECT concat_ws(' ', (SELECT count(*) FROM report_runs WHERE org_id = $1), (SELECT count(*) FROM report_run_items WHERE org_id = $1),
		(SELECT count(*) > 4000 FROM computed_results WHERE org_id = $1))`, ik).Scan(&reportsMade); err != nil || reportsMade != "20 400 t" {
		t.Fatalf("reports: %q %v (runs, students, results worked out)", reportsMade, err)
	}

	again, err := seed.RunWith(ctx, owner, user, suffix)
	if err != nil {
		t.Fatal(err)
	}
	for i := range again {
		if again[i] != first[i] {
			t.Errorf("a second run changed %s: %+v, was %+v", seed.Demos[i].Name, again[i], first[i])
		}
	}
}
