package scheme

import (
	"encoding/json"
	"strings"
	"testing"
)

const example = `{
  "schema": 1,
  "rounding": {"mode": "half_up", "places": 2, "at": "components"},
  "components": [
    {"code": "PT", "name": "Periodic tests", "from": {"kinds": ["periodic_test"], "part_kind": "main"}, "aggregate": {"fn": "best_n", "n": 2}, "scale_to": 10, "on_absent": "wait_makeup"},
    {"code": "TE", "name": "Term exam", "from": {"kinds": ["term_end"], "part_kind": "main"}, "aggregate": {"fn": "sum"}, "scale_to": 90, "on_absent": "wait_makeup"}
  ],
  "subject": {"expr": "PT + TE", "max": 100},
  "grading": {"bands": [{"label": "Pass", "min_pct": 33}, {"label": "Below", "min_pct": 0}]}
}`

func parse(t *testing.T, s string) Definition {
	t.Helper()
	d, err := Parse([]byte(s))
	if err != nil {
		t.Fatalf("parse: %v", err)
	}
	return d
}

// AT-v3-12: a function outside the whitelist is refused when the scheme is
// saved, and so is every other kind of bad expression, each saying where.
func TestCompileRefuses(t *testing.T) {
	vars := map[string]bool{"PT": true, "TE": true}
	for _, tc := range []struct{ src, want string }{
		{"pow(PT, 2)", `"pow" is not an allowed function`},
		{"PT + XX", `"XX" is not a component code`},
		{"PT +", "ends too early"},
		{"(PT + TE", "a closing )"},
		{"PT ; TE", `";" cannot be used here`},
		{"best_n(PT, 2)", "best_n takes a list first"},
		{"best_n([PT, TE], 1.5)", "whole number"},
		{"scale(PT, 10)", "scale takes 3 argument(s), not 2"},
		{"sum", "sum is a function"},
		{"[PT, TE]", "a list [ ] can only be given"},
		{"", "empty"},
		{"clamp([PT], 0, 10)", "clamp does not take a list"},
	} {
		_, err := Compile(tc.src, vars)
		if err == nil || !strings.Contains(err.Error(), tc.want) {
			t.Errorf("%q: got %v, want %q", tc.src, err, tc.want)
		}
	}
	for _, ok := range []string{"PT + TE", "sum([PT, TE])", "best_n([PT, TE], 1) * 2", "scale(PT, 10, 20) + clamp(TE, 0, 80) - 0", "round_half_up(pct(PT, 10), 1)", "coalesce(PT, TE) + -1 + 1", "max(PT, TE) / 2"} {
		if _, err := Compile(ok, vars); err != nil {
			t.Errorf("%q: %v", ok, err)
		}
	}
}

func TestExpressionFunctions(t *testing.T) {
	vals := map[string]val{"A": {r: mustRat("8")}, "B": {r: mustRat("6")}, "C": {r: zero(), missing: true}}
	vars := map[string]bool{"A": true, "B": true, "C": true}
	for src, want := range map[string]string{
		"A + B":                   "14.0000",
		"A - B * 2":               "-4.0000",
		"A / 3":                   "2.6667",
		"avg([A, B, C])":          "7.0000", // the left-out C is skipped
		"sum([A, B, C])":          "14.0000",
		"best_n([A, B, C], 1)":    "8.0000",
		"min(A, B)":               "6.0000",
		"scale(A, 10, 20)":        "16.0000",
		"clamp(A, 0, 5)":          "5.0000",
		"round_half_up(A / 3, 1)": "2.7000",
		"pct(B, 8)":               "75.0000",
		"coalesce(C, B)":          "6.0000",
		"coalesce(A, B)":          "8.0000",
	} {
		e, err := Compile(src, vars)
		if err != nil {
			t.Fatalf("%s: %v", src, err)
		}
		got, err := e.Eval(vals)
		if err != nil {
			t.Fatalf("%s: %v", src, err)
		}
		if text(got.r, 4) != want {
			t.Errorf("%s = %s, want %s", src, text(got.r, 4), want)
		}
	}
	e, _ := Compile("A / (B - 6)", vars)
	if _, err := e.Eval(vals); err == nil || !strings.Contains(err.Error(), "divides by zero") {
		t.Errorf("dividing by zero: %v", err)
	}
}

// Every validation message names the line it is about.
func TestValidateNamesTheLine(t *testing.T) {
	for _, tc := range []struct{ edit, path, want string }{
		{`"scale_to": 90`, "subject.max", "gives 90.00, not 100"},
		{`"PT + TE"`, "subject.expr", "TE is not used"},
		{`"aggregate": {"fn": "sum"}`, "components[1].aggregate.fn", "combine by"},
		{`"on_absent": "wait_makeup"}
  ],`, "components[1].on_absent", "choose what an absence does"},
		{`"code": "TE"`, "components[1].code", "PT is used by another component"},
		{`["term_end"]`, "components[1].from", "would both count"},
		{`{"label": "Below", "min_pct": 0}`, "grading.bands", "one band must start at 0%"},
		{`"places": 2`, "rounding.places", "0, 1 or 2"},
	} {
		replacement := map[string]string{
			`"scale_to": 90`:                   `"scale_to": 80`,
			`"PT + TE"`:                        `"PT * 10"`,
			`"aggregate": {"fn": "sum"}`:       `"aggregate": {"fn": "median"}`,
			`"code": "TE"`:                     `"code": "PT"`,
			`["term_end"]`:                     `["periodic_test"]`,
			`"places": 2`:                      `"places": 3`,
			`{"label": "Below", "min_pct": 0}`: `{"label": "Below", "min_pct": 10}`,
			`"on_absent": "wait_makeup"}
  ],`: `"on_absent": "ignore"}
  ],`,
		}[tc.edit]
		src := strings.Replace(example, tc.edit, replacement, 1)
		if src == example {
			t.Fatalf("edit %q did not apply", tc.edit)
		}
		_, err := Parse([]byte(src))
		ps, ok := err.(Problems)
		if !ok {
			t.Fatalf("%s: got %v, want problems", tc.edit, err)
		}
		found := false
		for _, p := range ps {
			if p.Path == tc.path && strings.Contains(p.Message, tc.want) {
				found = true
			}
		}
		if !found {
			t.Errorf("%s: problems %v, want %s: %s", tc.edit, ps, tc.path, tc.want)
		}
	}
	if _, err := Parse([]byte(`{"schema": 1, "colour": "red"}`)); err == nil || !strings.Contains(err.Error(), "unknown field") {
		t.Errorf("unknown field: %v", err)
	}
}

