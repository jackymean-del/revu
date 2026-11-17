// Package analysis serves the class summary, students by range and the
// reteach list (pilot P0.6; blueprint v23 B8.6 and B8.7). Every number
// comes from stored results or from internal/scheme; nothing here does
// arithmetic on marks. What a person sees follows the permission matrix:
// a teacher sees their own subjects, a class teacher and administrators
// the whole section, coordinators and principals counts only.
package analysis

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/results"
	"github.com/jackymean-del/revu/internal/scheme"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Routes serves the analysis screens.
func Routes(g fiber.Router, now func() time.Time) {
	if now == nil {
		now = time.Now
	}
	g.Get("/analysis/settings", getSettings)
	g.Put("/analysis/settings", putSettings)
	g.Get("/analysis/summary", func(c fiber.Ctx) error { return summary(c, now()) })
	g.Get("/analysis/summary.xlsx", func(c fiber.Ctx) error { return exportPack(c, now()) })
	g.Get("/analysis/assessment", assessment)
	g.Put("/analysis/reteach", putReteach)
}

// Settings are the institution's analysis thresholds.
type Settings struct {
	MasteryPct      string   `json:"masteryPct"`      // below this share of a section's marks, a student needs another look
	ReteachSharePct string   `json:"reteachSharePct"` // a section is listed when this share of students is below mastery
	MinEvidence     int      `json:"minEvidence"`     // fewer marks than this and nothing is listed
	Ranges          []string `json:"ranges"`          // boundaries for students by range, rising
	Lists           []Rule   `json:"lists"`           // criteria lists, checked in order; the first a student meets wins
	Signoff         []string `json:"signoff"`         // who signs the printed pack; empty for the class teacher and principal
}

// Rule is one criteria list (decision D32): a student goes on it when any
// (or all, as Match says) of its conditions hold. The list shows the
// subjects that put the student there.
type Rule struct {
	Name     string      `json:"name"`
	Action   string      `json:"action"` // undertaking, warning, retest or support
	Criteria []Criterion `json:"criteria"`
	Match    string      `json:"match"` // any or all
	// The first condition, and the threshold below which a subject is shown
	// beside the student, worked out from the conditions; kept for older
	// readers of the settings.
	On           string `json:"on"`
	BelowPct     string `json:"belowPct"`
	AtLeast      int    `json:"atLeast"`
	ShowBelowPct string `json:"showBelowPct"`
}

// Criterion is one condition of a list: "at least AtLeast subjects below
// BelowPct" when On is subjects, or "overall below BelowPct" when On is
// overall.
type Criterion struct {
	On       string `json:"on"`
	AtLeast  int    `json:"atLeast"`
	BelowPct string `json:"belowPct"`
}

// normal gives a rule its conditions (an older rule has its one in the
// flat fields), and works out the flat fields from them: a subject shows
// beside the student when it is below the highest subject threshold, or,
// with only an overall condition, below that.
func (r Rule) normal() Rule {
	if len(r.Criteria) == 0 {
		r.Criteria = []Criterion{{On: r.On, AtLeast: r.AtLeast, BelowPct: r.BelowPct}}
	}
	if r.Match != "all" {
		r.Match = "any"
	}
	first := r.Criteria[0]
	r.On, r.AtLeast, r.BelowPct = first.On, first.AtLeast, first.BelowPct
	show := ""
	for _, c := range r.Criteria {
		if c.On == "subjects" && (show == "" || scheme.Below(show, c.BelowPct)) {
			show = c.BelowPct
		}
	}
	if show == "" {
		show = first.BelowPct
	}
	r.ShowBelowPct = show
	return r
}

// DefaultSettings are used until an institution changes them.
func DefaultSettings() Settings {
	return Settings{MasteryPct: "40", ReteachSharePct: "30", MinEvidence: 5, Ranges: []string{"40", "50", "60", "70", "80", "90"},
		Lists: []Rule{
			Rule{Name: "Undertaking", Action: "undertaking", Criteria: []Criterion{{On: "subjects", AtLeast: 3, BelowPct: "60"}}}.normal(),
			Rule{Name: "Verbal warning", Action: "warning", Criteria: []Criterion{{On: "subjects", AtLeast: 1, BelowPct: "70"}}}.normal(),
		}, Signoff: []string{}}
}

var pctShape = regexp.MustCompile(`^\d{1,3}(\.\d{1,2})?$`)

