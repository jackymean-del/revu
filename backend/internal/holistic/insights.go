package holistic

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"slices"
	"sort"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/ai"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Each subject on the holistic progress card has an insight: a short line
// for the first page, and a fuller one for the subject's own part, beside
// its learning outcomes (or its sections, or the whole, as finely as the
// marks were entered) and its grade. Both are worked out from every
// assessment of the term. They are drafted from the data here, or with AI
// when it is set up, then edited and approved by the class teacher.

// Point is one learning outcome of a subject and how the child did in it.
type Point struct {
	Text  string  `json:"text"`
	Pct   float64 `json:"pct"`
	Level int     `json:"level"` // a step of the scale, 0 with too little evidence
	Marks int     `json:"marks"`
}

// Insight is a subject's insight for a child, with what it rests on.
type Insight struct {
	SubjectID string    `json:"subjectId"`
	Subject   string    `json:"subject"`
	Grade     string    `json:"grade"`
	Pct       *float64  `json:"pct,omitempty"`
	ClassPct  *float64  `json:"classPct,omitempty"`
	Trend     []float64 `json:"trend"`
	Points    []Point   `json:"points"`
	Summary   string    `json:"summary"`
	Detail    string    `json:"detail"`
	Status    string    `json:"status"` // draft or approved, empty when none
	FromAI    bool      `json:"fromAi"`
}

type savedInsight struct {
	summary, detail, status string
	fromAI                  bool
}

// insights lays out each subject of a report with its outcomes and what
// was saved for it.
func insights(r Report, outs []outRow, saved map[string]savedInsight, scale []Level, levelOf func(float64) int) []Insight {
	list := []Insight{}
	// Every subject with a result, then any with outcome marks but no
	// result worked out yet.
	scores := append([]Score{}, r.Scores...)
	for _, o := range outs {
		if !slices.ContainsFunc(scores, func(s Score) bool { return s.SubjectID == o.subjectID }) {
			scores = append(scores, Score{SubjectID: o.subjectID, Subject: o.subject, Trend: []float64{}})
		}
	}
	for _, s := range scores {
		in := Insight{SubjectID: s.SubjectID, Subject: s.Subject, Grade: s.Grade, Pct: s.Pct, ClassPct: s.ClassPct, Trend: s.Trend, Points: []Point{}}
		for _, o := range outs {
			if o.subjectID != s.SubjectID || o.t.max <= 0 {
				continue
			}
			p := Point{Text: o.text, Pct: math.Round(o.t.pct()*10) / 10, Marks: o.t.marks}
			if o.t.marks >= enough || o.t.max >= 2 {
				p.Level = levelOf(p.Pct)
			}
			in.Points = append(in.Points, p)
		}
		sort.SliceStable(in.Points, func(i, j int) bool { return in.Points[i].Pct > in.Points[j].Pct })
		if v, ok := saved[s.SubjectID]; ok {
			in.Summary, in.Detail, in.Status, in.FromAI = v.summary, v.detail, v.status, v.fromAI
		}
		list = append(list, in)
	}
	return list
}

func firstName(name string) string {
	if f := strings.Fields(name); len(f) > 0 {
		return f[0]
	}
	return name
}

func joinAnd(xs []string) string {
	switch len(xs) {
	case 0:
		return ""
	case 1:
		return xs[0]
	}
	return strings.Join(xs[:len(xs)-1], ", ") + " and " + xs[len(xs)-1]
}

// lowerFirst makes an outcome read inside a sentence: "Adds fractions."
// becomes "adds fractions".
func lowerFirst(s string) string {
	s = strings.TrimRight(strings.TrimSpace(s), ".")
	if s == "" {
		return s
	}
	w := strings.SplitN(s, " ", 2)
	if len(w[0]) > 1 && strings.ToUpper(w[0]) == w[0] {
		return s // an abbreviation stays as it is
	}
	return strings.ToLower(s[:1]) + s[1:]
}

