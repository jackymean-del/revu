package server

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/reqid"
	"go.yaml.in/yaml/v3"
)

// specRoutes reads contracts/openapi.yaml and returns "METHOD /path" for
// every operation. Chi writes path parameters as {id}, the same as OpenAPI.
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
	methods := []string{"get", "put", "post", "delete", "patch", "options", "head"}
	var out []string
	for path, item := range doc.Paths {
		for m := range item {
			if slices.Contains(methods, m) {
				out = append(out, strings.ToUpper(m)+" "+path)
			}
		}
	}
	slices.Sort(out)
	return out
}

func routesOf(t *testing.T, r chi.Router) []string {
	t.Helper()
	var out []string
	err := chi.Walk(r, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		out = append(out, method+" "+route)
		return nil
	})
	if err != nil {
		t.Fatal(err)
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
	undocumented, missing := diff(spec, routesOf(t, New(config.Config{Version: "test"}, nil)))
	for _, r := range undocumented {
		t.Errorf("served but not in contracts/openapi.yaml: %s", r)
	}
	for _, r := range missing {
		t.Errorf("in contracts/openapi.yaml but not served: %s", r)
	}
}

// The guard must catch what it guards against.
func TestContractGuardCatchesDrift(t *testing.T) {
	r := New(config.Config{Version: "test"}, nil)
	r.Post("/v1/undocumented/{id}", func(http.ResponseWriter, *http.Request) {})
	undocumented, missing := diff(append(specRoutes(t), "GET /v1/promised"), routesOf(t, r))
	if !slices.Equal(undocumented, []string{"POST /v1/undocumented/{id}"}) {
		t.Fatalf("undocumented route not caught: %v", undocumented)
	}
	if !slices.Equal(missing, []string{"GET /v1/promised"}) {
		t.Fatalf("unserved operation not caught: %v", missing)
	}
}

// Errors from the real router are problem details with a stable code.
func TestErrorsAreProblemDetails(t *testing.T) {
	r := New(config.Config{Version: "test"}, nil)
	r.Get("/boom", func(http.ResponseWriter, *http.Request) { panic("kaboom") })
	r.Get("/locked", problem.Handler(func(http.ResponseWriter, *http.Request) error {
		return problem.New(409, "evidence.locked", "These marks are locked.")
	}))
	cases := []struct {
		method, path string
		status       int
		code         string
	}{
		{"GET", "/v1/nothing-here", 404, "route.not_found"},
		{"DELETE", "/api/health", 405, "route.method_not_allowed"},
		{"GET", "/boom", 500, "internal"},
		{"GET", "/locked", 409, "evidence.locked"},
	}
	for _, tc := range cases {
		t.Run(tc.method+" "+tc.path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			r.ServeHTTP(rec, httptest.NewRequest(tc.method, tc.path, nil))
			if rec.Code != tc.status {
				t.Fatalf("status %d, want %d", rec.Code, tc.status)
			}
			if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, problem.ContentType) {
				t.Fatalf("content type %q, want %s", ct, problem.ContentType)
			}
			var p api.Problem
			if err := json.NewDecoder(rec.Body).Decode(&p); err != nil {
				t.Fatal(err)
			}
			if p.Code != tc.code || p.Status != tc.status || p.Instance != tc.path {
				t.Fatalf("problem %+v, want code %s with instance", p, tc.code)
			}
			if p.RequestId == "" || p.RequestId != rec.Header().Get(reqid.Header) {
				t.Fatalf("request id %q not matching header %q", p.RequestId, rec.Header().Get(reqid.Header))
			}
			if strings.Contains(p.Detail, "kaboom") {
				t.Fatal("a panic message leaked into the response")
			}
		})
	}
}
