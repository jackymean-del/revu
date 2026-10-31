package policy

import (
	"errors"
	"testing"

	"github.com/jackymean-del/revu/internal/problem"
)

// The blueprint's matrix (Part 5), copied cell by cell as written there, in
// the column order Admin, Coordinator, Principal, Teacher, Class teacher,
// View-only. Rows whose cell grants two things are split the same way as
// the actions in policy.go, with the original wording kept in the comment.
var blueprint = []struct {
	act   Action
	cells [6]string
}{
	{StructureWrite, [6]string{"yes", "no", "no", "no", "no", "no"}},
	{TerminologyWrite, [6]string{"yes", "no", "no", "no", "no", "no"}}, // coordinator: "schemes only"
	{SchemeWrite, [6]string{"yes", "yes", "no", "no", "no", "no"}},     // coordinator: "schemes only"
	{AssessmentEdit, [6]string{"yes", "yes", "no", "own subjects", "own subjects", "no"}},
	{AssessmentPublish, [6]string{"yes", "yes", "no", "own subjects", "own subjects", "no"}}, // "own, publish only"
	{AssessmentLock, [6]string{"yes", "yes", "no", "no", "no", "no"}},                        // "own, publish only"
	{EvidenceEnter, [6]string{"yes", "yes", "no", "own sections", "own section", "no"}},
	{EvidenceChangeLocked, [6]string{"yes", "with reason", "no", "no", "no", "no"}},
	{ResultsRead, [6]string{"yes", "yes", "yes", "own sections", "own section", "yes"}},
	{RemarksEdit, [6]string{"yes", "yes", "no", "own subject remarks", "own section", "no"}},
	{RemarksApprove, [6]string{"yes", "yes", "yes", "no", "section remarks only", "no"}},
	{ReportsPublish, [6]string{"yes", "yes", "yes", "no", "no", "no"}},                  // class teacher: "section remarks only"
	{InsightRead, [6]string{"yes", "yes", "yes", "own sections", "own section", "yes"}}, // view-only: "read"
	{InsightWrite, [6]string{"yes", "yes", "yes", "own sections", "own section", "no"}}, // view-only: "read"
	{AuditRead, [6]string{"yes", "no", "yes", "no", "no", "no"}},                        // principal: "audit read"
	{APIKeysManage, [6]string{"yes", "no", "no", "no", "no", "no"}},                     // principal: "audit read"
}

var columns = [6]Role{Admin, Coordinator, Principal, Teacher, ClassTeacher, Viewer}

var wording = map[string]Rule{
	"yes": Allow, "no": Deny, "with reason": WithReason,
	"own subjects": OwnSubject, "own subject remarks": OwnSubject,
	"own sections": OwnSections, "own section": OwnSection,
	"section remarks only": SectionRemark,
}

// Every cell of the matrix in code matches the blueprint, and there is no
// action in code that the blueprint does not have.
func TestMatrixMatchesTheBlueprint(t *testing.T) {
	seen := map[Action]bool{}
	for _, row := range blueprint {
		seen[row.act] = true
		for i, cell := range row.cells {
			want, ok := wording[cell]
			if !ok {
				t.Fatalf("%s: unknown wording %q", row.act, cell)
			}
			if got := Matrix[row.act][columns[i]]; got != want {
				t.Errorf("%s / %s: code says %d, blueprint says %q", row.act, columns[i], got, cell)
			}
		}
	}
	for act := range Matrix {
		if !seen[act] {
			t.Errorf("action %s is in the code but not in the blueprint table above", act)
		}
	}
	if len(Roles) != len(columns) {
		t.Errorf("roles %v do not match the matrix columns %v", Roles, columns)
	}
}

const (
	north, south = "branch-north", "branch-south"
	sec6A, sec6B = "section-6a", "section-6b"
	maths, sci   = "subject-maths", "subject-science"
)

// Asha teaches maths in 6A and is class teacher of 6B.
var asha = Actor{
	Grants:      []Grant{{Role: Teacher}, {Role: ClassTeacher}},
	Assignments: []Assignment{{SectionID: sec6A, SubjectID: maths}, {SectionID: sec6B}},
}

