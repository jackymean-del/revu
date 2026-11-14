package papers

import (
	"encoding/json"
	"errors"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/syllabus"
	"github.com/jackymean-del/revu/internal/tenant"
)

func newID() string { return uuid.Must(uuid.NewV7()).String() }

// Question is one question of the bank (B3.4).
type Question struct {
	ID         string   `json:"id"`
	LevelID    string   `json:"levelId"`
	SubjectID  string   `json:"subjectId"`
	LessonID   string   `json:"lessonId,omitempty"`
	OutcomeID  string   `json:"outcomeId,omitempty"`
	Bloom      string   `json:"bloom"`
	QType      string   `json:"qtype"`
	Marks      string   `json:"marks"`
	Difficulty string   `json:"difficulty"`
	Text       string   `json:"text"`
	Options    []string `json:"options"`
	Bits       []Bit    `json:"bits"`
	SpaceKind  string   `json:"spaceKind"` // room to answer on the printed paper: auto, lines, blank, box or none
	SpaceSize  int      `json:"spaceSize"` // lines, or the height in lines of blank space or a box
	Answer     string   `json:"answer"`
	Source     string   `json:"source"`
	Status     string   `json:"status"`
	Solo       string   `json:"solo,omitempty"`
	Custom     string   `json:"customLevel,omitempty"`
	Used       int      `json:"used"` // papers it is in
}

// Bit is one lettered part of a question, (a), (b), with its own marks.
type Bit struct {
	Text   string `json:"text"`
	Marks  string `json:"marks"`
	Answer string `json:"answer"`
}

const questionCols = `q.id::text, q.level_id::text, q.subject_id::text, coalesce(q.lesson_id::text, ''), coalesce(q.outcome_id::text, ''), q.bloom, coalesce(q.solo, ''), coalesce(q.custom_level, ''), q.qtype,
	q.marks::text, q.difficulty, q.text, q.options, q.answer, q.source, q.status, q.bits, q.space_kind, q.space_size,
	(SELECT count(DISTINCT i.paper_id) FROM paper_items i WHERE i.question_id = q.id)::int`

func scanQuestion(r pgx.Row) (Question, error) {
	var q Question
	var opts, bits []byte
	err := r.Scan(&q.ID, &q.LevelID, &q.SubjectID, &q.LessonID, &q.OutcomeID, &q.Bloom, &q.Solo, &q.Custom, &q.QType, &q.Marks, &q.Difficulty, &q.Text, &opts, &q.Answer, &q.Source, &q.Status, &bits, &q.SpaceKind, &q.SpaceSize, &q.Used)
	q.Marks = trim(q.Marks)
	q.Options, q.Bits = []string{}, []Bit{}
	if len(opts) > 0 {
		_ = json.Unmarshal(opts, &q.Options)
	}
	if len(bits) > 0 {
		_ = json.Unmarshal(bits, &q.Bits)
	}
	return q, err
}

// mayWrite says whether the person may add or change questions of a subject.
func mayWrite(c fiber.Ctx, subjectID string) error {
	actor, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	return policy.Check(actor, policy.AssessmentEdit, policy.Target{SubjectID: subjectID})
}

// listQuestions lists a class and subject's bank, narrowed by lesson, Bloom
// level, type or status; retired questions only when asked for.
func listQuestions(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	levelID, subjectID := c.Query("levelId"), c.Query("subjectId")
	if !records.UUIDShape.MatchString(levelID) || !records.UUIDShape.MatchString(subjectID) {
		return problem.Invalid(api.FieldError{Field: "levelId", Code: "required", Message: "Choose a class and a subject."})
	}
	if err := mayWrite(c, subjectID); err != nil {
		return err
	}
	where := []string{"q.level_id = $1::uuid", "q.subject_id = $2::uuid"}
	args := []any{levelID, subjectID}
	add := func(cond string, v string) {
		args = append(args, v)
		where = append(where, strings.ReplaceAll(cond, "?", "$"+strconv.Itoa(len(args))))
	}
	if v := c.Query("lessonId"); records.UUIDShape.MatchString(v) {
		add("q.lesson_id = ?::uuid", v)
	}
	if v := c.Query("bloom"); slices.Contains(syllabus.Blooms, v) {
		add("q.bloom = ?", v)
	}
	if v := c.Query("qtype"); v != "" {
		add("lower(q.qtype) = lower(?)", v)
	}
	switch v := c.Query("status"); v {
	case "draft", "approved", "retired":
		add("q.status = ?", v)
	default:
		where = append(where, "q.status <> 'retired'")
	}
	rows, err := tx.Query(c.Context(), `SELECT `+questionCols+` FROM questions q WHERE `+strings.Join(where, " AND ")+` ORDER BY q.created_at DESC LIMIT 500`, args...)
	if err != nil {
		return err
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Question, error) { return scanQuestion(r) })
	if err != nil {
		return err
	}
	if out == nil {
		out = []Question{}
	}
	return c.JSON(out)
}