func validPct(s string) bool {
	if !pctShape.MatchString(s) {
		return false
	}
	return scheme.InRange(s, "0", "100")
}

func loadSettings(ctx context.Context, tx pgx.Tx) (Settings, error) {
	var b pgx.Batch
	get := queueSettings(&b)
	if err := results.Send(ctx, tx, &b); err != nil {
		return Settings{}, err
	}
	return get(), nil
}

// queueSettings queues reading the settings, or the defaults.
func queueSettings(b *pgx.Batch) func() Settings {
	s := DefaultSettings()
	b.Queue(`SELECT settings -> 'analysis' FROM orgs WHERE id = app_org_id()`).QueryRow(func(r pgx.Row) error {
		var raw []byte
		if err := r.Scan(&raw); err != nil {
			return err
		}
		if len(raw) > 0 && string(raw) != "null" {
			_ = json.Unmarshal(raw, &s)
		}
		for i := range s.Lists {
			s.Lists[i] = s.Lists[i].normal()
		}
		return nil
	})
	return func() Settings { return s }
}

func getSettings(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	s, err := loadSettings(c.Context(), tx)
	if err != nil {
		return err
	}
	return c.JSON(s)
}

func putSettings(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	a, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	if err := policy.Check(a, policy.SchemeWrite, policy.Target{}); err != nil {
		return err
	}
	var in Settings
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	var f records.Fields
	if !validPct(in.MasteryPct) {
		f.Add("masteryPct", "invalid", "Give a percentage from 0 to 100.")
	}
	if !validPct(in.ReteachSharePct) {
		f.Add("reteachSharePct", "invalid", "Give a percentage from 0 to 100.")
	}
	if in.MinEvidence < 1 || in.MinEvidence > 100 {
		f.Add("minEvidence", "invalid", "Give a number of marks from 1 to 100.")
	}
	if len(in.Ranges) == 0 || len(in.Ranges) > 12 {
		f.Add("ranges", "invalid", "Give 1 to 12 boundaries.")
	}
	for i, r := range in.Ranges {
		if !validPct(r) || r == "0" || r == "100" || i > 0 && !scheme.InRange(in.Ranges[i-1], "0", r) {
			f.Add("ranges", "invalid", "Boundaries are percentages between 0 and 100, rising.")
			break
		}
	}
	if len(in.Signoff) > 6 || slices.ContainsFunc(in.Signoff, func(x string) bool { return strings.TrimSpace(x) == "" || len(x) > 40 }) {
		f.Add("signoff", "invalid", "Give up to 6 sign-off lines of up to 40 characters.")
	}
	if len(in.Lists) > 8 {
		f.Add("lists", "invalid", "Give at most 8 lists.")
	}
	for _, r := range in.Lists {
		if strings.TrimSpace(r.Name) == "" || len(r.Name) > 60 {
			f.Add("lists", "invalid", "Each list needs a name of up to 60 characters.")
			break
		}
		if !slices.Contains([]string{"undertaking", "warning", "retest", "support"}, r.Action) {
			f.Add("lists", "invalid", "Each list needs an action.")
			break
		}
		crit := r.Criteria
		if len(crit) == 0 {
			crit = []Criterion{{On: r.On, AtLeast: r.AtLeast, BelowPct: r.BelowPct}}
		}
		bad := len(crit) > 6
		for _, c := range crit {
			if !slices.Contains([]string{"subjects", "overall"}, c.On) || !validPct(c.BelowPct) || c.On == "subjects" && (c.AtLeast < 1 || c.AtLeast > 30) {
				bad = true
			}
		}
		if bad {
			f.Add("lists", "invalid", "Each list has 1 to 6 conditions, each with a percentage from 0 to 100 and, for subjects, a count from 1 to 30.")
			break
		}
	}
	if len(f) > 0 {
		return problem.Invalid(f...)
	}
	for i := range in.Lists {
		in.Lists[i] = in.Lists[i].normal()
	}
	raw, _ := json.Marshal(in)
	if _, err := tx.Exec(c.Context(), `UPDATE orgs SET settings = jsonb_set(settings, '{analysis}', $1::jsonb) WHERE id = app_org_id()`, string(raw)); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "analysis_settings", After: in}); err != nil {
		return err
	}
	return c.JSON(in)
}

