// Package policy decides who may do what. The permission matrix of the
// blueprint (Part 5) is data in this file, one rule per action and role;
// policy_test.go checks every cell against the blueprint and proves each
// rule on real scenarios. Handlers call Check before any write or read.
//
// Teachers act only on the sections and subjects they are assigned to. Class
// teachers also act on their own section across subjects. A role limited to
// a branch acts only inside that branch.
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

// Roles lists every role that signs in to the app.
var Roles = []Role{Admin, Coordinator, Principal, Teacher, ClassTeacher, Viewer}

// Action is a resource and what is done to it. Matrix cells that grant two
// different things ("schemes only", "publish only", "audit read") are split
// into separate actions so each cell is a single rule.
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
	InsightRead          Action = "insight.read"
	InsightWrite         Action = "insight.write" // intervention plans
	AuditRead            Action = "audit.read"
	APIKeysManage        Action = "api_keys.manage"
)

// Rule is what one matrix cell grants.
type Rule int

const (
	Deny          Rule = iota
	Allow              // anywhere in the role's scope
	WithReason         // allowed, but the change must state why
	OwnSubject         // a section and subject the person is assigned to teach
	OwnSections        // any section the person teaches; a subject, if named, must be theirs there
	OwnSection         // the section the person is class teacher of, across subjects
	SectionRemark      // own section, and only its section-level remark (no subject)
)

// Matrix is the blueprint's permission matrix (Part 5). A missing cell is Deny.
var Matrix = map[Action]map[Role]Rule{
	StructureWrite:       {Admin: Allow},
	TerminologyWrite:     {Admin: Allow},
	SchemeWrite:          {Admin: Allow, Coordinator: Allow},
	AssessmentEdit:       {Admin: Allow, Coordinator: Allow, Teacher: OwnSubject, ClassTeacher: OwnSubject},
	AssessmentPublish:    {Admin: Allow, Coordinator: Allow, Teacher: OwnSubject, ClassTeacher: OwnSubject},
	AssessmentLock:       {Admin: Allow, Coordinator: Allow},
	EvidenceEnter:        {Admin: Allow, Coordinator: Allow, Teacher: OwnSections, ClassTeacher: OwnSection},
	EvidenceChangeLocked: {Admin: Allow, Coordinator: WithReason},
	ResultsRead:          {Admin: Allow, Coordinator: Allow, Principal: Allow, Teacher: OwnSections, ClassTeacher: OwnSection, Viewer: Allow},
	RemarksEdit:          {Admin: Allow, Coordinator: Allow, Teacher: OwnSubject, ClassTeacher: OwnSection},
	RemarksApprove:       {Admin: Allow, Coordinator: Allow, Principal: Allow, ClassTeacher: SectionRemark},
	ReportsPublish:       {Admin: Allow, Coordinator: Allow, Principal: Allow},
	InsightRead:          {Admin: Allow, Coordinator: Allow, Principal: Allow, Teacher: OwnSections, ClassTeacher: OwnSection, Viewer: Allow},
	InsightWrite:         {Admin: Allow, Coordinator: Allow, Principal: Allow, Teacher: OwnSections, ClassTeacher: OwnSection},
	AuditRead:            {Admin: Allow, Principal: Allow},
	APIKeysManage:        {Admin: Allow},
}

// Grant is one role a person holds, for the whole organisation (BranchID "")
// or for one branch.
type Grant struct {
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
	Grants      []Grant
	Assignments []Assignment
}

// Target is what the action touches. Leave fields empty that do not apply:
// an organisation-wide setting has no branch, a section remark no subject.
type Target struct {
	BranchID  string
	SectionID string
	SubjectID string
	Reason    string // why a locked record is changed
}

// Allowed reports whether any of the actor's roles grants the action on the
// target.
func Allowed(a Actor, act Action, t Target) bool {
	return Check(a, act, t) == nil
}

// Check returns nil when allowed, or a 403 problem saying why not.
func Check(a Actor, act Action, t Target) error {
	needsReason := false
	for _, g := range a.Grants {
		if g.BranchID != "" && g.BranchID != t.BranchID {
			continue // a branch role does not reach other branches or organisation-wide settings
		}
		switch Matrix[act][g.Role] {
		case Allow:
			return nil
		case WithReason:
			if t.Reason != "" {
				return nil
			}
			needsReason = true
		case OwnSubject:
			if t.SubjectID != "" && a.teaches(t.SectionID, t.SubjectID) {
				return nil
			}
		case OwnSections:
			if a.teachesIn(t.SectionID, t.SubjectID) {
				return nil
			}
		case OwnSection:
			if a.classTeacherOf(t.SectionID) {
				return nil
			}
		case SectionRemark:
			if t.SubjectID == "" && a.classTeacherOf(t.SectionID) {
				return nil
			}
		}
	}
	if needsReason {
		return problem.New(http.StatusUnprocessableEntity, "reason.required", "Say why this locked record is being changed.")
	}
	return problem.New(http.StatusForbidden, "auth.forbidden", "Your role does not allow this here.")
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
