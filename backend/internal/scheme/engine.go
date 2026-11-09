package scheme

import (
	"fmt"
	"math/big"
	"sort"
	"strings"
)

// Input is everything the engine reads for one student in one subject and
// period: the assessments held, each with the student's row status and the
// state and value of every column.
type Input struct {
	Events []Event
	// ChoiceMissing is set when the subject is one of a group's options
	// and the student has chosen none of them: the result is blocked, never
	// guessed (Part 74.1).
	ChoiceMissing bool
}

// Event is one assessment, as the student sat it.
type Event struct {
	AssessmentID string `json:"assessmentId"`
	Title        string `json:"title"`
	Kind         string `json:"kind"`
	HeldOn       string `json:"heldOn,omitempty"`
	RowStatus    string `json:"rowStatus,omitempty"` // absent, exempt, not_applicable or left
	Parts        []Part `json:"parts"`
}

// Part is one entry column and the student's cell in it.
type Part struct {
	ID            string `json:"partId"`
	Name          string `json:"name"`
	Kind          string `json:"kind"` // main or additional
	ComponentCode string `json:"componentCode,omitempty"`
	CountsInTotal bool   `json:"countsInTotal"`
	Max           string `json:"max"`
	State         string `json:"state"` // a value state; empty is pending
	Value         string `json:"value,omitempty"`
}

// Result is the subject result and the detail that explains it. Marshalled,
// it is the detail document stored with the result: every input used, every
// policy decision, and the arithmetic (Part 4.5, AT-v3-10).
type Result struct {
	State           string            `json:"state"` // complete, provisional, blocked, not_assessed
	Reason          string            `json:"reason,omitempty"`
	Value           string            `json:"value,omitempty"`
	Max             string            `json:"max,omitempty"`
	Pct             string            `json:"pct,omitempty"`
	Grade           string            `json:"grade,omitempty"`
	GradeDescriptor string            `json:"gradeDescriptor,omitempty"`
	Passed          *bool             `json:"passed,omitempty"`
	Basis           string            `json:"basis,omitempty"` // full, renormalised or so_far
	Expr            string            `json:"expr"`
	Working         []string          `json:"working,omitempty"`
	Rounding        Rounding          `json:"rounding"`
	Components      []ComponentResult `json:"components"`
}

// ComponentResult is one component of the result.
type ComponentResult struct {
	Code      string     `json:"code"`
	Name      string     `json:"name"`
	Aggregate string     `json:"aggregate"`
	OnAbsent  string     `json:"onAbsent"`
	State     string     `json:"state"` // complete, provisional, blocked, left_out, not_assessed
	Reason    string     `json:"reason,omitempty"`
	Value     string     `json:"value,omitempty"`
	Exact     string     `json:"exact,omitempty"` // before rounding, when it differs
	Max       string     `json:"max"`
	Pct       string     `json:"pct,omitempty"`
	Working   string     `json:"working,omitempty"`
	Events    []EventUse `json:"events"`

	value *big.Rat // as the subject uses it
}

// EventUse is how one assessment counted in a component.
type EventUse struct {
	AssessmentID string    `json:"assessmentId"`
	Title        string    `json:"title"`
	Kind         string    `json:"kind"`
	HeldOn       string    `json:"heldOn,omitempty"`
	Use          string    `json:"use"` // used, dropped, carried, left_out, pending, blocked
	Reason       string    `json:"reason,omitempty"`
	CarriedFrom  string    `json:"carriedFrom,omitempty"`
	Value        string    `json:"value,omitempty"`
	Max          string    `json:"max,omitempty"`
	Pct          string    `json:"pct,omitempty"`
	Parts        []PartUse `json:"parts"`

	value, max, pct *big.Rat
}

// PartUse is how one cell counted.
type PartUse struct {
	PartID string `json:"partId"`
	Name   string `json:"name"`
	State  string `json:"state"`
	Value  string `json:"value,omitempty"`
	Max    string `json:"max"`
	Use    string `json:"use"` // counted, zero, left_out, pending, absent
}

