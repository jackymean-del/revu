// Package problem turns every error the server returns into RFC 7807
// problem details with a stable code (contracts/openapi.yaml, Problem).
// Handlers return problem.New(...) for errors a person can act on; anything
// else becomes a 500 whose detail never leaks internals.
package problem

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"github.com/jackymean-del/revu/internal/api"
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

// Errors Fiber raises itself (unknown route, bad body, ...), with a code and
// a detail written for people.
var fiberCodes = map[int]struct{ code, detail string }{
	http.StatusBadRequest:            {"request.bad", ""},
	http.StatusUnauthorized:          {"auth.required", "Sign in to continue."},
	http.StatusForbidden:             {"auth.forbidden", ""},
	http.StatusNotFound:              {"route.not_found", "There is nothing at this address."},
	http.StatusMethodNotAllowed:      {"route.method_not_allowed", "This address does not accept that method."},
	http.StatusRequestEntityTooLarge: {"request.too_large", "The request is too large."},
	http.StatusUnsupportedMediaType:  {"request.unsupported_type", ""},
	http.StatusTooManyRequests:       {"rate.limited", "Too many requests. Wait a moment and try again."},
}

const internalDetail = "Something went wrong on our side. Quote the request id if you report it."

// From maps any error to its problem body. Instance and request id are
// filled in by Handler, which knows the request.
func From(err error) api.Problem {
	var pe *Error
	if errors.As(err, &pe) {
		return api.Problem{Type: typeBase + pe.Code, Title: http.StatusText(pe.Status),
			Status: pe.Status, Code: pe.Code, Detail: pe.Detail, Errors: pe.Fields}
	}
	var fe *fiber.Error
	if errors.As(err, &fe) && fe.Code < 500 {
		known, ok := fiberCodes[fe.Code]
		if !ok {
			known.code = "request.rejected"
		}
		if known.detail == "" {
			known.detail = fe.Message
		}
		return api.Problem{Type: "about:blank", Title: http.StatusText(fe.Code),
			Status: fe.Code, Code: known.code, Detail: known.detail}
	}
	status := http.StatusInternalServerError
	if fe != nil {
		status = fe.Code
	}
	return api.Problem{Type: "about:blank", Title: http.StatusText(status),
		Status: status, Code: "internal", Detail: internalDetail}
}

// StatusOf is the status the response for err will carry.
func StatusOf(err error) int { return From(err).Status }

// Handler is the Fiber error handler: every error becomes a problem body.
// Server-side failures are logged with the request id the body carries.
func Handler(c fiber.Ctx, err error) error {
	p := From(err)
	p.Instance = c.Path()
	p.RequestId = requestid.FromContext(c)
	if p.Status >= 500 {
		slog.Error("request failed", "err", err, "method", c.Method(), "path", p.Instance, "request_id", p.RequestId)
	}
	return c.Status(p.Status).JSON(p, ContentType)
}
