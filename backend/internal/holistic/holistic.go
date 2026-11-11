// Package holistic serves the holistic progress report (pilot P0.11 H2 to
// H5; blueprint v23 B8.6.2): scores and the child together, one page for
// most children. Competency and Bloom levels are worked out from tagged
// marks and never typed (D38); activities are rated by the teacher; the
// voices and the teacher's note are written once a term.
package holistic

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/ai"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/reports"
	"github.com/jackymean-del/revu/internal/results"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Options are what the holistic routes need from outside.
type Options struct {
	Renderer reports.Renderer
	AI       ai.Drafter // nil when AI drafting is not set up
}

// Routes serves the class view, the child's report, what teachers add to
// it, and its printable page and PDF.
func Routes(g fiber.Router, o Options) {
	g.Get("/holistic/settings", getSettings)
	g.Put("/holistic/settings", putSettings)
	g.Get("/holistic/class", classView)
	g.Get("/holistic/student", studentView)
	g.Put("/holistic/student", putStudent)
	g.Post("/holistic/note-draft", draftNote(o.AI))
	g.Get("/holistic/html", pageHTML)
	g.Post("/holistic/pdf", o.pdf)
}

// Level is one step of the institution's level scale: its name and the
// percentage it starts at.
type Level struct {
	Name string  `json:"name"`
	Min  float64 `json:"min"`
}

// Settings are the level scale, lowest first.
type Settings struct {
	Levels []Level `json:"levels"`
}

func defaultSettings() Settings {
	return Settings{Levels: []Level{{"Beginner", 0}, {"Developing", 40}, {"Proficient", 60}, {"Advanced", 80}}}
}

func loadSettings(ctx context.Context, tx pgx.Tx) (Settings, error) {
	s := defaultSettings()
	var raw []byte
	if err := tx.QueryRow(ctx, `SELECT settings -> 'holistic' FROM orgs WHERE id = app_org_id()`).Scan(&raw); err != nil {
		return s, err
	}
	var got Settings
	if len(raw) > 0 && json.Unmarshal(raw, &got) == nil && len(got.Levels) >= 2 {
		s = got
	}
	return s, nil
}

// levelOf is the 1-based step a percentage reaches.
func (s Settings) levelOf(pct float64) int {
	n := 1
	for i, l := range s.Levels {
		if pct >= l.Min {
			n = i + 1
		}
	}
	return n
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

// putSettings renames the levels or moves their starting percentages;
// administrators only.
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
	ok := len(in.Levels) >= 2 && len(in.Levels) <= 8 && in.Levels[0].Min == 0
	for i, l := range in.Levels {
		in.Levels[i].Name = strings.TrimSpace(l.Name)
		if in.Levels[i].Name == "" || len(in.Levels[i].Name) > 30 || l.Min < 0 || l.Min > 100 || (i > 0 && l.Min <= in.Levels[i-1].Min) {
			ok = false
		}
	}
	if !ok {
		return problem.Invalid(api.FieldError{Field: "levels", Code: "invalid", Message: "Give 2 to 8 levels with names of up to 30 characters; the first starts at 0% and each starts higher than the one before."})
	}
	raw, _ := json.Marshal(in)
	if _, err := tx.Exec(c.Context(), `UPDATE orgs SET settings = jsonb_set(settings, '{holistic}', $1::jsonb) WHERE id = app_org_id()`, string(raw)); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "holistic_settings", After: in}); err != nil {
		return err
	}
	return c.JSON(in)
}

// access checks a section can be read here: the section's teachers and
// class teacher, and those who approve report remarks. edit says whether
// the person may add ratings, voices and the note (the class teacher and
// administrators).
func access(c fiber.Ctx, tx pgx.Tx, sectionID, periodID string) (results.Section, bool, error) {
	var b pgx.Batch
	get := results.QueueSection(&b, sectionID, periodID)
	if err := tx.SendBatch(c.Context(), &b).Close(); err != nil {
		return results.Section{}, false, err
	}
	s, err := get()
	if err != nil {
		return s, false, err
	}
	actor, err := tenant.Teaching(c)
	if err != nil {
		return s, false, err
	}
	t := policy.Target{BranchID: s.BranchID, SectionID: s.ID}
	read := policy.Decide(actor, policy.ResultsRead, t) == policy.Full || policy.Decide(actor, policy.RemarksApprove, t) == policy.Full
	if !read {
		return s, false, problem.New(http.StatusForbidden, "auth.forbidden", "Only this section's teachers, its class teacher and those who approve reports see its holistic reports.")
	}
	return s, policy.Decide(actor, policy.RemarksEdit, t) == policy.Full, nil
}

// sectionOf is the section a student is in during a period's year.
func sectionOf(ctx context.Context, tx pgx.Tx, studentID, periodID string) (string, error) {
	if !records.UUIDShape.MatchString(studentID) || !records.UUIDShape.MatchString(periodID) {
		return "", problem.Invalid(api.FieldError{Field: "studentId", Code: "unknown", Message: "Not an id."})
	}
	var id string
	err := tx.QueryRow(ctx, `
		SELECT e.section_id::text FROM enrolments e JOIN periods p ON p.id = $2::uuid AND p.year_id = e.year_id
		 WHERE e.student_id = $1::uuid AND e.deleted_at IS NULL ORDER BY e.created_at DESC LIMIT 1`, studentID, periodID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", problem.New(http.StatusNotFound, "student.not_found", "This student is in no section that year.")
	}
	return id, err
}

func classView(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	s, edit, err := access(c, tx, c.Query("sectionId"), c.Query("periodId"))
	if err != nil {
		return err
	}
	cl, err := build(c.Context(), tx, s, c.Query("periodId"))
	if err != nil {
		return err
	}
	cl.CanEdit = edit
	return c.JSON(cl.view())
}

func studentView(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	studentID, periodID := c.Query("studentId"), c.Query("periodId")
	sectionID, err := sectionOf(ctx, tx, studentID, periodID)
	if err != nil {
		return err
	}
	s, edit, err := access(c, tx, sectionID, periodID)
	if err != nil {
		return err
	}
	cl, err := build(ctx, tx, s, periodID)
	if err != nil {
		return err
	}
	i := slices.IndexFunc(cl.Reports, func(r Report) bool { return r.Student.ID == studentID })
	if i < 0 {
		return problem.New(http.StatusNotFound, "student.not_found", "This student is not in the section.")
	}
	r := cl.Reports[i]
	r.CanEdit = edit
	return c.JSON(r)
}
