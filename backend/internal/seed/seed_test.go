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
			for _, table := range []string{"assessment_parts", "assessment_scopes", "assessments", "student_subject_choices", "subject_group_options", "subject_groups", "audit_log", "guardians", "enrolments", "teaching_assignments", "students", "memberships", "staff",
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
	if err := owner.QueryRow(ctx, `SELECT count(*) FROM revu_my_orgs($1)`, user).Scan(&orgs); err != nil || orgs != 2 {
		t.Fatalf("the seed user administers %d organisations, %v", orgs, err)
	}
	if err := owner.QueryRow(ctx, `SELECT count(*) FROM guardians WHERE org_id = $1 AND is_primary`, first[0].OrgID).Scan(&primaries); err != nil || primaries != 72 {
		t.Fatalf("%d primary contacts, %v", primaries, err)
	}
	if err := owner.QueryRow(ctx, `SELECT count(*) FROM periods WHERE org_id = $1`, first[1].OrgID).Scan(&periods); err != nil || periods != 2 {
		t.Fatalf("%d semesters, %v", periods, err)
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
