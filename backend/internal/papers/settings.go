package papers

import (
	"context"
	"encoding/json"
	"slices"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/syllabus"
	"github.com/jackymean-del/revu/internal/tenant"
)

// SOLO are the levels of the SOLO taxonomy, lowest first.
var SOLO = []string{"prestructural", "unistructural", "multistructural", "relational", "extended"}

// Custom is an institution's own taxonomy: its name and levels, lowest first.
type Custom struct {
	Name   string   `json:"name"`
	Levels []string `json:"levels"`
}

// Settings are how an institution makes its papers: the names its sets
// take, in order, and its own taxonomy if it has one.
type Settings struct {
	SetNames []string `json:"setNames"`
	Custom   Custom   `json:"custom"`
}

func defaultSettings() Settings {
	return Settings{SetNames: []string{"Set A", "Set B", "Set C", "Set D"}, Custom: Custom{Levels: []string{}}}
}

func loadSettings(ctx context.Context, tx pgx.Tx) (Settings, error) {
	s := defaultSettings()
	var raw []byte
	if err := tx.QueryRow(ctx, `SELECT settings -> 'papers' FROM orgs WHERE id = app_org_id()`).Scan(&raw); err != nil {
		return s, err
	}
	if len(raw) > 0 && string(raw) != "null" {
		var got Settings
		if err := json.Unmarshal(raw, &got); err == nil {
			if len(got.SetNames) > 0 {
				s.SetNames = got.SetNames
			}
			if got.Custom.Levels != nil {
				s.Custom = got.Custom
			}
		}
	}
	return s, nil
}

// levelsOf are the levels a taxonomy's cells may use, in order.
func levelsOf(ctx context.Context, tx pgx.Tx, taxonomy string) ([]string, error) {
	switch taxonomy {
	case "bloom":
		return syllabus.Blooms, nil
	case "solo":
		return SOLO, nil
	case "custom":
		s, err := loadSettings(ctx, tx)
		return s.Custom.Levels, err
	default:
		return []string{""}, nil
	}
}

// nextSetName is the first of the institution's set names an assessment
// does not use yet, or "Set" and a number when they are all taken.
func nextSetName(ctx context.Context, tx pgx.Tx, assessmentID string) (string, error) {
	s, err := loadSettings(ctx, tx)
	if err != nil {
		return "", err
	}
	rows, err := tx.Query(ctx, `SELECT set_label FROM papers WHERE assessment_id = $1::uuid`, assessmentID)
	if err != nil {
		return "", err
	}
	used, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return "", err
	}
	for _, n := range s.SetNames {
		if !slices.ContainsFunc(used, func(u string) bool { return strings.EqualFold(u, n) }) {
			return n, nil
		}
	}
	for i := len(used) + 1; ; i++ {
		n := "Set " + itoa(i)
		if !slices.Contains(used, n) {
			return n, nil
		}
	}
}

func itoa(n int) string {
	if n < 10 {
		return string(rune('0' + n))
	}
	return itoa(n/10) + string(rune('0'+n%10))
}

func getSettings(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	s, err := loadSettings(c.Context(), tx)
	if err != nil {
		return err
	}
	return c.JSON(s)
}

// putSettings saves the set names and the institution's own taxonomy;
// administrators only (Configuration).
func putSettings(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	actor, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	if err := policy.Check(actor, policy.StructureWrite, policy.Target{}); err != nil {
		return err
	}
	var in Settings
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	clean := func(list []string, most, long int) ([]string, bool) {
		out := []string{}
		for _, x := range list {
			x = strings.Join(strings.Fields(x), " ")
			if x == "" {
				continue
			}
			if len(x) > long || slices.ContainsFunc(out, func(o string) bool { return strings.EqualFold(o, x) }) {
				return nil, false
			}
			out = append(out, x)
		}
		return out, len(out) <= most
	}
	var f records.Fields
	names, ok := clean(in.SetNames, 26, 30)
	if !ok || len(names) == 0 {
		f.Add("setNames", "invalid", "Give 1 to 26 set names, each different and up to 30 characters.")
	}
	levels, ok := clean(in.Custom.Levels, 12, 40)
	if !ok {
		f.Add("custom", "invalid", "Give up to 12 levels, each different and up to 40 characters.")
	}
	name := strings.TrimSpace(in.Custom.Name)
	if len(name) > 40 || (len(levels) > 0) != (name != "") {
		f.Add("custom", "invalid", "Name your taxonomy, up to 40 characters, and give its levels.")
	}
	if len(f) > 0 {
		return problem.Invalid(f...)
	}
	s := Settings{SetNames: names, Custom: Custom{Name: name, Levels: levels}}
	raw, _ := json.Marshal(s)
	if _, err := tx.Exec(c.Context(), `UPDATE orgs SET settings = jsonb_set(settings, '{papers}', $1::jsonb) WHERE id = app_org_id()`, string(raw)); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "paper_settings", After: s}); err != nil {
		return err
	}
	return c.JSON(s)
}
