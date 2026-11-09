package reports

import (
	"bytes"
	"fmt"

	"github.com/jackymean-del/revu/internal/scheme"
	"github.com/xuri/excelize/v2"
)

// states as a marksheet writes a result without a number.
var codes = map[string]string{"blocked": "Withheld", "not_assessed": "-", "provisional": ""}

// Marksheet writes a section's results for a period: one row per student
// with each subject's components, marks, percentage and band in the
// template's subject order, then the overall result; and a summary sheet
// with each subject's class average, highest and lowest. A provisional
// value is marked (P); withheld and absent never become zero.
func Marksheet(facts []Facts, cfg Config) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()
	const sheet = "Results"
	if err := f.SetSheetName("Sheet1", sheet); err != nil {
		return nil, err
	}
	bold, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}, Fill: excelize.Fill{Type: "pattern", Color: []string{"F1EFFC"}, Pattern: 1}})

	// Columns follow the first student who takes each subject.
	type col struct {
		subjectID, name string
		components      []Component
	}
	var cols []col
	seen := map[string]bool{}
	for _, fx := range facts {
		for _, s := range fx.Subjects {
			if !seen[s.ID] {
				seen[s.ID] = true
				cols = append(cols, col{s.ID, s.Name, s.Components})
			}
		}
	}
	words := map[string]string{}
	if len(facts) > 0 {
		words = facts[0].Words
	}
	header := []any{words["person.roll_no"], words["person.admission_no"], words["person.student"]}
	for _, c := range cols {
		if cfg.On("components") {
			for _, p := range c.components {
				header = append(header, fmt.Sprintf("%s %s /%s", c.name, p.Name, p.Max))
			}
		}
		header = append(header, c.name+" marks", c.name+" max", c.name+" %", c.name+" band")
	}
	header = append(header, "Overall", "Overall max", "Overall %", "State")
	if err := f.SetSheetRow(sheet, "A1", &header); err != nil {
		return nil, err
	}
	last, _ := excelize.CoordinatesToCellName(len(header), 1)
	_ = f.SetCellStyle(sheet, "A1", last, bold)

	value := func(state, v string) string {
		if v == "" {
			if c, ok := codes[state]; ok && c != "" {
				return c
			}
			return "-"
		}
		if state == "provisional" {
			return v + " (P)"
		}
		return v
	}
	perSubject := map[string][]string{}
	for i, fx := range facts {
		row := []any{fx.Student.RollNo, fx.Student.AdmissionNo, fx.Student.Name}
		bySubject := map[string]Subject{}
		for _, s := range fx.Subjects {
			bySubject[s.ID] = s
		}
		for _, c := range cols {
			s, takes := bySubject[c.subjectID]
			if cfg.On("components") {
				for _, p := range c.components {
					cell := ""
					if takes {
						for _, sp := range s.Components {
							if sp.Code == p.Code {
								cell = value(sp.State, sp.Value)
							}
						}
					}
					row = append(row, cell)
				}
			}
			if !takes {
				row = append(row, "", "", "", "") // does not take the subject
				continue
			}
			row = append(row, value(s.State, s.Value), s.Max, s.Pct, s.Grade)
			if s.State == "complete" {
				perSubject[c.subjectID] = append(perSubject[c.subjectID], s.Value)
			}
		}
		o := fx.Overall
		row = append(row, value(o.State, o.Value), o.Max, o.Pct, stateLabel(o.State))
		cell, _ := excelize.CoordinatesToCellName(1, i+2)
		if err := f.SetSheetRow(sheet, cell, &row); err != nil {
			return nil, err
		}
	}
	_ = f.SetPanes(sheet, &excelize.Panes{Freeze: true, XSplit: 3, YSplit: 1, TopLeftCell: "D2", ActivePane: "bottomRight"})
	_ = f.AutoFilter(sheet, "A1:"+last, nil)

	const summary = "Summary"
	if _, err := f.NewSheet(summary); err != nil {
		return nil, err
	}
	_ = f.SetSheetRow(summary, "A1", &[]any{words["course.subject"], "Final results", "Class average", "Highest", "Lowest"})
	_ = f.SetCellStyle(summary, "A1", "E1", bold)
	for i, c := range cols {
		st := scheme.Describe(perSubject[c.subjectID], 2)
		cell, _ := excelize.CoordinatesToCellName(1, i+2)
		_ = f.SetSheetRow(summary, cell, &[]any{c.name, st.Count, st.Average, st.Highest, st.Lowest})
	}
	note, _ := excelize.CoordinatesToCellName(1, len(cols)+3)
	_ = f.SetCellValue(summary, note, "Averages count final results only; withheld, absent and provisional results are left out, never counted as zero.")

	var b bytes.Buffer
	if err := f.Write(&b); err != nil {
		return nil, err
	}
	return b.Bytes(), nil
}
