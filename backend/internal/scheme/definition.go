// Package scheme is the scheme engine (blueprint Part 4): it turns the
// marks of one student in one subject and period into a result, with a
// detail that explains every number. It is pure Go with no database
// access, so it is tested with golden files. No file outside this package
// computes a result.
package scheme

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

// Definition is a scheme, stored as JSON in schemes.definition (Part 4.1).
type Definition struct {
	Schema     int         `json:"schema"`
	Rounding   Rounding    `json:"rounding"`
	Components []Component `json:"components"`
	Subject    SubjectRule `json:"subject"`
	Grading    *Grading    `json:"grading,omitempty"`
	Pass       *Pass       `json:"pass,omitempty"`
}

// Rounding is where and how numbers are rounded. At components, each
// component is rounded before the subject is worked out, so the shown
// components add up to the shown subject; at subject, only the end.
type Rounding struct {
	Mode   string `json:"mode"` // half_up
	Places int    `json:"places"`
	At     string `json:"at"` // components or subject
}

// Component is one part of a subject result, built from assessments of
// some kinds (Part 4.1).
type Component struct {
	Code      string    `json:"code"`
	Name      string    `json:"name"`
	From      From      `json:"from"`
	Aggregate Aggregate `json:"aggregate"`
	ScaleTo   Dec       `json:"scale_to"`
	OnAbsent  string    `json:"on_absent"`
}

// From says which marks a component reads: assessments of these kinds,
// their main columns, or their additional columns with this code.
type From struct {
	Kinds         []string `json:"kinds"`
	PartKind      string   `json:"part_kind"`
	ComponentCode string   `json:"component_code,omitempty"`
}

// Aggregate combines a component's assessments.
type Aggregate struct {
	Fn string `json:"fn"` // sum, avg, best_n, max, min
	N  int    `json:"n,omitempty"`
}

// SubjectRule combines the components into the subject result.
type SubjectRule struct {
	Expr string `json:"expr"`
	Max  Dec    `json:"max"`
}

// Grading turns the subject percentage into the institution's grade.
type Grading struct {
	From  string `json:"from"` // rounded or unrounded percentage
	Bands []Band `json:"bands"`
}

// Band is one grade: from MinPct (inclusive) up to the next band.
type Band struct {
	Label      string `json:"label"`
	MinPct     Dec    `json:"min_pct"`
	Descriptor string `json:"descriptor,omitempty"`
}

// Pass is the pass rule: a minimum subject percentage, and optionally a
// minimum percentage in some components.
type Pass struct {
	SubjectMinPct Dec            `json:"subject_min_pct"`
	Components    map[string]Dec `json:"components,omitempty"`
}

// Kinds are the assessment kinds a component can read.
var Kinds = []string{"periodic_test", "midterm", "term_end"}

// Policies are what an absence does (Part 4.4).
var Policies = []string{"wait_makeup", "zero", "exclude", "carry_forward"}

var aggregates = []string{"sum", "avg", "best_n", "max", "min"}

var codeShape = regexp.MustCompile(`^[A-Z][A-Z0-9_]{0,15}$`)

// Problem is one thing wrong with a definition, at a path such as
// components[1].scale_to, so the editor can name the line.
type Problem struct {
	Path    string `json:"path"`
	Message string `json:"message"`
}

// Problems is every problem found.
type Problems []Problem

func (p Problems) Error() string {
	parts := make([]string, len(p))
	for i, x := range p {
		parts[i] = x.Path + ": " + x.Message
	}
	return strings.Join(parts, "; ")
}

// Parse reads a definition from JSON, refusing unknown fields, and checks
// it. The error is Problems when it is invalid.
func Parse(raw []byte) (Definition, error) {
	var d Definition
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&d); err != nil {
		var unknown string
		if _, e := fmt.Sscanf(err.Error(), "json: unknown field %s", &unknown); e == nil {
			return d, Problems{{Path: "", Message: "unknown field " + unknown}}
		}
		return d, Problems{{Path: "", Message: "not a scheme: " + err.Error()}}
	}
	d.normalise()
	if p := d.Validate(); len(p) > 0 {
		return d, p
	}
	return d, nil
}

