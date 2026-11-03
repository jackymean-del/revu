package assessment

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/evidence"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
	"github.com/xuri/excelize/v2"
)

// section is one section of an assessment, checked for the person.
type section struct {
	as     api.Assessment
	target policy.Target
	actor  policy.Actor
	tx     pgx.Tx
}

func openSection(c fiber.Ctx, sectionID string) (section, error) {
	var s section
	tx, err := tenant.Tx(c)
	if err != nil {
		return s, err
	}
	s.tx = tx
	if s.as, err = load(c.Context(), tx, c.Params("id")); err != nil {
		return s, err
	}
	in := false
	for _, id := range s.as.SectionIds {
		in = in || id == sectionID
	}
	if !in {
		return s, problem.New(http.StatusNotFound, "assessment.not_found", "This assessment does not cover that section.")
	}
	if s.target, err = sectionTarget(c.Context(), tx, sectionID, s.as.SubjectId); err != nil {
		return s, err
	}
	if s.actor, err = tenant.Teaching(c); err != nil {
		return s, err
	}
	if policy.Decide(s.actor, policy.EvidenceEnter, s.target) != policy.Full && policy.Decide(s.actor, policy.ResultsRead, s.target) != policy.Full {
		return s, problem.New(http.StatusForbidden, "auth.forbidden", "These marks belong to the teachers of this section.")
	}
	return s, nil
}

func students(c fiber.Ctx, s section) ([]api.GridStudent, error) {
	rows, err := s.tx.Query(c.Context(), `
		SELECT st.id::text, st.admission_no, st.name, coalesce(e.roll_no, ''),
		       `+fmt.Sprintf(evidence.Applicable, evidence.Selected, "st.id")+`,
		       coalesce(p.status, '')
		  FROM assessments a
		  JOIN enrolments e ON e.section_id = $2::uuid AND e.year_id = a.year_id AND e.deleted_at IS NULL
		  JOIN students st ON st.id = e.student_id AND st.deleted_at IS NULL
		  LEFT JOIN assessment_participation p ON p.assessment_id = a.id AND p.student_id = st.id
		 WHERE a.id = $1::uuid AND (st.status = 'active' OR p.status IS NOT NULL)
		 ORDER BY nullif(regexp_replace(coalesce(e.roll_no, ''), '\D', '', 'g'), '')::bigint NULLS LAST, st.admission_no`,
		s.as.Id, s.target.SectionID)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (g api.GridStudent, err error) {
		var status string
		err = r.Scan(&g.Id, &g.AdmissionNo, &g.Name, &g.RollNo, &g.Applicable, &status)
		g.Status = api.GridStudentStatus(status)
		return g, err
	})
	if list == nil {
		list = []api.GridStudent{}
	}
	return list, err
}

func grid(c fiber.Ctx) error {
	s, err := openSection(c, c.Query("sectionId"))
	if err != nil {
		return err
	}
	ctx := c.Context()
	out := api.MarksGrid{Assessment: s.as, SectionId: s.target.SectionID, Cells: []api.GridCell{}, Applicability: "all"}
	var selected bool
	if err := s.tx.QueryRow(ctx, `SELECT `+evidence.Selected+` FROM assessments a WHERE a.id = $1::uuid`, s.as.Id).Scan(&selected); err != nil {
		return err
	}
	if selected {
		out.Applicability = "selected"
	}
	if out.Students, err = students(c, s); err != nil {
		return err
	}
	rows, err := s.tx.Query(ctx, `
		SELECT ev.student_id::text, ev.part_id::text, ev.state::text, coalesce(ev.value::text, ''), ev.version
		  FROM evidence ev JOIN assessment_parts p ON p.id = ev.part_id AND p.deleted_at IS NULL
		  JOIN enrolments e ON e.student_id = ev.student_id AND e.section_id = $2::uuid AND e.deleted_at IS NULL
		 WHERE ev.assessment_id = $1::uuid`, s.as.Id, s.target.SectionID)
	if err != nil {
		return err
	}
	if out.Cells, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (g api.GridCell, err error) {
		return g, r.Scan(&g.StudentId, &g.PartId, &g.State, &g.Value, &g.Version)
	}); err != nil {
		return err
	}
	if out.Cells == nil {
		out.Cells = []api.GridCell{}
	}
	out.CanEdit = policy.Decide(s.actor, policy.EvidenceEnter, s.target) == policy.Full && s.as.Status == "open"
	out.CanLock = policy.Decide(s.actor, policy.AssessmentLock, s.target) == policy.Full
	out.CanSetLeft = policy.Decide(s.actor, policy.RowStatusLeft, s.target) == policy.Full
	return c.JSON(out)
}

