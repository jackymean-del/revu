package terminology_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/server"
)

// headerAuth signs a request in as the user named in X-Test-User.
type headerAuth struct{}

func (headerAuth) UserID(c fiber.Ctx) (string, error) {
	return c.Get("X-Test-User"), nil
}

type response struct {
	Code int
	Body *bytes.Buffer
}

func do(t *testing.T, app *fiber.App, req *http.Request) *response {
	t.Helper()
	res, err := app.Test(req, fiber.TestConfig{Timeout: 0}) // database work can exceed the 1s default under load
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(res.Body)
	return &response{Code: res.StatusCode, Body: bytes.NewBuffer(body)}
}

func TestTerminologyAPI(t *testing.T) {
	owner, app := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	b := dbtest.SeedOrg(t, owner, "Org B")
	ctx := context.Background()
	h := server.New(config.Config{Version: "test"}, server.Deps{DB: app, Auth: headerAuth{}})

	member := func(org, user, role, branch string) {
		t.Helper()
		if _, err := owner.Exec(ctx, `INSERT INTO memberships (org_id, clerk_user_id, role, branch_id) VALUES ($1, $2, $3, nullif($4, '')::uuid)`, org, user, role, branch); err != nil {
			t.Fatal(err)
		}
	}
	viewer, branchAdmin := a.UserID+"_viewer", a.UserID+"_branch"
	member(a.ID, viewer, "viewer", "")
	member(a.ID, branchAdmin, "admin", a.BranchID)
	member(b.ID, a.UserID, "teacher", "")

	call := func(method, path, user, org string, body any) (*response, api.Problem) {
		t.Helper()
		var buf bytes.Buffer
		if body != nil {
			_ = json.NewEncoder(&buf).Encode(body)
		}
		req := httptest.NewRequest(method, path, &buf)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User", user)
		req.Header.Set("X-Org-Id", org)
		rec := do(t, h, req)
		var p api.Problem
		if rec.Code >= 400 {
			_ = json.Unmarshal(rec.Body.Bytes(), &p)
		}
		return rec, p
	}

	t.Run("my organisations lists each with my roles there", func(t *testing.T) {
		rec, _ := call("GET", "/v1/me", a.UserID, "", nil)
		var me api.Me
		_ = json.Unmarshal(rec.Body.Bytes(), &me)
		orgs := me.Orgs
		if rec.Code != 200 || len(orgs) != 2 || me.UserId != a.UserID {
			t.Fatalf("status %d: %s", rec.Code, rec.Body)
		}
		roles := map[string][]api.MyOrgRoles{}
		for _, o := range orgs {
			roles[o.Id] = o.Roles
		}
		if !slices.Equal(roles[a.ID], []api.MyOrgRoles{"admin"}) || !slices.Equal(roles[b.ID], []api.MyOrgRoles{"teacher"}) {
			t.Fatalf("roles %v", roles)
		}
	})

	t.Run("signed out is 401", func(t *testing.T) {
		h := server.New(config.Config{Version: "test"}, server.Deps{DB: app})
		req := httptest.NewRequest("GET", "/v1/terminology", nil)
		req.Header.Set("X-Org-Id", a.ID)
		rec := do(t, h, req)
		if rec.Code != 401 {
			t.Fatalf("status %d", rec.Code)
		}
	})

	t.Run("any member reads the words", func(t *testing.T) {
		rec, _ := call("GET", "/v1/terminology", viewer, a.ID, nil)
		var got api.Terminology
		_ = json.Unmarshal(rec.Body.Bytes(), &got)
		if rec.Code != 200 || got.Preset != api.PresetSchool || len(got.Overrides) != 1 || got.Overrides[0].Key != "group.section" {
			t.Fatalf("status %d: %s", rec.Code, rec.Body)
		}
	})

	t.Run("an administrator switches preset and sets words, and it is audited", func(t *testing.T) {
		in := api.Terminology{Preset: api.PresetUniversity, Overrides: []api.TermOverride{
			{Key: "group.section", One: " House ", Other: "Houses"},
			{Key: "group.section", BranchId: a.BranchID, One: "Stream", Other: "Streams"},
		}}
		rec, p := call("PUT", "/v1/terminology", a.UserID, a.ID, in)
		if rec.Code != 200 {
			t.Fatalf("status %d: %+v", rec.Code, p)
		}
		var got api.Terminology
		_ = json.Unmarshal(rec.Body.Bytes(), &got)
		if got.Preset != api.PresetUniversity || len(got.Overrides) != 2 || got.Overrides[0].One != "House" {
			t.Fatalf("saved %+v", got)
		}
		var n int
		if err := owner.QueryRow(ctx, `SELECT count(*) FROM audit_log WHERE org_id = $1 AND entity = 'terminology' AND before->>'preset' = 'school' AND after->>'preset' = 'university' AND actor_id = $2`, a.ID, a.UserID).Scan(&n); err != nil || n != 1 {
			t.Fatalf("audit entries %d, %v", n, err)
		}
	})

	t.Run("every bad field is reported at once", func(t *testing.T) {
		in := api.Terminology{Preset: "kindergarten", Overrides: []api.TermOverride{
			{Key: "group.sektion", One: "A", Other: "B"},
			{Key: "person.student", One: "", Other: "Pupils"},
			{Key: "period.term", One: "Session", Other: "Sessions"},
			{Key: "period.term", One: "Session", Other: "Sessions"},
			{Key: "group.level", BranchId: b.BranchID, One: "Form", Other: "Forms"},
		}}
		rec, p := call("PUT", "/v1/terminology", a.UserID, a.ID, in)
		var fields []string
		for _, f := range p.Errors {
			fields = append(fields, f.Field+":"+f.Code)
		}
		want := []string{"preset:unknown", "overrides[0].key:unknown", "overrides[1].one:length", "overrides[3].key:duplicate", "overrides[4].branchId:unknown"}
		if rec.Code != 422 || !slices.Equal(fields, want) {
			t.Fatalf("status %d fields %v, want %v", rec.Code, fields, want)
		}
	})

	refusals := []struct{ name, user string }{
		{"view-only", viewer},
		{"an administrator of one branch", branchAdmin},
	}
	for _, tc := range refusals {
		t.Run(tc.name+" cannot change the words", func(t *testing.T) {
			rec, p := call("PUT", "/v1/terminology", tc.user, a.ID, api.Terminology{Preset: api.PresetSchool, Overrides: []api.TermOverride{}})
			if rec.Code != 403 || p.Code != "auth.forbidden" {
				t.Fatalf("status %d code %s", rec.Code, p.Code)
			}
		})
	}

	t.Run("another organisation's words are not found", func(t *testing.T) {
		rec, p := call("GET", "/v1/terminology", viewer, b.ID, nil)
		if rec.Code != 404 || p.Code != "org.not_found" {
			t.Fatalf("status %d code %s", rec.Code, p.Code)
		}
	})
}
