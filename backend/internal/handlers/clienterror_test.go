package handlers

import (
	"bytes"
	"log/slog"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
)

// A screen's fault is logged without its query string, clipped, and an
// address that sends too many is quietly ignored.
func TestClientError(t *testing.T) {
	var log bytes.Buffer
	was := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&log, nil)))
	t.Cleanup(func() { slog.SetDefault(was) })

	app := fiber.New()
	app.Post("/api/client-errors", ClientError())
	post := func(body string) int {
		r := httptest.NewRequest("POST", "/api/client-errors", strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		res, err := app.Test(r)
		if err != nil {
			t.Fatal(err)
		}
		return res.StatusCode
	}

	if got := post(`{"message":"x is undefined","stack":"at a\nat b","path":"/marks?a=secret","version":"v1"}`); got != 204 {
		t.Fatalf("status %d", got)
	}
	out := log.String()
	if !strings.Contains(out, "x is undefined") || !strings.Contains(out, "path=/marks") || strings.Contains(out, "secret") {
		t.Fatalf("logged %q", out)
	}
	log.Reset()
	if got := post(`{"message":""}`); got != 204 || log.Len() != 0 {
		t.Fatalf("an empty report is ignored: %d %q", got, log.String())
	}
	for range 12 {
		post(`{"message":"again"}`)
	}
	if n := strings.Count(log.String(), "again"); n != 8 {
		t.Fatalf("an address is held to ten a minute: %d logged", n)
	}
}
