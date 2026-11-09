// Package evidence holds the evidence write service (blueprint Part 6.1):
// the single function that changes marks. No handler or job writes the
// evidence table any other way. Each write checks who is writing, the
// assessment's status, the student's row status and whether they take the
// subject, validates the value against the column's maximum exactly, and
// refuses an edit made on a version that has since moved. In the same
// transaction it bumps the version, writes the history row and an audit
// entry, records that the student's result must be recomputed and marks
// the stored result stale.
package evidence

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/stale"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Write is one cell to change.
type Write struct {
	StudentID, PartID string
	State             string
	Value             string // exact decimal text, only for scored
	// BaseVersion is the version the edit was made on, 0 for a cell never
	// saved. AnyVersion skips the check, for bulk writes planned on a fresh
	// preview and for undo.
	BaseVersion int
	Reason      string
	Source      string // grid or import
	BulkID      string
	UndoOf      string
}

// AnyVersion writes whatever version the cell is at.
const AnyVersion = -1

// Refused is a write that was not applied: a rule said no (Code says
// which), or the cell moved on since the edit (Conflict holds it now).
type Refused struct {
	Code, Message string
	Conflict      *api.GridCell
}

func (r *Refused) Error() string { return r.Message }

func refuse(code, msg string) error { return &Refused{Code: code, Message: msg} }

// Decimal matches the marks the API accepts: up to 6 digits and 2 places.
var Decimal = regexp.MustCompile(`^\d{1,6}(\.\d{1,2})?$`)

// Hundredths reads an exact decimal as a whole number of hundredths, so
// marks compare exactly and never as floats.
func Hundredths(s string) int64 {
	whole, frac, _ := strings.Cut(s, ".")
	w, _ := strconv.ParseInt(whole, 10, 64)
	f, _ := strconv.ParseInt((frac + "00")[:2], 10, 64)
	return w*100 + f
}

// Canonical writes a decimal the way the database returns it, two places.
func Canonical(s string) string {
	h := Hundredths(s)
	return fmt.Sprintf("%d.%02d", h/100, h%100)
}

var states = map[string]bool{"scored": true, "absent": true, "exempt": true, "not_applicable": true, "pending": true, "not_assessed": true}

type part struct {
	assessmentID, max string
	status            string
	periodID          string
	subjectID         string
	levelID, yearID   string
	selected          bool // the subject is taken only by those who chose it
}

type place struct {
	sectionID, branchID string
	applicable          bool
	rowStatus           string
}

// Service applies writes for one request, remembering what it has read.
type Service struct {
	c      fiber.Ctx
	tx     pgx.Tx
	actor  policy.Actor
	user   string
	parts  map[string]part
	places map[string]place // assessment and student
}

// New is the service for this request.
func New(c fiber.Ctx) (*Service, error) {
	tx, err := tenant.Tx(c)
	if err != nil {
		return nil, err
	}
	a, err := tenant.Teaching(c)
	if err != nil {
		return nil, err
	}
	m, _ := tenant.MemberFrom(c)
	return &Service{c: c, tx: tx, actor: a, user: m.UserID, parts: map[string]part{}, places: map[string]place{}}, nil
}

func (s *Service) ctx() context.Context { return s.c.Context() }

func (s *Service) part(id string) (part, error) {
	if p, ok := s.parts[id]; ok {
		return p, nil
	}
	var p part
	err := s.tx.QueryRow(s.ctx(), `
		SELECT a.id::text, p.max_marks::text, a.status::text, a.period_id::text, a.subject_id::text, a.level_id::text, a.year_id::text,
		       `+Selected+`
		  FROM assessment_parts p JOIN assessments a ON a.id = p.assessment_id AND a.deleted_at IS NULL
		 WHERE p.id::text = $1 AND p.deleted_at IS NULL`, id).
		Scan(&p.assessmentID, &p.max, &p.status, &p.periodID, &p.subjectID, &p.levelID, &p.yearID, &p.selected)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, refuse("evidence.unknown_column", "This column is not part of any assessment.")
	}
	if err != nil {
		return p, err
	}
	s.parts[id] = p
	return p, nil
}

// Selected says whether assessment a's subject is taken only by those who
// chose it: it is optional at the level, or a subject group offers it.
const Selected = `(coalesce((SELECT ls.optional FROM level_subjects ls WHERE ls.level_id = a.level_id AND ls.subject_id = a.subject_id AND ls.deleted_at IS NULL LIMIT 1), false)
	OR EXISTS (SELECT 1 FROM subject_group_options o JOIN subject_groups g ON g.id = o.group_id AND g.deleted_at IS NULL
	            WHERE o.deleted_at IS NULL AND o.subject_id = a.subject_id AND g.level_id = a.level_id))`

