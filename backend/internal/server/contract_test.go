package server

import (
	"encoding/json"
	"net/http/httptest"
	"os"
	"regexp"
	"slices"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/problem"
	"go.yaml.in/yaml/v3"
)

// specRoutes reads contracts/openapi.yaml and returns "METHOD /path" for
// every operation, with {param} written the way Fiber writes :param.
func specRoutes(t *testing.T) []string {
	t.Helper()
	raw, err := os.ReadFile("../../../contracts/openapi.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var doc struct {
		Paths map[string]map[string]any `yaml:"paths"`
	}
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	param := regexp.MustCompile(`\{([^}]+)\}`)
	methods := []string{"get", "put", "post", "delete", "patch", "options", "head"}
	var out []string
	for path, item := range doc.Paths {
		for m := range item {
			if slices.Contains(methods, m) {
				out = append(out, strings.ToUpper(m)+" "+param.ReplaceAllString(path, ":$1"))
			}
		}
	}
	slices.Sort(out)
	return out
}

func routesOf(app *fiber.App) []string {
	var out []string
	for _, r := range app.GetRoutes(true) {
		if r.Method == fiber.MethodHead { // Fiber adds HEAD for every GET by itself
			continue
		}
		out = append(out, r.Method+" "+r.Path)
	}
	slices.Sort(out)
	return slices.Compact(out)
}

// diff lists routes served but not in the spec, and operations in the spec
// that are not served.
func diff(spec, served []string) (undocumented, missing []string) {
	for _, r := range served {
		if !slices.Contains(spec, r) {
			undocumented = append(undocumented, r)
		}
	}
	for _, r := range spec {
		if !slices.Contains(served, r) {
			missing = append(missing, r)
		}
	}
	return undocumented, missing
}

// Every route the server answers is in the contract, and every operation in
// the contract is served. A route added without the spec fails here.
func TestEveryRouteIsInTheContract(t *testing.T) {
	spec := specRoutes(t)
	if len(spec) == 0 {
		t.Fatal("no operations found in contracts/openapi.yaml")
	}
	undocumented, missing := diff(spec, routesOf(New(config.Config{Version: "test"}, nil)))
	for _, r := range undocumented {
		t.Errorf("served but not in contracts/openapi.yaml: %s", r)
	}
	for _, r := range missing {
		t.Errorf("in contracts/openapi.yaml but not served: %s", r)
	}
}

// The guard must catch what it guards against.
func TestContractGuardCatchesDrift(t *testing.T) {
	app := New(config.Config{Version: "test"}, nil)
	app.Post("/v1/undocumented/:id", func(c fiber.Ctx) error { return nil })
	undocumented, missing := diff(append(specRoutes(t), "GET /v1/promised"), routesOf(app))
	if !slices.Equal(undocumented, []string{"POST /v1/undocumented/:id"}) {
		t.Fatalf("undocumented route not caught: %v", undocumented)
	}
	if !slices.Equal(missing, []string{"GET /v1/promised"}) {
		t.Fatalf("unserved operation not caught: %v", missing)
	}
}

// Errors from the real app are problem details with a stable code.
func TestErrorsAreProblemDetails(t *testing.T) {
	app := New(config.Config{Version: "test"}, nil)
	app.Get("/boom", func(c fiber.Ctx) error { panic("kaboom") })
	app.Get("/locked", func(c fiber.Ctx) error {
		return problem.New(409, "evidence.locked", "These marks are locked.")
	})
	cases := []struct {
		path   string
		status int
		code   string
	}{
		{"/v1/nothing-here", 404, "route.not_found"},
		{"/boom", 500, "internal"},
		{"/locked", 409, "evidence.locked"},
	}
	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			res, err := app.Test(httptest.NewRequest("GET", tc.path, nil))
			if err != nil {
				t.Fatal(err)
			}
			if res.StatusCode != tc.status {
				t.Fatalf("status %d, want %d", res.StatusCode, tc.status)
			}
			if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, problem.ContentType) {
				t.Fatalf("content type %q, want %s", ct, problem.ContentType)
			}
			var p api.Problem
			if err := json.NewDecoder(res.Body).Decode(&p); err != nil {
				t.Fatal(err)
			}
			if p.Code != tc.code || p.Status != tc.status || p.Instance != tc.path || p.RequestId == "" {
				t.Fatalf("problem %+v, want code %s with instance and request id", p, tc.code)
			}
			if strings.Contains(p.Detail, "kaboom") {
				t.Fatal("a panic message leaked into the response")
			}
		})
	}
}
