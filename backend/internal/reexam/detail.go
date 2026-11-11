package reexam

import (
	"errors"
	"net/http"
	"regexp"
	"slices"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/results"
	"github.com/jackymean-del/revu/internal/stale"
	"github.com/jackymean-del/revu/internal/tenant"
)

var dateShape = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)

// Summary is a re-exam in the list.
type Summary struct {
	ID          string   `json:"id"`
	SourceID    string   `json:"sourceId"`
	Title       string   `json:"title"`
	SourceTitle string   `json:"sourceTitle"`
	Subject     string   `json:"subject"`
	Attempt     int      `json:"attempt"`
	HeldOn      string   `json:"heldOn"`
	Policy      string   `json:"policy"`
	AbsentRule  string   `json:"absentRule"`
	Status      string   `json:"status"`
	Sitting     int      `json:"sitting"` // students chosen
	Marked      int      `json:"marked"`  // candidates with a mark or an absence entered
	SectionIDs  []string `json:"sectionIds"`
}

const summaryCols = `x.assessment_id::text, x.source_id::text, a.title, s.title, sj.name, a.attempt, coalesce(a.held_on::text, ''), x.policy, x.absent_rule, x.status,
	(SELECT count(*) FROM reexam_candidates c WHERE c.assessment_id = x.assessment_id)::int,
	(SELECT count(DISTINCT c.student_id) FROM reexam_candidates c WHERE c.assessment_id = x.assessment_id
	   AND (EXISTS (SELECT 1 FROM evidence ev WHERE ev.assessment_id = x.assessment_id AND ev.student_id = c.student_id AND ev.state <> 'pending')
	        OR EXISTS (SELECT 1 FROM assessment_participation ap WHERE ap.assessment_id = x.assessment_id AND ap.student_id = c.student_id)))::int,
	coalesce((SELECT array_agg(section_id::text) FROM assessment_scopes WHERE assessment_id = x.assessment_id), '{}')`

const summaryFrom = ` FROM reexams x JOIN assessments a ON a.id = x.assessment_id AND a.deleted_at IS NULL
	JOIN assessments s ON s.id = x.source_id JOIN subjects sj ON sj.id = a.subject_id`

func scanSummary(r pgx.Row) (Summary, error) {
	var s Summary
	err := r.Scan(&s.ID, &s.SourceID, &s.Title, &s.SourceTitle, &s.Subject, &s.Attempt, &s.HeldOn, &s.Policy, &s.AbsentRule, &s.Status, &s.Sitting, &s.Marked, &s.SectionIDs)
	return s, err
}

