package reports

import (
	"bytes"
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/jackymean-del/revu/internal/scheme"
	"github.com/xuri/excelize/v2"
)

func TestParseTemplate(t *testing.T) {
	raw, _ := json.Marshal(DefaultConfig())
	if c, ps := Parse(raw); len(ps) > 0 || !c.On("marks") || c.Paper.Size != "A4" {
		t.Fatalf("default does not round-trip: %+v %v", c, ps)
	}
	for _, tc := range []struct{ edit, field string }{
		{`{"key": "identity", "on": false}`, "config.sections"},
		{`{"key": "gossip", "on": true}`, "config.sections[0]"},
	} {
		c := DefaultConfig()
		var s Section
		_ = json.Unmarshal([]byte(tc.edit), &s)
		c.Sections[0] = s
		raw, _ := json.Marshal(c)
		if _, ps := Parse(raw); len(ps) == 0 || ps[0].Field != tc.field {
			t.Errorf("%s: %v", tc.edit, ps)
		}
	}
	c := DefaultConfig()
	c.Paper = Paper{Size: "custom", WidthMM: 50, HeightMM: 200, Orientation: "portrait"}
	c.Booklet = true
	raw, _ = json.Marshal(c)
	if _, ps := Parse(raw); len(ps) != 2 {
		t.Errorf("a tiny custom booklet: %v", ps)
	}
	if _, ps := Parse([]byte(`{"title": "x", "extra": 1}`)); len(ps) == 0 {
		t.Error("an unknown field is accepted")
	}
	// Orientation swaps the sides.
	c = DefaultConfig()
	c.Paper = Paper{Size: "A5", Orientation: "landscape"}
	if w, h := c.PageMM(); w != 210 || h != 148 {
		t.Errorf("A5 landscape is %v by %v", w, h)
	}
}

func sampleFacts(name, admission string) Facts {
	return Facts{
		Institution: Branding{Version: 2, DisplayName: "Hill View School", Address: "Bhubaneswar"},
		Student:     Student{ID: admission, Name: name, AdmissionNo: admission, RollNo: "4"},
		Level:       "Grade 6", Section: "A", Year: "2026-27", Period: "Term 1",
		Words: map[string]string{"person.student": "Student", "person.admission_no": "Admission number", "person.roll_no": "Roll number",
			"group.level": "Grade", "group.section": "Section", "period.term": "Term", "period.year": "Year", "course.subject": "Subject",
			"person.class_teacher": "Class teacher", "person.principal": "Principal", "person.guardian": "Parent"},
		Subjects: []Subject{
			{ID: "m", Name: "Mathematics", State: "complete", Value: "79.00", Max: "100", Pct: "79.00", Grade: "B1",
				Components: []Component{{Code: "PT", Name: "Periodic tests", State: "complete", Value: "8.50", Max: "10"}}},
			{ID: "s", Name: "Science", State: "provisional", Value: "16.50", Max: "20", Pct: "82.50"},
			{ID: "h", Name: "Hindi", State: "blocked"},
		},
		Overall: scheme.Overall{State: "blocked", Reason: "subject_withheld"},
		Legends: []Legend{{Scheme: "Our scheme", Bands: []scheme.Band{{Label: "A1", MinPct: "91"}, {Label: "E", MinPct: "0"}}}},
	}
}

func TestRender(t *testing.T) {
	c := DefaultConfig()
	c.QR = true
	c.Paper = Paper{Size: "A5", Orientation: "landscape"}
	h, err := Render(Page{Config: c, Reports: []Report{{Facts: sampleFacts("Kiran Das", "A-002")}, {Facts: sampleFacts("Leela Rao", "A-003")}}, Preview: true})
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"Hill View School", "Kiran Das", "Leela Rao", "Admission number", "Mathematics", "79 / 100", "Periodic tests 8.5/10",
		"Provisional", "Withheld", "Class teacher", "Parent", "<b>A1</b> from 91%", "size: 210.0mm 148.0mm", "QR code"} {
		if !strings.Contains(h, want) {
			t.Errorf("the page lacks %q", want)
		}
	}
	if strings.Contains(h, "<no value>") || strings.Count(h, `class="report`) != 2 || strings.Count(h, "report last") != 1 {
		t.Error("each report must be its own block, the last without a page break")
	}
	// The overall result is withheld, so no overall number is printed.
	if strings.Contains(h, "Overall:</b> 0") {
		t.Error("a withheld overall shows a number")
	}
	// Turning a section off removes it.
	c.Sections[1].On = false // marks
	h, _ = Render(Page{Config: c, Reports: []Report{{Facts: sampleFacts("Kiran Das", "A-002")}}})
	if strings.Contains(h, "Mathematics") {
		t.Error("the marks section shows while off")
	}
}

