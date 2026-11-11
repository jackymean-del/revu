package holistic

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
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

type ratingIn struct {
	CompetencyID string `json:"competencyId"`
	Level        int    `json:"level"` // 0 clears it
}

type noteIn struct {
	Text    string `json:"text"`
	Approve bool   `json:"approve"`
	FromAI  bool   `json:"fromAi"`
}

type studentIn struct {
	StudentID string     `json:"studentId"`
	PeriodID  string     `json:"periodId"`
	Ratings   []ratingIn `json:"ratings"`
	Voices    *Voices    `json:"voices"`
	Note      *noteIn    `json:"note"`
}

// putStudent saves what the class teacher adds to a child's report: the
// activity ratings, the voices and the note. Each part is saved only when
// sent; an empty text or a 0 rating clears it.
func putStudent(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	var in studentIn
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	sectionID, err := sectionOf(ctx, tx, in.StudentID, in.PeriodID)
	if err != nil {
		return err
	}
	s, edit, err := access(c, tx, sectionID, in.PeriodID)
	if err != nil {
		return err
	}
	if !edit {
		return problem.New(http.StatusForbidden, "auth.forbidden", "Only the class teacher and administrators add to a child's holistic report.")
	}
	st, err := loadSettings(ctx, tx)
	if err != nil {
		return err
	}
	var f records.Fields
	for _, r := range in.Ratings {
		if !records.UUIDShape.MatchString(r.CompetencyID) || r.Level < 0 || r.Level > len(st.Levels) {
			f.Add("ratings", "invalid", fmt.Sprintf("Ratings are levels from 1 to %d, or 0 to clear.", len(st.Levels)))
			break
		}
	}
	if v := in.Voices; v != nil {
		for _, x := range []string{v.Self, v.Peer, v.Parent, v.Ambition} {
			if len([]rune(strings.TrimSpace(x))) > 300 {
				f.Add("voices", "too_long", "Each voice is one line, up to 300 characters.")
				break
			}
		}
	}
	if in.Note != nil && len([]rune(strings.TrimSpace(in.Note.Text))) > 1500 {
		f.Add("note", "too_long", "The note is up to 1500 characters.")
	}
	if len(f) > 0 {
		return problem.Invalid(f...)
	}
	m, _ := tenant.MemberFrom(c)
	var b pgx.Batch
	if len(in.Ratings) > 0 {
		// Only activity competencies of the section's level are rated.
		var allowed []string
		rows, err := tx.Query(ctx, `
			SELECT c.id::text FROM competencies c JOIN subjects sj ON sj.id = c.subject_id AND sj.kind = 'co_curricular' AND sj.deleted_at IS NULL
			  JOIN level_subjects ls ON ls.subject_id = sj.id AND ls.level_id = $1::uuid AND ls.deleted_at IS NULL
			 WHERE c.deleted_at IS NULL AND (c.level_id IS NULL OR c.level_id = $1::uuid)`, s.LevelID)
		if err != nil {
			return err
		}
		if allowed, err = pgx.CollectRows(rows, pgx.RowTo[string]); err != nil {
			return err
		}
		for _, r := range in.Ratings {
			if !slices.Contains(allowed, r.CompetencyID) {
				return problem.Invalid(api.FieldError{Field: "ratings", Code: "unknown", Message: "Only the activities of this class are rated here."})
			}
			if r.Level == 0 {
				b.Queue(`DELETE FROM holistic_ratings WHERE student_id = $1::uuid AND period_id = $2::uuid AND competency_id = $3::uuid`, in.StudentID, in.PeriodID, r.CompetencyID)
				continue
			}
			b.Queue(`INSERT INTO holistic_ratings (org_id, student_id, period_id, competency_id, level, rated_by) VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6)
				ON CONFLICT (student_id, period_id, competency_id) DO UPDATE SET level = excluded.level, rated_by = excluded.rated_by, updated_at = now()`,
				m.OrgID, in.StudentID, in.PeriodID, r.CompetencyID, r.Level, m.UserID)
		}
	}
	if v := in.Voices; v != nil {
		for kind, text := range map[string]string{"self": v.Self, "peer": v.Peer, "parent": v.Parent, "ambition": v.Ambition} {
			text = strings.Join(strings.Fields(text), " ")
			if text == "" {
				b.Queue(`DELETE FROM holistic_voices WHERE student_id = $1::uuid AND period_id = $2::uuid AND kind = $3`, in.StudentID, in.PeriodID, kind)
				continue
			}
			b.Queue(`INSERT INTO holistic_voices (org_id, student_id, period_id, kind, text, recorded_by) VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6)
				ON CONFLICT (student_id, period_id, kind) DO UPDATE SET text = excluded.text, recorded_by = excluded.recorded_by, updated_at = now()`,
				m.OrgID, in.StudentID, in.PeriodID, kind, text, m.UserID)
		}
	}
	if n := in.Note; n != nil {
		text := strings.TrimSpace(n.Text)
		if text == "" {
			b.Queue(`DELETE FROM holistic_notes WHERE student_id = $1::uuid AND period_id = $2::uuid`, in.StudentID, in.PeriodID)
		} else {
			status := "draft"
			if n.Approve {
				status = "approved"
			}
			b.Queue(`INSERT INTO holistic_notes (org_id, student_id, period_id, text, status, from_ai, written_by, approved_by, approved_at)
				VALUES ($1, $2::uuid, $3::uuid, $4, $5, $6, $7, CASE WHEN $5 = 'approved' THEN $7 END, CASE WHEN $5 = 'approved' THEN now() END)
				ON CONFLICT (student_id, period_id) DO UPDATE SET text = excluded.text, status = excluded.status, from_ai = excluded.from_ai,
				  written_by = excluded.written_by, approved_by = excluded.approved_by, approved_at = excluded.approved_at, updated_at = now()`,
				m.OrgID, in.StudentID, in.PeriodID, text, status, n.FromAI, m.UserID)
		}
	}
	if b.Len() > 0 {
		if err := tx.SendBatch(ctx, &b).Close(); err != nil {
			return err
		}
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "holistic", EntityID: in.StudentID,
		After: map[string]any{"periodId": in.PeriodID, "ratings": len(in.Ratings), "voices": in.Voices != nil, "note": in.Note != nil && strings.TrimSpace(in.Note.Text) != ""}}); err != nil {
		return err
	}
	cl, err := build(ctx, tx, s, in.PeriodID)
	if err != nil {
		return err
	}
	i := slices.IndexFunc(cl.Reports, func(r Report) bool { return r.Student.ID == in.StudentID })
	if i < 0 {
		return problem.New(http.StatusNotFound, "student.not_found", "This student is not in the section.")
	}
	r := cl.Reports[i]
	r.CanEdit = true
	return c.JSON(r)
}

