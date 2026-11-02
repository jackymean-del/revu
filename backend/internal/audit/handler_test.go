package audit_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/server"
)

type headerAuth struct{}

func (headerAuth) UserID(c fiber.Ctx) (string, error) { return c.Get("X-Test-User"), nil }

func TestAuditLog(t *testing.T) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	b := dbtest.SeedOrg(t, owner, "Org B")
	app := server.New(config.Config{Version: "test"}, server.Deps{DB: appPool, Auth: headerAuth{}})
	ctx := context.Background()

	call := func(user, org string, code int, method, path string, body any) []byte {
		t.Helper()
		var buf bytes.Buffer
		if body != nil {
			_ = json.NewEncoder(&buf).Encode(body)
		}
		req := httptest.NewRequest(method, path, &buf)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Test-User", user)
		req.Header.Set("X-Org-Id", org)
		res, err := app.Test(req, fiber.TestConfig{Timeout: 0})
		if err != nil {
			t.Fatal(err)
		}
		out, _ := io.ReadAll(res.Body)
		if res.StatusCode != code {
			t.Fatalf("%s %s: status %d, want %d: %s", method, path, res.StatusCode, code, out)
		}
		return out
	}
	page := func(user, path string) api.AuditPage {
		t.Helper()
		var p api.AuditPage
		_ = json.Unmarshal(call(user, a.ID, 200, "GET", path, nil), &p)
		return p
	}

	// Four changes to one level, and one in another organisation.
	var lvl api.Level
	_ = json.Unmarshal(call(a.UserID, a.ID, 201, "POST", "/v1/levels", api.LevelInput{Name: "Grade 8", Seq: 8}), &lvl)
	call(a.UserID, a.ID, 200, "PUT", "/v1/levels/"+lvl.Id, api.LevelInput{Name: "Grade VIII", Seq: 8})
	call(a.UserID, a.ID, 204, "DELETE", "/v1/levels/"+lvl.Id, nil)
	call(a.UserID, a.ID, 200, "POST", "/v1/levels/"+lvl.Id+"/restore", nil)
	call(b.UserID, b.ID, 201, "POST", "/v1/levels", api.LevelInput{Name: "Elsewhere", Seq: 1})

	t.Run("newest first, with before and after, and who did it", func(t *testing.T) {
		p := page(a.UserID, "/v1/audit?entity=levels")
		if len(p.Items) != 4 || p.Items[0].Action != "restore" || p.Items[3].Action != "create" {
			t.Fatalf("%+v", p.Items)
		}
		for _, e := range p.Items {
			if e.ActorName != "Asha Rao" || e.EntityId != lvl.Id || e.RequestId == "" {
				t.Fatalf("entry %+v", e)
			}
		}
		u := page(a.UserID, "/v1/audit?entity=levels&action=update").Items
		if len(u) != 1 || u[0].Before["name"] != "Grade 8" || u[0].After["name"] != "Grade VIII" {
			t.Fatalf("update %+v", u)
		}
	})

	t.Run("another organisation's changes never show", func(t *testing.T) {
		for _, e := range page(a.UserID, "/v1/audit?limit=200").Items {
			if e.After["name"] == "Elsewhere" {
				t.Fatal("an entry of organisation B is visible to A")
			}
		}
	})

	t.Run("pages follow on without gaps or repeats", func(t *testing.T) {
		seen := map[string]bool{}
		p := page(a.UserID, "/v1/audit?entity=levels&limit=3")
		for _, e := range p.Items {
			seen[e.Id] = true
		}
		if p.NextCursor == "" {
			t.Fatal("no next page")
		}
		next := page(a.UserID, "/v1/audit?entity=levels&limit=3&cursor="+p.NextCursor)
		if len(next.Items) != 1 || seen[next.Items[0].Id] || next.NextCursor != "" {
			t.Fatalf("second page %+v", next)
		}
	})

	t.Run("dates and the record filter narrow the list", func(t *testing.T) {
		today := time.Now().UTC().Format(time.DateOnly)
		tomorrow := time.Now().UTC().AddDate(0, 0, 1).Format(time.DateOnly)
		if n := len(page(a.UserID, "/v1/audit?entity=levels&from="+today+"&to="+today).Items); n != 4 {
			t.Fatalf("%d entries today, want 4", n)
		}
		if n := len(page(a.UserID, "/v1/audit?from="+tomorrow).Items); n != 0 {
			t.Fatalf("%d entries from tomorrow", n)
		}
		if n := len(page(a.UserID, "/v1/audit?entityId="+lvl.Id).Items); n != 4 {
			t.Fatalf("%d entries for the level", n)
		}
		call(a.UserID, a.ID, 422, "GET", "/v1/audit?from=yesterday", nil)
	})

	t.Run("facets list what is in the log", func(t *testing.T) {
		var f api.AuditFacets
		_ = json.Unmarshal(call(a.UserID, a.ID, 200, "GET", "/v1/audit/facets", nil), &f)
		has := func(list []string, v string) bool {
			for _, x := range list {
				if x == v {
					return true
				}
			}
			return false
		}
		if !has(f.Entities, "levels") || !has(f.Actions, "restore") || len(f.Actors) == 0 || f.Actors[0].Name != "Asha Rao" {
			t.Fatalf("%+v", f)
		}
	})

	t.Run("principals read the log; teachers and view-only do not", func(t *testing.T) {
		for user, role := range map[string]string{"user_p": "principal", "user_t": "teacher", "user_v": "viewer"} {
			if _, err := owner.Exec(ctx, `INSERT INTO memberships (org_id, clerk_user_id, role) VALUES ($1, $2, $3)`, a.ID, user, role); err != nil {
				t.Fatal(err)
			}
		}
		call("user_p", a.ID, 200, "GET", "/v1/audit", nil)
		call("user_t", a.ID, 403, "GET", "/v1/audit", nil)
		call("user_v", a.ID, 403, "GET", "/v1/audit/facets", nil)
	})
}