const shown = 2 // places for percentages and inputs in the working

// Evaluate works out one result. It is deterministic: the same definition
// and input, in any order, give byte-identical output.
func Evaluate(d Definition, in Input) Result {
	d.normalise()
	places := d.Rounding.Places
	res := Result{Expr: d.Subject.Expr, Rounding: d.Rounding, Components: []ComponentResult{}}
	events := append([]Event(nil), in.Events...)
	sort.SliceStable(events, func(i, j int) bool {
		a, b := orderKey(events[i]), orderKey(events[j])
		return a < b
	})
	for _, c := range d.Components {
		res.Components = append(res.Components, component(c, events, d.Rounding))
	}
	if in.ChoiceMissing {
		res.State, res.Reason = "blocked", "choice_missing"
		return res
	}

	anyEvidence, blocked, toCome, leftOut := false, []string{}, []string{}, []string{}
	vals, maxes := map[string]val{}, map[string]val{}
	for _, c := range res.Components {
		if c.State != "not_assessed" {
			anyEvidence = true
		}
		switch {
		case c.State == "blocked":
			blocked = append(blocked, c.Code)
		case c.value == nil && c.State == "left_out":
			leftOut = append(leftOut, c.Code)
		case c.value == nil:
			toCome = append(toCome, c.Code) // pending, or no assessment held yet
		}
		if c.value != nil {
			vals[c.Code], maxes[c.Code] = val{r: c.value}, val{r: mustRat(c.Max)}
		} else {
			vals[c.Code], maxes[c.Code] = val{r: zero(), missing: true}, val{r: zero(), missing: true}
		}
	}
	switch {
	case !anyEvidence:
		res.State, res.Reason = "not_assessed", "no_evidence"
		return res
	case len(blocked) > 0:
		res.State, res.Reason = "blocked", "component_blocked:"+strings.Join(blocked, ",")
		return res
	case len(vals) == len(leftOut)+len(toCome):
		if len(toCome) > 0 {
			res.State, res.Reason = "provisional", "pending:"+strings.Join(toCome, ",")
		} else {
			res.State, res.Reason = "not_assessed", "all_left_out"
		}
		return res
	}

	e, err := Compile(d.Subject.Expr, codesOf(d))
	if err != nil {
		res.State, res.Reason = "blocked", "scheme_invalid"
		return res
	}
	v, err := e.Eval(vals)
	if err != nil {
		res.State, res.Reason = "blocked", "scheme_divides_by_zero"
		return res
	}
	m, err := e.Eval(maxes)
	if err != nil || m.missing || m.r.Sign() == 0 {
		res.State, res.Reason = "not_assessed", "all_left_out"
		return res
	}
	smax := mustRat(string(d.Subject.Max))
	value, max := v.r, smax
	res.Working = []string{fmt.Sprintf("%s = %s = %s", d.Subject.Expr, substitute(d.Subject.Expr, vals, places), exact(v.r, places))}
	switch {
	case len(toCome) > 0:
		res.Basis, max = "so_far", m.r
		res.Working = append(res.Working, fmt.Sprintf("so far out of %s; still to come: %s", trim(text(m.r, places)), strings.Join(toCome, ", ")))
	case len(leftOut) > 0:
		res.Basis = "renormalised"
		value = quo(mul(v.r, smax), m.r)
		res.Working = append(res.Working, fmt.Sprintf("%s of %s, scaled to %s = %s; left out: %s",
			exact(v.r, places), trim(text(m.r, places)), trim(text(smax, places)), exact(value, places), strings.Join(leftOut, ", ")))
	default:
		res.Basis = "full"
	}
	rv := round(value, places)
	exactPct := percent(value, max)
	pct := round(percent(rv, max), places)
	res.Value, res.Max, res.Pct = text(rv, places), trim(text(max, places)), text(pct, places)
	res.Working = append(res.Working, fmt.Sprintf("%s of %s = %s%%", res.Value, res.Max, res.Pct))

	res.State = "complete"
	if len(toCome) > 0 {
		res.State, res.Reason = "provisional", "pending:"+strings.Join(toCome, ",")
	}
	for _, c := range res.Components {
		if c.State == "provisional" && res.State == "complete" {
			res.State, res.Reason = "provisional", "pending:"+c.Code
		}
	}

	if g := d.Grading; g != nil {
		on := pct
		if g.From == "unrounded" {
			on = exactPct
		}
		if b, ok := band(g.Bands, on); ok {
			res.Grade, res.GradeDescriptor = b.Label, b.Descriptor
			res.Working = append(res.Working, fmt.Sprintf("%s%% is %s (from %s%%)", text(on, places), b.Label, b.MinPct))
		}
	}
	if p := d.Pass; p != nil && res.State == "complete" {
		passed := pct.Cmp(mustRat(string(p.SubjectMinPct))) >= 0
		for _, c := range res.Components {
			if min, ok := p.Components[c.Code]; ok && c.value != nil && c.Pct != "" && mustRat(c.Pct).Cmp(mustRat(string(min))) < 0 {
				passed = false
			}
		}
		res.Passed = &passed
	}
	return res
}