// JSON is the definition as stored, with defaults filled in.
func (d Definition) JSON() []byte {
	d.normalise()
	b, err := json.Marshal(d)
	if err != nil {
		panic(err) // a Definition always marshals
	}
	return b
}

func (d *Definition) normalise() {
	if d.Rounding.Mode == "" {
		d.Rounding.Mode = "half_up"
	}
	if d.Rounding.At == "" {
		d.Rounding.At = "components"
	}
	if d.Grading != nil && d.Grading.From == "" {
		d.Grading.From = "rounded"
	}
	for i := range d.Components {
		c := &d.Components[i]
		if c.From.PartKind == "" {
			c.From.PartKind = "main"
		}
		if c.Aggregate.Fn != "best_n" {
			c.Aggregate.N = 0
		}
	}
}

func oneOf(v string, list []string) bool {
	for _, x := range list {
		if v == x {
			return true
		}
	}
	return false
}

func pctProblem(path string, d Dec, required bool) *Problem {
	if d == "" {
		if required {
			return &Problem{path, "give a percentage from 0 to 100"}
		}
		return nil
	}
	r, ok := rat(string(d))
	if !ok || r.Cmp(whole(100)) > 0 {
		return &Problem{path, "give a percentage from 0 to 100, with at most 4 decimal places"}
	}
	return nil
}

