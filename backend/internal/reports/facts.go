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
	Pct   string `json:"pct,omitempty"`
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
	Passed          *bool       `json:"passed,omitempty"`
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
	var b pgx.Batch
	get := QueueBranding(&b)
	if err := results.Send(ctx, tx, &b); err != nil {
		return Branding{}, err
	}
	return get(), nil
}

// QueueBranding queues reading the latest branding, with the
// institution's name to fall back on.
func QueueBranding(b *pgx.Batch) func() Branding {
	var br Branding
	var name string
	found := false
	b.Queue(`
		SELECT version, display_name, coalesce(address, ''), coalesce(contact, ''), coalesce(affiliation, ''), coalesce(header_note, ''), logo IS NOT NULL
		  FROM branding_versions ORDER BY version DESC LIMIT 1`).
		Query(func(rows pgx.Rows) error {
			for rows.Next() {
				found = true
				if err := rows.Scan(&br.Version, &br.DisplayName, &br.Address, &br.Contact, &br.Affiliation, &br.HeaderNote, &br.HasLogo); err != nil {
					return err
				}
			}
			return rows.Err()
		})
	b.Queue(`SELECT name FROM orgs WHERE id = app_org_id()`).QueryRow(func(r pgx.Row) error { return r.Scan(&name) })
	return func() Branding {
		if !found {
			return Branding{DisplayName: name}
		}
		return br
	}
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
	var b pgx.Batch
	return QueueGather(&b, sec, periodID).Facts(ctx, tx, &b, only, cfg, now)
}

// Gathered is a Gather queued on a batch, waiting to be sent.
type Gathered struct {
	sec      results.Section
	periodID string
	words    func() func(key string, count int) string
	brand    func() Branding
	base     *Facts
	subjects *[]subj
	roster   func() results.Roster
	got      map[[2]string]stored
	schemes  func() results.Schemes
}

type subj struct{ id, name string }

type stored struct {
	state, reason, value, max, pct, grade string
	stale                                 bool
	detail                                scheme.Result
	schemeID, schemeName                  string
}

// QueueGather queues every read Gather needs on b: one round trip for a
// whole section, however many subjects (decision D30). A screen may queue
// its own reads on b too, then call Facts.
func QueueGather(b *pgx.Batch, sec results.Section, periodID string) *Gathered {
	g := &Gathered{sec: sec, periodID: periodID, base: &Facts{Words: map[string]string{}}, subjects: &[]subj{}, got: map[[2]string]stored{}}
	g.words = terminology.QueueWords(b)
	g.brand = QueueBranding(b)
	b.Queue(`
		SELECT l.name, s.name, y.label, p.name
		  FROM sections s JOIN levels l ON l.id = s.level_id JOIN academic_years y ON y.id = s.year_id, periods p
		 WHERE s.id = $1::uuid AND p.id = $2::uuid`, sec.ID, periodID).
		QueryRow(func(r pgx.Row) error { return r.Scan(&g.base.Level, &g.base.Section, &g.base.Year, &g.base.Period) })
	b.Queue(`
		SELECT s.id::text, s.name FROM level_subjects ls JOIN subjects s ON s.id = ls.subject_id AND s.deleted_at IS NULL
		 WHERE ls.level_id = $1::uuid AND ls.deleted_at IS NULL ORDER BY s.name`, sec.LevelID).
		Query(func(rows pgx.Rows) error {
			for rows.Next() {
				var x subj
				if err := rows.Scan(&x.id, &x.name); err != nil {
					return err
				}
				*g.subjects = append(*g.subjects, x)
			}
			return rows.Err()
		})
	g.roster = results.QueueRoster(b, sec, periodID)
	b.Queue(`
		SELECT r.student_id::text, r.subject_id::text, r.state::text, coalesce(r.reason, ''), coalesce(r.value::text, ''), coalesce(r.max::text, ''),
		       coalesce(r.pct::text, ''), coalesce(r.grade, ''), r.stale, r.detail, r.scheme_id::text, sc.name
		  FROM computed_results r JOIN schemes sc ON sc.id = r.scheme_id
		 WHERE r.period_id = $1::uuid AND r.component_code = '_subject'
		   AND r.student_id IN (SELECT student_id FROM enrolments WHERE section_id = $2::uuid AND year_id = $3::uuid AND deleted_at IS NULL)`,
		periodID, sec.ID, sec.YearID).
		Query(func(rows pgx.Rows) error {
			for rows.Next() {
				var student, subject string
				var x stored
				var detail []byte
				if err := rows.Scan(&student, &subject, &x.state, &x.reason, &x.value, &x.max, &x.pct, &x.grade, &x.stale, &detail, &x.schemeID, &x.schemeName); err != nil {
					return err
				}
				if len(detail) > 0 {
					if err := json.Unmarshal(detail, &x.detail); err != nil {
						return err
					}
				}
				g.got[[2]string{student, subject}] = x
			}
			return rows.Err()
		})
	g.schemes = results.QueueSchemes(b)
	return g
}