func orderKey(e Event) string {
	held := e.HeldOn
	if held == "" {
		held = "9999-12-31"
	}
	return held + "/" + e.AssessmentID
}

func codesOf(d Definition) map[string]bool {
	out := map[string]bool{}
	for _, c := range d.Components {
		out[c.Code] = true
	}
	return out
}

// exact writes r to places, with two more digits when it has them, so the
// working shows what was rounded: 79.00, but 78.3333.
func exact(r *big.Rat, places int) string {
	long := text(r, places+2)
	if strings.HasSuffix(long, "00") && text(r, places) == long[:len(long)-2] {
		return long[:len(long)-2]
	}
	return long
}

// Delta is after minus before, signed, for showing how a result would
// change.
func Delta(before, after string) string {
	b, okB := rat(before)
	a, okA := rat(after)
	if !okA || !okB {
		return ""
	}
	d := sub(a, b)
	if d.Sign() > 0 {
		return "+" + text(d, 2)
	}
	return text(d, 2)
}

// trim drops a zero fraction: 100.00 reads as 100.
func trim(s string) string {
	if i := strings.IndexByte(s, '.'); i >= 0 && strings.Trim(s[i+1:], "0") == "" {
		return s[:i]
	}
	return s
}

// substitute writes the expression with each code replaced by its value.
func substitute(src string, vals map[string]val, places int) string {
	toks, err := tokens(src)
	if err != nil {
		return src
	}
	var b strings.Builder
	last := 0
	for _, t := range toks {
		if t.kind != 'i' {
			continue
		}
		v, ok := vals[t.text]
		if !ok {
			continue
		}
		b.WriteString(src[last : t.at-1])
		if v.missing {
			b.WriteString("(left out)")
		} else {
			b.WriteString(text(v.r, places))
		}
		last = t.at - 1 + len(t.text)
	}
	b.WriteString(src[last:])
	return b.String()
}

func band(bands []Band, pct *big.Rat) (Band, bool) {
	var best Band
	var bestMin *big.Rat
	for _, b := range bands {
		min := mustRat(string(b.MinPct))
		if pct.Cmp(min) >= 0 && (bestMin == nil || min.Cmp(bestMin) > 0) {
			best, bestMin = b, min
		}
	}
	return best, bestMin != nil
}

// matches says which of an event's columns a component reads.
func matches(c Component, e Event) []Part {
	if !oneOf(e.Kind, c.From.Kinds) {
		return nil
	}
	var out []Part
	for _, p := range e.Parts {
		switch {
		case c.From.PartKind == "main" && p.Kind == "main" && p.CountsInTotal:
			out = append(out, p)
		case c.From.PartKind == "additional" && p.Kind == "additional" && p.ComponentCode == c.From.ComponentCode:
			out = append(out, p)
		}
	}
	return out
}

