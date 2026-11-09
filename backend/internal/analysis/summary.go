package analysis

import (
	"fmt"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/reports"
	"github.com/jackymean-del/revu/internal/results"
	"github.com/jackymean-del/revu/internal/scheme"
	"github.com/jackymean-del/revu/internal/tenant"
)

// The standard analysis pack (blueprint v23 B8.6.1): the aggregate, the
// band counts and the criteria lists for a section in a period, on the
// term result of each subject or on one component of it (decision D33).

// Band is how many students have one band.
type Band struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

// SubjectSummary is one subject across the section.
type SubjectSummary struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Access      string `json:"access"` // full or counts
	Max         string `json:"max,omitempty"`
	Taking      int    `json:"taking"`
	Complete    int    `json:"complete"`
	Provisional int    `json:"provisional"`
	Blocked     int    `json:"blocked"`
	NotAssessed int    `json:"notAssessed"`
	Average     string `json:"average,omitempty"` // of percentages
	Median      string `json:"median,omitempty"`
	Highest     string `json:"highest,omitempty"`
	Lowest      string `json:"lowest,omitempty"`
	Passed      int    `json:"passed"`
	Failed      int    `json:"failed"`
	Bands       []Band `json:"bands"`
}

// Cell is one student's result in one subject on the chosen basis.
type Cell struct {
	State string `json:"state"` // complete, provisional, blocked, not_assessed
	Value string `json:"value,omitempty"`
	Max   string `json:"max,omitempty"`
	Pct   string `json:"pct,omitempty"`
	Band  string `json:"band,omitempty"`
}

// StudentRow is one student across the subjects the viewer may see.
type StudentRow struct {
	ID          string          `json:"id"`
	Name        string          `json:"name"`
	RollNo      string          `json:"rollNo,omitempty"`
	AdmissionNo string          `json:"admissionNo,omitempty"`
	SectionID   string          `json:"sectionId"`
	Section     string          `json:"section"` // such as Class 10 A
	Subjects    map[string]Cell `json:"subjects"`
	Total       *Cell           `json:"total,omitempty"` // only when every subject is visible
}

// ListEntry is one student on a criteria list.
type ListEntry struct {
	StudentID string   `json:"studentId"`
	Name      string   `json:"name"`
	RollNo    string   `json:"rollNo,omitempty"`
	Section   string   `json:"section"`
	TotalPct  string   `json:"totalPct,omitempty"`
	Subjects  []string `json:"subjects"` // ids of the subjects below the list's display threshold
}

// List is one criteria list and who is on it.
type List struct {
	Rule     Rule        `json:"rule"`
	Students []ListEntry `json:"students"`
}

// Basis is a choice of what the analysis runs on.
type Basis struct {
	Code string `json:"code"` // empty for the term result
	Name string `json:"name"`
}

// Summary is a section's analysis pack for a period.
type Summary struct {
	Access   string            `json:"access"` // full, partial or counts
	Basis    string            `json:"basis"`
	Bases    []Basis           `json:"bases"`
	Subjects []SubjectSummary  `json:"subjects"`
	Students []StudentRow      `json:"students"`
	Lists    []List            `json:"lists"`
	Bands    []scheme.Band     `json:"bands"` // the band scale used for totals, when the section has one
	Settings Settings          `json:"settings"`
	Words    map[string]string `json:"-"`
	Title    string            `json:"-"`
	Signoff  []string          `json:"-"` // who signs the printed pack
}

func summary(c fiber.Ctx, now time.Time) error {
	s, err := build(c, now)
	if err != nil {
		return err
	}
	return c.JSON(s)
}

