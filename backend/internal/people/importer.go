package people

import (
	"bytes"
	"context"
	"encoding/csv"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tables"
	"github.com/jackymean-del/revu/internal/tenant"
	"github.com/jackymean-del/revu/internal/terminology"
)

// Importing a class list is two steps. The preview reads the file, checks
// every row and stores the result as an import job; nothing else changes.
// Applying then writes exactly the accepted rows, matching students by
// admission number, so running the same file again updates instead of
// duplicating (AT-v1-06, AT-P-02).

const (
	maxImportRows   = 5000 // larger lists: split the file (a background job comes with v3)
	maxShownProblem = 100  // the preview shows these; errors.csv has every one
)

// fields of a student row, with the headings each accepts. Headings are
// compared without case, spaces or punctuation; the organisation's own
// words are added at run time.
var headings = map[string][]string{
	"admissionNo":      {"admission number", "admission no", "adm no", "admn no", "admission", "registration number", "registration no", "enrolment number", "enrollment number", "student id"},
	"name":             {"name", "student name", "full name", "student"},
	"preferredName":    {"preferred name", "display name", "known as"},
	"dob":              {"date of birth", "dob", "birth date", "birthday"},
	"section":          {"section", "class", "class section", "division", "batch", "group"},
	"rollNo":           {"roll number", "roll no", "roll"},
	"guardianName":     {"guardian", "guardian name", "parent", "parent name", "father name", "mother name"},
	"guardianRelation": {"relation", "relationship", "guardian relation"},
	"guardianPhone":    {"phone", "mobile", "contact", "guardian phone", "parent phone", "parent mobile", "phone number"},
	"guardianEmail":    {"email", "guardian email", "parent email", "email address"},
}

// fieldOrder is how fields read back in the preview's list of columns.
var fieldOrder = []string{"admissionNo", "name", "preferredName", "dob", "section", "rollNo", "guardianName", "guardianRelation", "guardianPhone", "guardianEmail"}

// importRow is one accepted row, kept with the job until it is applied.
type importRow struct {
	Row              int    `json:"row"`
	AdmissionNo      string `json:"admissionNo"`
	Name             string `json:"name"`
	PreferredName    string `json:"preferredName,omitempty"`
	Dob              string `json:"dob,omitempty"`
	SectionID        string `json:"sectionId,omitempty"`
	RollNo           string `json:"rollNo,omitempty"`
	GuardianName     string `json:"guardianName,omitempty"`
	GuardianRelation string `json:"guardianRelation,omitempty"`
	GuardianPhone    string `json:"guardianPhone,omitempty"`
	GuardianEmail    string `json:"guardianEmail,omitempty"`
	Action           string `json:"action"` // create, update or unchanged at preview time
}

var dateLayouts = []string{"2006-01-02", "02-01-2006", "02/01/2006", "2/1/2006", "02.01.2006", "2-1-2006", "01-02-06", "2006/01/02"}

func parseDOB(s string) (string, bool) {
	for _, l := range dateLayouts {
		if d, err := time.Parse(l, s); err == nil {
			if d.After(time.Now()) || d.Year() < 1900 {
				return "", false
			}
			return d.Format(time.DateOnly), true
		}
	}
	return "", false
}

var emailShape = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

type sectionIndex struct {
	byName map[string]string // normalised "level section", "levelsection" or a unique section name -> id
	year   string            // label, for messages
	yearID string
}

// sectionsOf indexes the live sections of a year for matching by name.
func sectionsOf(ctx context.Context, tx pgx.Tx, yearID string) (sectionIndex, error) {
	idx := sectionIndex{byName: map[string]string{}, yearID: yearID}
	if err := tx.QueryRow(ctx, `SELECT label FROM academic_years WHERE id = $1::uuid`, yearID).Scan(&idx.year); err != nil {
		return idx, err
	}
	rows, err := tx.Query(ctx, `SELECT s.id::text, l.name, s.name FROM sections s JOIN levels l ON l.id = s.level_id WHERE s.year_id = $1::uuid AND s.deleted_at IS NULL`, yearID)
	if err != nil {
		return idx, err
	}
	defer rows.Close()
	plainCount := map[string]int{}
	plainID := map[string]string{}
	for rows.Next() {
		var id, level, name string
		if err := rows.Scan(&id, &level, &name); err != nil {
			return idx, err
		}
		idx.byName[tables.Norm(level+" "+name)] = id
		plainCount[tables.Norm(name)]++
		plainID[tables.Norm(name)] = id
	}
	for k, n := range plainCount {
		if n == 1 {
			idx.byName[k] = plainID[k]
		}
	}
	return idx, rows.Err()
}

