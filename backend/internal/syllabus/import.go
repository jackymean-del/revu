package syllabus

import (
	"context"
	"io"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tables"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Counts are how many records of each kind an import makes or finds.
type Counts struct {
	Subjects     int `json:"subjects"`
	Competencies int `json:"competencies"`
	Lessons      int `json:"lessons"`
	Outcomes     int `json:"outcomes"`
}

// RowProblem is a row that could not be read.
type RowProblem struct {
	Row     int    `json:"row"`
	Message string `json:"message"`
}

// Report is what an import found, made, or would make.
type Report struct {
	Shape           string       `json:"shape"` // competencies, outcomes or workbook
	Rows            int          `json:"rows"`
	Created         Counts       `json:"created"`
	Matched         Counts       `json:"matched"`
	Repeated        int          `json:"repeated"`     // rows saying again what an earlier row or record says
	NoCompetency    int          `json:"noCompetency"` // outcomes with no competency named
	UnknownSubjects []string     `json:"unknownSubjects"`
	UnknownLevels   []string     `json:"unknownLevels"`
	Problems        []RowProblem `json:"problems"`
	Applied         bool         `json:"applied"`
}

type subject struct{ id, name, kind string }
type level struct{ id, name string }
type competency struct{ id, subject, level, name, description string }
type lesson struct {
	id, level, subject, name string
	seq                      int
}
type outcome struct{ id, level, subject, lesson, competency, code, text, bloom, note string }

// state is what the institution already has, keyed for matching, and what
// the import adds.
type state struct {
	org       string
	subjects  map[string]*subject // by tables.Norm(name)
	levels    []level
	comps     map[string]*competency // subject|level|norm(name)
	lessons   map[string]*lesson     // level|subject|norm(name)
	outcomes  map[string]bool        // level|subject|lesson|norm(text), and level|subject|#code
	lessonSeq map[string]int         // level|subject -> highest seq
	add       struct {
		subjects []*subject
		comps    []*competency
		lessons  []*lesson
		outcomes []*outcome
	}
}

func newID() string { return uuid.Must(uuid.NewV7()).String() }

func load(ctx context.Context, tx pgx.Tx, org string) (*state, error) {
	st := &state{org: org, subjects: map[string]*subject{}, comps: map[string]*competency{}, lessons: map[string]*lesson{},
		outcomes: map[string]bool{}, lessonSeq: map[string]int{}}
	var b pgx.Batch
	b.Queue(`SELECT id::text, name, kind FROM subjects WHERE deleted_at IS NULL`).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			s := &subject{}
			if err := rows.Scan(&s.id, &s.name, &s.kind); err != nil {
				return err
			}
			st.subjects[tables.Norm(s.name)] = s
		}
		return rows.Err()
	})
	b.Queue(`SELECT id::text, name FROM levels WHERE deleted_at IS NULL ORDER BY seq`).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var l level
			if err := rows.Scan(&l.id, &l.name); err != nil {
				return err
			}
			st.levels = append(st.levels, l)
		}
		return rows.Err()
	})
	b.Queue(`SELECT id::text, subject_id::text, coalesce(level_id::text, ''), name, coalesce(description, '') FROM competencies WHERE deleted_at IS NULL`).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			c := &competency{}
			if err := rows.Scan(&c.id, &c.subject, &c.level, &c.name, &c.description); err != nil {
				return err
			}
			st.comps[c.subject+"|"+c.level+"|"+tables.Norm(c.name)] = c
		}
		return rows.Err()
	})
	b.Queue(`SELECT id::text, level_id::text, subject_id::text, name, seq FROM lessons WHERE deleted_at IS NULL`).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			l := &lesson{}
			if err := rows.Scan(&l.id, &l.level, &l.subject, &l.name, &l.seq); err != nil {
				return err
			}
			st.lessons[l.level+"|"+l.subject+"|"+tables.Norm(l.name)] = l
			if k := l.level + "|" + l.subject; l.seq > st.lessonSeq[k] {
				st.lessonSeq[k] = l.seq
			}
		}
		return rows.Err()
	})
	b.Queue(`SELECT level_id::text, subject_id::text, coalesce(lesson_id::text, ''), coalesce(code, ''), text FROM learning_outcomes WHERE deleted_at IS NULL`).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var lv, sub, les, code, text string
			if err := rows.Scan(&lv, &sub, &les, &code, &text); err != nil {
				return err
			}
			st.outcomes[lv+"|"+sub+"|"+les+"|"+tables.Norm(text)] = true
			if code != "" {
				st.outcomes[lv+"|"+sub+"|#"+code] = true
			}
		}
		return rows.Err()
	})
	return st, tx.SendBatch(ctx, &b).Close()
}