// cellOf is a subject's result on the basis: the term result, or the
// component with that code, as the engine stored it.
func cellOf(x reports.Subject, basis string) (Cell, bool) {
	if basis == "" {
		return Cell{State: x.State, Value: x.Value, Max: x.Max, Pct: x.Pct, Band: x.Grade}, true
	}
	for _, p := range x.Components {
		if p.Code != basis {
			continue
		}
		cell := Cell{State: p.State, Value: p.Value, Max: p.Max, Pct: p.Pct}
		if cell.Pct == "" && cell.Value != "" {
			cell.Pct = scheme.Pct(p.Value, p.Max, 2)
		}
		if cell.State == "left_out" {
			cell.State = "not_assessed"
		}
		return cell, true
	}
	return Cell{}, false
}

// sectionIDs are the sections asked for: sectionIds as a comma list (up to
// 60, the same year), or one sectionId.
func sectionIDs(c fiber.Ctx) ([]string, error) {
	raw := c.Query("sectionIds")
	if raw == "" {
		raw = c.Query("sectionId")
	}
	var out []string
	for _, id := range strings.Split(raw, ",") {
		if id = strings.TrimSpace(id); id != "" && !slices.Contains(out, id) {
			out = append(out, id)
		}
	}
	if len(out) == 0 || len(out) > 60 {
		return nil, problem.Invalid(api.FieldError{Field: "sectionIds", Code: "invalid", Message: "Choose from 1 to 60 sections."})
	}
	return out, nil
}

// row is one student's facts with the section they are in.
type row struct {
	sec  results.Section
	name string // the section as people say it, such as Class 10 A
	f    reports.Facts
}

