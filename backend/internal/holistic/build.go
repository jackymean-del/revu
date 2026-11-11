package holistic

import "math"

// enough is how many marks a level rests on before it is shown (D38).
const enough = 3

// smallGroup hides class comparisons below this many children (B8.6.2).
const smallGroup = 5

// Student names a child.
type Student struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	AdmissionNo string `json:"admissionNo"`
	RollNo      string `json:"rollNo"`
}

// Score is a subject's result beside the class, with its trend across the
// term's assessments.
type Score struct {
	SubjectID string    `json:"subjectId"`
	Subject   string    `json:"subject"`
	Pct       *float64  `json:"pct,omitempty"`
	Grade     string    `json:"grade"`
	ClassPct  *float64  `json:"classPct,omitempty"`
	Trend     []float64 `json:"trend"`
}

// Chip is a level worked out from marks: a step of the scale, the share of
// the marks, and how many marks it rests on. Level is 0 with too little
// evidence.
type Chip struct {
	ID    string  `json:"id"`
	Name  string  `json:"name"`
	Level int     `json:"level"`
	Pct   float64 `json:"pct"`
	Marks int     `json:"marks"`
}

// Profile is a subject's competencies as chips.
type Profile struct {
	SubjectID    string `json:"subjectId"`
	Subject      string `json:"subject"`
	Competencies []Chip `json:"competencies"`
}

// Bloom is one thinking skill, the child beside the class.
type Bloom struct {
	Level    string   `json:"level"`
	Pct      *float64 `json:"pct,omitempty"`
	ClassPct *float64 `json:"classPct,omitempty"`
	Marks    int      `json:"marks"`
}

// Outcome is a strength or a focus area, in plain words, with what helps.
type Outcome struct {
	Text    string  `json:"text"`
	Subject string  `json:"subject"`
	Bloom   string  `json:"bloom"`
	Pct     float64 `json:"pct"`
	Tip     string  `json:"tip"`
}

// Activity is an activity competency and the teacher's rating, 0 unrated.
type Activity struct {
	CompetencyID string `json:"competencyId"`
	Name         string `json:"name"`
	Subject      string `json:"subject"`
	Level        int    `json:"level"`
}

// Voices are the 360-degree lines and the ambition.
type Voices struct {
	Self     string `json:"self"`
	Peer     string `json:"peer"`
	Parent   string `json:"parent"`
	Ambition string `json:"ambition"`
}

// Note is the teacher's note.
type Note struct {
	Text   string `json:"text"`
	Status string `json:"status"` // draft or approved, empty when none
	FromAI bool   `json:"fromAi"`
}

// Report is one child's holistic report.
type Report struct {
	Student    Student    `json:"student"`
	Section    string     `json:"section"`
	SectionID  string     `json:"sectionId"`
	Period     string     `json:"period"`
	PeriodID   string     `json:"periodId"`
	Scale      []Level    `json:"scale"`
	Scores     []Score    `json:"scores"`
	Overall    *float64   `json:"overall,omitempty"`
	Profile    []Profile  `json:"profile"`
	Blooms     []Bloom    `json:"blooms"`
	Activities []Activity `json:"activities"`
	Strengths  []Outcome  `json:"strengths"`
	Focus      []Outcome  `json:"focus"`
	Voices     Voices     `json:"voices"`
	Note       Note       `json:"note"`
	CanEdit    bool       `json:"canEdit"`
}

// Class is every report of a section, built together for the class figures.
type Class struct {
	Section, SectionID, Period, PeriodID string
	Scale                                []Level
	Reports                              []Report
	CanEdit                              bool
	comps                                []comp
}

type comp struct {
	id, name, subjectID, subject string
	activity                     bool
}

type tally struct {
	got, max float64
	marks    int
}

func (t tally) pct() float64 {
	if t.max <= 0 {
		return 0
	}
	return math.Round(t.got*1000/t.max) / 10
}

// homeTip is one line of what helps at home, by the thinking skill an
// outcome asks for.
var homeTip = map[string]string{
	"remember":   "A few minutes of recall a day: ask them to tell you three things from the lesson.",
	"understand": "Ask them to explain it to you in their own words, with an example.",
	"apply":      "Use it in daily life: shopping, cooking or travel give real problems to solve.",
	"analyse":    "Compare two things together and ask how they are alike and different.",
	"evaluate":   "Ask which answer is better and why, and let them defend a choice.",
	"create":     "Give room to make something of their own: a story, a model, a plan.",
}

func ptr(f float64) *float64 { return &f }

func avg(xs []float64) *float64 {
	if len(xs) < smallGroup {
		return nil
	}
	sum := 0.0
	for _, x := range xs {
		sum += x
	}
	return ptr(math.Round(sum*10/float64(len(xs))) / 10)
}
