package problem

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/jackymean-del/revu/internal/api"
)

func TestFrom(t *testing.T) {
	cases := []struct {
		name       string
		err        error
		wantStatus int
		wantCode   string
		wantDetail string
	}{
		{"own error keeps status, code and detail", New(409, "evidence.locked", "These marks are locked."), 409, "evidence.locked", "These marks are locked."},
		{"own error found through wrapping", fmt.Errorf("save: %w", New(404, "student.not_found", "No such student.")), 404, "student.not_found", "No such student."},
		{"validation lists fields", Invalid(api.FieldError{Field: "name", Code: "required", Message: "Enter a name."}), 422, "validation.failed", "Some fields need attention."},
		{"unknown route", NotFound, 404, "route.not_found", NotFound.Detail},
		{"wrong method", MethodNotAllowed, 405, "route.method_not_allowed", MethodNotAllowed.Detail},
		{"plain error never leaks", errors.New("password authentication failed for user revu"), 500, "internal", internalDetail},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			p := From(tc.err)
			if p.Status != tc.wantStatus || p.Code != tc.wantCode || p.Detail != tc.wantDetail {
				t.Fatalf("got %d %q %q, want %d %q %q", p.Status, p.Code, p.Detail, tc.wantStatus, tc.wantCode, tc.wantDetail)
			}
			if p.Title == "" || p.Type == "" {
				t.Fatalf("title and type are required by the contract: %+v", p)
			}
		})
	}
	if p := From(Invalid(api.FieldError{Field: "a"}, api.FieldError{Field: "b"})); len(p.Errors) != 2 {
		t.Fatalf("validation errors lost: %+v", p.Errors)
	}
}

func TestHandlerWritesProblems(t *testing.T) {
	h := Handler(func(w http.ResponseWriter, r *http.Request) error {
		return errors.New("dial tcp 10.0.0.3:5432: connection refused")
	})
	rec := httptest.NewRecorder()
	h(rec, httptest.NewRequest("GET", "/v1/students", nil))
	if rec.Code != 500 || !strings.HasPrefix(rec.Header().Get("Content-Type"), ContentType) {
		t.Fatalf("status %d content type %q", rec.Code, rec.Header().Get("Content-Type"))
	}
	var p api.Problem
	if err := json.NewDecoder(rec.Body).Decode(&p); err != nil {
		t.Fatal(err)
	}
	if p.Code != "internal" || p.Instance != "/v1/students" || strings.Contains(p.Detail, "10.0.0.3") {
		t.Fatalf("problem %+v", p)
	}
}
