package terminology

import (
	"bytes"
	"os"
	"testing"
)

// The embedded copy is the app's file, byte for byte.
func TestEmbeddedCopyIsCurrent(t *testing.T) {
	src, err := os.ReadFile("../../../frontend/src/lib/terminology/presets.json")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(bytes.ReplaceAll(src, []byte("\r\n"), []byte("\n")), bytes.ReplaceAll(raw, []byte("\r\n"), []byte("\n"))) {
		t.Fatal("presets.gen.json is stale: run npm run gen:terms in frontend/ (or make gen)")
	}
}

func TestEveryPresetNamesEveryKey(t *testing.T) {
	for name, p := range data.Presets {
		for _, k := range Keys {
			if f := p[k]; f.One == "" || f.Other == "" {
				t.Errorf("preset %s has no word for %s", name, k)
			}
		}
		if len(p) != len(Keys) {
			t.Errorf("preset %s has %d words for %d keys", name, len(p), len(Keys))
		}
	}
}

func TestResolve(t *testing.T) {
	overrides := []Override{
		{Key: "group.section", Forms: Forms{"House", "Houses"}},
		{Key: "group.section", BranchID: "north", Forms: Forms{"Stream", "Streams"}},
	}
	cases := []struct {
		name, preset, branch, key string
		count                     int
		want                      string
	}{
		{"preset word", "school", "", "period.term", 1, "Term"},
		{"another preset", "university", "", "period.term", 2, "Semesters"},
		{"organisation override beats the preset", "school", "", "group.section", 1, "House"},
		{"branch override beats the organisation", "school", "north", "group.section", 2, "Streams"},
		{"another branch falls back to the organisation", "school", "south", "group.section", 1, "House"},
		{"an unknown preset falls back to school", "kindergarten", "", "group.level", 1, "Grade"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := Word(tc.preset, overrides, tc.branch, tc.key, tc.count)
			if err != nil || got != tc.want {
				t.Fatalf("got %q, %v; want %q", got, err, tc.want)
			}
		})
	}
	if _, err := Resolve("school", nil, "", "group.sektion"); err == nil {
		t.Fatal("an unknown key resolved instead of failing")
	}
}
