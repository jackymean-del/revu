// Package policy decides who may do what. The permission matrix of the
// blueprint (Part 5, as narrowed by Part 77 and decision D19) is data in
// this file, one rule per action and role; policy_test.go checks every cell
// against the blueprint and proves each rule on real scenarios.
//
// The matrix is the most a role can ever receive. Teachers act only on the
// sections and subjects they are assigned to; class teachers also on their
// own section where the matrix says so; a role limited to a branch acts
// only inside that branch. Coordinators, principals and view-only roles see
// counts and status unless an administrator grants more (Part 77).
package policy

import (
	"net/http"

	"github.com/jackymean-del/revu/internal/problem"
)

// Role is a membership role (database enum member_role).
type Role string

const (
	Admin        Role = "admin"
	Principal    Role = "principal"
	Coordinator  Role = "coordinator"
	Teacher      Role = "teacher"
	ClassTeacher Role = "class_teacher"
	Viewer       Role = "viewer"
)

// Roles lists every role that signs in to the app. Parents and students use
// the portal with their own tokens (v4) and are not members.
var Roles = []Role{Admin, Coordinator, Principal, Teacher, ClassTeacher, Viewer}

// Action is a resource and what is done to it. Matrix rows that grant two
// different things ("schemes only", "publish only", "audit read", "read")
// are split into separate actions so each cell is a single rule.
type Action string

const (
	StructureWrite       Action = "structure.write" // structure and people
	TerminologyWrite     Action = "terminology.write"
	SchemeWrite          Action = "scheme.write"
	AssessmentEdit       Action = "assessment.edit" // create and edit
	AssessmentPublish    Action = "assessment.publish"
	AssessmentLock       Action = "assessment.lock"
	EvidenceEnter        Action = "evidence.enter"
	EvidenceChangeLocked Action = "evidence.change_locked"
	ResultsRead          Action = "results.read"
	RemarksEdit          Action = "remarks.edit" // draft and edit
	RemarksApprove       Action = "remarks.approve"
	ReportsPublish       Action = "reports.publish" // approve and publish reports
	Insight              Action = "insight"         // insight and intervention plans
	AuditRead            Action = "audit.read"
	APIKeysManage        Action = "api_keys.manage"
	LayoutInstitution    Action = "layout.institution" // order and layout: institution, level and template
	LayoutPersonal       Action = "layout.personal"    // order and layout: personal entry view
	HistoricalImport     Action = "historical.import"
	ParentMessaging      Action = "parent.messaging" // messages, consent and channel settings
	DataRequestsRead     Action = "data_requests.read"
	DataRequestsManage   Action = "data_requests.manage" // retention and erasure
	SubjectChoices       Action = "subject_choices.write"
	RowStatus            Action = "row_status.write"      // not applicable, absent, exempt
	RowStatusLeft        Action = "row_status_left.write" // TC, the student has left
	PaperViewFinalised   Action = "paper.view_finalised"
	PaperPrint           Action = "paper.print"
	PaperRevise          Action = "paper.revise" // a printed paper, or marks after the exam
	VisibilityPolicy     Action = "visibility.policy"
	GroupSharingPolicy   Action = "group_sharing.policy"
	DeductionReasons     Action = "deduction_reasons.write"
	ContentGrants        Action = "content_grants.manage" // grant, hide or show confidential content
	OwnershipReassign    Action = "ownership.reassign"
)

// Rule is what one matrix cell grants.
type Rule int

const (
	Deny                    Rule = iota
	Allow                        // anywhere in the role's scope
	OwnSubject                   // a section and subject the person is assigned to teach
	OwnSections                  // sections the person teaches; a subject, if named, must be theirs there
	OwnSection                   // the section the person is class teacher of, across subjects
	SectionRemark                // own section, and only its section-level remark (no subject)
	ByGrant                      // only with an administrator's grant for this item
	ByGrantWithReason            // a grant, and the change states why
	CountsOnly                   // status and totals, never student-level content
	CountsReportsAtApproval      // counts, and full access to reports in their approval queue
	ByPolicy                     // when the institution's policy allows it
	GroupAdmin                   // a group administrator only, never an institution role
)

