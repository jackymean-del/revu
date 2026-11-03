package assessment_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/server"
	"github.com/xuri/excelize/v2"
)

type headerAuth struct{}

func (headerAuth) UserID(c fiber.Ctx) (string, error) { return c.Get("X-Test-User"), nil }

type caller struct {
	t         *testing.T
	app       *fiber.App
	user, org string
}

type reply struct {
	code int
	body []byte
}

func (r reply) into(v any) { _ = json.Unmarshal(r.body, v) }

func (c caller) send(method, path, contentType string, body io.Reader) reply {
	c.t.Helper()
	req := httptest.NewRequest(method, path, body)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	req.Header.Set("X-Test-User", c.user)
	req.Header.Set("X-Org-Id", c.org)
	res, err := c.app.Test(req, fiber.TestConfig{Timeout: 0})
	if err != nil {
		c.t.Fatal(err)
	}
	b, _ := io.ReadAll(res.Body)
	return reply{res.StatusCode, b}
}

func (c caller) must(code int, method, path string, body any) reply {
	c.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	r := c.send(method, path, "application/json", &buf)
	if r.code != code {
		c.t.Fatalf("%s %s as %s: status %d, want %d: %s", method, path, c.user, r.code, code, r.body)
	}
	return r
}

func (c caller) problem(method, path string, body any) string {
	c.t.Helper()
	var buf bytes.Buffer
	_ = json.NewEncoder(&buf).Encode(body)
	var p api.Problem
	c.send(method, path, "application/json", &buf).into(&p)
	return p.Code
}

var ops int

// sync sends edits and returns their results in order.
func (c caller) sync(edits ...api.EvidenceOp) []api.OpResult {
	c.t.Helper()
	for i := range edits {
		if edits[i].OpId == "" {
			ops++
			edits[i].OpId = fmt.Sprintf("op-test-%06d", ops)
		}
	}
	var res api.SyncResult
	c.must(200, "POST", "/v1/sync/evidence", api.SyncInput{DeviceId: "test", Ops: edits}).into(&res)
	return res.Results
}

func (c caller) grid(assessment, section string) api.MarksGrid {
	c.t.Helper()
	var g api.MarksGrid
	c.must(200, "GET", "/v1/assessments/"+assessment+"/grid?sectionId="+section, nil).into(&g)
	return g
}

func cellOf(g api.MarksGrid, student string) api.GridCell {
	for _, c := range g.Cells {
		if c.StudentId == student {
			return c
		}
	}
	return api.GridCell{State: "pending"}
}

