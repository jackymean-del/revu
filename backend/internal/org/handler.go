// Package org serves the organisations a person belongs to. Creating and
// editing an organisation arrives with the setup wizard (v1.10).
package org

import (
	"log/slog"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/auth"
)

// Me answers who is signed in and lists their organisations through
// revu_my_orgs, which returns only their own memberships. First it claims
// any invitation for an address the sign-in service says this person has
// verified, so an invited person lands in their organisation on first
// sign-in.
func Me(pool *pgxpool.Pool, a auth.Authenticator, dir auth.Directory) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, err := a.UserID(c)
		if err != nil {
			return err
		}
		if dir != nil {
			emails, err := dir.VerifiedEmails(c.Context(), user)
			if err != nil {
				slog.Warn("could not read verified emails; invitations wait for the next sign-in", "err", err)
			} else if len(emails) > 0 {
				var n int
				if err := pool.QueryRow(c.Context(), `SELECT revu_claim_invitations($1, $2)`, user, emails).Scan(&n); err != nil {
					return err
				}
			}
		}
		rows, err := pool.Query(c.Context(), `SELECT id::text, name, preset, roles, coalesce(staff_id::text, ''), setup_done FROM revu_my_orgs($1)`, user)
		if err != nil {
			return err
		}
		orgs, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (api.MyOrg, error) {
			var o api.MyOrg
			var roles []string
			err := row.Scan(&o.Id, &o.Name, &o.Preset, &roles, &o.StaffId, &o.SetupDone)
			for _, ro := range roles {
				o.Roles = append(o.Roles, api.MyOrgRoles(ro))
			}
			return o, err
		})
		if err != nil {
			return err
		}
		if orgs == nil {
			orgs = []api.MyOrg{}
		}
		return c.JSON(api.Me{UserId: user, Orgs: orgs})
	}
}
