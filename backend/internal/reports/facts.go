package reports

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/results"
	"github.com/jackymean-del/revu/internal/scheme"
	"github.com/jackymean-del/revu/internal/terminology"
)

// Branding is the institution's identity on documents, at one version.
type Branding struct {
	Version     int    `json:"version"`
	DisplayName string `json:"displayName"`
	Address     string `json:"address,omitempty"`
	Contact     string `json:"contact,omitempty"`
	Affiliation string `json:"affiliation,omitempty"`
	HeaderNote  string `json:"headerNote,omitempty"`
	HasLogo     bool   `json:"hasLogo"`
}

// Student is who a report is about.
type Student struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	AdmissionNo string `json:"admissionNo"`
	RollNo      string `json:"rollNo,omitempty"`
}

// Component is one part of a subject result as stored.
type Component struct {
	Code  string `json:"code"`
	Name  string `json:"name"`
	State string `json:"state"`
	Value string `json:"value,omitempty"`
	Max   string `json:"max"`
}

// Subject is one subject's result as stored.
type Subject struct {
	ID              string      `json:"id"`
	Name            string      `json:"name"`
	State           string      `json:"state"`
	Reason          string      `json:"reason,omitempty"`
	Value           string      `json:"value,omitempty"`
	Max             string      `json:"max,omitempty"`
	Pct             string      `json:"pct,omitempty"`
	Grade           string      `json:"grade,omitempty"`
	GradeDescriptor string      `json:"gradeDescriptor,omitempty"`
	Stale           bool        `json:"stale,omitempty"`
	Components      []Component `json:"components"`
}

// Legend is one scheme's bands.
type Legend struct {
	Scheme string        `json:"scheme"`
	Bands  []scheme.Band `json:"bands"`
}

// Facts are everything one student's report is drawn from. Stored with a
// run, they show the report again exactly as it was made.
type Facts struct {
	Institution Branding          `json:"institution"`
	Student     Student           `json:"student"`
	Level       string            `json:"level"`
	Section     string            `json:"section"`
	Year        string            `json:"year"`
	Period      string            `json:"period"`
	Words       map[string]string `json:"words"`
	Subjects    []Subject         `json:"subjects"`
	Overall     scheme.Overall    `json:"overall"`
	Legends     []Legend          `json:"legends"`
	GeneratedAt string            `json:"generatedAt"`
}

// wordKeys are the institution words a report prints.
var wordKeys = append([]string{"person.student", "person.admission_no", "person.roll_no", "group.level", "group.section", "period.term", "period.year", "course.subject", "org.institution"}, SignoffKeys...)

// LoadBranding reads the latest branding, or the institution's name when
// none was saved yet.
func LoadBranding(ctx context.Context, tx pgx.Tx) (Branding, error) {
	var b Branding
	err := tx.QueryRow(ctx, `
		SELECT version, display_name, coalesce(address, ''), coalesce(contact, ''), coalesce(affiliation, ''), coalesce(header_note, ''), logo IS NOT NULL
		  FROM branding_versions ORDER BY version DESC LIMIT 1`).
		Scan(&b.Version, &b.DisplayName, &b.Address, &b.Contact, &b.Affiliation, &b.HeaderNote, &b.HasLogo)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, `SELECT name FROM orgs WHERE id = app_org_id()`).Scan(&b.DisplayName)
	}
	return b, err
}

// Logo is the logo of a branding version, or nil.
func Logo(ctx context.Context, tx pgx.Tx, version int) (data []byte, kind string, err error) {
	err = tx.QueryRow(ctx, `SELECT logo, coalesce(logo_type, '') FROM branding_versions WHERE version = $1`, version).Scan(&data, &kind)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, "", nil
	}
	return data, kind, err
}