func build(c fiber.Ctx, now time.Time) (Summary, error) {
	var out Summary
	tx, err := tenant.Tx(c)
	if err != nil {
		return out, err
	}
	ctx := c.Context()
	periodID := c.Query("periodId")
	ids, err := sectionIDs(c)
	if err != nil {
		return out, err
	}

	// The sections, each checked to be in the period's year, in one round trip.
	var b pgx.Batch
	gets := make([]func() (results.Section, error), len(ids))
	for i, id := range ids {
		gets[i] = results.QueueSection(&b, id, periodID)
	}
	if err := results.Send(ctx, tx, &b); err != nil {
		return out, err
	}
	secs := make([]results.Section, len(ids))
	for i, get := range gets {
		if secs[i], err = get(); err != nil {
			return out, err
		}
	}
	actor, err := tenant.Teaching(c)
	if err != nil {
		return out, err
	}

	// Everything else in one more round trip, however many sections (D30).
	b = pgx.Batch{}
	gathered := make([]*reports.Gathered, len(secs))
	for i, s := range secs {
		gathered[i] = reports.QueueGather(&b, s, periodID)
	}
	getConfig := reports.QueueTemplateConfig(&b)
	getSettings := queueSettings(&b)
	if err := results.Send(ctx, tx, &b); err != nil {
		return out, err
	}
	cfg, err := getConfig()
	if err != nil {
		return out, err
	}
	settings := getSettings()
	var rows []row
	var legends [][]scheme.Band
	sameScale := true
	for i, g := range gathered {
		for _, f := range g.Build(nil, cfg, now) {
			rows = append(rows, row{sec: secs[i], name: strings.TrimSpace(f.Level + " " + f.Section), f: f})
			if len(f.Legends) != 1 {
				sameScale = false
			} else if len(legends) == 0 || !slices.Equal(legends[0], f.Legends[0].Bands) {
				legends = append(legends, f.Legends[0].Bands)
			}
		}
	}

	// The subjects in report order (first seen across the sections), the
	// bases on offer, and what the viewer may see of each subject in each
	// section: the matrix decides per section, so a teacher sees in full
	// only the sections and subjects they teach.
	var order []reports.Subject
	seen := map[string]bool{}
	bases := []Basis{{Code: "", Name: "Term result"}}
	seenBasis := map[string]bool{}
	access := map[[2]string]policy.Access{}
	for _, r := range rows {
		for _, s := range r.f.Subjects {
			if !seen[s.ID] {
				seen[s.ID] = true
				order = append(order, s)
			}
			for _, p := range s.Components {
				if !seenBasis[p.Code] {
					seenBasis[p.Code] = true
					bases = append(bases, Basis{Code: p.Code, Name: p.Name})
				}
			}
			k := [2]string{r.sec.ID, s.ID}
			if _, ok := access[k]; !ok {
				access[k] = policy.Decide(actor, policy.ResultsRead, policy.Target{BranchID: r.sec.BranchID, SectionID: r.sec.ID, SubjectID: s.ID})
			}
		}
	}
	basis := c.Query("basis")
	if basis != "" && !seenBasis[basis] {
		return out, problem.New(http.StatusNotFound, "analysis.basis_unknown", "No subject here has that component.")
	}
	full, shown := 0, 0
	for _, a := range access {
		if a != policy.None {
			shown++
		}
		if a == policy.Full {
			full++
		}
	}
	if shown == 0 && len(access) > 0 {
		return out, problem.New(http.StatusForbidden, "auth.forbidden", "Your role does not show these results.")
	}
	out = Summary{Access: "counts", Basis: basis, Bases: bases, Subjects: []SubjectSummary{}, Students: []StudentRow{}, Lists: []List{},
		Bands: []scheme.Band{}, Settings: settings}
	switch {
	case full == len(access):
		out.Access = "full"
	case full > 0:
		out.Access = "partial"
	}
	// One band scale across the sections grades totals and components; with
	// several, only the term results carry a band.
	if sameScale && len(legends) == 1 {
		out.Bands = legends[0]
	}
	if len(rows) > 0 {
		out.Words = rows[0].f.Words
		out.Signoff = settings.Signoff
		if len(out.Signoff) == 0 {
			out.Signoff = []string{out.Words["person.class_teacher"], out.Words["person.principal"]}
		}
		var names []string
		for _, r := range rows {
			if !slices.Contains(names, r.name) {
				names = append(names, r.name)
			}
		}
		if len(names) > 4 {
			names = []string{fmt.Sprintf("%s to %s, %d %s", names[0], names[len(names)-1], len(names), strings.ToLower(out.Words["group.section"])+"s")}
		}
		out.Title = strings.Join(names, ", ") + ", " + rows[0].f.Period
	}

	band := func(cell Cell) Cell {
		if basis != "" && cell.Band == "" && len(out.Bands) > 0 && cell.Pct != "" {
			cell.Band = scheme.BandOf(cell.Pct, out.Bands)
		}
		return cell
	}
	for _, s := range order {
		sum := SubjectSummary{ID: s.ID, Name: s.Name, Access: "full", Bands: []Band{}}
		var pcts []string
		bands := map[string]int{}
		var labels []string
		maxes := map[string]bool{}
		found := false
		for _, r := range rows {
			a := access[[2]string{r.sec.ID, s.ID}]
			if a == policy.None {
				continue
			}
			for _, x := range r.f.Subjects {
				if x.ID != s.ID {
					continue
				}
				cell, has := cellOf(x, basis)
				if !has {
					continue
				}
				found = true
				if a != policy.Full {
					sum.Access = "counts"
				}
				cell = band(cell)
				sum.Taking++
				if cell.Max != "" {
					maxes[cell.Max] = true
				}
				switch cell.State {
				case "complete":
					sum.Complete++
					pcts = append(pcts, cell.Pct)
					if cell.Band != "" {
						if bands[cell.Band] == 0 {
							labels = append(labels, cell.Band)
						}
						bands[cell.Band]++
					}
					if basis == "" && x.Passed != nil {
						if *x.Passed {
							sum.Passed++
						} else {
							sum.Failed++
						}
					}
				case "provisional":
					sum.Provisional++
				case "blocked":
					sum.Blocked++
				default:
					sum.NotAssessed++
				}
			}
		}
		if !found || sum.Taking == 0 {
			continue // hidden here, or no component of this kind in this subject
		}
		if len(maxes) == 1 {
			for m := range maxes {
				sum.Max = m
			}
		}
		// Band counts follow the scale's order where there is one.
		if len(out.Bands) > 0 {
			slices.SortStableFunc(labels, func(a, b string) int { return bandIndex(out.Bands, a) - bandIndex(out.Bands, b) })
		}
		for _, l := range labels {
			sum.Bands = append(sum.Bands, Band{Label: l, Count: bands[l]})
		}
		if sum.Access == "full" {
			st := scheme.Describe(pcts, 2)
			sum.Average, sum.Highest, sum.Lowest = st.Average, st.Highest, st.Lowest
			sum.Median = scheme.Median(pcts, 2)
		} else {
			sum.Passed, sum.Failed = 0, 0
		}
		out.Subjects = append(out.Subjects, sum)
	}
	if full == 0 {
		return out, nil
	}

	lists := make([]List, len(settings.Lists))
	for i, r := range settings.Lists {
		lists[i] = List{Rule: r, Students: []ListEntry{}}
	}
	for _, r := range rows {
		st := StudentRow{ID: r.f.Student.ID, Name: r.f.Student.Name, RollNo: r.f.Student.RollNo, AdmissionNo: r.f.Student.AdmissionNo,
			SectionID: r.sec.ID, Section: r.name, Subjects: map[string]Cell{}}
		var lines []scheme.SubjectLine
		visible := 0
		for _, x := range r.f.Subjects {
			if access[[2]string{r.sec.ID, x.ID}] != policy.Full {
				continue
			}
			cell, has := cellOf(x, basis)
			if !has {
				continue
			}
			cell = band(cell)
			st.Subjects[x.ID] = cell
			lines = append(lines, scheme.SubjectLine{State: cell.State, Value: cell.Value, Max: cell.Max})
			visible++
		}
		if visible == 0 {
			continue // a section this viewer sees as counts only
		}
		if out.Access == "full" {
			o := scheme.Summarise(lines, 2)
			total := Cell{State: o.State, Value: o.Value, Max: o.Max, Pct: o.Pct}
			if o.Pct != "" && len(out.Bands) > 0 {
				total.Band = scheme.BandOf(o.Pct, out.Bands)
			}
			st.Total = &total
		}
		out.Students = append(out.Students, st)
		if i, entry, ok := place(st, out.Subjects, settings.Lists); ok {
			lists[i].Students = append(lists[i].Students, entry)
		}
	}
	out.Lists = lists
	return out, nil
}