// currentYear is the year that includes today, or else the latest one.
func currentYear(ctx context.Context, tx pgx.Tx) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `
		SELECT id::text FROM academic_years WHERE deleted_at IS NULL
		 ORDER BY (current_date BETWEEN starts_on AND ends_on) DESC, starts_on DESC LIMIT 1`).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return id, err
}

func previewImport(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	fh, err := c.FormFile("file")
	if err != nil {
		return problem.Invalid(api.FieldError{Field: "file", Code: "required", Message: "Choose a .csv or .xlsx file."})
	}
	file, err := fh.Open()
	if err != nil {
		return err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 5<<20))
	if err != nil {
		return err
	}
	table, err := tables.Read(fh.Filename, data)
	if err != nil {
		return problem.Invalid(api.FieldError{Field: "file", Code: "format", Message: err.Error() + "."})
	}

	words, err := terminology.Words(ctx, tx)
	if err != nil {
		return err
	}
	accepts := map[string]string{} // normalised heading -> field
	for field, list := range headings {
		for _, h := range list {
			accepts[tables.Norm(h)] = field
		}
	}
	for _, n := range []int{1, 2} {
		accepts[tables.Norm(words("person.admission_no", n))] = "admissionNo"
		accepts[tables.Norm(words("person.student", 1)+" name")] = "name"
		accepts[tables.Norm(words("group.section", n))] = "section"
		accepts[tables.Norm(words("person.roll_no", n))] = "rollNo"
		accepts[tables.Norm(words("person.guardian", n))] = "guardianName"
	}

	if len(table) == 0 {
		return problem.Invalid(api.FieldError{Field: "file", Code: "empty", Message: "The file is empty."})
	}
	col := map[string]int{}
	var unknown []string
	for i, h := range table[0] {
		field, ok := accepts[tables.Norm(h)]
		switch {
		case strings.TrimSpace(h) == "":
		case !ok:
			unknown = append(unknown, strings.TrimSpace(h))
		default:
			if _, taken := col[field]; !taken {
				col[field] = i
			}
		}
	}
	for _, need := range []string{"admissionNo", "name"} {
		if _, ok := col[need]; !ok {
			label := map[string]string{"admissionNo": words("person.admission_no", 1), "name": "Name"}[need]
			return problem.Invalid(api.FieldError{Field: "file", Code: "heading", Message: fmt.Sprintf("The first row needs a heading for %s. Found: %s.", label, strings.Join(table[0], ", "))})
		}
	}
	body := table[1:]
	if len(body) > maxImportRows {
		return problem.New(http.StatusUnprocessableEntity, "import.too_large", fmt.Sprintf("This file has %d rows. Import up to %d at a time.", len(body), maxImportRows))
	}

	// Where students go: a chosen section, or a section column matched in a year.
	defaultSection := c.FormValue("sectionId")
	var sections sectionIndex
	if defaultSection != "" {
		var yearID string
		err := tx.QueryRow(ctx, `SELECT year_id::text FROM sections WHERE id::text = $1 AND deleted_at IS NULL`, defaultSection).Scan(&yearID)
		if errors.Is(err, pgx.ErrNoRows) || !records.UUIDShape.MatchString(defaultSection) {
			return problem.Invalid(api.FieldError{Field: "sectionId", Code: "unknown", Message: "Choose one from the list."})
		} else if err != nil {
			return err
		}
		if sections, err = sectionsOf(ctx, tx, yearID); err != nil {
			return err
		}
	} else if _, ok := col["section"]; ok {
		yearID, err := currentYear(ctx, tx)
		if err != nil {
			return err
		}
		if yearID != "" {
			if sections, err = sectionsOf(ctx, tx, yearID); err != nil {
				return err
			}
		}
	}

	cell := func(r []string, field string) string {
		i, ok := col[field]
		if !ok || i >= len(r) {
			return ""
		}
		return strings.TrimSpace(r[i])
	}
	var accepted []importRow
	var rejected []api.ImportProblem
	seen := map[string]int{}
	for n, r := range body {
		rowNo := n + 2
		if strings.TrimSpace(strings.Join(r, "")) == "" {
			continue
		}
		row := importRow{
			Row: rowNo, AdmissionNo: cell(r, "admissionNo"), Name: cell(r, "name"), PreferredName: cell(r, "preferredName"),
			RollNo: cell(r, "rollNo"), GuardianName: cell(r, "guardianName"), GuardianRelation: cell(r, "guardianRelation"),
			GuardianPhone: cell(r, "guardianPhone"), GuardianEmail: cell(r, "guardianEmail"),
		}
		var why []string
		switch {
		case row.AdmissionNo == "":
			why = append(why, words("person.admission_no", 1)+" is missing")
		case len([]rune(row.AdmissionNo)) > 40:
			why = append(why, words("person.admission_no", 1)+" is longer than 40 characters")
		}
		if first, dup := seen[strings.ToLower(row.AdmissionNo)]; dup && row.AdmissionNo != "" {
			why = append(why, fmt.Sprintf("the same %s is in row %d", strings.ToLower(words("person.admission_no", 1)), first))
		} else if row.AdmissionNo != "" {
			seen[strings.ToLower(row.AdmissionNo)] = rowNo
		}
		if row.Name == "" {
			why = append(why, "name is missing")
		} else if len([]rune(row.Name)) > 120 {
			why = append(why, "name is longer than 120 characters")
		}
		if len([]rune(row.PreferredName)) > 80 {
			why = append(why, "preferred name is longer than 80 characters")
		}
		if v := cell(r, "dob"); v != "" {
			if d, ok := parseDOB(v); ok {
				row.Dob = d
			} else {
				why = append(why, fmt.Sprintf("date of birth %q is not a date in the past (use 2014-06-21 or 21-06-2014)", v))
			}
		}
		if v := cell(r, "section"); v != "" && sections.yearID != "" {
			if id, ok := sections.byName[tables.Norm(v)]; ok {
				row.SectionID = id
			} else {
				why = append(why, fmt.Sprintf("no %s %q in %s", strings.ToLower(words("group.section", 1)), v, sections.year))
			}
		} else if v != "" {
			why = append(why, "there is no year to place students in yet")
		} else {
			row.SectionID = defaultSection
		}
		if len([]rune(row.RollNo)) > 20 {
			why = append(why, "roll number is longer than 20 characters")
		}
		if (row.GuardianPhone != "" || row.GuardianEmail != "") && row.GuardianName == "" {
			why = append(why, "a contact phone or email needs a contact name")
		}
		if row.GuardianPhone != "" && !phoneShape.MatchString(row.GuardianPhone) {
			why = append(why, fmt.Sprintf("phone %q is not a phone number", row.GuardianPhone))
		}
		if row.GuardianEmail != "" && !emailShape.MatchString(row.GuardianEmail) {
			why = append(why, fmt.Sprintf("email %q is not an email address", row.GuardianEmail))
		}
		if len(why) > 0 {
			rejected = append(rejected, api.ImportProblem{Row: rowNo, AdmissionNo: row.AdmissionNo, Name: row.Name, Reasons: why})
			continue
		}
		accepted = append(accepted, row)
	}

	if err := allowedFor(c, tx, accepted); err != nil {
		return err
	}
	counts, err := classify(ctx, tx, accepted)
	if err != nil {
		return err
	}
	counts["rejected"] = len(rejected)
	counts["rows"] = len(accepted) + len(rejected)

	var understood []string
	for _, f := range fieldOrder {
		if i, ok := col[f]; ok {
			understood = append(understood, strings.TrimSpace(table[0][i]))
		}
	}
	me, _ := tenant.MemberFrom(c)
	acc, _ := json.Marshal(nonNil(accepted))
	rej, _ := json.Marshal(nonNil(rejected))
	sum, _ := json.Marshal(counts)
	opts, _ := json.Marshal(map[string]string{"sectionId": defaultSection})
	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO import_jobs (org_id, kind, file_name, total_rows, options, accepted, rejected, summary, created_by)
		VALUES ($1, 'students', $2, $3, $4, $5, $6, $7, $8) RETURNING id::text`,
		me.OrgID, fh.Filename, counts["rows"], opts, acc, rej, sum, me.UserID).Scan(&id)
	if err != nil {
		return err
	}
	shown := rejected
	if len(shown) > maxShownProblem {
		shown = shown[:maxShownProblem]
	}
	return c.Status(http.StatusCreated).JSON(api.ImportPreview{
		Id: id, FileName: fh.Filename, Rows: counts["rows"], Create: counts["create"], Update: counts["update"],
		Unchanged: counts["unchanged"], Rejected: len(rejected), Problems: nonNil(shown),
		Columns: nonNil(understood), UnknownColumns: nonNil(unknown),
	})
}

func nonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}

// allowedFor checks structure.write for every branch the rows place
// students in; rows without a placement need it for the whole organisation.
func allowedFor(c fiber.Ctx, tx pgx.Tx, rows []importRow) error {
	m, _ := tenant.MemberFrom(c)
	ids := map[string]bool{}
	unplaced := len(rows) == 0
	for _, r := range rows {
		if r.SectionID == "" {
			unplaced = true
		} else {
			ids[r.SectionID] = true
		}
	}
	if unplaced {
		if err := policy.Check(m.Actor(), policy.StructureWrite, policy.Target{}); err != nil {
			return err
		}
	}
	for id := range ids {
		var branch string
		if err := tx.QueryRow(c.Context(), `SELECT branch_id::text FROM sections WHERE id = $1::uuid`, id).Scan(&branch); err != nil {
			return err
		}
		if err := policy.Check(m.Actor(), policy.StructureWrite, policy.Target{BranchID: branch}); err != nil {
			return err
		}
	}
	return nil
}

// classify marks each accepted row create, update or unchanged against the
// students already here, and returns the counts.
func classify(ctx context.Context, tx pgx.Tx, rows []importRow) (map[string]int, error) {
	counts := map[string]int{"create": 0, "update": 0, "unchanged": 0}
	type current struct{ name, preferred, dob, section, contacts string }
	existing := map[string]current{}
	dbRows, err := tx.Query(ctx, `
		SELECT lower(s.admission_no), s.name, coalesce(s.preferred_name, ''), coalesce(s.dob::text, ''),
		       coalesce((SELECT string_agg(e.section_id::text || '|' || coalesce(e.roll_no, ''), ',') FROM enrolments e
		                  WHERE e.student_id = s.id AND e.deleted_at IS NULL), ''),
		       coalesce((SELECT string_agg(lower(g.name), '|') FROM guardians g
		                  WHERE g.student_id = s.id AND g.deleted_at IS NULL), '')
		  FROM students s WHERE s.deleted_at IS NULL`)
	if err != nil {
		return nil, err
	}
	for dbRows.Next() {
		var adm, placements string
		var cur current
		if err := dbRows.Scan(&adm, &cur.name, &cur.preferred, &cur.dob, &placements, &cur.contacts); err != nil {
			dbRows.Close()
			return nil, err
		}
		cur.section = placements
		existing[adm] = cur
	}
	dbRows.Close()
	if err := dbRows.Err(); err != nil {
		return nil, err
	}
	for i := range rows {
		r := &rows[i]
		cur, ok := existing[strings.ToLower(r.AdmissionNo)]
		switch {
		case !ok:
			r.Action = "create"
		case cur.name != r.Name || (r.PreferredName != "" && cur.preferred != r.PreferredName) || (r.Dob != "" && cur.dob != r.Dob) ||
			(r.SectionID != "" && !strings.Contains(cur.section, r.SectionID+"|"+r.RollNo) && !(r.RollNo == "" && strings.Contains(cur.section, r.SectionID+"|"))) ||
			(r.GuardianName != "" && !containsName(cur.contacts, r.GuardianName)):
			r.Action = "update"
		default:
			r.Action = "unchanged"
		}
		counts[r.Action]++
	}
	return counts, nil
}

func containsName(list, name string) bool {
	for _, n := range strings.Split(list, "|") {
		if n == strings.ToLower(name) {
			return true
		}
	}
	return false
}

// applyRow upserts one student by admission number, places them, and adds
// the contact if they do not have one by that name. It returns whether the
// student was created (true), changed (false) or neither (null), and how
// many placements or contacts it wrote.
const applyRow = `
WITH s AS (
  INSERT INTO students (org_id, admission_no, name, preferred_name, dob)
  VALUES ($1, $2, $3, $4, $5::date)
  ON CONFLICT (org_id, admission_no) WHERE deleted_at IS NULL
  DO UPDATE SET name = EXCLUDED.name,
                preferred_name = coalesce(EXCLUDED.preferred_name, students.preferred_name),
                dob = coalesce(EXCLUDED.dob, students.dob)
   WHERE (students.name, students.preferred_name, students.dob)
         IS DISTINCT FROM (EXCLUDED.name, coalesce(EXCLUDED.preferred_name, students.preferred_name), coalesce(EXCLUDED.dob, students.dob))
  RETURNING id, (xmax = 0) AS created
), ids AS (
  SELECT id FROM s
  UNION ALL
  SELECT id FROM students WHERE org_id = $1 AND admission_no = $2 AND deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM s)
), e AS (
  INSERT INTO enrolments (org_id, student_id, section_id, year_id, roll_no)
  SELECT $1, ids.id, sec.id, sec.year_id, $7 FROM ids, sections sec WHERE sec.id = $6::uuid AND sec.deleted_at IS NULL
  ON CONFLICT (student_id, year_id) WHERE deleted_at IS NULL
  DO UPDATE SET section_id = EXCLUDED.section_id, roll_no = coalesce(EXCLUDED.roll_no, enrolments.roll_no)
   WHERE (enrolments.section_id, enrolments.roll_no) IS DISTINCT FROM (EXCLUDED.section_id, coalesce(EXCLUDED.roll_no, enrolments.roll_no))
  RETURNING 1
), g AS (
  INSERT INTO guardians (org_id, student_id, name, relation, phone, email, is_primary)
  SELECT $1, ids.id, $8, $9, $10, $11,
         NOT EXISTS (SELECT 1 FROM guardians x WHERE x.student_id = ids.id AND x.is_primary AND x.deleted_at IS NULL)
    FROM ids
   WHERE $8::text IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM guardians x WHERE x.student_id = ids.id AND lower(x.name) = lower($8::text) AND x.deleted_at IS NULL)
  RETURNING 1
)
SELECT (SELECT created FROM s), (SELECT count(*) FROM e) + (SELECT count(*) FROM g)`

var errApplied = problem.New(http.StatusConflict, "import.applied", "This import was applied already. To import the file again, start a new import; students are matched by admission number, so nobody is added twice.")

func loadJob(ctx context.Context, tx pgx.Tx, id string) (api.ImportJob, []importRow, []api.ImportProblem, error) {
	var job api.ImportJob
	var acc, rej []byte
	if !records.UUIDShape.MatchString(id) {
		return job, nil, nil, problem.New(http.StatusNotFound, "import.not_found", "Nothing here has this id.")
	}
	err := tx.QueryRow(ctx, `
		SELECT id::text, file_name, status, total_rows,
		       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       coalesce(to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
		       summary, accepted, rejected
		  FROM import_jobs WHERE id = $1::uuid`, id).
		Scan(&job.Id, &job.FileName, &job.Status, &job.Rows, &job.CreatedAt, &job.AppliedAt, &job.Summary, &acc, &rej)
	if errors.Is(err, pgx.ErrNoRows) {
		return job, nil, nil, problem.New(http.StatusNotFound, "import.not_found", "Nothing here has this id.")
	}
	if err != nil {
		return job, nil, nil, err
	}
	var accepted []importRow
	var rejected []api.ImportProblem
	if err := json.Unmarshal(acc, &accepted); err != nil {
		return job, nil, nil, err
	}
	if err := json.Unmarshal(rej, &rejected); err != nil {
		return job, nil, nil, err
	}
	return job, accepted, rejected, nil
}

func applyImport(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	job, rows, _, err := loadJob(ctx, tx, c.Params("id"))
	if err != nil {
		return err
	}
	if job.Status == "applied" {
		return errApplied
	}
	if err := allowedFor(c, tx, rows); err != nil {
		return err
	}

	me, _ := tenant.MemberFrom(c)
	batch := &pgx.Batch{}
	for _, r := range rows {
		batch.Queue(applyRow, me.OrgID, r.AdmissionNo, r.Name, nullIfEmpty(r.PreferredName), nullIfEmpty(r.Dob),
			nullIfEmpty(r.SectionID), nullIfEmpty(r.RollNo), nullIfEmpty(r.GuardianName), nullIfEmpty(r.GuardianRelation),
			nullIfEmpty(r.GuardianPhone), nullIfEmpty(r.GuardianEmail))
	}
	created, updated, unchanged := 0, 0, 0
	results := tx.SendBatch(ctx, batch)
	for range rows {
		var isNew *bool
		var writes int
		if err := results.QueryRow().Scan(&isNew, &writes); err != nil {
			results.Close()
			return records.DBProblem(err)
		}
		switch {
		case isNew != nil && *isNew:
			created++
		case isNew != nil || writes > 0:
			updated++
		default:
			unchanged++
		}
	}
	if err := results.Close(); err != nil {
		return err
	}
	for k, v := range map[string]int{"created": created, "updated": updated, "unchanged": unchanged} {
		job.Summary[k] = v
	}
	sum, _ := json.Marshal(job.Summary)
	if _, err := tx.Exec(ctx, `UPDATE import_jobs SET status = 'applied', applied_at = now(), summary = $2 WHERE id = $1::uuid`, job.Id, sum); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "import", Entity: "students", EntityID: job.Id, After: job.Summary}); err != nil {
		return err
	}
	job, _, _, err = loadJob(ctx, tx, job.Id)
	if err != nil {
		return err
	}
	return c.JSON(job)
}

// csvSafe stops a cell from being read as a formula when the report is
// opened in a spreadsheet.
func csvSafe(s string) string {
	if s != "" && strings.ContainsRune("=+-@\t\r", rune(s[0])) {
		return "'" + s
	}
	return s
}

func importErrors(c fiber.Ctx) error {
	if err := manage(c, ""); err != nil {
		return err
	}
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	job, _, rejected, err := loadJob(c.Context(), tx, c.Params("id"))
	if err != nil {
		return err
	}
	words, err := terminology.Words(c.Context(), tx)
	if err != nil {
		return err
	}
	var buf bytes.Buffer
	buf.WriteString("\xef\xbb\xbf") // so spreadsheet programs read UTF-8
	w := csv.NewWriter(&buf)
	_ = w.Write([]string{"Row", words("person.admission_no", 1), "Name", "Problems"})
	for _, r := range rejected {
		_ = w.Write([]string{fmt.Sprint(r.Row), csvSafe(r.AdmissionNo), csvSafe(r.Name), strings.Join(r.Reasons, "; ")})
	}
	w.Flush()
	name := strings.TrimSuffix(strings.TrimSuffix(job.FileName, ".csv"), ".xlsx") + "-rejected.csv"
	c.Set(fiber.HeaderContentType, "text/csv; charset=utf-8")
	c.Set(fiber.HeaderContentDisposition, fmt.Sprintf(`attachment; filename="%s"`, strings.ReplaceAll(name, `"`, "")))
	return c.Send(buf.Bytes())
}

func listImportJobs(c fiber.Ctx) error {
	if err := manage(c, ""); err != nil {
		return err
	}
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	rows, err := tx.Query(c.Context(), `
		SELECT id::text, file_name, status, total_rows,
		       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       coalesce(to_char(applied_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''), summary
		  FROM import_jobs ORDER BY created_at DESC LIMIT 20`)
	if err != nil {
		return err
	}
	jobs, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (api.ImportJob, error) {
		var j api.ImportJob
		return j, r.Scan(&j.Id, &j.FileName, &j.Status, &j.Rows, &j.CreatedAt, &j.AppliedAt, &j.Summary)
	})
	if err != nil {
		return err
	}
	return c.JSON(nonNil(jobs))
}