// Gather reads the facts for a section's students in a period, in roll
// order: only the given students when any are named. Stored results are
// read as they are; the caller recomputes first when it needs them fresh.
func Gather(ctx context.Context, tx pgx.Tx, sec results.Section, periodID string, only []string, cfg Config, now time.Time) ([]Facts, error) {
	words, err := terminology.Words(ctx, tx)
	if err != nil {
		return nil, err
	}
	brand, err := LoadBranding(ctx, tx)
	if err != nil {
		return nil, err
	}
	base := Facts{Institution: brand, Words: map[string]string{}, GeneratedAt: now.UTC().Format(time.RFC3339)}
	for _, k := range wordKeys {
		base.Words[k] = words(k, 1)
	}
	if err := tx.QueryRow(ctx, `
		SELECT l.name, s.name, y.label, p.name
		  FROM sections s JOIN levels l ON l.id = s.level_id JOIN academic_years y ON y.id = s.year_id, periods p
		 WHERE s.id = $1::uuid AND p.id = $2::uuid`, sec.ID, periodID).Scan(&base.Level, &base.Section, &base.Year, &base.Period); err != nil {
		return nil, err
	}

	// The level's subjects, in the template's order, then by name.
	rows, err := tx.Query(ctx, `
		SELECT s.id::text, s.name FROM level_subjects ls JOIN subjects s ON s.id = ls.subject_id AND s.deleted_at IS NULL
		 WHERE ls.level_id = $1::uuid AND ls.deleted_at IS NULL ORDER BY s.name`, sec.LevelID)
	if err != nil {
		return nil, err
	}
	type subj struct{ id, name string }
	subjects, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (subj, error) {
		var s subj
		return s, r.Scan(&s.id, &s.name)
	})
	if err != nil {
		return nil, err
	}
	rank := func(id string) int {
		if i := slices.Index(cfg.SubjectOrder, id); i >= 0 {
			return i
		}
		return len(cfg.SubjectOrder)
	}
	sort.SliceStable(subjects, func(i, j int) bool { return rank(subjects[i].id) < rank(subjects[j].id) })

	// Who takes what, and the roster in roll order.
	type place struct{ takes, missing bool }
	takes := map[[2]string]place{}
	var roster []results.Student
	for i, s := range subjects {
		list, err := results.Students(ctx, tx, sec, periodID, s.id)
		if err != nil {
			return nil, err
		}
		if i == 0 {
			roster = list
		}
		for _, st := range list {
			takes[[2]string{st.ID, s.id}] = place{st.Takes, st.ChoiceMissing}
		}
	}
	if len(only) > 0 {
		roster = slices.DeleteFunc(roster, func(s results.Student) bool { return !slices.Contains(only, s.ID) })
	}
	ids := make([]string, len(roster))
	for i, s := range roster {
		ids[i] = s.ID
	}

	type stored struct {
		state, reason, value, max, pct, grade string
		stale                                 bool
		detail                                scheme.Result
		schemeID, schemeName                  string
	}
	got := map[[2]string]stored{}
	rows, err = tx.Query(ctx, `
		SELECT r.student_id::text, r.subject_id::text, r.state::text, coalesce(r.reason, ''), coalesce(r.value::text, ''), coalesce(r.max::text, ''),
		       coalesce(r.pct::text, ''), coalesce(r.grade, ''), r.stale, r.detail, r.scheme_id::text, sc.name
		  FROM computed_results r JOIN schemes sc ON sc.id = r.scheme_id
		 WHERE r.period_id = $1::uuid AND r.component_code = '_subject' AND r.student_id = ANY($2::uuid[])`, periodID, ids)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var student, subject string
		var x stored
		var detail []byte
		if err := rows.Scan(&student, &subject, &x.state, &x.reason, &x.value, &x.max, &x.pct, &x.grade, &x.stale, &detail, &x.schemeID, &x.schemeName); err != nil {
			return nil, err
		}
		if len(detail) > 0 {
			if err := json.Unmarshal(detail, &x.detail); err != nil {
				return nil, err
			}
		}
		got[[2]string{student, subject}] = x
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Band legends come from the schemes that apply here, one per scheme.
	schemes, err := results.LoadSchemes(ctx, tx)
	if err != nil {
		return nil, err
	}
	var legends []Legend
	seen := map[string]bool{}
	for _, s := range subjects {
		applied, ok := schemes.For(sec.LevelID, periodID, s.id)
		if !ok || seen[applied.ID] || applied.Definition.Grading == nil {
			continue
		}
		seen[applied.ID] = true
		bands := append([]scheme.Band(nil), applied.Definition.Grading.Bands...)
		legends = append(legends, Legend{Scheme: applied.Name, Bands: bands})
	}

	out := make([]Facts, 0, len(roster))
	for _, st := range roster {
		f := base
		f.Student = Student{ID: st.ID, Name: st.Name, AdmissionNo: st.AdmissionNo, RollNo: st.RollNo}
		f.Subjects = []Subject{}
		f.Legends = legends
		var lines []scheme.SubjectLine
		for _, s := range subjects {
			pl := takes[[2]string{st.ID, s.id}]
			if !pl.takes && !pl.missing {
				continue // a subject the student does not take is not on the report
			}
			row := Subject{ID: s.id, Name: s.name, State: "not_assessed", Components: []Component{}}
			if x, ok := got[[2]string{st.ID, s.id}]; ok {
				row.State, row.Reason, row.Value, row.Max, row.Pct, row.Grade, row.Stale = x.state, x.reason, x.value, x.max, x.pct, x.grade, x.stale
				row.GradeDescriptor = x.detail.GradeDescriptor
				for _, c := range x.detail.Components {
					state := c.State
					if state == "left_out" {
						state = "not_assessed"
					}
					row.Components = append(row.Components, Component{Code: c.Code, Name: c.Name, State: state, Value: c.Value, Max: c.Max})
				}
			}
			f.Subjects = append(f.Subjects, row)
			lines = append(lines, scheme.SubjectLine{State: row.State, Value: row.Value, Max: row.Max})
		}
		f.Overall = scheme.Summarise(lines, 2)
		out = append(out, f)
	}
	return out, nil
}
