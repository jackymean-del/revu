package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/api"
)

type fakeDB struct{ err error }

func (f fakeDB) Ping(context.Context) error { return f.err }

func TestHealth(t *testing.T) {
	cases := []struct {
		name   string
		db     Pinger
		wantDB bool
	}{
		{"database answers", fakeDB{}, true},
		{"database down", fakeDB{err: errors.New("connection refused")}, false},
		{"no database configured", nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			app := fiber.New()
			app.Get("/api/health", Health(tc.db, "test-1"))
			res, err := app.Test(httptest.NewRequest("GET", "/api/health", nil))
			if err != nil {
				t.Fatal(err)
			}
			if res.StatusCode != 200 {
				t.Fatalf("status %d, want 200", res.StatusCode)
			}
			var body api.Health
			if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
				t.Fatal(err)
			}
			if body.Status != api.HealthOk || body.Database != tc.wantDB || body.Version != "test-1" {
				t.Fatalf("body %+v, want database=%v", body, tc.wantDB)
			}
		})
	}
}
