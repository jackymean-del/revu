package syllabus

import (
	"errors"
	"net/http"
	"slices"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Routes serves the syllabus: what is loaded, one class and subject in
// full, the import, and changing an outcome's Bloom level or competency.
func Routes(g fiber.Router) {
	g.Get("/syllabus/summary", summary)
	g.Get("/syllabus", one)
	g.Post("/syllabus/import", importFile)
	g.Put("/learning-outcomes/:id", updateOutcome)
}

// Place is how much syllabus one class and subject has.
type Place struct {
	LevelID      string `json:"levelId"`
	SubjectID    string `json:"subjectId"`
	Competencies int    `json:"competencies"`
	Lessons      int    `json:"lessons"`
	Outcomes     int    `json:"outcomes"`
}

// summary lists every class and subject with syllabus, so the screen shows
// at a glance what is in and what is missing. Competencies for every level
// of a subject count in each class that takes it.
func summary(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	rows, err := tx.Query(c.Context(), `
		SELECT ls.level_id::text, ls.subject_id::text,
		       (SELECT count(*) FROM competencies k WHERE k.subject_id = ls.subject_id AND (k.level_id IS NULL OR k.level_id = ls.level_id) AND k.deleted_at IS NULL),
		       (SELECT count(*) FROM lessons l WHERE l.subject_id = ls.subject_id AND l.level_id = ls.level_id AND l.deleted_at IS NULL),
		       (SELECT count(*) FROM learning_outcomes o WHERE o.subject_id = ls.subject_id AND o.level_id = ls.level_id AND o.deleted_at IS NULL)
		  FROM level_subjects ls WHERE ls.deleted_at IS NULL`)
	if err != nil {
		return err
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Place, error) {
		var p Place
		return p, r.Scan(&p.LevelID, &p.SubjectID, &p.Competencies, &p.Lessons, &p.Outcomes)
	})
	if err != nil {
		return err
	}
	if out == nil {
		out = []Place{}
	}
	return c.JSON(out)
}

// Competency is one competency as the screen shows it.
type Competency struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Outcomes    int    `json:"outcomes"`
}

// Outcome is one learning outcome.
type Outcome struct {
	ID           string `json:"id"`
	Code         string `json:"code,omitempty"`
	Text         string `json:"text"`
	CompetencyID string `json:"competencyId,omitempty"`
	Bloom        string `json:"bloom"`
	BloomBy      string `json:"bloomBy"`
	Note         string `json:"note,omitempty"`
}

// Lesson is one lesson with its outcomes.
type Lesson struct {
	ID       string    `json:"id"`
	Seq      int       `json:"seq"`
	Name     string    `json:"name"`
	Outcomes []Outcome `json:"outcomes"`
}

// Syllabus is one class and subject in full.
type Syllabus struct {
	Kind         string       `json:"kind"` // academic or co_curricular
	Competencies []Competency `json:"competencies"`
	Lessons      []Lesson     `json:"lessons"`
	Unplaced     []Outcome    `json:"unplaced"` // outcomes in no lesson
}