// Facts sends b, with the reads QueueGather queued and any others, and
// builds each student's facts in roll order.
func (g *Gathered) Facts(ctx context.Context, tx pgx.Tx, b *pgx.Batch, only []string, cfg Config, now time.Time) ([]Facts, error) {
	if err := results.Send(ctx, tx, b); err != nil {
		return nil, err
	}
	return g.Build(only, cfg, now), nil
}

// Build makes the facts once the batch QueueGather used has been sent.
func (g *Gathered) Build(only []string, cfg Config, now time.Time) []Facts {
	sec, periodID := g.sec, g.periodID
	base := *g.base
	base.Institution = g.brand()
	base.GeneratedAt = now.UTC().Format(time.RFC3339)
	words := g.words()
	for _, k := range wordKeys {
		base.Words[k] = words(k, 1)
	}

	// The level's subjects, in the template's order, then by name.
	subjects := *g.subjects
	rank := func(id string) int {
		if i := slices.Index(cfg.SubjectOrder, id); i >= 0 {
			return i
		}
		return len(cfg.SubjectOrder)
	}
	sort.SliceStable(subjects, func(i, j int) bool { return rank(subjects[i].id) < rank(subjects[j].id) })

	// Who takes what, and the roster in roll order.
	r := g.roster()
	roster := r.Students
	if len(only) > 0 {
		roster = slices.DeleteFunc(roster, func(s results.Student) bool { return !slices.Contains(only, s.ID) })
	}
	got := g.got
	schemes := g.schemes()

	// Band legends come from the schemes that apply here, one per scheme.
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
			pl := r.Places[[2]string{st.ID, s.id}]
			if !pl.Takes && !pl.ChoiceMissing {
				continue // a subject the student does not take is not on the report
			}
			row := Subject{ID: s.id, Name: s.name, State: "not_assessed", Components: []Component{}}
			if x, ok := got[[2]string{st.ID, s.id}]; ok {
				row.State, row.Reason, row.Value, row.Max, row.Pct, row.Grade, row.Stale = x.state, x.reason, x.value, x.max, x.pct, x.grade, x.stale
				row.GradeDescriptor, row.Passed = x.detail.GradeDescriptor, x.detail.Passed
				for _, c := range x.detail.Components {
					state := c.State
					if state == "left_out" {
						state = "not_assessed"
					}
					row.Components = append(row.Components, Component{Code: c.Code, Name: c.Name, State: state, Value: c.Value, Max: c.Max, Pct: c.Pct})
				}
			}
			f.Subjects = append(f.Subjects, row)
			lines = append(lines, scheme.SubjectLine{State: row.State, Value: row.Value, Max: row.Max})
		}
		f.Overall = scheme.Summarise(lines, 2)
		out = append(out, f)
	}
	return out
}
