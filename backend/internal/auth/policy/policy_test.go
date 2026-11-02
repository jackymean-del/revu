package policy

import (
	"errors"
	"testing"

	"github.com/jackymean-del/revu/internal/problem"
)

// The blueprint's matrix (v22, Part 5), copied cell by cell as written
// there, in the column order Admin, Coordinator, Principal, Teacher, Class
// teacher, View-only. Rows whose cell grants two things are split the same
// way as the actions in policy.go, with the original wording in the comment.
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
	{EvidenceEnter, [6]string{"yes", "by grant", "no", "own sections", "own sections", "no"}},
	{EvidenceChangeLocked, [6]string{"yes", "by grant, with reason", "no", "no", "no", "no"}},
	{ResultsRead, [6]string{"yes", "counts, reports at approval", "counts, reports at approval", "own sections", "own section", "by grant"}},
	{RemarksEdit, [6]string{"yes", "by grant", "no", "own subject remarks", "own section", "no"}},
	{RemarksApprove, [6]string{"yes", "yes", "yes", "no", "section remarks only", "no"}},
	{ReportsPublish, [6]string{"yes", "yes", "yes", "no", "no", "no"}}, // class teacher: "section remarks only"
	{Insight, [6]string{"yes", "counts", "counts", "own sections", "own section", "by grant"}},
	{AuditRead, [6]string{"yes", "no", "yes", "no", "no", "no"}},    // principal: "audit read"
	{APIKeysManage, [6]string{"yes", "no", "no", "no", "no", "no"}}, // principal: "audit read"
	{LayoutInstitution, [6]string{"yes", "yes", "no", "no", "no", "no"}},
	{LayoutPersonal, [6]string{"yes", "yes", "no", "own sections", "own section", "no"}},
	{HistoricalImport, [6]string{"yes", "yes", "no", "no", "no", "no"}},
	{ParentMessaging, [6]string{"yes", "yes", "no", "no", "no", "no"}},
	{DataRequestsRead, [6]string{"yes", "no", "yes", "no", "no", "no"}},  // principal: "read"
	{DataRequestsManage, [6]string{"yes", "no", "no", "no", "no", "no"}}, // principal: "read"
	{SubjectChoices, [6]string{"yes", "yes", "no", "no", "own section", "no"}},
	{RowStatus, [6]string{"yes", "yes", "no", "own sections", "own section", "no"}},
	{RowStatusLeft, [6]string{"yes", "yes", "no", "no", "no", "no"}},
	{PaperViewFinalised, [6]string{"yes", "no", "no", "no", "no", "no"}},
	{PaperPrint, [6]string{"yes", "policy", "no", "no", "no", "no"}},
	{PaperRevise, [6]string{"yes", "no", "no", "no", "no", "no"}},
	{VisibilityPolicy, [6]string{"yes", "no", "no", "no", "no", "no"}},
	{GroupSharingPolicy, [6]string{"group admin", "no", "no", "no", "no", "no"}},
	{DeductionReasons, [6]string{"yes", "yes", "no", "own sections", "own section", "no"}},
	{ContentGrants, [6]string{"yes", "no", "no", "no", "no", "no"}},
	{OwnershipReassign, [6]string{"yes", "no", "no", "no", "no", "no"}},
}

var columns = [6]Role{Admin, Coordinator, Principal, Teacher, ClassTeacher, Viewer}

var wording = map[string]Rule{
	"yes": Allow, "no": Deny,
	"own subjects": OwnSubject, "own subject remarks": OwnSubject,
	"own sections": OwnSections, "own section": OwnSection,
	"section remarks only":        SectionRemark,
	"by grant":                    ByGrant,
	"by grant, with reason":       ByGrantWithReason,
	"counts":                      CountsOnly,
	"counts, reports at approval": CountsReportsAtApproval,
	"policy":                      ByPolicy,
	"group admin":                 GroupAdmin,
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
	Roles:       []RoleIn{{Role: Teacher}, {Role: ClassTeacher}},
	Assignments: []Assignment{{SectionID: sec6A, SubjectID: maths}, {SectionID: sec6B}},
}

