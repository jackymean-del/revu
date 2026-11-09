package schemes

import (
	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/results"
	"github.com/jackymean-del/revu/internal/scheme"
	"github.com/jackymean-del/revu/internal/tenant"
)

type dryCell struct {
	State  string `json:"state"`
	Reason string `json:"reason,omitempty"`
	Value  string `json:"value,omitempty"`
	Max    string `json:"max,omitempty"`
	Pct    string `json:"pct,omitempty"`
	Grade  string `json:"grade,omitempty"`
}

type dryRow struct {
	StudentID string   `json:"studentId"`
	Name      string   `json:"name"`
	Before    *dryCell `json:"before,omitempty"`
	After     *dryCell `json:"after,omitempty"`
	Changed   bool     `json:"changed"`
	Delta     string   `json:"delta,omitempty"`
}

type dryRunOut struct {
	Current    *api.SchemeRef `json:"current,omitempty"`
	Students   int            `json:"students"`
	Changed    int            `json:"changed"`
	NowBlocked int            `json:"nowBlocked"`
	Rows       []dryRow       `json:"rows"`
}

func cellOf(o results.Outcome) *dryCell {
	if o.Skip {
		return nil
	}
	r := o.Result
	return &dryCell{State: r.State, Reason: r.Reason, Value: r.Value, Max: r.Max, Pct: r.Pct, Grade: r.Grade}
}

// dryRun works out a section's results under this version and under the
// scheme in force, in memory, and lists the difference. Nothing is saved
// (AT-v3-08). A role that sees result counts only gets the counts.
func dryRun(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if err := mayWrite(c); err != nil {
		return err
	}
	ctx := c.Context()
	f, err := load(ctx, tx, c.Params("id"))
	if err != nil {
		return err
	}
	if ps := f.Definition.Validate(); len(ps) > 0 {
		return invalid(ps)
	}
	var in api.DryRunInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if !records.UUIDShape.MatchString(in.SubjectId) {
		return problem.Invalid(api.FieldError{Field: "subjectId", Code: "unknown", Message: "Choose a subject."})
	}
	s, err := results.LoadSection(ctx, tx, in.SectionId, in.PeriodId)
	if err != nil {
		return err
	}
	actor, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	full := policy.Decide(actor, policy.ResultsRead, policy.Target{BranchID: s.BranchID, SectionID: s.ID, SubjectID: in.SubjectId}) == policy.Full

	students, err := results.Students(ctx, tx, s, in.PeriodId, in.SubjectId)
	if err != nil {
		return err
	}
	names := map[string]string{}
	var keys []results.Key
	for _, st := range students {
		if st.Takes || st.ChoiceMissing {
			keys = append(keys, results.Key{StudentID: st.ID, PeriodID: in.PeriodId, SubjectID: in.SubjectId})
			names[st.ID] = st.Name
		}
	}
	schemes, err := results.LoadSchemes(ctx, tx)
	if err != nil {
		return err
	}
	inputs, err := results.Load(ctx, tx, keys)
	if err != nil {
		return err
	}
	out := dryRunOut{Rows: []dryRow{}}
	if cur, ok := schemes.For(s.LevelID, in.PeriodId, in.SubjectId); ok {
		out.Current = &api.SchemeRef{Id: cur.ID, Name: cur.Name, Version: cur.Version}
	}
	trial := results.Applied{ID: f.ID, FamilyID: f.FamilyID, Name: f.Name, Version: f.Version, Definition: f.Definition}
	before := results.Evaluate(keys, inputs, schemes, nil)
	after := results.Evaluate(keys, inputs, schemes, &trial)
	for i, k := range keys {
		b, a := cellOf(before[i]), cellOf(after[i])
		if a == nil && b == nil {
			continue
		}
		out.Students++
		row := dryRow{StudentID: k.StudentID, Name: names[k.StudentID], Before: b, After: a}
		row.Changed = b == nil || a == nil || *a != *b
		if row.Changed {
			out.Changed++
		}
		if a != nil && a.State == "blocked" && (b == nil || b.State != "blocked") {
			out.NowBlocked++
		}
		if a != nil && b != nil && a.Pct != "" && b.Pct != "" {
			row.Delta = scheme.Delta(b.Pct, a.Pct)
		}
		if full {
			out.Rows = append(out.Rows, row)
		}
	}
	return c.JSON(out)
}
