package papers

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/ai"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/syllabus"
	"github.com/jackymean-del/revu/internal/tenant"
)

type draftIn struct {
	LevelID   string `json:"levelId"`
	SubjectID string `json:"subjectId"`
	LessonID  string `json:"lessonId"`
	OutcomeID string `json:"outcomeId"`
	QType     string `json:"qtype"`
	Bloom     string `json:"bloom"`
	Marks     string `json:"marks"`
	Count     int    `json:"count"`
	Note      string `json:"note"`     // anything the teacher wants, e.g. "use local examples"
	Taxonomy  string `json:"taxonomy"` // solo or custom, with Level; Bloom uses Bloom
	Level     string `json:"level"`
}

var soloMeaning = map[string]string{
	"prestructural":   "the learner has not yet grasped the point; questions here check basic recognition",
	"unistructural":   "one relevant idea (identify, name, follow a simple procedure)",
	"multistructural": "several relevant ideas, used separately (describe, list, combine)",
	"relational":      "ideas linked into a whole (explain causes, compare, relate, apply)",
	"extended":        "the whole taken to a new situation (generalise, hypothesise, reflect, create)",
}

var bloomVerbs = map[string]string{
	"remember":   "recall facts and basic ideas (identify, list, define, name)",
	"understand": "explain ideas (describe, explain, summarise, classify)",
	"apply":      "use what was learnt in a new situation (solve, calculate, use, demonstrate)",
	"analyse":    "break ideas apart and see how they relate (compare, differentiate, examine)",
	"evaluate":   "justify a position or judge (assess, argue, defend, critique)",
	"create":     "produce something new (design, compose, plan, construct)",
}

const draftSystem = `You write examination questions for a teacher, who checks every one before use.
Write original questions, never copied from a textbook or past paper you remember.
Each question must test the stated learning outcome at the stated Bloom level and be answerable by a typical learner of the stated class in the time its marks suggest (about one minute per mark).
Use clear, plain language for that age. Avoid real people's names, brands and anything culturally or politically sensitive.
For choice questions give exactly four options, one correct, with plausible distractors; for true or false, give the two options True and False.
The answer is for the teacher: give the correct answer and, for more than one mark, how the marks split.
Do not repeat or closely paraphrase the existing questions you are shown.`

