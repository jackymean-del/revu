// Package problem turns every error the server returns into RFC 7807
// problem details with a stable code (contracts/openapi.yaml, Problem).
// Handlers return problem.New(...) for errors a person can act on; anything
// else becomes a 500 whose detail never leaks internals.
package problem

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/reqid"
)

// ContentType is the media type of every error body.
const ContentType = "application/problem+json"

const typeBase = "https://revu.bhusku.com/problems/"

// Error is an error with an HTTP status and a stable code, for example
// New(409, "evidence.locked", "These marks are locked for moderation.").
type Error struct {
	Status int
	Code   string
	Detail string
	Fields []api.FieldError
}

func (e *Error) Error() string { return e.Code + ": " + e.Detail }

// New returns an error that becomes a problem response with this status,
// code and detail. The detail is shown to people, so write it for them.
func New(status int, code, detail string) *Error {
	return &Error{Status: status, Code: code, Detail: detail}
}

// Invalid is a 422 validation.failed listing what is wrong with each field.
func Invalid(fields ...api.FieldError) *Error {
	return &Error{Status: http.StatusUnprocessableEntity, Code: "validation.failed",
		Detail: "Some fields need attention.", Fields: fields}
}

// Errors the router raises itself.
var (
	NotFound         = New(http.StatusNotFound, "route.not_found", "There is nothing at this address.")
	MethodNotAllowed = New(http.StatusMethodNotAllowed, "route.method_not_allowed", "This address does not accept that method.")
)

const internalDetail = "Something went wrong on our side. Quote the request id if you report it."

// From maps any error to its problem body. Instance and request id are
// filled in by Write, which knows the request.
func From(err error) api.Problem {
	var pe *Error
	if errors.As(err, &pe) {
		return api.Problem{Type: typeBase + pe.Code, Title: http.StatusText(pe.Status),
			Status: pe.Status, Code: pe.Code, Detail: pe.Detail, Errors: pe.Fields}
	}
	return api.Problem{Type: "about:blank", Title: http.StatusText(http.StatusInternalServerError),
		Status: http.StatusInternalServerError, Code: "internal", Detail: internalDetail}
}

// Write sends err as a problem body. Server-side failures are logged with
// the request id the body carries.
func Write(w http.ResponseWriter, r *http.Request, err error) {
	p := From(err)
	p.Instance = r.URL.Path
	p.RequestId = reqid.From(r.Context())
	if p.Status >= 500 {
		slog.Error("request failed", "err", err, "method", r.Method, "path", p.Instance, "request_id", p.RequestId)
	}
	w.Header().Set("Content-Type", ContentType)
	w.WriteHeader(p.Status)
	_ = json.NewEncoder(w).Encode(p)
}

// Handler adapts a handler that returns an error: a nil error means it has
// written its response, anything else is written as a problem.
func Handler(fn func(w http.ResponseWriter, r *http.Request) error) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := fn(w, r); err != nil {
			Write(w, r, err)
		}
	}
}