// Validate checks the definition and says what is wrong, line by line.
func (d Definition) Validate() Problems {
	var ps Problems
	add := func(path, msg string, args ...any) { ps = append(ps, Problem{path, fmt.Sprintf(msg, args...)}) }
	if d.Schema != 1 {
		add("schema", "this engine reads schema 1")
	}
	if d.Rounding.Mode != "half_up" {
		add("rounding.mode", "rounding is half_up")
	}
	if d.Rounding.Places < 0 || d.Rounding.Places > 2 {
		add("rounding.places", "round to 0, 1 or 2 decimal places")
	}
	if d.Rounding.At != "components" && d.Rounding.At != "subject" {
		add("rounding.at", "round at components or at subject")
	}

	if len(d.Components) == 0 {
		add("components", "add at least one component")
	}
	codes := map[string]bool{}
	for i, c := range d.Components {
		at := fmt.Sprintf("components[%d]", i)
		switch {
		case !codeShape.MatchString(c.Code):
			add(at+".code", "a code is 1 to 16 capital letters, digits or _, starting with a letter, for example PT")
		case codes[c.Code]:
			add(at+".code", "%s is used by another component", c.Code)
		}
		codes[c.Code] = true
		if strings.TrimSpace(c.Name) == "" {
			add(at+".name", "give the component a name")
		}
		if len(c.From.Kinds) == 0 {
			add(at+".from.kinds", "choose the kinds of assessment it reads")
		}
		for j, k := range c.From.Kinds {
			if !oneOf(k, Kinds) {
				add(fmt.Sprintf("%s.from.kinds[%d]", at, j), "%q is not a kind of assessment; use %s", k, strings.Join(Kinds, ", "))
			}
		}
		switch c.From.PartKind {
		case "main":
			if c.From.ComponentCode != "" {
				add(at+".from.component_code", "only additional columns carry a code")
			}
		case "additional":
			if strings.TrimSpace(c.From.ComponentCode) == "" {
				add(at+".from.component_code", "say which additional column it reads, by its code")
			}
		default:
			add(at+".from.part_kind", "read main or additional columns")
		}
		if !oneOf(c.Aggregate.Fn, aggregates) {
			add(at+".aggregate.fn", "combine by %s", strings.Join(aggregates, ", "))
		}
		if c.Aggregate.Fn == "best_n" && (c.Aggregate.N < 1 || c.Aggregate.N > 99) {
			add(at+".aggregate.n", "say how many of the best to keep, from 1")
		}
		if r, ok := rat(string(c.ScaleTo)); !ok || r.Sign() == 0 {
			add(at+".scale_to", "give the marks this component is worth, more than 0")
		}
		if !oneOf(c.OnAbsent, Policies) {
			add(at+".on_absent", "choose what an absence does: %s", strings.Join(Policies, ", "))
		}
	}
	// Two components must never read the same marks.
	for i, a := range d.Components {
		for j := i + 1; j < len(d.Components); j++ {
			b := d.Components[j]
			if a.From.PartKind != b.From.PartKind || a.From.ComponentCode != b.From.ComponentCode {
				continue
			}
			for _, k := range a.From.Kinds {
				if oneOf(k, b.From.Kinds) {
					add(fmt.Sprintf("components[%d].from", j), "%s and %s would both count the %s marks", a.Code, b.Code, k)
					break
				}
			}
		}
	}

	smax, maxOK := rat(string(d.Subject.Max))
	if !maxOK || smax.Sign() == 0 {
		add("subject.max", "give the subject's maximum, more than 0")
	}
	if len(ps) == 0 {
		e, err := Compile(d.Subject.Expr, codes)
		var ee *ExprError
		switch {
		case errors.As(err, &ee):
			add("subject.expr", "%s", ee.Error())
		case err != nil:
			add("subject.expr", "%s", err.Error())
		default:
			for _, c := range d.Components {
				if !e.refs[c.Code] {
					add("subject.expr", "%s is not used; add it to the expression or remove the component", c.Code)
				}
			}
			// With every component at its maximum the expression must give
			// the subject's maximum, so the maximum shown is the real one.
			full := map[string]val{}
			for _, c := range d.Components {
				full[c.Code] = val{r: mustRat(string(c.ScaleTo))}
			}
			if v, err := e.Eval(full); err != nil {
				add("subject.expr", "%s", err.Error())
			} else if maxOK && v.r.Cmp(smax) != 0 {
				add("subject.max", "with every component at its maximum the expression gives %s, not %s", text(v.r, 2), d.Subject.Max)
			}
		}
	}

	if g := d.Grading; g != nil {
		if g.From != "rounded" && g.From != "unrounded" {
			add("grading.from", "take the band from the rounded or the unrounded percentage")
		}
		if len(g.Bands) == 0 {
			add("grading.bands", "add the bands, or remove them")
		}
		labels, mins, atZero := map[string]bool{}, map[string]bool{}, false
		for i, b := range g.Bands {
			at := fmt.Sprintf("grading.bands[%d]", i)
			if strings.TrimSpace(b.Label) == "" {
				add(at+".label", "give the band a label")
			} else if labels[b.Label] {
				add(at+".label", "%s is used by another band", b.Label)
			}
			labels[b.Label] = true
			if p := pctProblem(at+".min_pct", b.MinPct, true); p != nil {
				ps = append(ps, *p)
				continue
			}
			key := text(mustRat(string(b.MinPct)), 4)
			if mins[key] {
				add(at+".min_pct", "another band starts at %s%%", b.MinPct)
			}
			mins[key] = true
			if mustRat(string(b.MinPct)).Sign() == 0 {
				atZero = true
			}
		}
		if len(g.Bands) > 0 && !atZero {
			add("grading.bands", "one band must start at 0%%, so every percentage has one")
		}
	}
	if p := d.Pass; p != nil {
		if x := pctProblem("pass.subject_min_pct", p.SubjectMinPct, true); x != nil {
			ps = append(ps, *x)
		}
		keys := make([]string, 0, len(p.Components))
		for code := range p.Components {
			keys = append(keys, code)
		}
		sort.Strings(keys)
		for _, code := range keys {
			min := p.Components[code]
			if !codes[code] {
				add("pass.components."+code, "%s is not a component of this scheme", code)
			} else if x := pctProblem("pass.components."+code, min, true); x != nil {
				ps = append(ps, *x)
			}
		}
	}
	return ps
}
