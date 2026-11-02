// Package org serves the organisations a person belongs to. Creating and
// editing an organisation arrives with the setup wizard (v1.10).
package org

import (
	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/auth"
)

// Me answers who is signed in and lists their organisations through
// revu_my_orgs, which returns only their own memberships.
func Me(pool *pgxpool.Pool, a auth.Authenticator) fiber.Handler {
	return func(c fiber.Ctx) error {
		user, err := a.UserID(c)
		if err != nil {
			return err
		}
		rows, err := pool.Query(c.Context(), `SELECT id::text, name, preset, roles FROM revu_my_orgs($1)`, user)
		if err != nil {
			return err
		}
		orgs, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (api.MyOrg, error) {
			var o api.MyOrg
			var roles []string
			err := row.Scan(&o.Id, &o.Name, &o.Preset, &roles)
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