func component(c Component, events []Event, rounding Rounding) ComponentResult {
	scale := mustRat(string(c.ScaleTo))
	agg := c.Aggregate.Fn
	if agg == "best_n" {
		agg = fmt.Sprintf("best_n:%d", c.Aggregate.N)
	}
	out := ComponentResult{Code: c.Code, Name: c.Name, Aggregate: agg, OnAbsent: c.OnAbsent, Max: trim(text(scale, rounding.Places)), Events: []EventUse{}}
	var used []int // indexes into out.Events of the events that count
	pending, blocked := 0, false
	for _, e := range events {
		parts := matches(c, e)
		if len(parts) == 0 {
			continue
		}
		u := event(c, e, parts, out.Events)
		switch u.Use {
		case "used", "carried":
			used = append(used, len(out.Events))
		case "pending":
			pending++
		case "blocked":
			blocked = true
		}
		out.Events = append(out.Events, u)
	}
	switch {
	case len(out.Events) == 0:
		out.State, out.Reason = "not_assessed", "no_assessment"
		return out
	case blocked:
		out.State, out.Reason = "blocked", "absent_wait_makeup"
		for _, u := range out.Events {
			if u.Use == "blocked" && u.Reason == "nothing_to_carry" {
				out.Reason = "nothing_to_carry"
			}
		}
		return out
	case len(used) == 0 && pending > 0:
		out.State, out.Reason = "provisional", "pending"
		return out
	case len(used) == 0:
		out.State, out.Reason = "left_out", "all_left_out"
		return out
	}

	var v *big.Rat
	var working string
	pcts := func(idx []int) string {
		s := make([]string, len(idx))
		for i, k := range idx {
			s[i] = out.Events[k].Pct + "%"
		}
		return strings.Join(s, ", ")
	}
	switch c.Aggregate.Fn {
	case "sum":
		got, of := zero(), zero()
		vs, ms := []string{}, []string{}
		for _, k := range used {
			got, of = add(got, out.Events[k].value), add(of, out.Events[k].max)
			vs, ms = append(vs, out.Events[k].Value), append(ms, out.Events[k].Max)
		}
		v = quo(mul(got, scale), of)
		working = fmt.Sprintf("(%s) of (%s) = %s%% of %s", strings.Join(vs, " + "), strings.Join(ms, " + "), text(percent(got, of), shown), out.Max)
	case "avg":
		s := zero()
		for _, k := range used {
			s = add(s, out.Events[k].pct)
		}
		mean := quo(s, whole(int64(len(used))))
		v = quo(mul(mean, scale), whole(100))
		working = fmt.Sprintf("average of %s = %s%% of %s", pcts(used), text(mean, shown), out.Max)
	case "best_n", "max", "min":
		order := append([]int(nil), used...)
		sort.SliceStable(order, func(i, j int) bool {
			cmp := out.Events[order[i]].pct.Cmp(out.Events[order[j]].pct)
			if c.Aggregate.Fn == "min" {
				return cmp < 0
			}
			return cmp > 0
		})
		n := 1
		if c.Aggregate.Fn == "best_n" {
			n = min(c.Aggregate.N, len(order))
		}
		keep, drop := order[:n], order[n:]
		for _, k := range drop {
			out.Events[k].Use = "dropped"
			out.Events[k].Reason = map[string]string{"best_n": "not_in_best", "max": "not_highest", "min": "not_lowest"}[c.Aggregate.Fn]
		}
		sort.Ints(keep)
		s := zero()
		for _, k := range keep {
			s = add(s, out.Events[k].pct)
		}
		mean := quo(s, whole(int64(len(keep))))
		v = quo(mul(mean, scale), whole(100))
		label := map[string]string{"best_n": fmt.Sprintf("best %d of %d", n, len(used)), "max": "highest", "min": "lowest"}[c.Aggregate.Fn]
		working = fmt.Sprintf("%s: %s = %s%% of %s", label, pcts(keep), text(mean, shown), out.Max)
	}
	rv := round(v, rounding.Places)
	out.Value = text(rv, rounding.Places)
	if text(v, 4) != text(rv, 4) {
		out.Exact = text(v, 4)
	}
	out.Pct = text(percent(v, scale), shown)
	out.Working = working + " = " + out.Value
	out.value = v
	if rounding.At == "components" {
		out.value = rv
	}
	out.State = "complete"
	if pending > 0 {
		out.State, out.Reason = "provisional", "pending"
	}
	return out
}