func TestScenarios(t *testing.T) {
	admin := Actor{Roles: []RoleIn{{Role: Admin}}}
	coordinator := Actor{Roles: []RoleIn{{Role: Coordinator}}}
	northCoordinator := Actor{Roles: []RoleIn{{Role: Coordinator, BranchID: north}}}
	principal := Actor{Roles: []RoleIn{{Role: Principal}}}
	teacherOnly := Actor{Roles: []RoleIn{{Role: Teacher}}, Assignments: []Assignment{{SectionID: sec6A, SubjectID: maths}}}
	otherTeacher := Actor{Roles: []RoleIn{{Role: Teacher}}, Assignments: []Assignment{{SectionID: sec6A, SubjectID: sci}}}
	viewer := Actor{Roles: []RoleIn{{Role: Viewer}}}
	groupAdmin := Actor{Roles: []RoleIn{{Role: Admin}}, GroupAdmin: true}
	nobody := Actor{}

	cases := []struct {
		name  string
		actor Actor
		act   Action
		t     Target
		want  Access
	}{
		// AT-v1-05
		{"a branch coordinator sees counts in their branch", northCoordinator, ResultsRead, Target{BranchID: north, SectionID: sec6A}, Counts},
		{"a branch coordinator sees nothing of another branch", northCoordinator, ResultsRead, Target{BranchID: south, SectionID: sec6A}, None},
		{"a branch coordinator cannot change organisation-wide schemes", northCoordinator, SchemeWrite, Target{}, None},
		{"a teacher cannot edit structure", teacherOnly, StructureWrite, Target{BranchID: north}, None},
		{"an admin edits structure", admin, StructureWrite, Target{BranchID: south}, Full},

		// AT-CF-03, AT-CF-05: confidential by default
		{"a coordinator sees counts of results, not marks", coordinator, ResultsRead, Target{SectionID: sec6A, SubjectID: maths}, Counts},
		{"a report in the coordinator's approval queue opens", coordinator, ResultsRead, Target{SectionID: sec6A, InApprovalQueue: true}, Full},
		{"a principal sees counts of insight only", principal, Insight, Target{SectionID: sec6A}, Counts},
		{"a coordinator cannot enter marks without a grant", coordinator, EvidenceEnter, Target{SectionID: sec6A, SubjectID: maths}, None},
		{"a coordinator enters marks with a grant", coordinator, EvidenceEnter, Target{SectionID: sec6A, SubjectID: maths, Granted: true}, Full},
		{"view-only sees nothing without a grant", viewer, ResultsRead, Target{SectionID: sec6A}, None},
		{"view-only reads results with a grant", viewer, ResultsRead, Target{SectionID: sec6A, Granted: true}, Full},
		{"a teacher sees results of their own subject", teacherOnly, ResultsRead, Target{SectionID: sec6A, SubjectID: maths}, Full},
		{"another teacher of the same class sees none of them", otherTeacher, ResultsRead, Target{SectionID: sec6A, SubjectID: maths}, None},

		{"a teacher enters marks for their own subject and section", teacherOnly, EvidenceEnter, Target{SectionID: sec6A, SubjectID: maths}, Full},
		{"a teacher cannot enter marks in a section they do not teach", teacherOnly, EvidenceEnter, Target{SectionID: sec6B, SubjectID: maths}, None},
		{"a teacher publishes their own assessment", teacherOnly, AssessmentPublish, Target{SectionID: sec6A, SubjectID: maths}, Full},
		{"a teacher cannot lock their own assessment", teacherOnly, AssessmentLock, Target{SectionID: sec6A, SubjectID: maths}, None},

		{"a class teacher enters marks only for subjects they teach", asha, EvidenceEnter, Target{SectionID: sec6B, SubjectID: sci}, None},
		{"a class teacher sets row status in their section", asha, RowStatus, Target{SectionID: sec6B, SubjectID: sci}, Full},
		{"a class teacher approves their section's remark", asha, RemarksApprove, Target{SectionID: sec6B}, Full},
		{"a class teacher cannot approve a subject remark", asha, RemarksApprove, Target{SectionID: sec6B, SubjectID: maths}, None},
		{"roles add up: Asha still teaches maths in 6A", asha, AssessmentEdit, Target{SectionID: sec6A, SubjectID: maths}, Full},

		{"a coordinator prints a paper when policy allows", coordinator, PaperPrint, Target{PolicyAllows: true}, Full},
		{"a coordinator cannot print when it does not", coordinator, PaperPrint, Target{}, None},
		{"only an admin views a finalised paper", coordinator, PaperViewFinalised, Target{}, None},
		{"an institution admin cannot set group sharing", admin, GroupSharingPolicy, Target{}, None},
		{"a group admin sets group sharing", groupAdmin, GroupSharingPolicy, Target{}, Full},
		{"no role, no access", nobody, ResultsRead, Target{SectionID: sec6A}, None},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Decide(tc.actor, tc.act, tc.t); got != tc.want {
				t.Fatalf("Decide = %d, want %d", got, tc.want)
			}
		})
	}
}

func TestChangeAfterLockNeedsAGrantAndAReason(t *testing.T) {
	coordinator := Actor{Roles: []RoleIn{{Role: Coordinator}}}
	var pe *problem.Error
	err := Check(coordinator, EvidenceChangeLocked, Target{SectionID: sec6A, Reason: "Re-marked after review"})
	if !errors.As(err, &pe) || pe.Code != "auth.forbidden" {
		t.Fatalf("a reason without a grant: %v, want auth.forbidden", err)
	}
	err = Check(coordinator, EvidenceChangeLocked, Target{SectionID: sec6A, Granted: true})
	if !errors.As(err, &pe) || pe.Code != "reason.required" {
		t.Fatalf("a grant without a reason: %v, want reason.required", err)
	}
	if err := Check(coordinator, EvidenceChangeLocked, Target{SectionID: sec6A, Granted: true, Reason: "Re-marked after review"}); err != nil {
		t.Fatalf("a grant and a reason: %v", err)
	}
	if err := Check(coordinator, ResultsRead, Target{SectionID: sec6A}); err == nil {
		t.Fatal("counts-only access passed a full-access check")
	}
}
