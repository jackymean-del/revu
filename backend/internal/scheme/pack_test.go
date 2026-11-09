package scheme

import (
	"errors"
	"strings"
	"testing"
	"testing/fstest"
)

func TestShippedPacks(t *testing.T) {
	ps, err := Packs()
	if err != nil {
		t.Fatal(err)
	}
	if len(ps) == 0 {
		t.Fatal("no pack is shipped")
	}
	for _, p := range ps {
		// Shipped packs are examples and must say so (Part 4.8, v3.10).
		if !strings.Contains(strings.ToLower(p.Name), "fictional") && !strings.Contains(strings.ToLower(p.Name), "example") {
			t.Errorf("%s: a shipped pack is named as an example", p.Key)
		}
		if p.Definition.Grading == nil || len(p.Definition.Grading.Bands) == 0 {
			t.Errorf("%s: no grades", p.Key)
		}
	}
	if _, ok := ShippedPack("example-secondary@1"); !ok {
		t.Fatal("example-secondary@1 is not shipped")
	}
}

func pack(files map[string]string) fstest.MapFS {
	fsys := fstest.MapFS{}
	for name, body := range files {
		fsys["p/"+name] = &fstest.MapFile{Data: []byte(body)}
	}
	return fsys
}

var goodPack = map[string]string{
	"manifest.yaml": "board: test\nname: Test pack\nstage: one\nversion: 1\nfiles:\n  scheme: scheme.yaml\n  bands: bands.yaml\n",
	"scheme.yaml": `schema: 1
rounding: { places: 2 }
components:
  - code: T
    name: Total
    from: { kinds: [term_end] }
    aggregate: { fn: sum }
    scale_to: 100
    on_absent: wait_makeup
subject: { expr: "T", max: 100 }
`,
	"bands.yaml": "bands:\n  - { label: Pass, min_pct: 33 }\n  - { label: Not yet, min_pct: 0 }\n",
}

// AT-v3-11: a pack that fails its schema imports nothing and says which
// file and line.
func TestPackErrorsNameFileAndLine(t *testing.T) {
	if p, err := LoadPack(pack(goodPack), "p"); err != nil || p.Key != "test-one@1" {
		t.Fatalf("good pack: %v %v", p.Key, err)
	}
	for _, tc := range []struct {
		file, from, to string
		wantFile       string
		wantLine       int
		want           string
	}{
		{"scheme.yaml", "on_absent: wait_makeup", "on_absent: ignore", "scheme.yaml", 9, "on_absent"},
		{"scheme.yaml", `expr: "T"`, `expr: "pow(T, 2)"`, "scheme.yaml", 10, "not an allowed function"},
		{"bands.yaml", "min_pct: 0", "min_pct: 5", "bands.yaml", 1, "start at 0%"},
		{"bands.yaml", "label: Pass", "label: ''", "bands.yaml", 2, "label"},
		{"manifest.yaml", "stage: one\n", "", "manifest.yaml", 1, "stage is required"},
		{"manifest.yaml", "version: 1", "version: [1", "manifest.yaml", -1, ""},
		{"scheme.yaml", "    scale_to: 100\n", "    scale_to: 100\n   bad: [\n", "scheme.yaml", -1, ""},
		{"manifest.yaml", "bands: bands.yaml", "bands: nope.yaml", "nope.yaml", 0, "missing"},
	} {
		files := map[string]string{}
		for k, v := range goodPack {
			files[k] = v
		}
		if !strings.Contains(files[tc.file], tc.from) {
			t.Fatalf("%q is not in %s", tc.from, tc.file)
		}
		files[tc.file] = strings.Replace(files[tc.file], tc.from, tc.to, 1)
		_, err := LoadPack(pack(files), "p")
		var pe PackErrors
		if !errors.As(err, &pe) {
			t.Fatalf("%s %q: got %v, want pack errors", tc.file, tc.to, err)
		}
		found := false
		for _, e := range pe {
			// A syntax error (wantLine -1) has the line the YAML reader reports.
			lineOK := e.Line == tc.wantLine || tc.wantLine == -1 && e.Line > 0
			if e.File == tc.wantFile && lineOK && strings.Contains(e.Message, tc.want) {
				found = true
			}
		}
		if !found {
			t.Errorf("%s %q: got %v, want %s:%d %q", tc.file, tc.to, pe, tc.wantFile, tc.wantLine, tc.want)
		}
	}
}
