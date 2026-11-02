package structure_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/server"
)

type headerAuth struct{}

func (headerAuth) UserID(c fiber.Ctx) (string, error) { return c.Get("X-Test-User"), nil }

type caller struct {
	t    *testing.T
	app  *fiber.App
	user string
	org  string
}

type reply struct {
	code int
	body []byte
}

func (r reply) problem() api.Problem {
	var p api.Problem
	_ = json.Unmarshal(r.body, &p)
	return p
}

func (r reply) id() string {
	var v struct{ Id string }
	_ = json.Unmarshal(r.body, &v)
	return v.Id
}

func (c caller) do(method, path string, body any) reply {
	c.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
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
	r := c.do(method, path, body)
	if r.code != code {
		c.t.Fatalf("%s %s: status %d, want %d: %s", method, path, r.code, code, r.body)
	}
	return r
}

func TestStructure(t *testing.T) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	b := dbtest.SeedOrg(t, owner, "Org B")
	ctx := context.Background()
	app := server.New(config.Config{Version: "test"}, server.Deps{DB: appPool, Auth: headerAuth{}})
	admin := caller{t, app, a.UserID, a.ID}

	member := func(user, role, branch string) caller {
		t.Helper()
		if _, err := owner.Exec(ctx, `INSERT INTO memberships (org_id, clerk_user_id, role, branch_id) VALUES ($1, $2, $3, nullif($4, '')::uuid)`, a.ID, user, role, branch); err != nil {
			t.Fatal(err)
		}
		return caller{t, app, user, a.ID}
	}
	viewer := member(a.UserID+"_v", "viewer", "")
	branchAdmin := member(a.UserID+"_b", "admin", a.BranchID)

	// The seed holds the words of the school preset: Term, Section, Student.
	year := admin.must(201, "POST", "/v1/years", api.YearInput{Label: "2027-28", StartsOn: "2027-04-01", EndsOn: "2028-03-31"}).id()

	t.Run("checks dates and keeps periods inside their year", func(t *testing.T) {
		p := admin.must(422, "POST", "/v1/years", api.YearInput{Label: "Bad", StartsOn: "2027-04-01", EndsOn: "2027-03-01"}).problem()
		if p.Errors[0].Field != "endsOn" {
			t.Fatalf("%+v", p.Errors)
		}
		p = admin.must(422, "POST", "/v1/periods", api.PeriodInput{YearId: year, Name: "Term 1", Seq: 1, StartsOn: "2027-03-01", EndsOn: "2027-09-30"}).problem()
		if p.Errors[0].Code != "outside" {
			t.Fatalf("%+v", p.Errors)
		}
		admin.must(201, "POST", "/v1/periods", api.PeriodInput{YearId: year, Name: "Term 1", Seq: 1, StartsOn: "2027-04-01", EndsOn: "2027-09-30"})
	})

	level := admin.must(201, "POST", "/v1/levels", api.LevelInput{Name: "Grade 7", Seq: 7}).id()
	sectionIn := api.SectionInput{BranchId: a.BranchID, LevelId: level, YearId: year, Name: "B"}
	section := admin.must(201, "POST", "/v1/sections", sectionIn).id()
	subject := admin.must(201, "POST", "/v1/subjects", api.SubjectInput{Name: "Science", Kind: "academic"}).id()
	admin.must(201, "POST", "/v1/level-subjects", api.LevelSubjectInput{LevelId: level, SubjectId: subject})
	assignment := admin.must(201, "POST", "/v1/teaching-assignments", api.TeachingAssignmentInput{StaffId: a.StaffID, SectionId: section, SubjectId: subject}).id()

	t.Run("a duplicate name is a clear conflict", func(t *testing.T) {
		if p := admin.must(409, "POST", "/v1/sections", sectionIn).problem(); p.Code != "structure.name_taken" {
			t.Fatalf("%+v", p)
		}
		if p := admin.must(409, "POST", "/v1/level-subjects", api.LevelSubjectInput{LevelId: level, SubjectId: subject}).problem(); p.Code != "structure.name_taken" {
			t.Fatalf("%+v", p)
		}
	})

	t.Run("removal is refused while anything uses it, in the organisation's words", func(t *testing.T) {
		p := admin.must(409, "DELETE", "/v1/years/"+year, nil).problem()
		if p.Code != "structure.in_use" || !strings.Contains(p.Detail, "1 term") || !strings.Contains(p.Detail, "1 section") {
			t.Fatalf("detail %q", p.Detail)
		}
		if _, err := owner.Exec(ctx, `UPDATE orgs SET preset = 'university' WHERE id = $1`, a.ID); err != nil {
			t.Fatal(err)
		}
		if _, err := owner.Exec(ctx, `DELETE FROM terminology WHERE org_id = $1`, a.ID); err != nil {
			t.Fatal(err)
		}
		p = admin.must(409, "DELETE", "/v1/years/"+year, nil).problem()
		if !strings.Contains(p.Detail, "1 semester") || !strings.Contains(p.Detail, "1 batch") {
			t.Fatalf("detail %q after switching to university words", p.Detail)
		}
		p = admin.must(409, "DELETE", "/v1/sections/"+section, nil).problem()
		if !strings.Contains(p.Detail, "1 teaching assignment") {
			t.Fatalf("detail %q", p.Detail)
		}
	})

	t.Run("removed items leave the list and come back with a restore", func(t *testing.T) {
		admin.must(204, "DELETE", "/v1/teaching-assignments/"+assignment, nil)
		admin.must(204, "DELETE", "/v1/sections/"+section, nil)
		var live, all []api.Section
		_ = json.Unmarshal(admin.must(200, "GET", "/v1/sections?yearId="+year, nil).body, &live)
		_ = json.Unmarshal(admin.must(200, "GET", "/v1/sections?yearId="+year+"&includeRemoved=true", nil).body, &all)
		if len(live) != 0 || len(all) != 1 || all[0].RemovedAt == "" {
			t.Fatalf("live %+v all %+v", live, all)
		}
		admin.must(404, "PUT", "/v1/sections/"+section, sectionIn) // removed items cannot be changed
	})

	t.Run("a restore waits for its parent", func(t *testing.T) {
		var ps []api.Period
		_ = json.Unmarshal(admin.must(200, "GET", "/v1/periods?yearId="+year, nil).body, &ps)
		admin.must(204, "DELETE", "/v1/periods/"+ps[0].Id, nil)
		admin.must(204, "DELETE", "/v1/years/"+year, nil)
		p := admin.must(409, "POST", "/v1/sections/"+section+"/restore", nil).problem()
		if p.Code != "structure.parent_removed" || !strings.Contains(p.Detail, "academic year") {
			t.Fatalf("%+v", p)
		}
		admin.must(200, "POST", "/v1/years/"+year+"/restore", nil)
		admin.must(200, "POST", "/v1/sections/"+section+"/restore", nil)
	})

	t.Run("a restore cannot take a name that is in use again", func(t *testing.T) {
		admin.must(204, "DELETE", "/v1/sections/"+section, nil)
		admin.must(201, "POST", "/v1/sections", sectionIn)
		if p := admin.must(409, "POST", "/v1/sections/"+section+"/restore", nil).problem(); p.Code != "structure.name_taken" {
			t.Fatalf("%+v", p)
		}
	})

	t.Run("anyone in the organisation reads; only administrators change", func(t *testing.T) {
		viewer.must(200, "GET", "/v1/levels", nil)
		viewer.must(200, "GET", "/v1/staff", nil)
		if p := viewer.must(403, "POST", "/v1/levels", api.LevelInput{Name: "Grade 9", Seq: 9}).problem(); p.Code != "auth.forbidden" {
			t.Fatalf("%+v", p)
		}
	})

	t.Run("a branch administrator works only inside their branch", func(t *testing.T) {
		other := admin.must(201, "POST", "/v1/branches", api.BranchInput{Name: "North campus"}).id()
		branchAdmin.must(201, "POST", "/v1/sections", api.SectionInput{BranchId: a.BranchID, LevelId: level, YearId: year, Name: "C"})
		branchAdmin.must(403, "POST", "/v1/sections", api.SectionInput{BranchId: other, LevelId: level, YearId: year, Name: "C"})
		branchAdmin.must(403, "POST", "/v1/years", api.YearInput{Label: "2030-31", StartsOn: "2030-04-01", EndsOn: "2031-03-31"})
		branchAdmin.must(200, "PUT", "/v1/branches/"+a.BranchID, api.BranchInput{Name: "Org A main", Address: "1 School Road"})
		branchAdmin.must(403, "PUT", "/v1/branches/"+other, api.BranchInput{Name: "Mine now"})
	})

	t.Run("another organisation's ids are unknown here", func(t *testing.T) {
		p := admin.must(422, "POST", "/v1/sections", api.SectionInput{BranchId: a.BranchID, LevelId: b.LevelID, YearId: year, Name: "X"}).problem()
		if p.Errors[0].Field != "levelId" || p.Errors[0].Code != "unknown" {
			t.Fatalf("%+v", p.Errors)
		}
		admin.must(404, "DELETE", "/v1/levels/"+b.LevelID, nil)
		admin.must(404, "POST", "/v1/levels/not-an-id/restore", nil)
		admin.must(422, "GET", "/v1/sections?yearId=nope", nil)
	})

	t.Run("every change is audited", func(t *testing.T) {
		var n int
		err := owner.QueryRow(ctx, `SELECT count(*) FROM audit_log WHERE org_id = $1 AND entity = 'sections' AND entity_id = $2::uuid AND actor_id = $3`, a.ID, section, a.UserID).Scan(&n)
		if err != nil || n != 4 { // create, delete, restore, delete
			t.Fatalf("%d audit entries, %v", n, err)
		}
	})
}
