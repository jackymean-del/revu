// Package auth answers who is signed in. The Clerk session check arrives in
// v1.4; until then every request is signed out, except in local development
// where DEV_USER_ID signs every request in as one person (config refuses it
// in production).
package auth

import (
	"net/http"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Authenticator returns the verified user id behind a request.
type Authenticator interface {
	UserID(c fiber.Ctx) (string, error)
}

// ErrSignIn is the answer when nobody is signed in.
var ErrSignIn = problem.New(http.StatusUnauthorized, "auth.required", "Sign in to continue.")

type signedOut struct{}

func (signedOut) UserID(fiber.Ctx) (string, error) { return "", ErrSignIn }

// SignedOut refuses every request.
func SignedOut() Authenticator { return signedOut{} }

// Dev signs every request in as the same user, for local development only.
type Dev string

func (d Dev) UserID(fiber.Ctx) (string, error) { return string(d), nil }

// OrgHeader names the organisation a request acts in.
const OrgHeader = "X-Org-Id"

// Identify gives the tenant middleware the signed-in user and the
// organisation asked for. The organisation is checked against the user's
// memberships there, never trusted as sent.
func Identify(a Authenticator) tenant.Identify {
	return func(c fiber.Ctx) (string, string, error) {
		user, err := a.UserID(c)
		if err != nil {
			return "", "", err
		}
		return user, c.Get(OrgHeader), nil
	}
}