const noteSystem = `You draft a short note from a class teacher to a child's family, for the holistic progress report. The teacher reads, edits and approves it before anyone sees it.
Write 60 to 100 words in warm, plain, specific language a parent understands. Start with a real strength, name one or two areas to work on with one concrete idea for home, and end with encouragement.
Refer to the child only as {name}, and do not use he, she or they for the child; repeat {name} or rephrase instead.
Use only the facts given. Do not invent events, behaviour or marks, and do not mention percentages, ranks or other children.`

// draftNote drafts the teacher's note from the child's levels and outcomes,
// sent without the name or any other identity: the model writes {name} and
// the name is put in afterwards, here. The draft is returned, not saved.
func draftNote(d ai.Drafter) fiber.Handler {
	return func(c fiber.Ctx) error {
		if d == nil {
			return problem.New(http.StatusServiceUnavailable, "ai.off", "AI drafting is not set up for this service yet.")
		}
		tx, err := tenant.Tx(c)
		if err != nil {
			return err
		}
		ctx := c.Context()
		var in struct {
			StudentID string `json:"studentId"`
			PeriodID  string `json:"periodId"`
		}
		if err := httpx.Decode(c, &in); err != nil {
			return err
		}
		sectionID, err := sectionOf(ctx, tx, in.StudentID, in.PeriodID)
		if err != nil {
			return err
		}
		s, edit, err := access(c, tx, sectionID, in.PeriodID)
		if err != nil {
			return err
		}
		if !edit {
			return problem.New(http.StatusForbidden, "auth.forbidden", "Only the class teacher and administrators write the note.")
		}
		cl, err := build(ctx, tx, s, in.PeriodID)
		if err != nil {
			return err
		}
		i := slices.IndexFunc(cl.Reports, func(r Report) bool { return r.Student.ID == in.StudentID })
		if i < 0 {
			return problem.New(http.StatusNotFound, "student.not_found", "This student is not in the section.")
		}
		r := cl.Reports[i]
		prompt := noteFacts(r)
		var out struct {
			Note string `json:"note"`
		}
		if err := d.Draft(ctx, ai.Request{System: noteSystem, Prompt: prompt, Schema: ai.Object(map[string]any{"note": ai.String()})}, &out); err != nil {
			if errors.Is(err, ai.ErrRefused) {
				return problem.New(http.StatusUnprocessableEntity, "ai.declined", "The AI declined to draft this note; write it yourself.")
			}
			slog.Error("ai note", "err", err)
			return problem.New(http.StatusBadGateway, "ai.failed", "The AI could not draft the note just now. Try again.")
		}
		first := strings.Fields(r.Student.Name)
		name := r.Student.Name
		if len(first) > 0 {
			name = first[0]
		}
		if err := audit.Record(c, audit.Entry{Action: "draft", Entity: "holistic_notes", EntityID: in.StudentID, After: map[string]any{"model": ai.Model, "periodId": in.PeriodID}}); err != nil {
			return err
		}
		return c.JSON(map[string]string{"text": strings.ReplaceAll(strings.TrimSpace(out.Note), "{name}", name)})
	}
}