// Grade 6 A of the seeded organisation: Ravi (seeded, chose Hindi), Kiran
// and Leela. Tara teaches it Mathematics; Omar teaches Mathematics in 6 B.
func TestMarks(t *testing.T) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	b := dbtest.SeedOrg(t, owner, "Org B")
	app := server.New(config.Config{Version: "test"}, server.Deps{DB: appPool, Auth: headerAuth{}})
	ctx := context.Background()
	one := func(sql string, args ...any) string {
		t.Helper()
		var id string
		if err := owner.QueryRow(ctx, sql, args...).Scan(&id); err != nil {
			t.Fatalf("%v\n%s", err, sql)
		}
		return id
	}
	count := func(sql string, args ...any) int {
		t.Helper()
		var n int
		if err := owner.QueryRow(ctx, sql, args...).Scan(&n); err != nil {
			t.Fatalf("%v\n%s", err, sql)
		}
		return n
	}
	t.Cleanup(func() {
		for _, u := range []string{"tara", "omar"} {
			_, _ = owner.Exec(ctx, `DELETE FROM memberships WHERE clerk_user_id = $1`, u+"-"+a.UserID)
		}
	})
	student := func(no, name string) string {
		id := one(`INSERT INTO students (org_id, admission_no, name) VALUES ($1, $2, $3) RETURNING id`, a.ID, no, name)
		one(`INSERT INTO enrolments (org_id, student_id, section_id, year_id, roll_no) VALUES ($1, $2, $3, $4, $5) RETURNING id`, a.ID, id, a.SectionID, a.YearID, no[len(no)-1:])
		return id
	}
	kiran, leela, ravi := student("A-002", "Kiran"), student("A-003", "Leela"), a.StudentID
	sectionB := one(`INSERT INTO sections (org_id, branch_id, level_id, year_id, name) VALUES ($1, $2, $3, $4, 'B') RETURNING id`, a.ID, a.BranchID, a.LevelID, a.YearID)
	teacher := func(user, name, section string) caller {
		staff := one(`INSERT INTO staff (org_id, name) VALUES ($1, $2) RETURNING id`, a.ID, name)
		one(`INSERT INTO teaching_assignments (org_id, staff_id, section_id, subject_id) VALUES ($1, $2, $3, $4) RETURNING id`, a.ID, staff, section, a.SubjectID)
		one(`INSERT INTO memberships (org_id, clerk_user_id, role, staff_id) VALUES ($1, $2, 'teacher', $3) RETURNING id`, a.ID, user+"-"+a.UserID, staff)
		return caller{t, app, user + "-" + a.UserID, a.ID}
	}
	tara, omar := teacher("tara", "Tara", a.SectionID), teacher("omar", "Omar", sectionB)
	admin := caller{t, app, a.UserID, a.ID}

	total := func(title, subject string) api.AssessmentInput {
		return api.AssessmentInput{PeriodId: a.PeriodID, LevelId: a.LevelID, SubjectId: subject, Title: title, EntryMode: "total",
			SectionIds: []string{a.SectionID}, Parts: []api.AssessmentPartInput{{Name: "Total", MaxMarks: "40", CountsInTotal: true}}}
	}

	var test api.Assessment
	t.Run("assessments state their columns, and a teacher sets them for their own section", func(t *testing.T) {
		in := total("Two totals", a.SubjectID)
		in.Parts = append(in.Parts, api.AssessmentPartInput{Name: "Other", MaxMarks: "10", CountsInTotal: true})
		if code := admin.problem("POST", "/v1/assessments", in); code != "validation.failed" {
			t.Fatalf("total marks with two columns: %q", code)
		}
		// AT-v2-02: an additional part needs a component code.
		sections := api.AssessmentInput{PeriodId: a.PeriodID, LevelId: a.LevelID, SubjectId: a.SubjectID, Title: "Term practical", EntryMode: "sections",
			SectionIds: []string{a.SectionID}, Parts: []api.AssessmentPartInput{
				{Name: "Theory", MaxMarks: "40", CountsInTotal: true}, {Name: "Practical", Kind: "additional", MaxMarks: "10"}}}
		if code := admin.problem("POST", "/v1/assessments", sections); code != "validation.failed" {
			t.Fatalf("an additional part without a code: %q", code)
		}
		sections.Parts[1].ComponentCode = "prac"
		var made api.Assessment
		admin.must(201, "POST", "/v1/assessments", sections).into(&made)
		if len(made.Parts) != 2 || made.Parts[1].ComponentCode != "PRAC" || made.Parts[1].CountsInTotal || made.Parts[0].MaxMarks != "40.00" {
			t.Fatalf("parts %+v", made.Parts)
		}
		if code := omar.problem("POST", "/v1/assessments", total("Not my section", a.SubjectID)); code != "auth.forbidden" {
			t.Fatalf("a teacher of another section set a test: %q", code)
		}
		tara.must(201, "POST", "/v1/assessments", total("Unit test 2", a.SubjectID)).into(&test)
		var list []api.Assessment
		omar.must(200, "GET", "/v1/assessments", nil).into(&list)
		if len(list) != 0 {
			t.Fatalf("Omar sees %d assessments of another section", len(list))
		}
	})
	part := func(as api.Assessment) string { return as.Parts[0].Id }

	t.Run("the grid lists the section with every cell pending", func(t *testing.T) {
		g := tara.grid(test.Id, a.SectionID)
		var names []string
		for _, s := range g.Students {
			names = append(names, s.Name)
		}
		if !slices.Equal(names, []string{"Ravi Kumar", "Kiran", "Leela"}) || len(g.Cells) != 0 || !g.CanEdit || g.CanLock {
			t.Fatalf("grid %v, %d cells, edit %v lock %v", names, len(g.Cells), g.CanEdit, g.CanLock)
		}
		omar.must(403, "GET", "/v1/assessments/"+test.Id+"/grid?sectionId="+a.SectionID, nil)
	})

	// AT-v2-03 and AT-v2-04: values within the maximum, states without values.
	t.Run("a mark is exact, within its maximum, and absent is never zero", func(t *testing.T) {
		res := tara.sync(
			api.EvidenceOp{StudentId: kiran, PartId: part(test), State: "scored", Value: "35.5"},
			api.EvidenceOp{StudentId: leela, PartId: part(test), State: "absent"},
			api.EvidenceOp{StudentId: ravi, PartId: part(test), State: "scored", Value: "40.01"},
			api.EvidenceOp{StudentId: ravi, PartId: part(test), State: "scored"},
			api.EvidenceOp{StudentId: ravi, PartId: part(test), State: "absent", Value: "0"},
		)
		want := []string{"applied", "applied", "refused", "refused", "refused"}
		for i, r := range res {
			if string(r.Outcome) != want[i] {
				t.Errorf("edit %d: %s %s, want %s", i, r.Outcome, r.Message, want[i])
			}
		}
		if res[0].Cell.Value != "35.50" || res[0].Cell.Version != 1 || res[2].Code != "evidence.above_max" {
			t.Fatalf("%+v %+v", res[0], res[2])
		}
		if n := count(`SELECT count(*) FROM evidence WHERE student_id = $1 AND state = 'absent' AND value IS NULL`, leela); n != 1 {
			t.Fatal("absent carries a value")
		}
	})

	// AT-v2-05, AT-v2-07 and AT-v2-08.
	t.Run("every change is versioned, a moved cell is a conflict, a replay applies once", func(t *testing.T) {
		if r := tara.sync(api.EvidenceOp{StudentId: kiran, PartId: part(test), State: "scored", Value: "36", BaseVersion: 1})[0]; r.Cell.Version != 2 {
			t.Fatalf("%+v", r)
		}
		id := one(`SELECT id FROM evidence WHERE student_id = $1 AND part_id = $2`, kiran, part(test))
		if h, au := count(`SELECT count(*) FROM evidence_history WHERE evidence_id = $1`, id), count(`SELECT count(*) FROM audit_log WHERE entity = 'evidence' AND entity_id = $1`, id); h != 2 || au != 2 {
			t.Fatalf("%d history rows and %d audit entries, want 2 each", h, au)
		}
		first := api.EvidenceOp{OpId: "device-one-1", StudentId: kiran, PartId: part(test), State: "scored", Value: "30", BaseVersion: 2}
		second := api.EvidenceOp{OpId: "device-two-1", StudentId: kiran, PartId: part(test), State: "scored", Value: "31", BaseVersion: 2}
		if r := tara.sync(first)[0]; r.Outcome != "applied" {
			t.Fatalf("first device %+v", r)
		}
		r := tara.sync(second)[0]
		if r.Outcome != "conflict" || r.Cell.Value != "30.00" || r.Cell.Version != 3 {
			t.Fatalf("second device %+v", r)
		}
		again := tara.sync(first, second)
		if again[0].Outcome != "applied" || again[1].Outcome != "conflict" || count(`SELECT version FROM evidence WHERE id = $1`, id) != 3 {
			t.Fatalf("replay %+v", again)
		}
	})

	// AT-v2-06: only the section's teacher; a locked assessment needs a reason.
	t.Run("who may enter, and a lock", func(t *testing.T) {
		if r := omar.sync(api.EvidenceOp{StudentId: ravi, PartId: part(test), State: "scored", Value: "20"})[0]; r.Code != "auth.forbidden" {
			t.Fatalf("Omar %+v", r)
		}
		tara.must(403, "POST", "/v1/assessments/"+test.Id+"/lock", nil)
		admin.must(200, "POST", "/v1/assessments/"+test.Id+"/lock", nil)
		if r := tara.sync(api.EvidenceOp{StudentId: ravi, PartId: part(test), State: "scored", Value: "20"})[0]; r.Code != "evidence.locked" {
			t.Fatalf("Tara on a locked test %+v", r)
		}
		if r := admin.sync(api.EvidenceOp{StudentId: ravi, PartId: part(test), State: "scored", Value: "20", Reason: "Recounted the script"})[0]; r.Outcome != "applied" {
			t.Fatalf("admin with a reason %+v", r)
		}
		if n := count(`SELECT count(*) FROM evidence_history h JOIN evidence e ON e.id = h.evidence_id WHERE e.student_id = $1 AND e.part_id = $2 AND h.reason = 'Recounted the script'`, ravi, part(test)); n != 1 {
			t.Fatal("the reason is not stored")
		}
		if code := admin.problem("POST", "/v1/assessments/"+test.Id+"/unlock", api.ReasonInput{Reason: " "}); code != "validation.failed" {
			t.Fatalf("unlock without a reason: %q", code)
		}
		admin.must(200, "POST", "/v1/assessments/"+test.Id+"/unlock", api.ReasonInput{Reason: "Late script found"})
	})

	t.Run("a row status locks the row and hides its marks without deleting them", func(t *testing.T) {
		tara.must(200, "PUT", "/v1/assessments/"+test.Id+"/participation/"+ravi, api.ParticipationInput{Status: "exempt", ReasonCode: "medical"})
		if r := tara.sync(api.EvidenceOp{StudentId: ravi, PartId: part(test), State: "scored", Value: "25", BaseVersion: 1})[0]; r.Code != "evidence.row_status" {
			t.Fatalf("a mark on an exempt row %+v", r)
		}
		if code := tara.problem("PUT", "/v1/assessments/"+test.Id+"/participation/"+ravi, api.ParticipationInput{Status: "left"}); code != "auth.forbidden" {
			t.Fatalf("a teacher marked a student as left: %q", code)
		}
		g := tara.grid(test.Id, a.SectionID)
		if s := g.Students[slices.IndexFunc(g.Students, func(s api.GridStudent) bool { return s.Id == ravi })]; s.Status != "exempt" || cellOf(g, ravi).Value != "20.00" {
			t.Fatalf("Ravi's row %+v, cell %+v", s, cellOf(g, ravi))
		}
		tara.must(200, "PUT", "/v1/assessments/"+test.Id+"/participation/"+ravi, api.ParticipationInput{Status: ""})
		if r := tara.sync(api.EvidenceOp{StudentId: ravi, PartId: part(test), State: "scored", Value: "25", BaseVersion: 1})[0]; r.Outcome != "applied" {
			t.Fatalf("after clearing %+v", r)
		}
	})

	// AT-GR-04 and AT-v2-09: a bulk write is one step, and undo is one step.
	t.Run("a bulk write applies as one step and undoes as one", func(t *testing.T) {
		before := cellOf(tara.grid(test.Id, a.SectionID), kiran)
		var res api.BulkResult
		tara.must(200, "POST", "/v1/assessments/"+test.Id+"/bulk", api.BulkInput{SectionId: a.SectionID, Kind: "upload", Cells: []api.BulkCell{
			{StudentId: kiran, PartId: part(test), State: "scored", Value: "12"},
			{StudentId: leela, PartId: part(test), State: "scored", Value: "13"},
			{StudentId: ravi, PartId: part(test), State: "scored", Value: "99"},
		}}).into(&res)
		if res.Applied != 2 || len(res.Refused) != 1 {
			t.Fatalf("bulk %+v", res)
		}
		tara.sync(api.EvidenceOp{StudentId: leela, PartId: part(test), State: "scored", Value: "14", BaseVersion: cellOf(tara.grid(test.Id, a.SectionID), leela).Version})
		var undo api.UndoResult
		tara.must(200, "POST", "/v1/bulk-writes/"+res.Id+"/undo", nil).into(&undo)
		if undo.Restored != 1 || undo.Kept != 1 {
			t.Fatalf("undo %+v", undo)
		}
		g := tara.grid(test.Id, a.SectionID)
		if k, l := cellOf(g, kiran), cellOf(g, leela); k.Value != before.Value || l.Value != "14.00" {
			t.Fatalf("after undo Kiran %+v Leela %+v", k, l)
		}
		if code := tara.problem("POST", "/v1/bulk-writes/"+res.Id+"/undo", nil); code != "bulk.undone" {
			t.Fatalf("undo twice: %q", code)
		}
		if n := count(`SELECT count(*) FROM evidence_history WHERE undo_of = $1`, res.Id); n != 1 {
			t.Fatalf("%d undo rows in history", n)
		}
	})

	// AT-AP-01 at the source: a non-taker's cell cannot be written.
	t.Run("a subject chosen by some takes marks from those who chose it only", func(t *testing.T) {
		hindi := one(`SELECT id FROM subjects WHERE org_id = $1 AND name = 'Hindi'`, a.ID)
		var lang api.Assessment
		admin.must(201, "POST", "/v1/assessments", total("Hindi test", hindi)).into(&lang)
		g := admin.grid(lang.Id, a.SectionID)
		applicable := map[string]bool{}
		for _, s := range g.Students {
			applicable[s.Name] = s.Applicable
		}
		if g.Applicability != "selected" || !applicable["Ravi Kumar"] || applicable["Kiran"] {
			t.Fatalf("%s %v", g.Applicability, applicable)
		}
		if r := admin.sync(api.EvidenceOp{StudentId: kiran, PartId: part(lang), State: "scored", Value: "10"})[0]; r.Code != "evidence.not_applicable" {
			t.Fatalf("a mark for a non-taker %+v", r)
		}
	})

	// AT-GR-01: the template carries the active column order and the marks so far.
	t.Run("the template is pre-filled", func(t *testing.T) {
		r := tara.send("GET", "/v1/assessments/"+test.Id+"/template.xlsx?sectionId="+a.SectionID, "", nil)
		if r.code != 200 {
			t.Fatalf("template %d %s", r.code, r.body)
		}
		f, err := excelize.OpenReader(bytes.NewReader(r.body))
		if err != nil {
			t.Fatal(err)
		}
		rows, _ := f.GetRows("Marks")
		if len(rows) != 4 || !slices.Equal(rows[0], []string{"Admission number", "Name", "Roll", "Total"}) {
			t.Fatalf("rows %v", rows)
		}
		got := map[string]string{}
		for _, row := range rows[1:] {
			got[row[1]] = row[3]
		}
		if got["Leela"] != "14" || got["Ravi Kumar"] != "25" {
			t.Fatalf("pre-filled %v", got)
		}
	})

	t.Run("a column with marks stays, and its maximum cannot fall below a mark", func(t *testing.T) {
		in := total("Unit test 2", a.SubjectID)
		in.Parts[0].Id, in.Parts[0].MaxMarks = part(test), "20"
		if code := tara.problem("PUT", "/v1/assessments/"+test.Id, in); code != "validation.failed" {
			t.Fatalf("a maximum below Ravi's 25: %q", code)
		}
		in.Parts[0] = api.AssessmentPartInput{Name: "New total", MaxMarks: "50", CountsInTotal: true}
		if code := tara.problem("PUT", "/v1/assessments/"+test.Id, in); code != "assessment.part_in_use" {
			t.Fatalf("dropping a column with marks: %q", code)
		}
		if code := tara.problem("DELETE", "/v1/assessments/"+test.Id, nil); code != "assessment.in_use" {
			t.Fatalf("removing an assessment with marks: %q", code)
		}
	})

	t.Run("a person's grid layout is their own", func(t *testing.T) {
		path := "/v1/layouts/resolve?surface=entry_grid&scopeId=" + test.Id
		var l api.Layout
		tara.must(200, "GET", path, nil).into(&l)
		if l.Personal || l.Sort[0].Field != "roll_no" {
			t.Fatalf("default %+v", l)
		}
		tara.must(200, "PUT", "/v1/layouts/mine", api.LayoutInput{Surface: "entry_grid", ScopeId: test.Id,
			Items: []api.LayoutItem{{ItemId: part(test), Position: 7, Visible: true, Pinned: true}}, Sort: []api.SortRule{{Field: "name", Direction: "desc"}}})
		tara.must(200, "GET", path, nil).into(&l)
		if !l.Personal || l.Sort[0].Field != "name" || l.Items[0].Position != 1 || !l.Items[0].Pinned {
			t.Fatalf("saved %+v", l)
		}
		admin.must(200, "GET", path, nil).into(&l)
		if l.Personal {
			t.Fatal("Tara's view reached the administrator")
		}
	})

	t.Run("an uploaded file reads back as text", func(t *testing.T) {
		var buf bytes.Buffer
		w := multipart.NewWriter(&buf)
		part, _ := w.CreateFormFile("file", "marks.csv")
		_, _ = part.Write([]byte("Admission number,Total\nA-002,AB\n"))
		_ = w.Close()
		r := tara.send("POST", "/v1/tables/read", w.FormDataContentType(), &buf)
		var tt api.TableText
		r.into(&tt)
		if r.code != 200 || !slices.Equal(tt.Header, []string{"Admission number", "Total"}) || tt.Rows[0][1] != "AB" {
			t.Fatalf("%d %+v", r.code, tt)
		}
	})

	t.Run("another organisation reaches none of it", func(t *testing.T) {
		other := caller{t, app, b.UserID, b.ID}
		other.must(404, "GET", "/v1/assessments/"+test.Id+"/grid?sectionId="+a.SectionID, nil)
		if r := other.sync(api.EvidenceOp{StudentId: kiran, PartId: part(test), State: "scored", Value: "1"})[0]; r.Code != "evidence.unknown_column" {
			t.Fatalf("B writing A's cell %+v", r)
		}
		var list []api.Assessment
		other.must(200, "GET", "/v1/assessments", nil).into(&list)
		if len(list) != 1 || list[0].Id != b.AssessmentID {
			t.Fatalf("B sees %d assessments", len(list))
		}
	})
}