func TestScenarios(t *testing.T) {
	admin := Actor{Grants: []Grant{{Role: Admin}}}
	northCoordinator := Actor{Grants: []Grant{{Role: Coordinator, BranchID: north}}}
	teacherOnly := Actor{Grants: []Grant{{Role: Teacher}}, Assignments: []Assignment{{SectionID: sec6A, SubjectID: maths}}}
	viewer := Actor{Grants: []Grant{{Role: Viewer}}}
	nobody := Actor{}

	cases := []struct {
		name  string
		actor Actor
		act   Action
		t     Target
		want  bool
	}{
		// AT-v1-05
		{"a branch coordinator reads results in their branch", northCoordinator, ResultsRead, Target{BranchID: north, SectionID: sec6A}, true},
		{"a branch coordinator cannot read another branch", northCoordinator, ResultsRead, Target{BranchID: south, SectionID: sec6A}, false},
		{"a branch coordinator cannot change organisation-wide schemes", northCoordinator, SchemeWrite, Target{}, false},
		{"a teacher cannot edit structure", teacherOnly, StructureWrite, Target{BranchID: north}, false},
		{"an admin edits structure", admin, StructureWrite, Target{BranchID: south}, true},

		{"a teacher enters marks for their own subject and section", teacherOnly, EvidenceEnter, Target{SectionID: sec6A, SubjectID: maths}, true},
		{"a teacher cannot enter marks for another subject in that section", teacherOnly, EvidenceEnter, Target{SectionID: sec6A, SubjectID: sci}, false},
		{"a teacher cannot enter marks in a section they do not teach", teacherOnly, EvidenceEnter, Target{SectionID: sec6B, SubjectID: maths}, false},
		{"a teacher reads results of a section they teach", teacherOnly, ResultsRead, Target{SectionID: sec6A}, true},
		{"a teacher publishes their own assessment", teacherOnly, AssessmentPublish, Target{SectionID: sec6A, SubjectID: maths}, true},
		{"a teacher cannot lock their own assessment", teacherOnly, AssessmentLock, Target{SectionID: sec6A, SubjectID: maths}, false},
		{"a teacher cannot approve remarks", teacherOnly, RemarksApprove, Target{SectionID: sec6A}, false},

		{"a class teacher enters marks in their section in any subject", asha, EvidenceEnter, Target{SectionID: sec6B, SubjectID: sci}, true},
		{"a class teacher cannot create assessments for subjects they do not teach", asha, AssessmentEdit, Target{SectionID: sec6B, SubjectID: sci}, false},
		{"a class teacher approves their section's remark", asha, RemarksApprove, Target{SectionID: sec6B}, true},
		{"a class teacher cannot approve a subject remark", asha, RemarksApprove, Target{SectionID: sec6B, SubjectID: maths}, false},
		{"a class teacher cannot publish reports", asha, ReportsPublish, Target{SectionID: sec6B}, false},
		{"roles add up: Asha still teaches maths in 6A", asha, AssessmentEdit, Target{SectionID: sec6A, SubjectID: maths}, true},

		{"view-only reads insight", viewer, InsightRead, Target{SectionID: sec6A}, true},
		{"view-only cannot change plans", viewer, InsightWrite, Target{SectionID: sec6A}, false},
		{"no role, no access", nobody, ResultsRead, Target{SectionID: sec6A}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Allowed(tc.actor, tc.act, tc.t); got != tc.want {
				t.Fatalf("Allowed = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestChangeAfterLockNeedsAReason(t *testing.T) {
	coordinator := Actor{Grants: []Grant{{Role: Coordinator}}}
	var pe *problem.Error
	err := Check(coordinator, EvidenceChangeLocked, Target{SectionID: sec6A})
	if !errors.As(err, &pe) || pe.Code != "reason.required" {
		t.Fatalf("without a reason: %v, want reason.required", err)
	}
	if err := Check(coordinator, EvidenceChangeLocked, Target{SectionID: sec6A, Reason: "Re-marked after review"}); err != nil {
		t.Fatalf("with a reason: %v", err)
	}
	err = Check(asha, EvidenceChangeLocked, Target{SectionID: sec6B, Reason: "please"})
	if !errors.As(err, &pe) || pe.Code != "auth.forbidden" || pe.Status != 403 {
		t.Fatalf("a teacher with a reason: %v, want 403 auth.forbidden", err)
	}
}