// noteFacts are the anonymous facts a note is drafted from: levels in
// words, strengths and focus areas as outcomes, activity ratings. No name,
// number, mark, voice or class figure is included.
func noteFacts(r Report) string {
	var p strings.Builder
	level := func(n int) string {
		if n < 1 || n > len(r.Scale) {
			return "not enough evidence yet"
		}
		return r.Scale[n-1].Name
	}
	p.WriteString("Levels, lowest to highest: ")
	for i, l := range r.Scale {
		if i > 0 {
			p.WriteString(", ")
		}
		p.WriteString(l.Name)
	}
	p.WriteString("\n\nSubjects and competencies:\n")
	for _, pr := range r.Profile {
		fmt.Fprintf(&p, "- %s: ", pr.Subject)
		for i, ch := range pr.Competencies {
			if i > 0 {
				p.WriteString("; ")
			}
			fmt.Fprintf(&p, "%s %s", ch.Name, level(ch.Level))
		}
		p.WriteString("\n")
	}
	if len(r.Strengths) > 0 {
		p.WriteString("\nStrengths (learning outcomes):\n")
		for _, o := range r.Strengths {
			fmt.Fprintf(&p, "- %s (%s)\n", o.Text, o.Subject)
		}
	}
	if len(r.Focus) > 0 {
		p.WriteString("\nTo work on (learning outcomes):\n")
		for _, o := range r.Focus {
			fmt.Fprintf(&p, "- %s (%s)\n", o.Text, o.Subject)
		}
	}
	var acts []string
	for _, a := range r.Activities {
		if a.Level > 0 {
			acts = append(acts, fmt.Sprintf("%s %s", a.Name, level(a.Level)))
		}
	}
	if len(acts) > 0 {
		fmt.Fprintf(&p, "\nActivities: %s\n", strings.Join(acts, "; "))
	}
	return p.String()
}
