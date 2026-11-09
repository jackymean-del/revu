package analysis

import (
	"fmt"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/xuri/excelize/v2"
)

// exportPack writes the analysis pack as one workbook: the aggregate, the
// band counts and one sheet per criteria list, each ending in the sign-off
// lines. Withheld and not assessed are written as words, never as zero. The
// export is logged without its contents (B8.8).
func exportPack(c fiber.Ctx, now time.Time) error {
	s, err := build(c, now)
	if err != nil {
		return err
	}
	b, err := workbook(s)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "export", Entity: "analysis_pack", EntityID: c.Query("sectionId"),
		After: map[string]string{"periodId": c.Query("periodId"), "basis": s.Basis}}); err != nil {
		return err
	}
	c.Set(fiber.HeaderContentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Set(fiber.HeaderContentDisposition, `attachment; filename="analysis.xlsx"`)
	return c.Send(b)
}

var stateWord = map[string]string{"blocked": "Withheld", "not_assessed": "Not assessed", "provisional": "Provisional"}

func cellText(cell Cell) string {
	if cell.Pct == "" {
		if w, ok := stateWord[cell.State]; ok {
			return w
		}
		return "-"
	}
	if cell.State == "provisional" {
		return cell.Pct + " (P)"
	}
	return cell.Pct
}

// sheetWriter writes rows one after another on one sheet.
type sheetWriter struct {
	f     *excelize.File
	sheet string
	row   int
}

func (w *sheetWriter) put(values []any, style int) error {
	w.row++
	cell, _ := excelize.CoordinatesToCellName(1, w.row)
	if err := w.f.SetSheetRow(w.sheet, cell, &values); err != nil {
		return err
	}
	if style != 0 && len(values) > 0 {
		last, _ := excelize.CoordinatesToCellName(len(values), w.row)
		return w.f.SetCellStyle(w.sheet, cell, last, style)
	}
	return nil
}

