package choices

import (
	"context"
	"errors"
	"io"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/tables"
	"github.com/jackymean-del/revu/internal/tenant"
	"github.com/jackymean-del/revu/internal/terminology"
)

// Headings that hold any subject, its group found from the student's level.
var anySubject = map[string]bool{"subject": true, "subjects": true, "option": true, "options": true, "elective": true, "electives": true, "choice": true, "choices": true}

type levelGroup struct {
	group
	options map[string]string // normalised name or code -> subject id
}

// groupsOf lists a level's groups and what each offers, by name and code.
func groupsOf(ctx context.Context, tx pgx.Tx, levelID string) ([]levelGroup, error) {
	rows, err := tx.Query(ctx, `
		SELECT g.id::text, g.name, g.min_choices, g.max_choices, s.id::text, s.name, coalesce(s.code, '')
		  FROM subject_groups g
		  JOIN subject_group_options o ON o.group_id = g.id AND o.deleted_at IS NULL
		  JOIN subjects s ON s.id = o.subject_id AND s.deleted_at IS NULL
		 WHERE g.level_id = $1::uuid AND g.deleted_at IS NULL ORDER BY g.id`, levelID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []levelGroup
	for rows.Next() {
		var g group
		var subject, name, code string
		if err := rows.Scan(&g.id, &g.name, &g.min, &g.max, &subject, &name, &code); err != nil {
			return nil, err
		}
		g.levelID = levelID
		if len(out) == 0 || out[len(out)-1].id != g.id {
			out = append(out, levelGroup{group: g, options: map[string]string{}})
		}
		last := &out[len(out)-1]
		last.options[tables.Norm(name)] = subject
		if code != "" {
			last.options[tables.Norm(code)] = subject
		}
	}
	return out, rows.Err()
}

func splitValues(cell string) []string {
	var out []string
	for _, v := range strings.FieldsFunc(cell, func(r rune) bool { return r == ',' || r == ';' || r == '/' || r == '|' }) {
		if v = strings.TrimSpace(v); v != "" {
			out = append(out, v)
		}
	}
	return out
}

func importChoices(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	fh, err := c.FormFile("file")
	if err != nil {
		return problem.Invalid(api.FieldError{Field: "file", Code: "required", Message: "Choose a .csv or .xlsx file."})
	}
	file, err := fh.Open()
	if err != nil {
		return err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 5<<20))
	if err != nil {
		return err
	}
	table, err := tables.Read(fh.Filename, data)
	if err != nil {
		return problem.Invalid(api.FieldError{Field: "file", Code: "format", Message: err.Error() + "."})
	}
	words, err := terminology.Words(ctx, tx)
	if err != nil {
		return err
	}
	admission := map[string]bool{"admissionno": true, "admno": true, "admissionnumber": true, tables.Norm(words("person.admission_no", 1)): true}
	adm := -1
	var heads []string
	if len(table) > 0 {
		for i, h := range table[0] {
			heads = append(heads, tables.Norm(h))
			if adm < 0 && admission[heads[i]] {
				adm = i
			}
		}
	}
	if adm < 0 {
		return problem.Invalid(api.FieldError{Field: "file", Code: "columns", Message: "Add a column headed " + words("person.admission_no", 1) + "."})
	}

	var year string
	err = tx.QueryRow(ctx, `
		SELECT id::text FROM academic_years WHERE deleted_at IS NULL
		 ORDER BY (current_date BETWEEN starts_on AND ends_on) DESC, starts_on DESC LIMIT 1`).Scan(&year)
	if errors.Is(err, pgx.ErrNoRows) {
		return problem.Invalid(api.FieldError{Field: "file", Code: "no_year", Message: "Add the " + strings.ToLower(words("period.year", 1)) + " first."})
	}
	if err != nil {
		return err
	}
	a, err := actor(c, tx)
	if err != nil {
		return err
	}
	apply := c.FormValue("apply") == "true"
	byLevel := map[string][]levelGroup{}
	report := api.ChoiceImportReport{Applied: apply, Problems: []api.ImportProblem{}}

	for i, row := range table[1:] {
		cell := func(j int) string {
			if j < len(row) {
				return strings.TrimSpace(row[j])
			}
			return ""
		}
		if strings.TrimSpace(strings.Join(row, "")) == "" {
			continue
		}
		report.Rows++
		pr := api.ImportProblem{Row: i + 2, AdmissionNo: cell(adm)}
		var p place
		rows, err := tx.Query(ctx, placeSelect+` AND st.admission_no = $1 AND y.id::text = $2 LIMIT 1`, pr.AdmissionNo, year)
		if err != nil {
			return err
		}
		p, err = pgx.CollectExactlyOneRow(rows, scanPlace)
		switch {
		case errors.Is(err, pgx.ErrNoRows):
			pr.Reasons = append(pr.Reasons, "No "+strings.ToLower(words("person.student", 1))+" with this number is placed in a "+strings.ToLower(words("group.section", 1))+" this year.")
			report.Problems = append(report.Problems, pr)
			continue
		case err != nil:
			return err
		}
		pr.Name = p.name
		if canWrite(a, p) != nil {
			pr.Reasons = append(pr.Reasons, "Your role cannot change the choices of this "+strings.ToLower(words("person.student", 1))+".")
			report.Problems = append(report.Problems, pr)
			continue
		}
		gs, ok := byLevel[p.levelID]
		if !ok {
			if gs, err = groupsOf(ctx, tx, p.levelID); err != nil {
				return err
			}
			byLevel[p.levelID] = gs
		}

		type pick struct {
			g       group
			subject string
		}
		var picks []pick
		perGroup := map[string]int{}
		for j, h := range heads {
			if j == adm || cell(j) == "" {
				continue
			}
			var named *levelGroup
			for k := range gs {
				if tables.Norm(gs[k].name) == h {
					named = &gs[k]
				}
			}
			if named == nil && !anySubject[h] {
				continue // a column this import does not read, such as a name
			}
			for _, v := range splitValues(cell(j)) {
				found := false
				for k := range gs {
					if named != nil && gs[k].id != named.id {
						continue
					}
					if subject, ok := gs[k].options[tables.Norm(v)]; ok {
						picks = append(picks, pick{gs[k].group, subject})
						perGroup[gs[k].id]++
						found = true
						break
					}
				}
				if !found && named != nil {
					pr.Reasons = append(pr.Reasons, v+" is not an option of "+named.name+".")
				} else if !found {
					pr.Reasons = append(pr.Reasons, v+" is not offered by any subject group of this student's level.")
				}
			}
		}
		for _, g := range gs {
			if perGroup[g.id] > g.max {
				pr.Reasons = append(pr.Reasons, "More options of "+g.name+" than it allows.")
			}
		}
		if len(pr.Reasons) > 0 {
			report.Problems = append(report.Problems, pr)
			continue
		}
		for _, x := range picks {
			if apply {
				outcome, err := assign(c, tx, p, x.g, x.subject, "", "import", true)
				if err != nil {
					return err
				}
				if outcome == full {
					pr.Reasons = append(pr.Reasons, "Already has as many options of "+x.g.name+" as it allows.")
					continue
				}
				tally(&report, outcome)
				continue
			}
			now, _, err := runningIn(ctx, tx, p, x.g.id)
			if err != nil {
				return err
			}
			outcome := assigned
			for _, r := range now {
				if r.subjectID == x.subject {
					outcome = unchanged
				}
			}
			if outcome != unchanged && len(now) >= x.g.max {
				outcome = changed
				if x.g.max != 1 {
					pr.Reasons = append(pr.Reasons, "Already has as many options of "+x.g.name+" as it allows.")
					continue
				}
			}
			tally(&report, outcome)
		}
		if len(pr.Reasons) > 0 {
			report.Problems = append(report.Problems, pr)
		}
	}
	if apply {
		if err := audit.Record(c, audit.Entry{Action: "import", Entity: "student_subject_choices",
			After: map[string]int{"assigned": report.Assign, "changed": report.Change, "unchanged": report.Unchanged, "rejected": len(report.Problems)}}); err != nil {
			return err
		}
	}
	return c.JSON(report)
}

func tally(r *api.ChoiceImportReport, outcome string) {
	switch outcome {
	case assigned:
		r.Assign++
	case changed:
		r.Change++
	case unchanged:
		r.Unchanged++
	}
}
