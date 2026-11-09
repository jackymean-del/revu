package scheme

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"testing"

	"go.yaml.in/yaml/v3"
)

// Golden cases (blueprint Part 4.6): each file in testdata/golden holds a
// scheme and cases worked out by hand from what the scheme says, not from
// the engine. Changing an expected value needs a note in the pull request.

type goldenFile struct {
	Scheme map[string]any `yaml:"scheme"`
	Cases  []goldenCase   `yaml:"cases"`
}

type goldenCase struct {
	Name string `yaml:"name"`
	// Overrides to the file's scheme, so related cases share one file.
	OnAbsent   map[string]string `yaml:"on_absent"`
	Aggregate  map[string]string `yaml:"aggregate"`
	RoundingAt string            `yaml:"rounding_at"`

	ChoiceMissing bool          `yaml:"choice_missing"`
	Events        []goldenEvent `yaml:"events"`
	Expect        goldenExpect  `yaml:"expect"`
}

type goldenEvent struct {
	ID        string            `yaml:"id"`
	Kind      string            `yaml:"kind"`
	HeldOn    string            `yaml:"held_on"`
	RowStatus string            `yaml:"row_status"`
	Total     string            `yaml:"total"` // one main column, as "32/40"
	Parts     []string          `yaml:"parts"` // main columns
	Extra     map[string]string `yaml:"extra"` // additional columns by code
}

type goldenExpect struct {
	State      string            `yaml:"state"`
	Reason     string            `yaml:"reason"`
	Value      string            `yaml:"value"`
	Max        string            `yaml:"max"`
	Pct        string            `yaml:"pct"`
	Grade      *string           `yaml:"grade"`
	Passed     *bool             `yaml:"passed"`
	Basis      string            `yaml:"basis"`
	Components map[string]string `yaml:"components"` // "state value"
	Uses       map[string]string `yaml:"uses"`       // "A1 used, A2 dropped"
	EventValue map[string]string `yaml:"event_value"`
}

// cell reads "32/40", "AB/40", "EX/40", "NA/40" or "-/40".
func cell(id, name, kind, code, s string) Part {
	v, max, _ := strings.Cut(s, "/")
	p := Part{ID: id, Name: name, Kind: kind, ComponentCode: code, CountsInTotal: kind == "main", Max: max}
	switch v {
	case "AB":
		p.State = "absent"
	case "EX":
		p.State = "exempt"
	case "NA":
		p.State = "not_applicable"
	case "-", "":
		p.State = "pending"
	default:
		p.State, p.Value = "scored", v
	}
	return p
}

func (g goldenEvent) event() Event {
	e := Event{AssessmentID: g.ID, Title: g.ID, Kind: g.Kind, HeldOn: g.HeldOn, RowStatus: g.RowStatus}
	if e.Kind == "" {
		e.Kind = "periodic_test"
	}
	if g.Total != "" {
		e.Parts = append(e.Parts, cell(g.ID+"-total", "Total", "main", "", g.Total))
	}
	for i, s := range g.Parts {
		e.Parts = append(e.Parts, cell(fmt.Sprintf("%s-%d", g.ID, i+1), fmt.Sprintf("Section %d", i+1), "main", "", s))
	}
	for _, code := range sortedKeys(g.Extra) {
		e.Parts = append(e.Parts, cell(g.ID+"-"+code, code, "additional", code, g.Extra[code]))
	}
	return e
}