// AT-v3-05: exact decimals. Three marks of 33.33 add to exactly 99.99, and
// so do marks that drift in float64 (10.1 + 20.2 is not 30.3 there), so this
// test would fail on an engine that used floats.
func TestDecimalsAreExact(t *testing.T) {
	f := 10.1
	f += 20.2
	if f == 30.3 {
		t.Fatal("float64 happens to be exact here; pick marks that show the drift")
	}
	if text(add(mustRat("10.1"), mustRat("20.2")), 10) != "30.3000000000" {
		t.Fatal("10.1 + 20.2")
	}
	s := zero()
	for range 3 {
		s = add(s, mustRat("33.33"))
	}
	if text(s, 10) != "99.9900000000" {
		t.Fatalf("33.33 x 3 = %s", text(s, 10))
	}
	if round(mustRat("16.665"), 2).Cmp(mustRat("16.67")) != 0 || round(mustRat("16.664"), 2).Cmp(mustRat("16.66")) != 0 {
		t.Fatal("half up")
	}
}

func scored(id, kind, held, v, max string) Event {
	return Event{AssessmentID: id, Title: id, Kind: kind, HeldOn: held, Parts: []Part{{ID: id + "p", Name: "Total", Kind: "main", CountsInTotal: true, Max: max, State: "scored", Value: v}}}
}

// Property tests (Part 4.6).
func TestProperties(t *testing.T) {
	d := parse(t, example)
	in := Input{Events: []Event{
		scored("A", "periodic_test", "2026-05-01", "32", "40"),
		scored("B", "periodic_test", "2026-06-01", "36", "40"),
		scored("C", "periodic_test", "2026-07-01", "20", "40"),
		scored("T", "term_end", "2026-09-01", "70", "90"),
	}}
	base := Evaluate(d, in)
	if base.State != "complete" || base.Value != "78.50" {
		t.Fatalf("base: %s %s", base.State, base.Value)
	}

	// Scaling every maximum by a constant scales the result by it.
	doubled := d
	doubled.Components = append([]Component(nil), d.Components...)
	for i := range doubled.Components {
		doubled.Components[i].ScaleTo = Dec(text(mul(mustRat(string(d.Components[i].ScaleTo)), whole(2)), 2))
	}
	doubled.Subject.Max = "200"
	if p := doubled.Validate(); len(p) > 0 {
		t.Fatal(p)
	}
	if got := Evaluate(doubled, in); got.Value != "157.00" || got.Pct != base.Pct {
		t.Errorf("doubled: %s (%s%%), want 157.00 (%s%%)", got.Value, got.Pct, base.Pct)
	}

	// Adding an exempt item changes nothing.
	ex := scored("D", "periodic_test", "2026-08-01", "40", "40")
	ex.RowStatus = "exempt"
	withExempt := Evaluate(d, Input{Events: append(append([]Event(nil), in.Events...), ex)})
	if withExempt.Value != base.Value || withExempt.State != base.State || withExempt.Grade != base.Grade {
		t.Errorf("an exempt item changed the result: %s, want %s", withExempt.Value, base.Value)
	}

	// The order of evidence does not matter, and recomputing is identical.
	shuffled := Input{Events: []Event{in.Events[2], in.Events[0], in.Events[3], in.Events[1]}}
	a, _ := json.Marshal(base)
	b, _ := json.Marshal(Evaluate(d, shuffled))
	if string(a) != string(b) {
		t.Errorf("order changed the result:\n%s\n%s", a, b)
	}
}

// The explanation reproduces the number: the components it lists add up
// to the subject value (AT-v3-10).
func TestExplanationAddsUp(t *testing.T) {
	d := parse(t, example)
	r := Evaluate(d, Input{Events: []Event{
		scored("A", "periodic_test", "2026-05-01", "33", "40"),
		scored("B", "periodic_test", "2026-06-01", "32", "40"),
		scored("T", "term_end", "2026-09-01", "61.5", "90"),
	}})
	sum := zero()
	for _, c := range r.Components {
		sum = add(sum, mustRat(c.Value))
		if len(c.Events) == 0 || c.Working == "" {
			t.Errorf("%s has no inputs or working", c.Code)
		}
	}
	if text(sum, 2) != r.Value {
		t.Fatalf("components add to %s, the result is %s", text(sum, 2), r.Value)
	}
	if len(r.Working) < 2 || !strings.Contains(r.Working[0], "PT + TE = 8.13 + 61.50") {
		t.Fatalf("working: %v", r.Working)
	}
}
