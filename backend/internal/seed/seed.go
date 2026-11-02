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
