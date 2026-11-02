package problem

import (
	"errors"
	"fmt"
	"testing"

	"github.com/gofiber/fiber/v3"
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
		{"unknown route", fiber.NewError(404, "Cannot GET /nope"), 404, "route.not_found", "There is nothing at this address."},
		{"wrong method", fiber.ErrMethodNotAllowed, 405, "route.method_not_allowed", "This address does not accept that method."},
		{"other client error gets a generic code", fiber.ErrTeapot, 418, "request.rejected", fiber.ErrTeapot.Message},
		{"server-side fiber error hides its message", fiber.NewError(503, "pool exhausted at 10.0.0.3"), 503, "internal", internalDetail},
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
			if StatusOf(tc.err) != tc.wantStatus {
				t.Fatalf("StatusOf = %d, want %d", StatusOf(tc.err), tc.wantStatus)
			}
		})
	}
	if p := From(Invalid(api.FieldError{Field: "a"}, api.FieldError{Field: "b"})); len(p.Errors) != 2 {
		t.Fatalf("validation errors lost: %+v", p.Errors)
	}
}
