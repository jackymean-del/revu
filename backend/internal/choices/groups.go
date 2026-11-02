// Package choices serves subject groups and the subjects each student has
// chosen from them (blueprint Part 74.1). A group belongs to a level and
// offers options with a rule for how many a student takes; a subject
// outside every group applies to every student of the level.
//
// A choice holds for a year between two days. A change mid-year ends the
// old row the day before the new one starts, so nothing entered under the
// earlier subject loses its place. Nothing is guessed: a student below a
// group's minimum is listed as missing, and that group's result will be
// blocked with the reason "choice missing" when results arrive.
package choices

import (
	"context"
	"unicode"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/records"
)

// Routes serves groups, their options and the choices.
func Routes(g fiber.Router) {
	groups.Routes(g)
	options.Routes(g)
	g.Get("/subject-choices", listChoices)
	g.Post("/subject-choices", assignChoices)
	g.Post("/subject-choices/copy", copyChoices)
	g.Post("/subject-choices/import", importChoices)
	g.Delete("/subject-choices/:id", endChoice)
	g.Get("/sections/:id/choice-completeness", completeness)
}

func plain(one, many string) func(records.Words, int) string {
	return func(_ records.Words, n int) string {
		if n == 1 {
			return one
		}
		return many
	}
}

// word names a parent in the organisation's words, starting lower case
// unless it is an abbreviation.
func word(key string) func(records.Words) string {
	return func(w records.Words) string {
		r := []rune(w(key, 1))
		if len(r) > 1 && unicode.IsUpper(r[0]) && unicode.IsLower(r[1]) {
			r[0] = unicode.ToLower(r[0])
		}
		return string(r)
	}
}

var groups = records.Resource[api.SubjectGroup, api.SubjectGroupInput]{
	Path: "subject-groups", Table: "subject_groups", Audited: "subject_groups",
	SelectList: `id::text, level_id::text, name, rule, min_choices, max_choices`,
	Scan: func(r pgx.CollectableRow) (g api.SubjectGroup, err error) {
		return g, r.Scan(&g.Id, &g.LevelId, &g.Name, &g.Rule, &g.MinChoices, &g.MaxChoices, &g.RemovedAt)
	},
	Order:   `(SELECT seq FROM levels l WHERE l.id = level_id), lower(name)`,
	Filters: map[string]string{"levelId": "level_id"},
	Columns: []records.Column{{Name: "level_id", Cast: "::uuid"}, {Name: "name"}, {Name: "rule"}, {Name: "min_choices"}, {Name: "max_choices"}},
	Values: func(in api.SubjectGroupInput) []any {
		return []any{in.LevelId, in.Name, string(in.Rule), in.MinChoices, in.MaxChoices}
	},
	Check: func(ctx context.Context, tx pgx.Tx, in *api.SubjectGroupInput) ([]api.FieldError, error) {
		var f records.Fields
		f.Text("name", &in.Name, 1, 80)
		switch in.Rule {
		case "exactly_one":
			in.MinChoices, in.MaxChoices = 1, 1
		case "at_most_one":
			in.MinChoices, in.MaxChoices = 0, 1
		case "range":
			if in.MinChoices < 0 {
				f.Add("minChoices", "range", "Use 0 or more.")
			}
			if in.MaxChoices < 1 {
				f.Add("maxChoices", "range", "Use 1 or more.")
			} else if in.MinChoices > in.MaxChoices {
				f.Add("maxChoices", "order", "Use at least the minimum.")
			}
		default:
			f.Add("rule", "unknown", "Choose exactly one, at most one, or a range.")
		}
		return f, f.Live(ctx, tx, "levelId", "levels", in.LevelId)
	},
	Dependants: []records.Dependant{
		{Table: "subject_group_options", Column: "group_id", Word: plain("option", "options")},
		{Count: `SELECT count(*) FROM student_subject_choices WHERE group_id = $1::uuid AND effective_to IS NULL`, Word: plain("running choice", "running choices")},
	},
	Parents: []records.Parent{{Column: "level_id", Table: "levels", Word: word("group.level")}},
}

var options = records.Resource[api.SubjectGroupOption, api.SubjectGroupOptionInput]{
	Path: "subject-group-options", Table: "subject_group_options", Audited: "subject_group_options",
	SelectList: `id::text, group_id::text, subject_id::text`,
	Scan: func(r pgx.CollectableRow) (o api.SubjectGroupOption, err error) {
		return o, r.Scan(&o.Id, &o.GroupId, &o.SubjectId, &o.RemovedAt)
	},
	Order:   `(SELECT lower(name) FROM subjects s WHERE s.id = subject_id)`,
	Filters: map[string]string{"groupId": "group_id"},
	Columns: []records.Column{{Name: "group_id", Cast: "::uuid"}, {Name: "subject_id", Cast: "::uuid"}},
	Values:  func(in api.SubjectGroupOptionInput) []any { return []any{in.GroupId, in.SubjectId} },
	Check: func(ctx context.Context, tx pgx.Tx, in *api.SubjectGroupOptionInput) ([]api.FieldError, error) {
		var f records.Fields
		if err := f.Live(ctx, tx, "groupId", "subject_groups", in.GroupId); err != nil {
			return nil, err
		}
		if err := f.Live(ctx, tx, "subjectId", "subjects", in.SubjectId); err != nil {
			return nil, err
		}
		if len(f) > 0 {
			return f, nil
		}
		// A subject is offered by one group of a level at most, or a
		// student's choice could not say which group it answers.
		var other string
		err := tx.QueryRow(ctx, `
			SELECT coalesce((SELECT g2.name FROM subject_group_options o
			  JOIN subject_groups g2 ON g2.id = o.group_id AND g2.deleted_at IS NULL
			 WHERE o.deleted_at IS NULL AND o.subject_id = $2::uuid AND g2.id <> g.id AND g2.level_id = g.level_id LIMIT 1), '')
			  FROM subject_groups g WHERE g.id = $1::uuid`, in.GroupId, in.SubjectId).Scan(&other)
		if err != nil {
			return nil, err
		}
		if other != "" {
			f.Add("subjectId", "taken", "Already an option of "+other+".")
		}
		return f, nil
	},
	// The level teaches what its groups offer.
	BeforeWrite: func(ctx context.Context, tx pgx.Tx, in *api.SubjectGroupOptionInput, _ string) error {
		_, err := tx.Exec(ctx, `
			INSERT INTO level_subjects (org_id, level_id, subject_id)
			SELECT org_id, level_id, $2::uuid FROM subject_groups WHERE id = $1::uuid
			ON CONFLICT (level_id, subject_id) WHERE deleted_at IS NULL DO NOTHING`, in.GroupId, in.SubjectId)
		return err
	},
	Dependants: []records.Dependant{{Count: `
		SELECT count(*) FROM student_subject_choices c JOIN subject_group_options o ON o.id = $1::uuid
		 WHERE c.group_id = o.group_id AND c.subject_id = o.subject_id AND c.effective_to IS NULL`,
		Word: plain("running choice", "running choices")}},
	Parents: []records.Parent{
		{Column: "group_id", Table: "subject_groups", Word: func(records.Words) string { return "subject group" }},
		{Column: "subject_id", Table: "subjects", Word: word("course.subject")},
	},
}
