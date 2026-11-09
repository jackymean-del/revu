// Package reports builds report cards and marksheets (pilot P0.5; blueprint
// v23 B8.2 to B8.4). A report is drawn from facts gathered once (results as
// the scheme engine stored them, the institution's words, its branding and
// its template) and rendered to HTML. The same HTML is the preview, the
// browser print and the PDF. No number is computed here: results come from
// computed_results, and totals and averages from internal/scheme.
package reports

import (
	"encoding/json"
	"fmt"
	"slices"
	"strings"
)

// Section keys, in the order a new template uses.
var SectionKeys = []string{"identity", "marks", "components", "overall", "legend", "signoff"}

// Signoff lines a template may print, as terminology keys.
var SignoffKeys = []string{"person.class_teacher", "person.principal", "person.guardian"}

// PaperSizes in millimetres, portrait.
var PaperSizes = map[string][2]float64{"A4": {210, 297}, "Letter": {215.9, 279.4}, "A5": {148, 210}}

// Section is one block of the report and whether it shows.
type Section struct {
	Key string `json:"key"`
	On  bool   `json:"on"`
}

// Paper is the page the report prints on.
type Paper struct {
	Size        string  `json:"size"` // A4, Letter, A5 or custom
	WidthMM     float64 `json:"widthMm,omitempty"`
	HeightMM    float64 `json:"heightMm,omitempty"`
	Orientation string  `json:"orientation"` // portrait or landscape
}

// Config is a report template: what shows, in what order, and how it prints.
type Config struct {
	Title        string    `json:"title"`
	Sections     []Section `json:"sections"`
	SubjectOrder []string  `json:"subjectOrder"`
	Signoff      []string  `json:"signoff"`
	Paper        Paper     `json:"paper"`
	Booklet      bool      `json:"booklet"`
	PadEven      bool      `json:"padEven"`
	QR           bool      `json:"qr"`
}

// DefaultConfig is the template an institution starts with.
func DefaultConfig() Config {
	c := Config{Title: "Progress report", SubjectOrder: []string{}, Signoff: append([]string(nil), SignoffKeys...),
		Paper: Paper{Size: "A4", Orientation: "portrait"}, PadEven: true}
	for _, k := range SectionKeys {
		c.Sections = append(c.Sections, Section{Key: k, On: true})
	}
	return c
}

// On says whether a section shows.
func (c Config) On(key string) bool {
	for _, s := range c.Sections {
		if s.Key == key {
			return s.On
		}
	}
	return false
}

// PageMM is the page width and height in millimetres, after orientation.
func (c Config) PageMM() (w, h float64) {
	if c.Paper.Size == "custom" {
		w, h = c.Paper.WidthMM, c.Paper.HeightMM
	} else {
		s := PaperSizes[c.Paper.Size]
		w, h = s[0], s[1]
	}
	if (c.Paper.Orientation == "landscape") != (w > h) {
		w, h = h, w
	}
	return w, h
}

// Problem is one thing wrong with a template, by field.
type Problem struct{ Field, Message string }

// Parse reads and checks a template. Every section appears once, in the
// order given; unknown sections and sign-off lines are refused.
func Parse(raw []byte) (Config, []Problem) {
	var c Config
	dec := json.NewDecoder(strings.NewReader(string(raw)))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&c); err != nil {
		return c, []Problem{{"config", "not a report template: " + err.Error()}}
	}
	var ps []Problem
	c.Title = strings.TrimSpace(c.Title)
	if c.Title == "" || len([]rune(c.Title)) > 80 {
		ps = append(ps, Problem{"config.title", "Give the report a title of up to 80 characters."})
	}
	seen := map[string]bool{}
	for i, s := range c.Sections {
		if !slices.Contains(SectionKeys, s.Key) || seen[s.Key] {
			ps = append(ps, Problem{fmt.Sprintf("config.sections[%d]", i), "Unknown or repeated section."})
		}
		seen[s.Key] = true
	}
	for _, k := range SectionKeys {
		if !seen[k] {
			c.Sections = append(c.Sections, Section{Key: k, On: false})
		}
	}
	if !c.On("identity") {
		ps = append(ps, Problem{"config.sections", "The student's details always show on a report."})
	}
	for i, k := range c.Signoff {
		if !slices.Contains(SignoffKeys, k) {
			ps = append(ps, Problem{fmt.Sprintf("config.signoff[%d]", i), "Unknown sign-off line."})
		}
	}
	if c.SubjectOrder == nil {
		c.SubjectOrder = []string{}
	}
	switch c.Paper.Size {
	case "A4", "Letter", "A5":
		c.Paper.WidthMM, c.Paper.HeightMM = 0, 0
	case "custom":
		if c.Paper.WidthMM < 90 || c.Paper.WidthMM > 600 || c.Paper.HeightMM < 90 || c.Paper.HeightMM > 600 {
			ps = append(ps, Problem{"config.paper", "A custom page is 90 to 600 mm on each side."})
		}
	default:
		ps = append(ps, Problem{"config.paper.size", "Choose A4, Letter, A5 or a custom size."})
	}
	if c.Paper.Orientation != "portrait" && c.Paper.Orientation != "landscape" {
		ps = append(ps, Problem{"config.paper.orientation", "Choose portrait or landscape."})
	}
	if c.Booklet && c.Paper.Size == "custom" {
		ps = append(ps, Problem{"config.booklet", "A booklet folds A4, Letter or A5 pages; choose one of those."})
	}
	return c, ps
}