func workbook(s Summary) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()
	head, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true}, Fill: excelize.Fill{Type: "pattern", Color: []string{"F1EFFC"}, Pattern: 1}})
	title, _ := f.NewStyle(&excelize.Style{Font: &excelize.Font{Bold: true, Size: 13}})
	word := func(k string) string {
		if v := s.Words[k]; v != "" {
			return v
		}
		return k
	}
	basis := "Term result"
	for _, b := range s.Bases {
		if b.Code == s.Basis && b.Code != "" {
			basis = b.Name
		}
	}
	open := func(sheet, what string, first bool) (*sheetWriter, error) {
		if first {
			if err := f.SetSheetName("Sheet1", sheet); err != nil {
				return nil, err
			}
		} else if _, err := f.NewSheet(sheet); err != nil {
			return nil, err
		}
		w := &sheetWriter{f: f, sheet: sheet}
		if err := w.put([]any{s.Title + ": " + what}, title); err != nil {
			return nil, err
		}
		return w, w.put([]any{"Basis: " + basis}, 0)
	}
	sign := func(w *sheetWriter) error {
		w.row++ // a blank line before the signatures
		values := []any{}
		for _, l := range s.Signoff {
			values = append(values, l, "")
		}
		return w.put(values, head)
	}

	// Aggregate.
	w, err := open("Aggregate", "aggregate", true)
	if err != nil {
		return nil, err
	}
	header := []any{word("person.roll_no"), word("person.student")}
	for _, sub := range s.Subjects {
		header = append(header, sub.Name+" %", sub.Name+" band")
	}
	if s.Access == "full" {
		header = append(header, "Total", "Total max", "Total %", "Total band")
	}
	if err := w.put(header, head); err != nil {
		return nil, err
	}
	headerRow := w.row
	for _, st := range s.Students {
		values := []any{st.RollNo, st.Name}
		for _, sub := range s.Subjects {
			cell, ok := st.Subjects[sub.ID]
			if !ok {
				values = append(values, "", "")
				continue
			}
			values = append(values, cellText(cell), cell.Band)
		}
		if st.Total != nil {
			values = append(values, st.Total.Value, st.Total.Max, cellText(*st.Total), st.Total.Band)
		}
		if err := w.put(values, 0); err != nil {
			return nil, err
		}
	}
	for _, line := range []struct {
		label string
		pick  func(SubjectSummary) string
	}{
		{"Average", func(x SubjectSummary) string { return x.Average }},
		{"Median", func(x SubjectSummary) string { return x.Median }},
		{"Highest", func(x SubjectSummary) string { return x.Highest }},
		{"Lowest", func(x SubjectSummary) string { return x.Lowest }},
	} {
		values := []any{"", line.label}
		for _, sub := range s.Subjects {
			values = append(values, line.pick(sub), "")
		}
		if err := w.put(values, head); err != nil {
			return nil, err
		}
	}
	if s.Basis == "" {
		values := []any{"", "Passed"}
		for _, sub := range s.Subjects {
			passed := ""
			if sub.Complete > 0 {
				passed = fmt.Sprintf("%d of %d", sub.Passed, sub.Complete)
			}
			values = append(values, passed, "")
		}
		if err := w.put(values, head); err != nil {
			return nil, err
		}
	}
	if err := sign(w); err != nil {
		return nil, err
	}
	top, _ := excelize.CoordinatesToCellName(3, headerRow+1)
	_ = f.SetPanes("Aggregate", &excelize.Panes{Freeze: true, XSplit: 2, YSplit: headerRow, TopLeftCell: top, ActivePane: "bottomRight"})

	// Bands.
	w, err = open("Bands", "band counts", false)
	if err != nil {
		return nil, err
	}
	var labels []string
	if len(s.Bands) > 0 {
		for _, b := range s.Bands {
			labels = append(labels, b.Label)
		}
	} else {
		seen := map[string]bool{}
		for _, sub := range s.Subjects {
			for _, b := range sub.Bands {
				if !seen[b.Label] {
					seen[b.Label] = true
					labels = append(labels, b.Label)
				}
			}
		}
	}
	header = []any{word("course.subject")}
	for _, l := range labels {
		header = append(header, l)
	}
	header = append(header, "Provisional", "Withheld", "Not assessed", "Total")
	if err := w.put(header, head); err != nil {
		return nil, err
	}
	for _, sub := range s.Subjects {
		values := []any{sub.Name}
		for _, l := range labels {
			n := 0
			for _, b := range sub.Bands {
				if b.Label == l {
					n = b.Count
				}
			}
			values = append(values, n)
		}
		values = append(values, sub.Provisional, sub.Blocked, sub.NotAssessed, sub.Taking)
		if err := w.put(values, 0); err != nil {
			return nil, err
		}
	}
	if err := sign(w); err != nil {
		return nil, err
	}

	// One sheet per list.
	byID := map[string]StudentRow{}
	for _, st := range s.Students {
		byID[st.ID] = st
	}
	for i, l := range s.Lists {
		name := fmt.Sprintf("%d %s", i+1, l.Rule.Name)
		if r := []rune(name); len(r) > 31 {
			name = string(r[:31])
		}
		w, err := open(name, l.Rule.Name, false)
		if err != nil {
			return nil, err
		}
		if err := w.put([]any{describe(l.Rule)}, 0); err != nil {
			return nil, err
		}
		header := []any{word("person.roll_no"), word("person.student")}
		for _, sub := range s.Subjects {
			header = append(header, sub.Name)
		}
		header = append(header, "Total %")
		if err := w.put(header, head); err != nil {
			return nil, err
		}
		for _, e := range l.Students {
			values := []any{e.RollNo, e.Name}
			for _, sub := range s.Subjects {
				v := ""
				for _, id := range e.Subjects {
					if id == sub.ID {
						cell := byID[e.StudentID].Subjects[sub.ID]
						v = cellText(cell) + " " + cell.Band
					}
				}
				values = append(values, v)
			}
			values = append(values, e.TotalPct)
			if err := w.put(values, 0); err != nil {
				return nil, err
			}
		}
		if err := sign(w); err != nil {
			return nil, err
		}
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// describe says a rule in words, as the page does.
func describe(r Rule) string {
	if r.On == "overall" {
		return fmt.Sprintf("Overall below %s%%. Shows subjects below %s%%.", r.BelowPct, r.ShowBelowPct)
	}
	return fmt.Sprintf("At least %d below %s%%. Shows subjects below %s%%.", r.AtLeast, r.BelowPct, r.ShowBelowPct)
}