// activity says whether a subject's competencies are rated by the teacher
// rather than worked out from marks: the arts, sport and the like.
var activityWords = []string{"art", "craft", "dance", "music", "drum", "keyboard", "guitar", "ukulele", "physical", "sport", "yoga",
	"generalknowledge", "kaushal", "workeducation", "enrichment", "games", "theatre", "drama"}

func activity(name string) bool {
	n := tables.Norm(name)
	return slices.ContainsFunc(activityWords, func(w string) bool { return strings.Contains(n, w) })
}

// subjectName is the subject a cell names: exports often add a description
// after " - " ("Drums - Plays drum patterns ..."), which is not the name.
func subjectName(cell string) string {
	cell = strings.TrimSpace(cell)
	if i := strings.Index(cell, " - "); i > 0 {
		cell = cell[:i]
	}
	return strings.TrimSpace(cell)
}

func (st *state) subject(name string, create bool, rep *Report) *subject {
	name = subjectName(name)
	if name == "" {
		return nil
	}
	k := tables.Norm(name)
	if s, ok := st.subjects[k]; ok {
		return s
	}
	if !create {
		if !slices.Contains(rep.UnknownSubjects, name) {
			rep.UnknownSubjects = append(rep.UnknownSubjects, name)
		}
		return nil
	}
	kind := "academic"
	if activity(name) {
		kind = "co_curricular"
	}
	s := &subject{id: newID(), name: name, kind: kind}
	st.subjects[k] = s
	st.add.subjects = append(st.add.subjects, s)
	rep.Created.Subjects++
	return s
}

var digits = regexp.MustCompile(`\d+`)

// level finds a level by name, or by its number ("Grade 6" is "Class 6").
func (st *state) level(name string, rep *Report) string {
	k := tables.Norm(name)
	for _, l := range st.levels {
		if tables.Norm(l.name) == k {
			return l.id
		}
	}
	if n := digits.FindString(name); n != "" {
		for _, l := range st.levels {
			if digits.FindString(l.name) == n {
				return l.id
			}
		}
	}
	if name != "" && !slices.Contains(rep.UnknownLevels, name) {
		rep.UnknownLevels = append(rep.UnknownLevels, name)
	}
	return ""
}

func (st *state) competency(sub *subject, levelID, name, description string, rep *Report, count bool) *competency {
	name = strings.TrimSpace(name)
	if name == "" {
		return nil
	}
	n := tables.Norm(name)
	// A competency for this level, else one for every level of the subject.
	for _, lv := range []string{levelID, ""} {
		if c, ok := st.comps[sub.id+"|"+lv+"|"+n]; ok {
			if count {
				rep.Matched.Competencies++
			}
			return c
		}
	}
	c := &competency{id: newID(), subject: sub.id, name: name, description: strings.TrimSpace(description)}
	st.comps[sub.id+"||"+n] = c
	st.add.comps = append(st.add.comps, c)
	rep.Created.Competencies++
	return c
}

func (st *state) lesson(levelID, subjectID, name string, seq int, rep *Report) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return ""
	}
	k := levelID + "|" + subjectID + "|" + tables.Norm(name)
	if l, ok := st.lessons[k]; ok {
		return l.id
	}
	place := levelID + "|" + subjectID
	if seq <= 0 {
		seq = st.lessonSeq[place] + 1
	}
	if seq > st.lessonSeq[place] {
		st.lessonSeq[place] = seq
	}
	l := &lesson{id: newID(), level: levelID, subject: subjectID, name: name, seq: seq}
	st.lessons[k] = l
	st.add.lessons = append(st.add.lessons, l)
	rep.Created.Lessons++
	return l.id
}