type questionIn struct {
	LevelID    string   `json:"levelId"`
	SubjectID  string   `json:"subjectId"`
	LessonID   string   `json:"lessonId"`
	OutcomeID  string   `json:"outcomeId"`
	Bloom      string   `json:"bloom"`
	Solo       string   `json:"solo"`
	Custom     string   `json:"customLevel"`
	QType      string   `json:"qtype"`
	Marks      string   `json:"marks"`
	Difficulty string   `json:"difficulty"`
	Text       string   `json:"text"`
	Options    []string `json:"options"`
	Bits       []Bit    `json:"bits"`
	SpaceKind  string   `json:"spaceKind"`
	SpaceSize  int      `json:"spaceSize"`
	Answer     string   `json:"answer"`
	Source     string   `json:"source"`
	Status     string   `json:"status"`
}

func (in *questionIn) valid() error {
	var f records.Fields
	if !records.UUIDShape.MatchString(in.LevelID) || !records.UUIDShape.MatchString(in.SubjectID) {
		f.Add("levelId", "required", "Choose a class and a subject.")
	}
	for _, id := range []struct{ field, v string }{{"lessonId", in.LessonID}, {"outcomeId", in.OutcomeID}} {
		if id.v != "" && !records.UUIDShape.MatchString(id.v) {
			f.Add(id.field, "unknown", "Not an id.")
		}
	}
	if in.Bloom == "" {
		in.Bloom = syllabus.SuggestBloom(in.Text)
	}
	if !slices.Contains(syllabus.Blooms, in.Bloom) {
		f.Add("bloom", "unknown", "Choose a Bloom level.")
	}
	if in.Solo != "" && !slices.Contains(SOLO, in.Solo) {
		f.Add("solo", "unknown", "Choose a SOLO level.")
	}
	in.Custom = strings.TrimSpace(in.Custom)
	if len(in.Custom) > 40 {
		f.Add("customLevel", "invalid", "A level is up to 40 characters.")
	}
	// With bits, the question is worth what its bits add up to.
	if len(in.Bits) > 0 {
		if len(in.Bits) > 12 {
			f.Add("bits", "too_many", "Up to 12 bits.")
		}
		sum := 0
		for i := range in.Bits {
			b := &in.Bits[i]
			b.Text, b.Marks, b.Answer = strings.TrimSpace(b.Text), strings.TrimSpace(b.Marks), strings.TrimSpace(b.Answer)
			if b.Text == "" || len(b.Text) > 2000 || !marksShape.MatchString(b.Marks) || strings.Trim(b.Marks, "0.") == "" {
				f.Add("bits", "invalid", "Each bit needs its text and marks above zero.")
				break
			}
			sum += hundredths(b.Marks)
		}
		in.Marks = fromHundredths(sum)
	}
	if in.Bits == nil {
		in.Bits = []Bit{}
	}
	// Room to answer: left to the paper unless set for this question.
	switch in.SpaceKind {
	case "", "auto", "none":
		if in.SpaceKind == "" {
			in.SpaceKind = "auto"
		}
		in.SpaceSize = 0
	case "lines", "blank", "box":
		if in.SpaceSize < 1 || in.SpaceSize > 60 {
			f.Add("spaceSize", "range", "Give the room to answer as 1 to 60 lines.")
		}
	default:
		f.Add("spaceKind", "unknown", "Room to answer is automatic, lines, blank space, a box, or none.")
	}
	if strings.TrimSpace(in.QType) == "" {
		f.Add("qtype", "required", "Choose the question type.")
	}
	if !marksShape.MatchString(in.Marks) || strings.Trim(in.Marks, "0.") == "" {
		f.Add("marks", "invalid", "Give the marks, more than zero, with up to two decimals.")
	}
	if in.Difficulty == "" {
		in.Difficulty = "medium"
	}
	if !slices.Contains([]string{"easy", "medium", "hard"}, in.Difficulty) {
		f.Add("difficulty", "unknown", "Choose easy, medium or hard.")
	}
	if strings.TrimSpace(in.Text) == "" || len(in.Text) > 5000 {
		f.Add("text", "required", "Write the question, up to 5000 characters.")
	}
	if len(in.Options) > 8 {
		f.Add("options", "too_many", "Up to 8 options.")
	}
	if in.Source == "" {
		in.Source = "typed"
	}
	if !slices.Contains([]string{"typed", "ai", "imported"}, in.Source) {
		f.Add("source", "unknown", "Not a source.")
	}
	if in.Status == "" {
		in.Status = "approved"
		if in.Source == "ai" {
			in.Status = "draft" // a draft until a teacher accepts it
		}
	}
	if !slices.Contains([]string{"draft", "approved", "retired"}, in.Status) {
		f.Add("status", "unknown", "Choose draft, approved or retired.")
	}
	if in.Options == nil {
		in.Options = []string{}
	}
	if len(f) > 0 {
		return problem.Invalid(f...)
	}
	return nil
}

func createQuestion(c fiber.Ctx) error {
	var in questionIn
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if err := in.valid(); err != nil {
		return err
	}
	if err := mayWrite(c, in.SubjectID); err != nil {
		return err
	}
	m, _ := tenant.MemberFrom(c)
	q, err := insertQuestion(c, in, m.OrgID, m.UserID)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "create", Entity: "questions", EntityID: q.ID, After: map[string]any{"qtype": q.QType, "marks": q.Marks, "source": q.Source}}); err != nil {
		return err
	}
	return c.Status(http.StatusCreated).JSON(q)
}