func one(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	levelID, subjectID := c.Query("levelId"), c.Query("subjectId")
	if !records.UUIDShape.MatchString(levelID) || !records.UUIDShape.MatchString(subjectID) {
		return problem.Invalid(api.FieldError{Field: "levelId", Code: "required", Message: "Choose a class and a subject."})
	}
	out := Syllabus{Competencies: []Competency{}, Lessons: []Lesson{}, Unplaced: []Outcome{}}
	var b pgx.Batch
	b.Queue(`SELECT kind FROM subjects WHERE id = $1::uuid AND deleted_at IS NULL`, subjectID).QueryRow(func(r pgx.Row) error {
		err := r.Scan(&out.Kind)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil
		}
		return err
	})
	b.Queue(`
		SELECT k.id::text, k.name, coalesce(k.description, ''),
		       (SELECT count(*) FROM learning_outcomes o WHERE o.competency_id = k.id AND o.level_id = $2::uuid AND o.deleted_at IS NULL)
		  FROM competencies k WHERE k.subject_id = $1::uuid AND (k.level_id IS NULL OR k.level_id = $2::uuid) AND k.deleted_at IS NULL
		 ORDER BY k.seq, k.name`, subjectID, levelID).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var k Competency
			if err := rows.Scan(&k.ID, &k.Name, &k.Description, &k.Outcomes); err != nil {
				return err
			}
			out.Competencies = append(out.Competencies, k)
		}
		return rows.Err()
	})
	b.Queue(`SELECT id::text, seq, name FROM lessons WHERE level_id = $1::uuid AND subject_id = $2::uuid AND deleted_at IS NULL ORDER BY seq, name`, levelID, subjectID).
		Query(func(rows pgx.Rows) error {
			for rows.Next() {
				l := Lesson{Outcomes: []Outcome{}}
				if err := rows.Scan(&l.ID, &l.Seq, &l.Name); err != nil {
					return err
				}
				out.Lessons = append(out.Lessons, l)
			}
			return rows.Err()
		})
	type placed struct {
		lesson string
		o      Outcome
	}
	var all []placed
	b.Queue(`
		SELECT coalesce(lesson_id::text, ''), id::text, coalesce(code, ''), text, coalesce(competency_id::text, ''), bloom, bloom_by, coalesce(note, '')
		  FROM learning_outcomes WHERE level_id = $1::uuid AND subject_id = $2::uuid AND deleted_at IS NULL ORDER BY seq, text`, levelID, subjectID).
		Query(func(rows pgx.Rows) error {
			for rows.Next() {
				var p placed
				if err := rows.Scan(&p.lesson, &p.o.ID, &p.o.Code, &p.o.Text, &p.o.CompetencyID, &p.o.Bloom, &p.o.BloomBy, &p.o.Note); err != nil {
					return err
				}
				all = append(all, p)
			}
			return rows.Err()
		})
	if err := tx.SendBatch(ctx, &b).Close(); err != nil {
		return err
	}
	if out.Kind == "" {
		return problem.New(http.StatusNotFound, "subject.not_found", "No subject has this id.")
	}
	at := map[string]int{}
	for i, l := range out.Lessons {
		at[l.ID] = i
	}
	for _, p := range all {
		if i, ok := at[p.lesson]; ok {
			out.Lessons[i].Outcomes = append(out.Lessons[i].Outcomes, p.o)
		} else {
			out.Unplaced = append(out.Unplaced, p.o)
		}
	}
	return c.JSON(out)
}

type outcomeChange struct {
	Bloom        *string `json:"bloom"`
	CompetencyID *string `json:"competencyId"` // empty clears it
}

// updateOutcome changes an outcome's Bloom level (then marked as set by a
// teacher) or its competency, which must belong to the same subject.
func updateOutcome(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	actor, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	if err := policy.Check(actor, policy.StructureWrite, policy.Target{}); err != nil {
		return err
	}
	id := c.Params("id")
	notFound := problem.New(http.StatusNotFound, "outcome.not_found", "No learning outcome has this id.")
	if !records.UUIDShape.MatchString(id) {
		return notFound
	}
	var in outcomeChange
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if in.Bloom != nil && !slices.Contains(Blooms, *in.Bloom) {
		return problem.Invalid(api.FieldError{Field: "bloom", Code: "unknown", Message: "Choose remember, understand, apply, analyse, evaluate or create."})
	}
	var subjectID, levelID string
	err = tx.QueryRow(ctx, `SELECT subject_id::text, level_id::text FROM learning_outcomes WHERE id = $1::uuid AND deleted_at IS NULL`, id).Scan(&subjectID, &levelID)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound
	}
	if err != nil {
		return err
	}
	if in.CompetencyID != nil && *in.CompetencyID != "" {
		var ok bool
		if !records.UUIDShape.MatchString(*in.CompetencyID) {
			return problem.Invalid(api.FieldError{Field: "competencyId", Code: "unknown", Message: "Not a competency of this subject."})
		}
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM competencies WHERE id = $1::uuid AND subject_id = $2::uuid AND (level_id IS NULL OR level_id = $3::uuid) AND deleted_at IS NULL)`,
			*in.CompetencyID, subjectID, levelID).Scan(&ok); err != nil {
			return err
		}
		if !ok {
			return problem.Invalid(api.FieldError{Field: "competencyId", Code: "unknown", Message: "Not a competency of this subject."})
		}
	}
	var o Outcome
	err = tx.QueryRow(ctx, `
		UPDATE learning_outcomes SET
		       bloom = coalesce($2, bloom),
		       bloom_by = CASE WHEN $2::text IS NULL THEN bloom_by ELSE 'teacher' END,
		       competency_id = CASE WHEN $3::text IS NULL THEN competency_id ELSE nullif($3, '')::uuid END,
		       updated_at = now()
		 WHERE id = $1::uuid
		RETURNING id::text, coalesce(code, ''), text, coalesce(competency_id::text, ''), bloom, bloom_by, coalesce(note, '')`,
		id, in.Bloom, in.CompetencyID).Scan(&o.ID, &o.Code, &o.Text, &o.CompetencyID, &o.Bloom, &o.BloomBy, &o.Note)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "learning_outcomes", EntityID: id, After: in}); err != nil {
		return err
	}
	return c.JSON(o)
}