// draftFromData words a subject's insight from its figures alone. The
// summary is a line for the first page; the detail names the outcomes in
// the scale's own words, or says the marks do not go that far.
func draftFromData(name string, in Insight, detail string, scale []Level) (summary, more string) {
	var s strings.Builder
	if in.Pct != nil {
		fmt.Fprintf(&s, "%s scored %s%% in %s", name, trimPct(*in.Pct), in.Subject)
		if in.Grade != "" {
			fmt.Fprintf(&s, " (grade %s)", in.Grade)
		}
		if in.ClassPct != nil {
			switch d := *in.Pct - *in.ClassPct; {
			case d >= 5:
				s.WriteString(", above the class average")
			case d <= -5:
				s.WriteString(", below the class average")
			default:
				s.WriteString(", close to the class average")
			}
		}
		s.WriteString(".")
	} else {
		fmt.Fprintf(&s, "%s's result in %s is still to come.", name, in.Subject)
	}
	if t := in.Trend; len(t) >= 2 {
		first, last := t[0], t[len(t)-1]
		switch {
		case last-first >= 5:
			fmt.Fprintf(&s, " Improved across the term's %d assessments, from %s%% to %s%%.", len(t), trimPct(first), trimPct(last))
		case first-last >= 5:
			fmt.Fprintf(&s, " Dropped across the term's %d assessments, from %s%% to %s%%.", len(t), trimPct(first), trimPct(last))
		default:
			fmt.Fprintf(&s, " Steady across the term's %d assessments.", len(t))
		}
	}
	summary = s.String()

	if detail == "total" || len(in.Points) == 0 {
		return summary, "Marks for " + in.Subject + " were entered as one total, so this is an overall picture rather than outcome by outcome."
	}
	// Group the outcomes by the step of the scale they reached.
	byLevel := map[int][]string{}
	var thin []string
	for _, p := range in.Points {
		if p.Level < 1 {
			thin = append(thin, lowerFirst(p.Text))
			continue
		}
		byLevel[p.Level] = append(byLevel[p.Level], lowerFirst(p.Text))
	}
	var m strings.Builder
	if detail == "sections" {
		m.WriteString("Judged from section marks. ")
	}
	for lv := len(scale); lv >= 1; lv-- {
		if xs := byLevel[lv]; len(xs) > 0 {
			fmt.Fprintf(&m, "%s: %s. ", scale[lv-1].Name, joinAnd(xs))
		}
	}
	if len(thin) > 0 {
		fmt.Fprintf(&m, "Too little evidence yet: %s.", joinAnd(thin))
	}
	return summary, strings.TrimSpace(m.String())
}

func trimPct(f float64) string {
	return strings.TrimSuffix(fmt.Sprintf("%.1f", f), ".0")
}

const insightSystem = `You polish a class teacher's insights on a child's progress in each subject, for the holistic progress card. The teacher reads, edits and approves every word before a family sees it.
For each subject you are given figures and a plain draft. Return a "summary" of one sentence (at most 30 words) for the card's first page, and a "detail" of two to four sentences (at most 90 words) for the subject's own section.
Combine the learning outcomes into a clear picture: what the child does well, what is developing, and one concrete next step. Use the level words given, not percentages, in the detail; the summary may keep the grade.
Refer to the child only as {name}; do not use he, she or they for the child.
Use only the facts given. Do not invent events, behaviour or marks, and do not mention other children or ranks. Warm, plain language a parent understands.`

// polish asks the model to reword a child's drafts, sent without any name
// or identity. On any failure the drafts from the data stand.
func polish(ctx context.Context, d ai.Drafter, list []Insight, drafts map[string][2]string) map[string][2]string {
	var p strings.Builder
	for _, in := range list {
		dr := drafts[in.SubjectID]
		fmt.Fprintf(&p, "Subject: %s (id %s)\n", in.Subject, in.SubjectID)
		if in.Grade != "" {
			fmt.Fprintf(&p, "Grade: %s\n", in.Grade)
		}
		fmt.Fprintf(&p, "Draft summary: %s\nDraft detail: %s\n\n", dr[0], dr[1])
	}
	item := ai.Object(map[string]any{"subjectId": ai.String(), "summary": ai.String(), "detail": ai.String()})
	var out struct {
		Subjects []struct{ SubjectID, Summary, Detail string } `json:"subjects"`
	}
	if err := d.Draft(ctx, ai.Request{System: insightSystem, Prompt: p.String(), Schema: ai.Object(map[string]any{"subjects": ai.Array(item)})}, &out); err != nil {
		if !errors.Is(err, ai.ErrRefused) {
			slog.Error("ai insights", "err", err)
		}
		return nil
	}
	got := map[string][2]string{}
	for _, s := range out.Subjects {
		if _, ok := drafts[s.SubjectID]; ok && strings.TrimSpace(s.Summary) != "" && len(s.Summary) <= 400 && len(s.Detail) <= 1500 {
			got[s.SubjectID] = [2]string{strings.TrimSpace(s.Summary), strings.TrimSpace(s.Detail)}
		}
	}
	return got
}