// tinyPDF makes a valid PDF of n empty A4 pages, so assembly can be tested
// without a renderer.
func tinyPDF(n int) []byte {
	var b bytes.Buffer
	offsets := []int{}
	obj := func(s string) {
		offsets = append(offsets, b.Len())
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", len(offsets), s)
	}
	b.WriteString("%PDF-1.4\n")
	kids := make([]string, n)
	for i := range kids {
		kids[i] = fmt.Sprintf("%d 0 R", i+3)
	}
	obj("<< /Type /Catalog /Pages 2 0 R >>")
	obj(fmt.Sprintf("<< /Type /Pages /Kids [%s] /Count %d >>", strings.Join(kids, " "), n))
	for range n {
		obj("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] >>")
	}
	xref := b.Len()
	fmt.Fprintf(&b, "xref\n0 %d\n0000000000 65535 f \n", len(offsets)+1)
	for _, o := range offsets {
		fmt.Fprintf(&b, "%010d 00000 n \n", o)
	}
	fmt.Fprintf(&b, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(offsets)+1, xref)
	return b.Bytes()
}

// A report of an odd number of pages gets a blank page in a combined PDF,
// so each report starts on a new sheet; a booklet pads to four and folds.
func TestAssemble(t *testing.T) {
	c := DefaultConfig()
	out, pages, err := Assemble([][]byte{tinyPDF(1), tinyPDF(2), tinyPDF(3)}, c)
	if err != nil {
		t.Fatal(err)
	}
	if n, _ := Pages(out); n != 8 || fmt.Sprint(pages) != "[2 2 4]" {
		t.Fatalf("combined %d pages, per report %v; want 8, [2 2 4]", n, pages)
	}
	// One report alone is never padded.
	out, pages, _ = Assemble([][]byte{tinyPDF(3)}, c)
	if n, _ := Pages(out); n != 3 || pages[0] != 3 {
		t.Fatalf("a single report has %d pages", n)
	}
	// Padding off keeps every report as it is.
	c.PadEven = false
	out, _, _ = Assemble([][]byte{tinyPDF(1), tinyPDF(1)}, c)
	if n, _ := Pages(out); n != 2 {
		t.Fatalf("unpadded: %d pages", n)
	}
	// A booklet of 3 pages pads to 4 and prints on one sheet, both sides.
	c = DefaultConfig()
	c.Booklet = true
	out, pages, err = Assemble([][]byte{tinyPDF(3)}, c)
	if err != nil {
		t.Fatal(err)
	}
	if n, _ := Pages(out); n != 2 || pages[0] != 4 {
		t.Fatalf("booklet: %d sheet sides from %v pages; want 2 from 4", n, pages)
	}
}

func TestMarksheet(t *testing.T) {
	a, b := sampleFacts("Kiran Das", "A-002"), sampleFacts("Leela Rao", "A-003")
	b.Subjects[0].Value, b.Subjects[0].Pct = "91.00", "91.00"
	raw, err := Marksheet([]Facts{a, b}, DefaultConfig())
	if err != nil {
		t.Fatal(err)
	}
	f, err := excelize.OpenReader(bytes.NewReader(raw))
	if err != nil {
		t.Fatal(err)
	}
	rows, _ := f.GetRows("Results")
	if len(rows) != 3 || rows[0][2] != "Student" || rows[1][2] != "Kiran Das" {
		t.Fatalf("rows %v", rows)
	}
	joined := strings.Join(rows[1], "|")
	for _, want := range []string{"Mathematics Periodic tests /10", "79.00", "16.50 (P)", "Withheld"} {
		if !strings.Contains(joined, want) && !strings.Contains(strings.Join(rows[0], "|"), want) {
			t.Errorf("the marksheet lacks %q", want)
		}
	}
	sum, _ := f.GetRows("Summary")
	// Mathematics: (79 + 91) / 2 = 85.00; Science is provisional, Hindi withheld: not averaged.
	if sum[1][0] != "Mathematics" || sum[1][2] != "85.00" || sum[1][3] != "91.00" || sum[1][4] != "79.00" {
		t.Fatalf("summary %v", sum)
	}
	if len(sum[2]) > 2 && sum[2][2] != "" {
		t.Fatalf("a provisional subject was averaged: %v", sum[2])
	}
}
