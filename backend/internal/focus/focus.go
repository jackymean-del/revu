// Package focus is what an administrator puts in front of everyone: which
// terms and exams teachers see and work on now, and which term and exam
// every picker opens on. Hiding last term's exams means no question is
// written, and no mark entered, under the wrong one.
package focus

import (
	"context"
	"encoding/json"
	"slices"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Focus is kept in the organisation's settings, under "exams".
type Focus struct {
	HiddenPeriods       []string `json:"hiddenPeriods"`       // terms teachers do not see
	HiddenAssessments   []string `json:"hiddenAssessments"`   // exams teachers do not see
	DefaultPeriodID     string   `json:"defaultPeriodId"`     // the term pickers open on
	DefaultAssessmentID string   `json:"defaultAssessmentId"` // the exam pickers open on
}

// Load reads the organisation's focus; with none set, nothing is hidden.
func Load(ctx context.Context, tx pgx.Tx) (Focus, error) {
	f := Focus{HiddenPeriods: []string{}, HiddenAssessments: []string{}}
	var raw []byte
	if err := tx.QueryRow(ctx, `SELECT settings -> 'exams' FROM orgs WHERE id = app_org_id()`).Scan(&raw); err != nil {
		return f, err
	}
	if len(raw) > 0 && string(raw) != "null" {
		_ = json.Unmarshal(raw, &f)
	}
	if f.HiddenPeriods == nil {
		f.HiddenPeriods = []string{}
	}
	if f.HiddenAssessments == nil {
		f.HiddenAssessments = []string{}
	}
	return f, nil
}

// SeesHidden says whether the person sees what is hidden from teachers:
// administrators, coordinators and principals do.
func SeesHidden(a policy.Actor) bool {
	return slices.ContainsFunc(a.Roles, func(r policy.RoleIn) bool {
		return r.Role == policy.Admin || r.Role == policy.Coordinator || r.Role == policy.Principal
	})
}

// Hidden says whether an exam, in its term, is hidden from teachers now.
func (f Focus) Hidden(assessmentID, periodID string) bool {
	return slices.Contains(f.HiddenAssessments, assessmentID) || slices.Contains(f.HiddenPeriods, periodID)
}

// Routes: anyone may read the focus; an administrator sets it.
func Routes(g fiber.Router) {
	g.Get("/exam-focus", get)
	g.Put("/exam-focus", put)
}

func get(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	f, err := Load(c.Context(), tx)
	if err != nil {
		return err
	}
	return c.JSON(f)
}

func put(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	actor, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	if err := policy.Check(actor, policy.StructureWrite, policy.Target{}); err != nil {
		return err
	}
	var in Focus
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	var f records.Fields
	ids := func(list []string, field string) []string {
		out := []string{}
		for _, id := range list {
			if !records.UUIDShape.MatchString(id) {
				f.Add(field, "unknown", "Not an id.")
				return out
			}
			if !slices.Contains(out, id) {
				out = append(out, id)
			}
		}
		return out
	}
	in.HiddenPeriods = ids(in.HiddenPeriods, "hiddenPeriods")
	in.HiddenAssessments = ids(in.HiddenAssessments, "hiddenAssessments")
	for _, d := range []struct{ v, field string }{{in.DefaultPeriodID, "defaultPeriodId"}, {in.DefaultAssessmentID, "defaultAssessmentId"}} {
		if d.v != "" && !records.UUIDShape.MatchString(d.v) {
			f.Add(d.field, "unknown", "Not an id.")
		}
	}
	if len(f) > 0 {
		return problem.Invalid(f...)
	}
	raw, _ := json.Marshal(in)
	if _, err := tx.Exec(c.Context(), `UPDATE orgs SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{exams}', $1::jsonb) WHERE id = app_org_id()`, string(raw)); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "exam_focus", After: in}); err != nil {
		return err
	}
	return c.JSON(in)
}