// Part is one entry column of an assessment.
type Part struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Max  string `json:"max"`
	Main bool   `json:"main"`
}

// Item is one paper section of the reteach list.
type Item struct {
	PartID   string         `json:"partId"`
	Name     string         `json:"name"`
	Max      string         `json:"max"`
	Mastery  scheme.Mastery `json:"mastery"`
	Students []string       `json:"students"` // names of those below, in roll order
	Status   string         `json:"status,omitempty"`
	FollowUp *FollowUp      `json:"followUp,omitempty"`
}

// FollowUp is the same paper section in the next assessment that has it.
type FollowUp struct {
	AssessmentID string `json:"assessmentId"`
	Title        string `json:"title"`
	SharePct     string `json:"sharePct,omitempty"`
	Trend        string `json:"trend,omitempty"` // improved, unchanged or worse; empty with too little evidence
}

// Reteach is the reteach list of an assessment for a section.
type Reteach struct {
	Available bool   `json:"available"`
	Reason    string `json:"reason,omitempty"` // total_marks or one_section
	Items     []Item `json:"items"`
}

// StudentScore is one student's result in the assessment.
type StudentScore struct {
	ID     string       `json:"id"`
	Name   string       `json:"name"`
	RollNo string       `json:"rollNo,omitempty"`
	Score  scheme.Score `json:"score"`
}

// AssessmentView is one assessment for one section.
type AssessmentView struct {
	ID        string         `json:"id"`
	Title     string         `json:"title"`
	Kind      string         `json:"kind"`
	EntryMode string         `json:"entryMode"`
	HeldOn    string         `json:"heldOn,omitempty"`
	Parts     []Part         `json:"parts"`
	Students  []StudentScore `json:"students"`
	Reteach   Reteach        `json:"reteach"`
	Settings  Settings       `json:"settings"`
}

type reteachIn struct {
	AssessmentID string `json:"assessmentId"`
	SectionID    string `json:"sectionId"`
	PartID       string `json:"partId"`
	Status       string `json:"status"` // planned, done, not_needed, or empty to clear
}

func putReteach(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	var in reteachIn
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if !slices.Contains([]string{"", "planned", "done", "not_needed"}, in.Status) {
		return problem.Invalid(api.FieldError{Field: "status", Code: "unknown", Message: "Choose planned, done or not needed."})
	}
	for _, id := range []string{in.AssessmentID, in.SectionID, in.PartID} {
		if !records.UUIDShape.MatchString(id) {
			return problem.New(http.StatusNotFound, "assessment.not_found", "No such reteach item.")
		}
	}
	a, err := loadAssessment(ctx, tx, in.AssessmentID)
	if errors.Is(err, pgx.ErrNoRows) {
		return problem.New(http.StatusNotFound, "assessment.not_found", "No assessment has this id.")
	}
	if err != nil {
		return err
	}
	if !slices.ContainsFunc(a.parts, func(p Part) bool { return p.ID == in.PartID && p.Main }) {
		return problem.New(http.StatusNotFound, "assessment.not_found", "That paper section is not part of this assessment.")
	}
	sec, err := results.LoadSection(ctx, tx, in.SectionID, a.period)
	if err != nil {
		return err
	}
	actor, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	if err := policy.Check(actor, policy.ResultsRead, policy.Target{BranchID: sec.BranchID, SectionID: sec.ID, SubjectID: a.subject}); err != nil {
		return err
	}
	m, _ := tenant.MemberFrom(c)
	if in.Status == "" {
		_, err = tx.Exec(ctx, `DELETE FROM reteach_marks WHERE assessment_id = $1::uuid AND section_id = $2::uuid AND part_id = $3::uuid`, in.AssessmentID, in.SectionID, in.PartID)
	} else {
		_, err = tx.Exec(ctx, `
			INSERT INTO reteach_marks (org_id, assessment_id, section_id, part_id, status, set_by) VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6)
			ON CONFLICT (assessment_id, section_id, part_id) DO UPDATE SET status = EXCLUDED.status, set_by = EXCLUDED.set_by, set_at = now()`,
			m.OrgID, in.AssessmentID, in.SectionID, in.PartID, in.Status, m.UserID)
	}
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "reteach_marks", EntityID: in.AssessmentID,
		After: map[string]string{"sectionId": in.SectionID, "partId": in.PartID, "status": in.Status}}); err != nil {
		return err
	}
	return c.JSON(in)
}
