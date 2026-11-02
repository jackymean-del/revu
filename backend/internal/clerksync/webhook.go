// Package clerksync keeps revU memberships in step with Clerk organisations
// through Clerk's webhook. revU still decides access: the sync only sets the
// Clerk-sourced role in organisations linked by clerk_org_id, and never
// changes a role an administrator set inside revU (005_clerk_sync.sql).
package clerksync

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/problem"
)

type event struct {
	Type string `json:"type"`
	Data struct {
		ID             string              `json:"id"` // user.deleted
		Role           string              `json:"role"`
		Organization   struct{ ID string } `json:"organization"`
		PublicUserData struct {
			UserID string `json:"user_id"`
		} `json:"public_user_data"`
	} `json:"data"`
}

// RoleFor maps a Clerk organisation role to the revU role a new member
// starts with. org:admin is an administrator; a Clerk role named after a
// revU role (org:teacher, org:coordinator, ...) is that role; anything else
// starts as view-only, which sees nothing until granted (Part 77).
func RoleFor(clerkRole string) policy.Role {
	name := strings.TrimPrefix(clerkRole, "org:")
	if slices.Contains(policy.Roles, policy.Role(name)) {
		return policy.Role(name)
	}
	return policy.Viewer
}

// Handler serves POST /v1/webhooks/clerk. secret is the endpoint's signing
// secret (whsec_...); without one the endpoint is switched off.
func Handler(pool *pgxpool.Pool, secret string, now func() time.Time) fiber.Handler {
	return func(c fiber.Ctx) error {
		if secret == "" || pool == nil {
			return problem.New(http.StatusServiceUnavailable, "webhook.not_configured", "The sign-in webhook is not set up on this server.")
		}
		key, err := secretBytes(secret)
		if err != nil {
			return err
		}
		body := c.Body()
		if err := verify(key, c.Get("svix-id"), c.Get("svix-timestamp"), c.Get("svix-signature"), body, now()); err != nil {
			return problem.New(http.StatusUnauthorized, "webhook.bad_signature", "This delivery is not signed by the sign-in service.")
		}
		var e event
		if err := json.Unmarshal(body, &e); err != nil {
			return problem.New(http.StatusBadRequest, "request.bad", "The delivery is not valid JSON.")
		}

		ctx := c.Context()
		var linked bool
		switch e.Type {
		case "organizationMembership.created", "organizationMembership.updated":
			err = pool.QueryRow(ctx, `SELECT revu_clerk_set_membership($1, $2, $3)`,
				e.Data.Organization.ID, e.Data.PublicUserData.UserID, string(RoleFor(e.Data.Role))).Scan(&linked)
		case "organizationMembership.deleted":
			err = pool.QueryRow(ctx, `SELECT revu_clerk_remove_membership($1, $2)`,
				e.Data.Organization.ID, e.Data.PublicUserData.UserID).Scan(&linked)
		case "user.deleted":
			var n int
			err = pool.QueryRow(ctx, `SELECT revu_clerk_remove_user($1)`, e.Data.ID).Scan(&n)
			linked = true
		default:
			linked = true // an event revU does not use: acknowledged so it is not retried
		}
		if err != nil {
			return err // 500: Svix retries the delivery
		}
		// Identifiers only, never names or email addresses (Part 70).
		slog.Info("clerk webhook", "type", e.Type, "svix_id", c.Get("svix-id"), "linked", linked)
		return c.SendStatus(http.StatusNoContent)
	}
}