func (st *state) outcome(o *outcome, rep *Report) {
	key := o.level + "|" + o.subject + "|" + o.lesson + "|" + tables.Norm(o.text)
	byCode := o.level + "|" + o.subject + "|#" + o.code
	if st.outcomes[key] || (o.code != "" && st.outcomes[byCode]) {
		rep.Repeated++
		return
	}
	st.outcomes[key] = true
	if o.code != "" {
		st.outcomes[byCode] = true
	}
	o.id = newID()
	o.bloom = SuggestBloom(o.text)
	st.add.outcomes = append(st.add.outcomes, o)
	rep.Created.Outcomes++
}

// save writes what the import adds, in one round trip, parents first.
func (st *state) save(ctx context.Context, tx pgx.Tx) error {
	var b pgx.Batch
	for _, s := range st.add.subjects {
		b.Queue(`INSERT INTO subjects (id, org_id, name, kind) VALUES ($1::uuid, $2, $3, $4)`, s.id, st.org, s.name, s.kind)
	}
	for i, c := range st.add.comps {
		b.Queue(`INSERT INTO competencies (id, org_id, subject_id, level_id, name, description, seq) VALUES ($1::uuid, $2, $3::uuid, nullif($4, '')::uuid, $5, nullif($6, ''), $7)`,
			c.id, st.org, c.subject, c.level, c.name, c.description, i+1)
	}
	for _, l := range st.add.lessons {
		b.Queue(`INSERT INTO lessons (id, org_id, level_id, subject_id, seq, name) VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5, $6)`, l.id, st.org, l.level, l.subject, l.seq, l.name)
	}
	for i, o := range st.add.outcomes {
		b.Queue(`INSERT INTO learning_outcomes (id, org_id, level_id, subject_id, lesson_id, competency_id, code, text, bloom, note, seq)
			VALUES ($1::uuid, $2, $3::uuid, $4::uuid, nullif($5, '')::uuid, nullif($6, '')::uuid, nullif($7, ''), $8, $9, nullif($10, ''), $11)`,
			o.id, st.org, o.level, o.subject, o.lesson, o.competency, o.code, o.text, o.bloom, o.note, i+1)
	}
	if b.Len() == 0 {
		return nil
	}
	return tx.SendBatch(ctx, &b).Close()
}

// Headings each shape is known by, normalised.
func shapeOf(head map[string]int) string {
	has := func(names ...string) bool {
		for _, n := range names {
			if _, ok := head[n]; !ok {
				return false
			}
		}
		return true
	}
	switch {
	case has("grade", "subject", "learningoutcome"):
		return "workbook"
	case has("learningoutcome", "competency"):
		return "outcomes"
	case has("competency", "subject"):
		return "competencies"
	}
	return ""
}