// InForceDay is today kept inside the period: the day a subject choice is
// read on for an assessment in that period.
const InForceDay = `(SELECT greatest(least(current_date, ends_on), starts_on) FROM periods WHERE id = a.period_id)`

// Applicable says whether the student takes the assessment's subject: every
// student does, unless the subject is chosen by some only (Part 74.1).
const Applicable = `(NOT %[1]s OR EXISTS (
	SELECT 1 FROM student_subject_choices c
	 WHERE c.student_id = %[2]s AND c.subject_id = a.subject_id AND c.year_id = a.year_id
	   AND c.effective_from <= ` + InForceDay + ` AND (c.effective_to IS NULL OR c.effective_to >= ` + InForceDay + `)))`

func (s *Service) place(p part, studentID string) (place, error) {
	key := p.assessmentID + "/" + studentID
	if pl, ok := s.places[key]; ok {
		return pl, nil
	}
	var pl place
	err := s.tx.QueryRow(s.ctx(), `
		SELECT s.id::text, s.branch_id::text,
		       `+fmt.Sprintf(Applicable, "$3::boolean", "st.id")+`,
		       coalesce((SELECT status FROM assessment_participation WHERE assessment_id = a.id AND student_id = st.id), '')
		  FROM assessments a
		  JOIN assessment_scopes sc ON sc.assessment_id = a.id
		  JOIN sections s ON s.id = sc.section_id AND s.deleted_at IS NULL
		  JOIN enrolments e ON e.section_id = s.id AND e.year_id = a.year_id AND e.deleted_at IS NULL
		  JOIN students st ON st.id = e.student_id AND st.deleted_at IS NULL
		 WHERE a.id::text = $1 AND st.id::text = $2`, p.assessmentID, studentID, p.selected).
		Scan(&pl.sectionID, &pl.branchID, &pl.applicable, &pl.rowStatus)
	if errors.Is(err, pgx.ErrNoRows) {
		return pl, refuse("evidence.not_in_scope", "This student is not in a section this assessment covers.")
	}
	if err != nil {
		return pl, err
	}
	s.places[key] = pl
	return pl, nil
}

// Forget drops what the service remembers about a student's row, after
// their row status changes.
func (s *Service) Forget(assessmentID, studentID string) {
	delete(s.places, assessmentID+"/"+studentID)
}

func (s *Service) current(studentID, partID string) (id string, cell api.GridCell, err error) {
	cell = api.GridCell{StudentId: studentID, PartId: partID, State: "pending"}
	err = s.tx.QueryRow(s.ctx(), `
		SELECT id::text, state::text, coalesce(value::text, ''), version FROM evidence
		 WHERE student_id::text = $1 AND part_id::text = $2 FOR UPDATE`, studentID, partID).
		Scan(&id, &cell.State, &cell.Value, &cell.Version)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", cell, nil
	}
	return id, cell, err
}