// draftInsights drafts every subject's insight for one child, or for every
// child of a section, and saves them as drafts. An approved insight is left
// as it is. With AI set up the drafts are reworded by it, with no name sent;
// without, they stand as worded from the data.
func draftInsights(d ai.Drafter) fiber.Handler {
	return func(c fiber.Ctx) error {
		tx, err := tenant.Tx(c)
		if err != nil {
			return err
		}
		ctx := c.Context()
		var in struct {
			PeriodID  string `json:"periodId"`
			StudentID string `json:"studentId"`
			SectionID string `json:"sectionId"`
		}
		if err := httpx.Decode(c, &in); err != nil {
			return err
		}
		for _, v := range []string{in.PeriodID, in.StudentID, in.SectionID} {
			if v != "" && !records.UUIDShape.MatchString(v) {
				return problem.Invalid(api.FieldError{Field: "studentId", Code: "unknown", Message: "Not an id."})
			}
		}
		if in.PeriodID == "" || (in.StudentID == "") == (in.SectionID == "") {
			return problem.Invalid(api.FieldError{Field: "studentId", Code: "required", Message: "Name the term, and a child or a section."})
		}
		sectionID := in.SectionID
		if in.StudentID != "" {
			if sectionID, err = sectionOf(ctx, tx, in.StudentID, in.PeriodID); err != nil {
				return err
			}
		}
		s, edit, err := access(c, tx, sectionID, in.PeriodID)
		if err != nil {
			return err
		}
		if !edit {
			return problem.New(http.StatusForbidden, "auth.forbidden", "Only the class teacher and administrators write the insights.")
		}
		cl, err := build(ctx, tx, s, in.PeriodID)
		if err != nil {
			return err
		}
		m, _ := tenant.MemberFrom(c)
		drafted, children := 0, 0
		for _, r := range cl.Reports {
			if in.StudentID != "" && r.Student.ID != in.StudentID {
				continue
			}
			drafts := map[string][2]string{}
			var todo []Insight
			for _, x := range r.Insights {
				if x.Status == "approved" {
					continue
				}
				sm, dt := draftFromData("{name}", x, r.Detail, r.Scale)
				drafts[x.SubjectID] = [2]string{sm, dt}
				todo = append(todo, x)
			}
			if len(todo) == 0 {
				continue
			}
			fromAI := false
			if d != nil {
				if got := polish(ctx, d, todo, drafts); len(got) > 0 {
					for k, v := range got {
						drafts[k] = v
					}
					fromAI = true
				}
			}
			name := firstName(r.Student.Name)
			for _, x := range todo {
				dr := drafts[x.SubjectID]
				if _, err := tx.Exec(ctx, `
					INSERT INTO holistic_insights (org_id, student_id, period_id, subject_id, summary, detail, status, from_ai, written_by)
					VALUES ($1, $2::uuid, $3::uuid, $4::uuid, left($5, 400), left($6, 1500), 'draft', $7, $8)
					ON CONFLICT (student_id, period_id, subject_id) DO UPDATE SET summary = excluded.summary, detail = excluded.detail,
					  from_ai = excluded.from_ai, written_by = excluded.written_by, updated_at = now()
					WHERE holistic_insights.status = 'draft'`,
					m.OrgID, r.Student.ID, in.PeriodID, x.SubjectID, strings.ReplaceAll(dr[0], "{name}", name), strings.ReplaceAll(dr[1], "{name}", name), fromAI, m.UserID); err != nil {
					return err
				}
				drafted++
			}
			children++
		}
		model := "built-in"
		if d != nil {
			model = ai.Model
		}
		if err := audit.Record(c, audit.Entry{Action: "draft", Entity: "holistic_insights", After: map[string]any{"model": model, "children": children, "subjects": drafted, "periodId": in.PeriodID}}); err != nil {
			return err
		}
		return c.JSON(map[string]int{"children": children, "drafted": drafted})
	}
}

// insightIn is a subject's insight as the teacher saves it.
type insightIn struct {
	SubjectID string `json:"subjectId"`
	Summary   string `json:"summary"`
	Detail    string `json:"detail"`
	Approve   bool   `json:"approve"`
}

// saveInsights queues what the teacher saved: each subject's texts, as a
// draft or approved. Both texts empty clears it.
func saveInsights(b *pgx.Batch, orgID, userID, studentID, periodID string, list []insightIn) error {
	for _, x := range list {
		if !records.UUIDShape.MatchString(x.SubjectID) {
			return problem.Invalid(api.FieldError{Field: "insights", Code: "unknown", Message: "Not a subject."})
		}
		summary, detail := strings.TrimSpace(x.Summary), strings.TrimSpace(x.Detail)
		if len([]rune(summary)) > 400 || len([]rune(detail)) > 1500 {
			return problem.Invalid(api.FieldError{Field: "insights", Code: "too_long", Message: "A summary is up to 400 characters, and the fuller insight up to 1500."})
		}
		if summary == "" && detail == "" {
			b.Queue(`DELETE FROM holistic_insights WHERE student_id = $1::uuid AND period_id = $2::uuid AND subject_id = $3::uuid`, studentID, periodID, x.SubjectID)
			continue
		}
		status := "draft"
		if x.Approve {
			status = "approved"
		}
		b.Queue(`INSERT INTO holistic_insights (org_id, student_id, period_id, subject_id, summary, detail, status, written_by, approved_by, approved_at)
			VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, CASE WHEN $7 = 'approved' THEN $8 END, CASE WHEN $7 = 'approved' THEN now() END)
			ON CONFLICT (student_id, period_id, subject_id) DO UPDATE SET summary = excluded.summary, detail = excluded.detail, status = excluded.status,
			  written_by = excluded.written_by, approved_by = excluded.approved_by, approved_at = excluded.approved_at, updated_at = now()`,
			orgID, studentID, periodID, x.SubjectID, summary, detail, status, userID)
	}
	return nil
}
