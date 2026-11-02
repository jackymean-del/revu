// Package seed creates demo organisations for local work, demos and tests.
// It runs as the owner role (creating an organisation is a sign-up step)
// and is repeatable: a second run finds the organisations by external id.
// v1.11 fills them with structure and people.
package seed

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Demo is one demo organisation.
type Demo struct {
	ExternalID, Name, Type, Preset, Branch string
}

// Demos are two organisations with different presets, so every screen can be
// checked in two vocabularies.
var Demos = []Demo{
	{"demo-school", "Riverside Public School", "school", "school", "Riverside main"},
	{"demo-university", "Lakeview University", "university", "university", "Lakeview campus"},
}

// Run creates the demo organisations and makes userID an administrator of
// each. It returns their ids, in the order of Demos.
func Run(ctx context.Context, owner *pgxpool.Pool, userID string) ([]string, error) {
	var ids []string
	err := pgx.BeginFunc(ctx, owner, func(tx pgx.Tx) error {
		for _, d := range Demos {
			var id string
			err := tx.QueryRow(ctx, `SELECT id::text FROM orgs WHERE external_id = $1`, d.ExternalID).Scan(&id)
			if err == pgx.ErrNoRows {
				err = tx.QueryRow(ctx, `
					INSERT INTO orgs (name, institution_type, preset, external_id)
					VALUES ($1, $2, $3, $4) RETURNING id::text`, d.Name, d.Type, d.Preset, d.ExternalID).Scan(&id)
				if err == nil {
					_, err = tx.Exec(ctx, `INSERT INTO branches (org_id, name) VALUES ($1, $2)`, id, d.Branch)
				}
			}
			if err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO memberships (org_id, clerk_user_id, role) VALUES ($1, $2, 'admin')
				ON CONFLICT DO NOTHING`, id, userID); err != nil {
				return err
			}
			ids = append(ids, id)
		}
		return nil
	})
	return ids, err
}

// CreateOrg is the platform owner's step for a new client (blueprint Part
// 56.5): the organisation with its preset and a main branch, and an
// invitation for its first administrator, who signs in with that address.
// It returns the organisation and invitation ids.
func CreateOrg(ctx context.Context, owner *pgxpool.Pool, name, kind, adminEmail string) (string, string, error) {
	var orgID, invID string
	err := pgx.BeginFunc(ctx, owner, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `INSERT INTO orgs (name, institution_type, preset) VALUES ($1, $2, $3) RETURNING id::text`, name, kind, kind).Scan(&orgID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO branches (org_id, name) VALUES ($1, $2)`, orgID, name); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `INSERT INTO invitations (org_id, email, role, invited_by) VALUES ($1, lower(btrim($2)), 'admin', 'platform') RETURNING id::text`, orgID, adminEmail).Scan(&invID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO audit_log (org_id, action, entity, entity_id, after) VALUES ($1, 'create', 'orgs', $1, jsonb_build_object('name', $2::text, 'type', $3::text))`, orgID, name, kind)
		return err
	})
	return orgID, invID, err
}

// MarkSent records that the sign-in service emailed the invitation link.
func MarkSent(ctx context.Context, owner *pgxpool.Pool, invitationID string) error {
	_, err := owner.Exec(ctx, `UPDATE invitations SET sent = true WHERE id = $1::uuid`, invitationID)
	return err
}