// draftQuestions asks the model for questions fitting one need of the
// blueprint and saves them in the bank as drafts from AI, to be approved by
// a teacher (B3.4). Only the curriculum is sent: no learner data at all.
func draftQuestions(d ai.Drafter) fiber.Handler {
	return func(c fiber.Ctx) error {
		if d == nil {
			return problem.New(http.StatusServiceUnavailable, "ai.off", "AI drafting is not set up for this service yet.")
		}
		tx, err := tenant.Tx(c)
		if err != nil {
			return err
		}
		ctx := c.Context()
		var in draftIn
		if err := httpx.Decode(c, &in); err != nil {
			return err
		}
		if !records.UUIDShape.MatchString(in.LevelID) || !records.UUIDShape.MatchString(in.SubjectID) {
			return problem.Invalid(api.FieldError{Field: "levelId", Code: "required", Message: "Choose a class and a subject."})
		}
		for _, v := range []string{in.LessonID, in.OutcomeID} {
			if v != "" && !records.UUIDShape.MatchString(v) {
				return problem.Invalid(api.FieldError{Field: "lessonId", Code: "unknown", Message: "Not a lesson or outcome."})
			}
		}
		if in.Bloom != "" && !slices.Contains(syllabus.Blooms, in.Bloom) {
			return problem.Invalid(api.FieldError{Field: "bloom", Code: "unknown", Message: "Choose a Bloom level."})
		}
		if !marksShape.MatchString(in.Marks) || strings.Trim(in.Marks, "0.") == "" {
			return problem.Invalid(api.FieldError{Field: "marks", Code: "invalid", Message: "Give the marks."})
		}
		in.QType = strings.TrimSpace(in.QType)
		if in.QType == "" || len(in.QType) > 60 || len(in.Note) > 500 {
			return problem.Invalid(api.FieldError{Field: "qtype", Code: "required", Message: "Choose the question type; a note is up to 500 characters."})
		}
		in.Count = min(max(in.Count, 1), 5)
		var customName string
		switch in.Taxonomy {
		case "", "bloom", "none":
		case "solo":
			if !slices.Contains(SOLO, in.Level) {
				return problem.Invalid(api.FieldError{Field: "level", Code: "unknown", Message: "Choose a SOLO level."})
			}
		case "custom":
			st, err := loadSettings(ctx, tx)
			if err != nil {
				return err
			}
			if !slices.Contains(st.Custom.Levels, in.Level) {
				return problem.Invalid(api.FieldError{Field: "level", Code: "unknown", Message: "Choose one of your levels."})
			}
			customName = st.Custom.Name
		default:
			return problem.Invalid(api.FieldError{Field: "taxonomy", Code: "unknown", Message: "Not a taxonomy."})
		}
		if err := mayWrite(c, in.SubjectID); err != nil {
			return err
		}

		// The curriculum around the need: class, subject, lesson, its
		// outcomes, and what the bank already holds for it.
		var level, subject, lesson string
		if err := tx.QueryRow(ctx, `SELECT (SELECT name FROM levels WHERE id = $1::uuid), (SELECT name FROM subjects WHERE id = $2::uuid),
			coalesce((SELECT name FROM lessons WHERE id = nullif($3, '')::uuid), '')`, in.LevelID, in.SubjectID, in.LessonID).Scan(&level, &subject, &lesson); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `
			SELECT o.id::text, o.text FROM learning_outcomes o
			 WHERE o.level_id = $1::uuid AND o.subject_id = $2::uuid AND ($3 = '' OR o.lesson_id = nullif($3, '')::uuid) AND o.deleted_at IS NULL
			 ORDER BY o.seq, o.text LIMIT 40`, in.LevelID, in.SubjectID, in.LessonID)
		if err != nil {
			return err
		}
		var outcomes []string
		var target string
		for rows.Next() {
			var id, text string
			if err := rows.Scan(&id, &text); err != nil {
				return err
			}
			if id == in.OutcomeID {
				target = text
			}
			outcomes = append(outcomes, text)
		}
		if err := rows.Err(); err != nil {
			return err
		}
		rows, err = tx.Query(ctx, `SELECT text FROM questions WHERE level_id = $1::uuid AND subject_id = $2::uuid AND ($3 = '' OR lesson_id = nullif($3, '')::uuid) AND status <> 'retired'
			ORDER BY created_at DESC LIMIT 30`, in.LevelID, in.SubjectID, in.LessonID)
		if err != nil {
			return err
		}
		var existing []string
		for rows.Next() {
			var t string
			if err := rows.Scan(&t); err != nil {
				return err
			}
			existing = append(existing, t)
		}
		if err := rows.Err(); err != nil {
			return err
		}

		var p strings.Builder
		fmt.Fprintf(&p, "Class: %s\nSubject: %s\n", level, subject)
		if lesson != "" {
			fmt.Fprintf(&p, "Lesson: %s\n", lesson)
		}
		if target != "" {
			fmt.Fprintf(&p, "Learning outcome to test: %s\n", target)
		} else if len(outcomes) > 0 {
			p.WriteString("Learning outcomes of the lesson (test one of these in each question):\n")
			for _, o := range outcomes {
				fmt.Fprintf(&p, "- %s\n", o)
			}
		}
		if in.Bloom != "" {
			fmt.Fprintf(&p, "Bloom level: %s, that is %s\n", in.Bloom, bloomVerbs[in.Bloom])
		}
		switch in.Taxonomy {
		case "solo":
			fmt.Fprintf(&p, "SOLO level: %s, that is %s\n", in.Level, soloMeaning[in.Level])
		case "custom":
			fmt.Fprintf(&p, "Level in the institution's %s: %s\n", customName, in.Level)
		}
		fmt.Fprintf(&p, "Question type: %s\nMarks for each question: %s\nHow many questions: %d\n", in.QType, in.Marks, in.Count)
		if strings.TrimSpace(in.Note) != "" {
			fmt.Fprintf(&p, "The teacher adds: %s\n", strings.TrimSpace(in.Note))
		}
		if len(existing) > 0 {
			p.WriteString("\nQuestions already in the bank, not to repeat:\n")
			for _, e := range existing {
				fmt.Fprintf(&p, "- %s\n", strings.ReplaceAll(e, "\n", " "))
			}
		}
		item := ai.Object(map[string]any{
			"text":       ai.String(),
			"options":    ai.Array(ai.String()),
			"answer":     ai.String(),
			"bloom":      ai.Enum(syllabus.Blooms...),
			"difficulty": ai.Enum("easy", "medium", "hard"),
		})
		var out struct {
			Questions []struct {
				Text, Answer, Bloom, Difficulty string
				Options                         []string
			} `json:"questions"`
		}
		if err := d.Draft(ctx, ai.Request{System: draftSystem, Prompt: p.String(), Schema: ai.Object(map[string]any{"questions": ai.Array(item)})}, &out); err != nil {
			if errors.Is(err, ai.ErrRefused) {
				return problem.New(http.StatusUnprocessableEntity, "ai.declined", "The AI declined this one. Change the note, or write the question yourself.")
			}
			slog.Error("ai draft", "err", err)
			return problem.New(http.StatusBadGateway, "ai.failed", "The AI could not draft questions just now. Try again.")
		}
		m, _ := tenant.MemberFrom(c)
		made := []Question{}
		for _, q := range out.Questions {
			if len(made) == in.Count || strings.TrimSpace(q.Text) == "" {
				continue
			}
			x := questionIn{LevelID: in.LevelID, SubjectID: in.SubjectID, LessonID: in.LessonID, OutcomeID: in.OutcomeID, Bloom: in.Bloom, QType: in.QType, Marks: in.Marks,
				Difficulty: q.Difficulty, Text: strings.TrimSpace(q.Text), Answer: q.Answer, Options: q.Options, Source: "ai", Status: "draft"}
			if x.Bloom == "" {
				x.Bloom = q.Bloom
			}
			switch in.Taxonomy {
			case "solo":
				x.Solo = in.Level
			case "custom":
				x.Custom = in.Level
			}
			if len(x.Options) > 8 || len(x.Text) > 5000 {
				continue
			}
			if err := x.valid(); err != nil {
				continue
			}
			made = append(made, Question{})
			saved, err := insertQuestion(c, x, m.OrgID, m.UserID)
			if err != nil {
				return err
			}
			made[len(made)-1] = saved
		}
		if err := audit.Record(c, audit.Entry{Action: "draft", Entity: "questions", After: map[string]any{"model": ai.Model, "count": len(made), "qtype": in.QType, "marks": in.Marks}}); err != nil {
			return err
		}
		return c.Status(http.StatusCreated).JSON(made)
	}
}