// participation sets or clears a row status (Part 74.2). Marks under a
// status stay where they are, hidden; clearing the status shows them again.
func participation(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	studentID := c.Params("studentId")
	if !records.UUIDShape.MatchString(studentID) {
		return errNotFound
	}
	var sectionID string
	err = tx.QueryRow(ctx, `
		SELECT e.section_id::text FROM assessments a
		  JOIN assessment_scopes sc ON sc.assessment_id = a.id
		  JOIN enrolments e ON e.section_id = sc.section_id AND e.year_id = a.year_id AND e.deleted_at IS NULL
		 WHERE a.id::text = $1 AND e.student_id = $2::uuid`, c.Params("id"), studentID).Scan(&sectionID)
	if err == pgx.ErrNoRows {
		return problem.New(http.StatusNotFound, "assessment.not_found", "This student is not in a section this assessment covers.")
	}
	if err != nil {
		return err
	}
	s, err := openSection(c, sectionID)
	if err != nil {
		return err
	}
	var in api.ParticipationInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	act := policy.RowStatus
	status := string(in.Status)
	switch status {
	case "", "not_applicable", "absent", "exempt":
	case "left":
		act = policy.RowStatusLeft
	default:
		return problem.Invalid(api.FieldError{Field: "status", Code: "unknown", Message: "Choose not applicable, absent, exempt or left."})
	}
	var was string
	_ = tx.QueryRow(ctx, `SELECT status FROM assessment_participation WHERE assessment_id = $1::uuid AND student_id = $2::uuid`, s.as.Id, studentID).Scan(&was)
	if was == "left" {
		act = policy.RowStatusLeft
	}
	if err := policy.Check(s.actor, act, s.target); err != nil {
		return err
	}
	if s.as.Status != "open" {
		return problem.New(http.StatusConflict, "assessment.locked", "This assessment is not open for entry.")
	}
	in.ReasonCode, in.Note = strings.TrimSpace(in.ReasonCode), strings.TrimSpace(in.Note)
	m, _ := tenant.MemberFrom(c)
	out := api.Participation{AssessmentId: s.as.Id, StudentId: studentID}
	if status == "" {
		_, err = tx.Exec(ctx, `DELETE FROM assessment_participation WHERE assessment_id = $1::uuid AND student_id = $2::uuid`, s.as.Id, studentID)
	} else {
		out.Status, out.ReasonCode, out.Note = api.ParticipationStatus(status), in.ReasonCode, in.Note
		_, err = tx.Exec(ctx, `
			INSERT INTO assessment_participation (org_id, assessment_id, student_id, status, reason_code, note, effective_from, set_by)
			VALUES ($1, $2::uuid, $3::uuid, $4, nullif($5, ''), nullif($6, ''), coalesce(nullif($7, '')::date, current_date), $8)
			ON CONFLICT (assessment_id, student_id) DO UPDATE SET status = EXCLUDED.status, reason_code = EXCLUDED.reason_code,
			       note = EXCLUDED.note, effective_from = EXCLUDED.effective_from, set_by = EXCLUDED.set_by, set_at = now()`,
			m.OrgID, s.as.Id, studentID, status, in.ReasonCode, in.Note, in.EffectiveFrom, m.UserID)
	}
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "assessment_participation", EntityID: s.as.Id,
		Before: map[string]string{"studentId": studentID, "status": was}, After: map[string]string{"studentId": studentID, "status": status}}); err != nil {
		return err
	}
	return c.JSON(out)
}

// codes are what a teacher types or uploads instead of a mark.
var codes = map[string]string{"absent": "AB", "exempt": "EX", "not_applicable": "NA"}

// template is a spreadsheet of the section's students who take the
// subject, with the columns in the order asked for and the marks entered
// so far, to be filled in any row order (Part 59.7, AT-GR-01).
func template(c fiber.Ctx) error {
	s, err := openSection(c, c.Query("sectionId"))
	if err != nil {
		return err
	}
	parts := s.as.Parts
	if want := c.Query("columns"); want != "" {
		byID := map[string]api.AssessmentPart{}
		for _, p := range parts {
			byID[p.Id] = p
		}
		parts = nil
		for _, id := range strings.Split(want, ",") {
			if p, ok := byID[strings.TrimSpace(id)]; ok {
				parts = append(parts, p)
				delete(byID, p.Id)
			}
		}
	}
	list, err := students(c, s)
	if err != nil {
		return err
	}
	rows, err := s.tx.Query(c.Context(), `SELECT student_id::text, part_id::text, state::text, coalesce(value::text, '') FROM evidence WHERE assessment_id = $1::uuid`, s.as.Id)
	if err != nil {
		return err
	}
	cells := map[string]string{}
	for rows.Next() {
		var st, p, state, value string
		if err := rows.Scan(&st, &p, &state, &value); err != nil {
			return err
		}
		if state == "scored" {
			cells[st+p] = strings.TrimSuffix(strings.TrimSuffix(value, "0"), ".0")
		} else {
			cells[st+p] = codes[state]
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

	f := excelize.NewFile()
	defer f.Close()
	sheet := "Marks"
	_ = f.SetSheetName("Sheet1", sheet)
	head := []any{"Admission number", "Name", "Roll"}
	for _, p := range parts {
		head = append(head, p.Name)
	}
	_ = f.SetSheetRow(sheet, "A1", &head)
	r := 2
	for _, st := range list {
		if !st.Applicable || st.Status != "" {
			continue
		}
		row := []any{st.AdmissionNo, st.Name, st.RollNo}
		for _, p := range parts {
			row = append(row, cells[st.Id+p.Id])
		}
		cell, _ := excelize.CoordinatesToCellName(1, r)
		_ = f.SetSheetRow(sheet, cell, &row)
		r++
	}
	_ = f.SetColWidth(sheet, "A", "A", 18)
	_ = f.SetColWidth(sheet, "B", "B", 28)
	about := "About"
	_, _ = f.NewSheet(about)
	_ = f.SetSheetRow(about, "A1", &[]any{"Column", "Out of"})
	for i, p := range parts {
		cell, _ := excelize.CoordinatesToCellName(1, i+2)
		_ = f.SetSheetRow(about, cell, &[]any{p.Name, p.MaxMarks})
	}
	n := len(parts) + 3
	for i, line := range []string{
		"Fill in any row order: each row is matched by admission number.",
		"Type a mark, or AB for absent, EX for exempt, NA for not applicable.",
		"Leave a cell blank to leave it as it is. A blank is never zero.",
	} {
		cell, _ := excelize.CoordinatesToCellName(1, n+i)
		_ = f.SetCellValue(about, cell, line)
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		return err
	}
	c.Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Set("Content-Disposition", `attachment; filename="marks.xlsx"`)
	return c.Send(buf.Bytes())
}