// Import reads a file of competencies, learning outcomes or an outcomes
// workbook, and previews or saves it.
func importFile(c fiber.Ctx) error {
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
	fh, err := c.FormFile("file")
	if err != nil {
		return problem.Invalid(api.FieldError{Field: "file", Code: "required", Message: "Choose a .csv or .xlsx file."})
	}
	f, err := fh.Open()
	if err != nil {
		return err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, 8<<20))
	if err != nil {
		return err
	}
	table, err := tables.Read(fh.Filename, data)
	if err != nil {
		return problem.Invalid(api.FieldError{Field: "file", Code: "format", Message: err.Error() + "."})
	}
	if len(table) < 2 {
		return problem.Invalid(api.FieldError{Field: "file", Code: "empty", Message: "The file has no rows under its headings."})
	}
	head := map[string]int{}
	for i, h := range table[0] {
		n := tables.Norm(h)
		if strings.HasPrefix(n, "comment") {
			n = "comments"
		}
		if _, ok := head[n]; !ok && n != "" {
			head[n] = i
		}
	}
	rep := Report{Shape: shapeOf(head), UnknownSubjects: []string{}, UnknownLevels: []string{}, Problems: []RowProblem{}}
	if rep.Shape == "" {
		return problem.Invalid(api.FieldError{Field: "file", Code: "heading", Message: "The headings match none of the shapes: competency, description, subject; learning outcome, competency, lesson name; or grade, subject, lesson, learning outcome."})
	}
	me, _ := tenant.MemberFrom(c)
	st, err := load(ctx, tx, me.OrgID)
	if err != nil {
		return err
	}
	create := c.FormValue("createSubjects") == "true"
	cell := func(row []string, name string) string {
		if i, ok := head[name]; ok && i < len(row) {
			return strings.TrimSpace(row[i])
		}
		return ""
	}
	addProblem := func(row int, msg string) {
		if len(rep.Problems) < 50 {
			rep.Problems = append(rep.Problems, RowProblem{Row: row, Message: msg})
		}
	}

	// The outcomes shape names no class or subject: they are chosen at upload.
	var fixedSubject *subject
	fixedLevel := ""
	if rep.Shape == "outcomes" {
		levelID, subjectID := c.FormValue("levelId"), c.FormValue("subjectId")
		if !records.UUIDShape.MatchString(levelID) || !records.UUIDShape.MatchString(subjectID) {
			return problem.Invalid(api.FieldError{Field: "levelId", Code: "required", Message: "Choose the class and subject these outcomes belong to."})
		}
		for _, l := range st.levels {
			if l.id == levelID {
				fixedLevel = levelID
			}
		}
		for _, s := range st.subjects {
			if s.id == subjectID {
				fixedSubject = s
			}
		}
		if fixedLevel == "" || fixedSubject == nil {
			return problem.Invalid(api.FieldError{Field: "levelId", Code: "unknown", Message: "That class or subject is not here."})
		}
	}

	for i, row := range table[1:] {
		n := i + 2
		if slices.IndexFunc(row, func(x string) bool { return strings.TrimSpace(x) != "" }) < 0 {
			continue
		}
		rep.Rows++
		switch rep.Shape {
		case "competencies":
			name := cell(row, "competency")
			if name == "" {
				addProblem(n, "No competency named.")
				continue
			}
			sub := st.subject(cell(row, "subject"), create, &rep)
			if sub == nil {
				continue
			}
			before := rep.Created.Competencies
			st.competency(sub, "", name, cell(row, "description"), &rep, true)
			if rep.Created.Competencies == before {
				rep.Repeated++
			}
		case "outcomes":
			text := cell(row, "learningoutcome")
			if text == "" {
				addProblem(n, "No learning outcome written.")
				continue
			}
			comp := st.competency(fixedSubject, fixedLevel, cell(row, "competency"), "", &rep, false)
			o := &outcome{level: fixedLevel, subject: fixedSubject.id, text: text}
			if comp != nil {
				o.competency = comp.id
			} else {
				rep.NoCompetency++
			}
			o.lesson = st.lesson(fixedLevel, fixedSubject.id, cell(row, "lessonname"), 0, &rep)
			st.outcome(o, &rep)
		case "workbook":
			text := cell(row, "learningoutcome")
			if text == "" {
				addProblem(n, "No learning outcome written.")
				continue
			}
			levelID := st.level(cell(row, "grade"), &rep)
			sub := st.subject(cell(row, "subject"), create, &rep)
			if levelID == "" || sub == nil {
				continue
			}
			seq, _ := strconv.Atoi(cell(row, "lessonno"))
			o := &outcome{level: levelID, subject: sub.id, text: text, code: cell(row, "outcomeid"), note: cell(row, "comments")}
			if comp := cell(row, "competency"); comp != "" {
				o.competency = st.competency(sub, levelID, comp, "", &rep, false).id
			} else {
				rep.NoCompetency++
			}
			o.lesson = st.lesson(levelID, sub.id, cell(row, "lessonname"), seq, &rep)
			st.outcome(o, &rep)
		}
	}
	rep.Matched.Outcomes = rep.Repeated

	if c.FormValue("apply") == "true" {
		if err := st.save(ctx, tx); err != nil {
			return err
		}
		rep.Applied = true
		if err := audit.Record(c, audit.Entry{Action: "import", Entity: "syllabus", After: map[string]any{
			"shape": rep.Shape, "file": fh.Filename, "rows": rep.Rows, "created": rep.Created}}); err != nil {
			return err
		}
	}
	return c.JSON(rep)
}