func bandIndex(bands []scheme.Band, label string) int {
	for i, b := range bands {
		if b.Label == label {
			return i
		}
	}
	return len(bands)
}

// place finds the first list a student meets (decision D32). Only results
// with a number count; withheld and not assessed are never read as zero.
func place(row StudentRow, subjects []SubjectSummary, rules []Rule) (int, ListEntry, bool) {
	for i, r := range rules {
		met := false
		switch r.On {
		case "overall":
			met = row.Total != nil && scheme.Below(row.Total.Pct, r.BelowPct)
		default:
			n := 0
			for _, cell := range row.Subjects {
				if scheme.Below(cell.Pct, r.BelowPct) {
					n++
				}
			}
			met = n >= r.AtLeast
		}
		if !met {
			continue
		}
		entry := ListEntry{StudentID: row.ID, Name: row.Name, RollNo: row.RollNo, Section: row.Section, Subjects: []string{}}
		if row.Total != nil {
			entry.TotalPct = row.Total.Pct
		}
		for _, s := range subjects { // in report order
			if cell, ok := row.Subjects[s.ID]; ok && scheme.Below(cell.Pct, r.ShowBelowPct) {
				entry.Subjects = append(entry.Subjects, s.ID)
			}
		}
		return i, entry, true
	}
	return 0, ListEntry{}, false
}