// Matrix is the blueprint's permission matrix. A missing cell is Deny.
var Matrix = map[Action]map[Role]Rule{
	StructureWrite:       {Admin: Allow},
	TerminologyWrite:     {Admin: Allow},
	SchemeWrite:          {Admin: Allow, Coordinator: Allow},
	AssessmentEdit:       {Admin: Allow, Coordinator: Allow, Teacher: OwnSubject, ClassTeacher: OwnSubject},
	AssessmentPublish:    {Admin: Allow, Coordinator: Allow, Teacher: OwnSubject, ClassTeacher: OwnSubject},
	AssessmentLock:       {Admin: Allow, Coordinator: Allow},
	EvidenceEnter:        {Admin: Allow, Coordinator: ByGrant, Teacher: OwnSections, ClassTeacher: OwnSections},
	EvidenceChangeLocked: {Admin: Allow, Coordinator: ByGrantWithReason},
	ResultsRead:          {Admin: Allow, Coordinator: CountsReportsAtApproval, Principal: CountsReportsAtApproval, Teacher: OwnSections, ClassTeacher: OwnSection, Viewer: ByGrant},
	RemarksEdit:          {Admin: Allow, Coordinator: ByGrant, Teacher: OwnSubject, ClassTeacher: OwnSection},
	RemarksApprove:       {Admin: Allow, Coordinator: Allow, Principal: Allow, ClassTeacher: SectionRemark},
	ReportsPublish:       {Admin: Allow, Coordinator: Allow, Principal: Allow},
	Insight:              {Admin: Allow, Coordinator: CountsOnly, Principal: CountsOnly, Teacher: OwnSections, ClassTeacher: OwnSection, Viewer: ByGrant},
	AuditRead:            {Admin: Allow, Principal: Allow},
	APIKeysManage:        {Admin: Allow},
	LayoutInstitution:    {Admin: Allow, Coordinator: Allow},
	LayoutPersonal:       {Admin: Allow, Coordinator: Allow, Teacher: OwnSections, ClassTeacher: OwnSection},
	HistoricalImport:     {Admin: Allow, Coordinator: Allow},
	ParentMessaging:      {Admin: Allow, Coordinator: Allow},
	DataRequestsRead:     {Admin: Allow, Principal: Allow},
	DataRequestsManage:   {Admin: Allow},
	SubjectChoices:       {Admin: Allow, Coordinator: Allow, ClassTeacher: OwnSection},
	RowStatus:            {Admin: Allow, Coordinator: Allow, Teacher: OwnSections, ClassTeacher: OwnSection},
	RowStatusLeft:        {Admin: Allow, Coordinator: Allow},
	PaperViewFinalised:   {Admin: Allow},
	PaperPrint:           {Admin: Allow, Coordinator: ByPolicy},
	PaperRevise:          {Admin: Allow},
	VisibilityPolicy:     {Admin: Allow},
	GroupSharingPolicy:   {Admin: GroupAdmin},
	DeductionReasons:     {Admin: Allow, Coordinator: Allow, Teacher: OwnSections, ClassTeacher: OwnSection},
	ContentGrants:        {Admin: Allow},
	OwnershipReassign:    {Admin: Allow},
}

// Access is how much of an item a person may see or do.
type Access int

const (
	None   Access = iota
	Counts        // status and totals only
	Full
)

// RoleIn is one role a person holds, for the whole organisation (BranchID
// "") or for one branch.
type RoleIn struct {
	Role     Role
	BranchID string
}

// Assignment is a section the person teaches. SubjectID "" means they are
// its class teacher.
type Assignment struct {
	SectionID string
	SubjectID string
}

// Actor is the person asking.
type Actor struct {
	Roles       []RoleIn
	Assignments []Assignment
	GroupAdmin  bool // administers the group this institution belongs to
}

// Target is what the action touches, and the facts the caller has checked
// about it. Leave fields empty that do not apply: an organisation-wide
// setting has no branch, a section remark no subject.
type Target struct {
	BranchID        string
	SectionID       string
	SubjectID       string
	Reason          string // why a locked record is changed
	Granted         bool   // an administrator's grant to this person for this item is active
	InApprovalQueue bool   // the report waits in this person's approval queue
	PolicyAllows    bool   // the institution's policy setting allows this role
}

// Decide returns the most any of the actor's roles grants on the target.
func Decide(a Actor, act Action, t Target) Access {
	access, _ := decide(a, act, t)
	return access
}

// Check returns nil when the actor has full access, or a problem saying why
// not: 422 reason.required when only a reason is missing, else 403.
func Check(a Actor, act Action, t Target) error {
	access, needsReason := decide(a, act, t)
	switch {
	case access == Full:
		return nil
	case needsReason:
		return problem.New(http.StatusUnprocessableEntity, "reason.required", "Say why this locked record is being changed.")
	default:
		return problem.New(http.StatusForbidden, "auth.forbidden", "Your role does not allow this here.")
	}
}

func decide(a Actor, act Action, t Target) (Access, bool) {
	best, needsReason := None, false
	for _, r := range a.Roles {
		if r.BranchID != "" && r.BranchID != t.BranchID {
			continue // a branch role does not reach other branches or organisation-wide settings
		}
		got := None
		switch Matrix[act][r.Role] {
		case Allow:
			got = Full
		case OwnSubject:
			if t.SubjectID != "" && a.teaches(t.SectionID, t.SubjectID) {
				got = Full
			}
		case OwnSections:
			if a.teachesIn(t.SectionID, t.SubjectID) {
				got = Full
			}
		case OwnSection:
			if a.classTeacherOf(t.SectionID) {
				got = Full
			}
		case SectionRemark:
			if t.SubjectID == "" && a.classTeacherOf(t.SectionID) {
				got = Full
			}
		case ByGrant:
			if t.Granted {
				got = Full
			}
		case ByGrantWithReason:
			if t.Granted && t.Reason != "" {
				got = Full
			} else if t.Granted {
				needsReason = true
			}
		case CountsOnly:
			got = Counts
		case CountsReportsAtApproval:
			got = Counts
			if t.InApprovalQueue {
				got = Full
			}
		case ByPolicy:
			if t.PolicyAllows {
				got = Full
			}
		case GroupAdmin:
			if a.GroupAdmin {
				got = Full
			}
		}
		best = max(best, got)
	}
	return best, needsReason
}

func (a Actor) teaches(section, subject string) bool {
	for _, as := range a.Assignments {
		if section != "" && as.SectionID == section && as.SubjectID == subject {
			return true
		}
	}
	return false
}

func (a Actor) teachesIn(section, subject string) bool {
	if section == "" {
		return false
	}
	if subject != "" {
		return a.teaches(section, subject)
	}
	for _, as := range a.Assignments {
		if as.SectionID == section && as.SubjectID != "" {
			return true
		}
	}
	return false
}

func (a Actor) classTeacherOf(section string) bool {
	return a.teaches(section, "")
}