func sortedKeys[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func (c goldenCase) definition(t *testing.T, base map[string]any) Definition {
	t.Helper()
	raw, err := json.Marshal(base)
	if err != nil {
		t.Fatal(err)
	}
	d, err := Parse(raw)
	if err != nil {
		t.Fatalf("the file's scheme is invalid: %v", err)
	}
	for i := range d.Components {
		comp := &d.Components[i]
		if p, ok := c.OnAbsent[comp.Code]; ok {
			comp.OnAbsent = p
		}
		if a, ok := c.Aggregate[comp.Code]; ok {
			fn, n, _ := strings.Cut(a, ":")
			comp.Aggregate.Fn, comp.Aggregate.N = fn, 0
			if n != "" {
				fmt.Sscan(n, &comp.Aggregate.N)
			}
		}
	}
	if c.RoundingAt != "" {
		d.Rounding.At = c.RoundingAt
	}
	if p := d.Validate(); len(p) > 0 {
		t.Fatalf("the case's scheme is invalid: %v", p)
	}
	return d
}

func goldenCases(t *testing.T) (files map[string]goldenFile, total int) {
	t.Helper()
	paths, err := filepath.Glob(filepath.Join("testdata", "golden", "*.yaml"))
	if err != nil || len(paths) == 0 {
		t.Fatalf("no golden files: %v", err)
	}
	files = map[string]goldenFile{}
	for _, p := range paths {
		raw, err := os.ReadFile(p)
		if err != nil {
			t.Fatal(err)
		}
		var f goldenFile
		dec := yaml.NewDecoder(bytes.NewReader(raw))
		dec.KnownFields(true)
		if err := dec.Decode(&f); err != nil {
			t.Fatalf("%s: %v", p, err)
		}
		files[filepath.Base(p)] = f
		total += len(f.Cases)
	}
	return files, total
}

func TestGolden(t *testing.T) {
	files, total := goldenCases(t)
	if total < 25 {
		t.Fatalf("%d golden cases; the blueprint asks for at least 25 (v3.2)", total)
	}
	for _, name := range sortedKeys(files) {
		f := files[name]
		for _, c := range f.Cases {
			t.Run(name+"/"+c.Name, func(t *testing.T) {
				d := c.definition(t, f.Scheme)
				in := Input{ChoiceMissing: c.ChoiceMissing}
				for _, e := range c.Events {
					in.Events = append(in.Events, e.event())
				}
				got := Evaluate(d, in)
				check(t, c.Expect, got)

				// Recomputing gives byte-identical output, in any order of
				// evidence (Part 4.6).
				first, _ := json.Marshal(got)
				again, _ := json.Marshal(Evaluate(d, in))
				rev := Input{ChoiceMissing: in.ChoiceMissing}
				for i := len(in.Events) - 1; i >= 0; i-- {
					rev.Events = append(rev.Events, in.Events[i])
				}
				reversed, _ := json.Marshal(Evaluate(d, rev))
				if !bytes.Equal(first, again) || !bytes.Equal(first, reversed) {
					t.Fatalf("not deterministic:\n%s\n%s\n%s", first, again, reversed)
				}
			})
		}
	}
}

func check(t *testing.T, want goldenExpect, got Result) {
	t.Helper()
	detail, _ := json.MarshalIndent(got, "", "  ")
	fail := func(format string, args ...any) {
		t.Helper()
		t.Fatalf(format+"\n%s", append(args, detail)...)
	}
	if got.State != want.State {
		fail("state %q, want %q", got.State, want.State)
	}
	if want.Reason != "" && got.Reason != want.Reason {
		fail("reason %q, want %q", got.Reason, want.Reason)
	}
	// A result without a number in the case has none in the engine: no
	// value is ever made up for a blocked or unassessed result.
	if got.Value != want.Value || got.Pct != want.Pct {
		fail("value %q (%q%%), want %q (%q%%)", got.Value, got.Pct, want.Value, want.Pct)
	}
	if want.Max != "" && got.Max != want.Max {
		fail("max %q, want %q", got.Max, want.Max)
	}
	if want.Grade != nil && got.Grade != *want.Grade {
		fail("grade %q, want %q", got.Grade, *want.Grade)
	}
	if want.Passed != nil && (got.Passed == nil || *got.Passed != *want.Passed) {
		fail("passed %v, want %v", got.Passed, *want.Passed)
	}
	if want.Basis != "" && got.Basis != want.Basis {
		fail("basis %q, want %q", got.Basis, want.Basis)
	}
	byCode := map[string]ComponentResult{}
	for _, c := range got.Components {
		byCode[c.Code] = c
	}
	for code, w := range want.Components {
		c := byCode[code]
		if g := strings.TrimSpace(c.State + " " + c.Value); g != w {
			fail("component %s is %q, want %q", code, g, w)
		}
	}
	for code, w := range want.Uses {
		var uses []string
		for _, e := range byCode[code].Events {
			uses = append(uses, e.AssessmentID+" "+e.Use)
		}
		if g := strings.Join(uses, ", "); g != w {
			fail("component %s uses %q, want %q", code, g, w)
		}
	}
	for key, w := range want.EventValue {
		code, id, _ := strings.Cut(key, "/")
		found := false
		for _, e := range byCode[code].Events {
			if e.AssessmentID == id {
				found = true
				if e.Value != w {
					fail("%s value %q, want %q", key, e.Value, w)
				}
			}
		}
		if !found {
			fail("%s not found", key)
		}
	}
}
