package scheme

import (
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// Guard the pattern, not the instance (REVU.md): no file outside this
// package does arithmetic on marks, and only internal/results stores a
// result. The planted cases prove the checks would catch one.
func TestOnlyTheEngineComputes(t *testing.T) {
	bigImport := regexp.MustCompile(`"math/big"`)
	writes := regexp.MustCompile(`(?i)INSERT INTO computed_results|UPDATE computed_results\s+\w*\s*SET\s+(value|pct|grade|state|detail)`)
	if !bigImport.MatchString(`import "math/big"`) || !writes.MatchString("UPDATE computed_results SET value = 1") || writes.MatchString("UPDATE computed_results r SET stale = true") {
		t.Fatal("the checks do not catch the planted cases")
	}
	root := filepath.Join("..", "..")
	err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() || !strings.HasSuffix(path, ".go") || strings.HasSuffix(path, "_test.go") {
			return nil
		}
		rel := filepath.ToSlash(path)
		src, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if bigImport.Match(src) && !strings.Contains(rel, "internal/scheme/") {
			t.Errorf("%s does exact arithmetic; results are computed only in internal/scheme", rel)
		}
		// The test fixture seeds one stored result, as it seeds every table.
		if writes.Match(src) && !strings.Contains(rel, "internal/results/") && !strings.Contains(rel, "internal/db/dbtest/") {
			t.Errorf("%s writes computed_results; only internal/results stores what the engine computed", rel)
		}
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
}