// insertQuestion saves a checked question.
func insertQuestion(c fiber.Ctx, in questionIn, orgID, userID string) (Question, error) {
	tx, err := tenant.Tx(c)
	if err != nil {
		return Question{}, err
	}
	opts, _ := json.Marshal(in.Options)
	bits, _ := json.Marshal(in.Bits)
	return scanQuestion(tx.QueryRow(c.Context(), `
		WITH n AS (
			INSERT INTO questions (org_id, level_id, subject_id, lesson_id, outcome_id, bloom, qtype, marks, difficulty, text, options, answer, source, status, created_by, solo, custom_level, bits, space_kind, space_size)
			VALUES ($1, $2::uuid, $3::uuid, nullif($4, '')::uuid, nullif($5, '')::uuid, $6, $7, $8::numeric, $9, $10, $11::jsonb, $12, $13, $14, $15, nullif($16, ''), nullif($17, ''), $18::jsonb, $19, $20) RETURNING *)
		SELECT `+questionCols+` FROM n q`,
		orgID, in.LevelID, in.SubjectID, in.LessonID, in.OutcomeID, in.Bloom, strings.TrimSpace(in.QType), in.Marks, in.Difficulty, strings.TrimSpace(in.Text), string(opts),
		strings.TrimSpace(in.Answer), in.Source, in.Status, userID, in.Solo, in.Custom, string(bits), in.SpaceKind, in.SpaceSize))
}

// updateQuestion changes a question. A question already in a final paper
// keeps that paper as it was printed: the paper refers to it by id, so an
// edit is refused and a new question is the way to change it.
func updateQuestion(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	id := c.Params("id")
	notFound := problem.New(http.StatusNotFound, "question.not_found", "No question has this id.")
	if !records.UUIDShape.MatchString(id) {
		return notFound
	}
	var in questionIn
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if err := in.valid(); err != nil {
		return err
	}
	var subjectID string
	var inFinal bool
	err = tx.QueryRow(ctx, `SELECT subject_id::text, EXISTS (SELECT 1 FROM paper_items i JOIN papers p ON p.id = i.paper_id WHERE i.question_id = q.id AND p.status = 'final')
		FROM questions q WHERE q.id = $1::uuid`, id).Scan(&subjectID, &inFinal)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound
	}
	if err != nil {
		return err
	}
	if err := mayWrite(c, subjectID); err != nil {
		return err
	}
	opts, _ := json.Marshal(in.Options)
	bits, _ := json.Marshal(in.Bits)
	if inFinal && in.Status != "retired" {
		return problem.New(http.StatusConflict, "question.in_final_paper", "This question is in a final paper; add a new question instead of changing it.")
	}
	q, err := scanQuestion(tx.QueryRow(ctx, `
		WITH u AS (
			UPDATE questions SET lesson_id = nullif($2, '')::uuid, outcome_id = nullif($3, '')::uuid, bloom = $4, qtype = $5, marks = $6::numeric, difficulty = $7,
			       text = $8, options = $9::jsonb, answer = $10, status = $11, solo = nullif($12, ''), custom_level = nullif($13, ''), bits = $14::jsonb, space_kind = $15, space_size = $16, updated_at = now()
			 WHERE id = $1::uuid RETURNING *)
		SELECT `+questionCols+` FROM u q`,
		id, in.LessonID, in.OutcomeID, in.Bloom, strings.TrimSpace(in.QType), in.Marks, in.Difficulty, strings.TrimSpace(in.Text), string(opts), strings.TrimSpace(in.Answer), in.Status, in.Solo, in.Custom, string(bits), in.SpaceKind, in.SpaceSize))
	if err != nil {
		return err
	}
	// In papers built freely and still in draft, the question's slot follows
	// its new type and marks.
	if _, err := tx.Exec(ctx, `UPDATE paper_items i SET marks = q.marks, section = q.qtype FROM questions q, papers p
		WHERE q.id = $1::uuid AND i.question_id = q.id AND p.id = i.paper_id AND p.status = 'draft' AND p.blueprint_version = 0`, id); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "questions", EntityID: id, After: map[string]any{"status": q.Status}}); err != nil {
		return err
	}
	return c.JSON(q)
}

// jsonUnmarshal reads a question's options as stored.
func jsonUnmarshal(b []byte, v any) error { return json.Unmarshal(b, v) }

// hundredths reads marks as whole hundredths; fromHundredths writes them back.
func hundredths(s string) int {
	whole, frac, _ := strings.Cut(s, ".")
	n := 0
	for _, r := range whole {
		n = n*10 + int(r-'0')
	}
	frac = (frac + "00")[:2]
	return n*100 + int(frac[0]-'0')*10 + int(frac[1]-'0')
}

func fromHundredths(h int) string {
	return trim(strconv.Itoa(h/100) + "." + string(rune('0'+h%100/10)) + string(rune('0'+h%10)))
}