// Apply writes one cell, or explains with a *Refused error why it did not.
func (s *Service) Apply(w Write) (api.GridCell, error) {
	p, err := s.part(w.PartID)
	if err != nil {
		return api.GridCell{}, err
	}
	pl, err := s.place(p, w.StudentID)
	if err != nil {
		return api.GridCell{}, err
	}
	target := policy.Target{BranchID: pl.branchID, SectionID: pl.sectionID, SubjectID: p.subjectID}
	if policy.Decide(s.actor, policy.EvidenceEnter, target) != policy.Full {
		return api.GridCell{}, refuse("auth.forbidden", "You cannot enter marks for this section and subject.")
	}
	switch p.status {
	case "open":
	case "locked":
		if strings.TrimSpace(w.Reason) == "" {
			return api.GridCell{}, refuse("evidence.locked", "This assessment is locked. Changing a mark needs a reason.")
		}
		target.Reason = w.Reason
		if policy.Decide(s.actor, policy.EvidenceChangeLocked, target) != policy.Full {
			return api.GridCell{}, refuse("evidence.locked", "This assessment is locked, and your role cannot change it.")
		}
	default:
		return api.GridCell{}, refuse("evidence.not_open", "This assessment is not open for entry yet.")
	}
	if pl.rowStatus != "" {
		return api.GridCell{}, refuse("evidence.row_status", "This student's row has a status. Clear it before entering a mark.")
	}
	if !pl.applicable {
		return api.GridCell{}, refuse("evidence.not_applicable", "This student did not choose this subject.")
	}

	// A scored cell carries an exact value no higher than the maximum;
	// every other state carries none (AT-v2-03).
	if !states[w.State] {
		return api.GridCell{}, refuse("evidence.invalid", "Unknown state.")
	}
	if w.State == "scored" {
		if !Decimal.MatchString(w.Value) {
			return api.GridCell{}, refuse("evidence.invalid", "Use a number with up to 2 decimals.")
		}
		if Hundredths(w.Value) > Hundredths(p.max) {
			return api.GridCell{}, refuse("evidence.above_max", "Above the maximum of "+strings.TrimSuffix(strings.TrimSuffix(p.max, "0"), ".0")+".")
		}
		w.Value = Canonical(w.Value)
	} else if w.Value != "" {
		return api.GridCell{}, refuse("evidence.invalid", "Only a scored cell carries a value.")
	}

	id, before, err := s.current(w.StudentID, w.PartID)
	if err != nil {
		return api.GridCell{}, err
	}
	if w.BaseVersion != AnyVersion && w.BaseVersion != before.Version {
		return api.GridCell{}, &Refused{Code: "evidence.conflict", Message: "Someone changed this cell since you opened it.", Conflict: &before}
	}
	if string(before.State) == w.State && before.Value == w.Value {
		return before, nil // nothing to change
	}
	m, _ := tenant.MemberFrom(s.c)
	value := any(nil)
	if w.State == "scored" {
		value = w.Value
	}
	source := w.Source
	if source == "" {
		source = "grid"
	}
	after := api.GridCell{StudentId: w.StudentID, PartId: w.PartID, State: api.ValueState(w.State), Value: w.Value}
	if id == "" {
		err = s.tx.QueryRow(s.ctx(), `
			INSERT INTO evidence (org_id, student_id, assessment_id, part_id, value, state, source, entered_by)
			VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::numeric, $6::value_state, $7::entry_source, $8)
			ON CONFLICT (student_id, part_id) DO NOTHING
			RETURNING id::text, version`, m.OrgID, w.StudentID, p.assessmentID, w.PartID, value, w.State, source, s.user).Scan(&id, &after.Version)
		if errors.Is(err, pgx.ErrNoRows) { // saved by someone else a moment ago
			_, now, err := s.current(w.StudentID, w.PartID)
			if err != nil {
				return api.GridCell{}, err
			}
			return api.GridCell{}, &Refused{Code: "evidence.conflict", Message: "Someone changed this cell since you opened it.", Conflict: &now}
		}
	} else {
		err = s.tx.QueryRow(s.ctx(), `
			UPDATE evidence SET value = $2::numeric, state = $3::value_state, source = $4::entry_source, entered_by = $5,
			       version = version + 1, updated_at = now()
			 WHERE id = $1::uuid RETURNING version`, id, value, w.State, source, s.user).Scan(&after.Version)
	}
	if err != nil {
		return api.GridCell{}, err
	}
	if _, err := s.tx.Exec(s.ctx(), `
		INSERT INTO evidence_history (org_id, evidence_id, version, value, state, source, bulk_id, undo_of, changed_by, reason)
		VALUES ($1, $2::uuid, $3, $4::numeric, $5::value_state, $6::entry_source, nullif($7, '')::uuid, nullif($8, '')::uuid, $9, nullif($10, ''))`,
		m.OrgID, id, after.Version, value, w.State, source, w.BulkID, w.UndoOf, s.user, strings.TrimSpace(w.Reason)); err != nil {
		return api.GridCell{}, err
	}
	if err := stale.Student(s.ctx(), s.tx, w.StudentID, p.periodID, p.subjectID); err != nil {
		return api.GridCell{}, err
	}
	// The audit log names the cell and its versions only; the marks
	// themselves stay in the evidence history (Part 77.4).
	action := "update"
	var was any = map[string]any{"version": before.Version, "state": before.State}
	if before.Version == 0 {
		action, was = "create", nil
	}
	if err := audit.Record(s.c, audit.Entry{Action: action, Entity: "evidence", EntityID: id, Before: was,
		After: map[string]any{"version": after.Version, "state": after.State, "assessmentId": p.assessmentID, "partId": w.PartID, "studentId": w.StudentID}}); err != nil {
		return api.GridCell{}, err
	}
	return after, nil
}
