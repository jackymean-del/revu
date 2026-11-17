package papers

import (
	"math/rand/v2"
	"strings"
	"testing"
)

func TestAsAction(t *testing.T) {
	for in, want := range map[string]string{
		"Add fractions with unlike denominators.":         "add fractions with unlike denominators",
		"Compares fractions":                              "compare fractions",
		"Identifies the parts of a plant.":                "identify the parts of a plant",
		"Learners will be able to classify living things": "classify living things",
		"To express ideas clearly":                        "express ideas clearly",
		"Discuss the causes of the war.":                  "discuss the causes of the war",
		"":                                                "",
	} {
		if got := asAction(in); got != want {
			t.Errorf("asAction(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestVariant(t *testing.T) {
	r := rand.New(rand.NewPCG(1, 2))
	if v := variant("Name the capital of France.", r); v != "" {
		t.Fatalf("no number, no variant: %q", v)
	}
	v := variant("Add 3/4 and 12/16. Then multiply by 1.", r)
	if v == "" || v == "Add 3/4 and 12/16. Then multiply by 1." || !strings.HasSuffix(v, "multiply by 1.") || !strings.HasPrefix(v, "Add ") {
		t.Fatalf("numbers change, 1 stays, words stay: %q", v)
	}
	if v := variant("A rope is 2.75 m long.", r); !strings.Contains(v, ".") || strings.Contains(v, "2.75") {
		t.Fatalf("decimals keep their places: %q", v)
	}
}

func TestSuggest(t *testing.T) {
	bank := []string{"Add 1/2 and 1/3.", "Name the parts of a fraction."}
	got := suggest(3, "Short answer", "apply", "Fractions", "Add fractions with unlike denominators.", bank, 7)
	if len(got) != 3 {
		t.Fatalf("three drafts: %+v", got)
	}
	for _, s := range got {
		for _, b := range bank {
			if strings.EqualFold(s.Text, b) {
				t.Fatalf("a draft repeats the bank: %q", s.Text)
			}
		}
	}
	if !strings.HasPrefix(got[0].Text, "Add ") || got[0].Text == bank[0] {
		t.Fatalf("a variant of the bank's question comes first: %q", got[0].Text)
	}
	tf := suggest(1, "True or false", "", "Fractions", "Compare fractions.", nil, 3)
	if len(tf) != 1 || len(tf[0].Options) != 2 || tf[0].Bloom != "remember" {
		t.Fatalf("true or false: %+v", tf)
	}
	if none := suggest(2, "Short answer", "apply", "", "", nil, 1); len(none) != 0 {
		t.Fatalf("with nothing to go on, nothing is made up: %+v", none)
	}
}