// list is every re-exam this person can see: those of subjects they plan
// for or sections they teach.
func list(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	actor, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	rows, err := tx.Query(c.Context(), `SELECT `+summaryCols+`, a.subject_id::text`+summaryFrom+` ORDER BY x.created_at DESC LIMIT 200`)
	if err != nil {
		return err
	}
	out := []Summary{}
	for rows.Next() {
		var s Summary
		var subject string
		if err := rows.Scan(&s.ID, &s.SourceID, &s.Title, &s.SourceTitle, &s.Subject, &s.Attempt, &s.HeldOn, &s.Policy, &s.AbsentRule, &s.Status, &s.Sitting, &s.Marked, &s.SectionIDs, &subject); err != nil {
			return err
		}
		if slices.ContainsFunc(s.SectionIDs, func(sec string) bool {
			t := policy.Target{SectionID: sec, SubjectID: subject}
			return policy.Decide(actor, policy.AssessmentEdit, t) == policy.Full || policy.Decide(actor, policy.EvidenceEnter, t) == policy.Full
		}) {
			out = append(out, s)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	return c.JSON(out)
}

// Candidate is a student sitting the re-exam: why, how the original went,
// how the re-exam went, and the subject result before and after it counts.
type Candidate struct {
	Sitter
	ByHand bool    `json:"byHand"`
	Retake Sitter  `json:"retake"`
	Before Outcome `json:"before"`
	After  Outcome `json:"after"`
}

// Outcome is a subject result as the scheme works it out.
type Outcome struct {
	State string `json:"state"`
	Pct   string `json:"pct"`
	Grade string `json:"grade"`
}

// Detail is a re-exam with its candidates and the preview of its policy.
type Detail struct {
	Summary
	Candidates []Candidate `json:"candidates"`
	Changes    struct {
		Up      int `json:"up"`
		Down    int `json:"down"`
		Same    int `json:"same"`
		Pending int `json:"pending"`
	} `json:"changes"`
	CanApprove bool `json:"canApprove"`
	CanPlan    bool `json:"canPlan"`
}

func detail(c fiber.Ctx, tx pgx.Tx, id string) (Detail, error) {
	ctx := c.Context()
	var d Detail
	if !records.UUIDShape.MatchString(id) {
		return d, problem.New(http.StatusNotFound, "reexam.not_found", "No re-exam has this id.")
	}
	s, err := scanSummary(tx.QueryRow(ctx, `SELECT `+summaryCols+summaryFrom+` WHERE x.assessment_id = $1::uuid`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return d, problem.New(http.StatusNotFound, "reexam.not_found", "No re-exam has this id.")
	}
	if err != nil {
		return d, err
	}
	d.Summary = s
	src, err := loadSource(ctx, tx, s.SourceID)
	if err != nil {
		return d, err
	}
	secs, err := plannable(c, tx, source{sections: s.SectionIDs, subjectID: src.subjectID})
	if err != nil {
		return d, err
	}
	d.CanPlan = true
	actor, err := tenant.Teaching(c)
	if err != nil {
		return d, err
	}
	d.CanApprove = policy.Decide(actor, policy.AssessmentLock, policy.Target{SubjectID: src.subjectID}) == policy.Full
	orig, err := sitters(ctx, tx, src.id, src.yearID, secs)
	if err != nil {
		return d, err
	}
	again, err := sitters(ctx, tx, id, src.yearID, secs)
	if err != nil {
		return d, err
	}
	rows, err := tx.Query(ctx, `SELECT student_id::text, reason, added_by_hand FROM reexam_candidates WHERE assessment_id = $1::uuid`, id)
	if err != nil {
		return d, err
	}
	type cand struct {
		reason string
		hand   bool
	}
	who := map[string]cand{}
	for rows.Next() {
		var sid string
		var x cand
		if err := rows.Scan(&sid, &x.reason, &x.hand); err != nil {
			return d, err
		}
		who[sid] = x
	}
	if err := rows.Err(); err != nil {
		return d, err
	}
	var keys []results.Key
	for _, o := range orig {
		w, ok := who[o.StudentID]
		if !ok {
			continue
		}
		o.Reason, o.Suggested = w.reason, true
		cd := Candidate{Sitter: o, ByHand: w.hand}
		if i := slices.IndexFunc(again, func(x Sitter) bool { return x.StudentID == o.StudentID }); i >= 0 {
			cd.Retake = again[i]
		}
		d.Candidates = append(d.Candidates, cd)
		keys = append(keys, results.Key{StudentID: o.StudentID, PeriodID: src.periodID, SubjectID: src.subjectID})
	}
	if d.Candidates == nil {
		d.Candidates = []Candidate{}
	}
	// The result before (without this re-exam) and after (with it, under
	// its policy), worked out now; nothing is stored.
	schemes, err := results.LoadSchemes(ctx, tx)
	if err != nil {
		return d, err
	}
	before, err := results.LoadAssuming(ctx, tx, keys, map[string]results.Retake{id: {Policy: "separate", AbsentRule: "keep"}})
	if err != nil {
		return d, err
	}
	after, err := results.LoadAssuming(ctx, tx, keys, map[string]results.Retake{id: {Policy: s.Policy, AbsentRule: s.AbsentRule}})
	if err != nil {
		return d, err
	}
	b := results.Evaluate(keys, before, schemes, nil)
	a := results.Evaluate(keys, after, schemes, nil)
	for i := range d.Candidates {
		d.Candidates[i].Before = Outcome{State: b[i].Result.State, Pct: trim(b[i].Result.Pct), Grade: b[i].Result.Grade}
		d.Candidates[i].After = Outcome{State: a[i].Result.State, Pct: trim(a[i].Result.Pct), Grade: a[i].Result.Grade}
		x, y := d.Candidates[i].Before, d.Candidates[i].After
		switch {
		case y.State != "complete":
			d.Changes.Pending++
		case x.State == "complete" && number(y.Pct) > number(x.Pct):
			d.Changes.Up++
		case x.State == "complete" && number(y.Pct) < number(x.Pct):
			d.Changes.Down++
		case x.State != "complete":
			d.Changes.Up++
		default:
			d.Changes.Same++
		}
	}
	return d, nil
}

func number(s string) float64 {
	var f float64
	for i, r := range s {
		if r == '.' {
			frac, scale := 0.0, 0.1
			for _, q := range s[i+1:] {
				frac += float64(q-'0') * scale
				scale /= 10
			}
			return f + frac
		}
		f = f*10 + float64(r-'0')
	}
	return f
}

func get(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	d, err := detail(c, tx, c.Params("id"))
	if err != nil {
		return err
	}
	return c.JSON(d)
}

type ruleIn struct {
	Policy     string `json:"policy"`
	AbsentRule string `json:"absentRule"`
}

// setPolicy changes how the re-exam counts. Once approved or applied, a
// change sends it back to draft (results stop counting it) for a new
// preview and approval.
func setPolicy(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	d, err := detail(c, tx, c.Params("id"))
	if err != nil {
		return err
	}
	var in ruleIn
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if err := validRule(in.Policy, in.AbsentRule); err != nil {
		return err
	}
	if in.Policy == d.Policy && in.AbsentRule == d.AbsentRule {
		return c.JSON(d)
	}
	if _, err := tx.Exec(ctx, `UPDATE reexams SET policy = $2, absent_rule = $3, status = 'draft', approved_by = NULL, approved_at = NULL, applied_by = NULL, applied_at = NULL, updated_at = now()
		WHERE assessment_id = $1::uuid`, d.ID, in.Policy, in.AbsentRule); err != nil {
		return err
	}
	if d.Status == "applied" {
		if err := stale.Assessment(ctx, tx, d.SourceID); err != nil {
			return err
		}
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "reexams", EntityID: d.ID, Before: map[string]any{"policy": d.Policy, "absentRule": d.AbsentRule, "status": d.Status},
		After: map[string]any{"policy": in.Policy, "absentRule": in.AbsentRule, "status": "draft"}}); err != nil {
		return err
	}
	out, err := detail(c, tx, d.ID)
	if err != nil {
		return err
	}
	return c.JSON(out)
}

// step approves the policy, or applies an approved one: results are then
// worked out again with the re-exam counted (B7.3 to B7.4). Only those who
// lock assessments (administrators and coordinators) do either.
func step(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	d, err := detail(c, tx, c.Params("id"))
	if err != nil {
		return err
	}
	if !d.CanApprove {
		return problem.New(http.StatusForbidden, "auth.forbidden", "Only administrators and coordinators approve and apply re-exam results.")
	}
	m, _ := tenant.MemberFrom(c)
	switch c.Params("step") {
	case "approve":
		if d.Status != "draft" {
			return problem.New(http.StatusConflict, "reexam.not_draft", "This policy is already approved.")
		}
		_, err = tx.Exec(ctx, `UPDATE reexams SET status = 'approved', approved_by = $2, approved_at = now(), updated_at = now() WHERE assessment_id = $1::uuid`, d.ID, m.UserID)
	case "apply":
		if d.Status != "approved" {
			return problem.New(http.StatusConflict, "reexam.not_approved", "Approve the policy before applying it.")
		}
		if d.Marked < d.Sitting {
			return problem.Invalid(api.FieldError{Field: "marks", Code: "incomplete", Message: "Enter a mark or an absence for every student who sits the re-exam first."})
		}
		if _, err = tx.Exec(ctx, `UPDATE reexams SET status = 'applied', applied_by = $2, applied_at = now(), updated_at = now() WHERE assessment_id = $1::uuid`, d.ID, m.UserID); err == nil {
			err = stale.Assessment(ctx, tx, d.SourceID)
		}
	default:
		return problem.New(http.StatusNotFound, "route.not_found", "No such step.")
	}
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: c.Params("step"), Entity: "reexams", EntityID: d.ID,
		After: map[string]any{"policy": d.Policy, "absentRule": d.AbsentRule, "up": d.Changes.Up, "down": d.Changes.Down, "same": d.Changes.Same, "pending": d.Changes.Pending}}); err != nil {
		return err
	}
	out, err := detail(c, tx, d.ID)
	if err != nil {
		return err
	}
	return c.JSON(out)
}

// trim drops a decimal's needless zeros: 30.00 is 30, 44.50 is 44.5.
func trim(s string) string {
	if !strings.Contains(s, ".") {
		return s
	}
	return strings.TrimSuffix(strings.TrimRight(s, "0"), ".")
}