// event decides how one assessment counts in a component, applying the
// row status, the cells' states and the component's absence policy.
func event(c Component, e Event, parts []Part, earlier []EventUse) EventUse {
	u := EventUse{AssessmentID: e.AssessmentID, Title: e.Title, Kind: e.Kind, HeldOn: e.HeldOn, Parts: []PartUse{}}
	counted, absent, pending, exempt := 0, 0, 0, false
	for _, p := range parts {
		state := p.State
		if state == "" || state == "not_assessed" {
			state = "pending"
		}
		switch e.RowStatus {
		case "absent":
			state = "absent"
		case "exempt":
			state = "exempt"
		case "not_applicable", "left":
			state = "not_applicable"
		}
		pu := PartUse{PartID: p.ID, Name: p.Name, State: state, Max: p.Max}
		switch state {
		case "scored":
			pu.Use, pu.Value = "counted", p.Value
			counted++
		case "exempt", "not_applicable":
			pu.Use = "left_out"
			exempt = exempt || state == "exempt"
		case "absent":
			pu.Use = "absent"
			absent++
		default:
			pu.Use = "pending"
			pending++
		}
		u.Parts = append(u.Parts, pu)
	}
	switch {
	case counted == 0 && absent == 0 && pending == 0:
		u.Use, u.Reason = "left_out", "not_applicable"
		if exempt {
			u.Reason = "exempt"
		}
		if e.RowStatus == "left" {
			u.Reason = "left"
		}
		return u
	case pending > 0:
		u.Use, u.Reason = "pending", "pending"
		return u
	case absent > 0:
		switch c.OnAbsent {
		case "wait_makeup":
			u.Use, u.Reason = "blocked", "absent"
			return u
		case "zero":
			for i := range u.Parts {
				if u.Parts[i].Use == "absent" {
					u.Parts[i].Use, u.Parts[i].Value = "zero", "0"
				}
			}
			u.Reason = "absent_zero"
		case "exclude":
			for i := range u.Parts {
				if u.Parts[i].Use == "absent" {
					u.Parts[i].Use = "left_out"
				}
			}
			u.Reason = "absent_excluded"
			if counted == 0 {
				u.Use = "left_out"
				return u
			}
		case "carry_forward":
			for k := len(earlier) - 1; k >= 0; k-- {
				if p := earlier[k]; (p.Use == "used" || p.Use == "carried") && p.pct != nil {
					u.Use, u.Reason, u.CarriedFrom = "carried", "absent_carried", p.AssessmentID
					max := zero()
					for _, part := range parts {
						max = add(max, mustRat(part.Max))
					}
					u.pct, u.max = p.pct, max
					u.value = quo(mul(p.pct, max), whole(100))
					u.Value, u.Max, u.Pct = trim(text(u.value, shown)), trim(text(max, shown)), text(u.pct, shown)
					return u
				}
			}
			u.Use, u.Reason = "blocked", "nothing_to_carry"
			return u
		}
	}
	got, max := zero(), zero()
	for _, p := range u.Parts {
		switch p.Use {
		case "counted":
			got = add(got, mustRat(p.Value))
			max = add(max, mustRat(p.Max))
		case "zero":
			max = add(max, mustRat(p.Max))
		}
	}
	if u.Use == "" {
		u.Use = "used"
	}
	u.value, u.max, u.pct = got, max, percent(got, max)
	u.Value, u.Max, u.Pct = trim(text(got, shown)), trim(text(max, shown)), text(u.pct, shown)
	return u
}
