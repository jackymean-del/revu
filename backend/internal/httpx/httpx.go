// Package httpx reads JSON requests the same way in every module.
package httpx

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/problem"
)

// Decode reads one JSON object into v, refusing unknown fields and trailing
// data with a 400 problem. The body size is capped by the app's BodyLimit.
func Decode(c fiber.Ctx, v any) error {
	dec := json.NewDecoder(bytes.NewReader(c.Body()))
	dec.DisallowUnknownFields()
	if err := dec.Decode(v); err != nil {
		return problem.New(http.StatusBadRequest, "request.bad", "The request body is not valid JSON for this address: "+err.Error())
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return problem.New(http.StatusBadRequest, "request.bad", "Send a single JSON object.")
	}
	return nil
}
