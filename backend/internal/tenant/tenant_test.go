package tenant_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/tenant"
)

// In these tests the user and organisation come from headers; in the server
// they come from the verified sign-in.
func fromHeaders(c fiber.Ctx) (string, string, error) {
	return c.Get("X-Test-User"), c.Get("X-Org-Id"), nil
}

type response struct {
	Code int
	Body *bytes.Buffer
}

func TestMiddleware(t *testing.T) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	b := dbtest.SeedOrg(t, owner, "Org B")
	ctx := context.Background()

	app := fiber.New(fiber.Config{ErrorHandler: problem.Handler})
	in := app.Group("", tenant.Middleware(appPool, fromHeaders))
	in.Get("/branches", func(c fiber.Ctx) error {
		tx, err := tenant.Tx(c)
		if err != nil {
			return err
		}
		rows, err := tx.Query(c.Context(), `SELECT name FROM branches ORDER BY name`)
		if err != nil {
			return err
		}
		names, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return err
		}
		m, _ := tenant.MemberFrom(c)
		return c.JSON(map[string]any{"names": names, "role": m.Roles[0].Name})
	})
	// Adds a branch, then answers with the status asked for, to show what is
	// kept and what is rolled back.
	in.Post("/branches", func(c fiber.Ctx) error {
		tx, err := tenant.Tx(c)
		if err != nil {
			return err
		}
		m, _ := tenant.MemberFrom(c)
		if _, err := tx.Exec(c.Context(), `INSERT INTO branches (org_id, name) VALUES ($1, $2)`, m.OrgID, c.Query("name")); err != nil {
			return err
		}
		if c.Query("fail") != "" {
			return problem.New(409, "branch.conflict", "Changed by someone else.")
		}
		return c.SendStatus(fiber.StatusCreated)
	})

	call := func(method, path, user, org string) *response {
		req := httptest.NewRequest(method, path, nil)
		req.Header.Set("X-Test-User", user)
		req.Header.Set("X-Org-Id", org)
		res, err := app.Test(req, fiber.TestConfig{Timeout: 0}) // database work can exceed the 1s default under load
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(res.Body)
		return &response{Code: res.StatusCode, Body: bytes.NewBuffer(body)}
	}
	branchExists := func(name string) bool {
		var n int
		if err := owner.QueryRow(ctx, `SELECT count(*) FROM branches WHERE org_id = $1 AND name = $2`, a.ID, name).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n > 0
	}

	t.Run("a member sees only their organisation", func(t *testing.T) {
		rec := call("GET", "/branches", a.UserID, a.ID)
		if rec.Code != 200 {
			t.Fatalf("status %d: %s", rec.Code, rec.Body)
		}
		var body struct {
			Names []string
			Role  string
		}
		_ = json.NewDecoder(rec.Body).Decode(&body)
		if len(body.Names) != 1 || body.Names[0] != "Org A main" || body.Role != "admin" {
			t.Fatalf("got %+v", body)
		}
	})

	notFound := []struct{ name, user, org string }{
		{"asking for another organisation", a.UserID, b.ID},
		{"an organisation id that is not an id", a.UserID, "org-b"},
		{"no organisation", a.UserID, ""},
		{"no user", "", a.ID},
	}
	for _, tc := range notFound {
		t.Run(tc.name+" is not found", func(t *testing.T) {
			rec := call("GET", "/branches", tc.user, tc.org)
			var p api.Problem
			_ = json.NewDecoder(rec.Body).Decode(&p)
			if rec.Code != 404 || p.Code != "org.not_found" {
				t.Fatalf("status %d code %q, want 404 org.not_found", rec.Code, p.Code)
			}
		})
	}

	t.Run("work is kept when the handler succeeds", func(t *testing.T) {
		if rec := call("POST", "/branches?name=Kept", a.UserID, a.ID); rec.Code != 201 {
			t.Fatalf("status %d: %s", rec.Code, rec.Body)
		}
		if !branchExists("Kept") {
			t.Fatal("a successful request was not committed")
		}
	})

	t.Run("work is rolled back when the handler fails", func(t *testing.T) {
		rec := call("POST", "/branches?name=Dropped&fail=1", a.UserID, a.ID)
		if rec.Code != 409 || !strings.Contains(rec.Body.String(), "branch.conflict") {
			t.Fatalf("status %d: %s", rec.Code, rec.Body)
		}
		if branchExists("Dropped") {
			t.Fatal("a failed request left its changes behind")
		}
	})

	t.Run("a database error is a 500 and keeps nothing", func(t *testing.T) {
		// an empty name breaks the branches name check
		rec := call("POST", "/branches?name=", a.UserID, a.ID)
		if rec.Code != 500 || strings.Contains(rec.Body.String(), "check constraint") {
			t.Fatalf("status %d: %s", rec.Code, rec.Body)
		}
	})
}

func TestTxOutsideMiddleware(t *testing.T) {
	app := fiber.New()
	app.Get("/", func(c fiber.Ctx) error {
		if _, err := tenant.Tx(c); err == nil {
			t.Error("a query outside a tenant transaction must fail, not run unscoped")
		}
		return nil
	})
	if _, err := app.Test(httptest.NewRequest("GET", "/", nil)); err != nil {
		t.Fatal(err)
	}
}
