package terminology

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
)

// load reads the organisation's preset and overrides. Row-level security
// limits both queries to the organisation of tx.
func load(ctx context.Context, tx pgx.Tx) (api.Terminology, error) {
	var t api.Terminology
	if err := tx.QueryRow(ctx, `SELECT preset FROM orgs`).Scan(&t.Preset); err != nil {
		return t, err
	}
	rows, err := tx.Query(ctx, `
		SELECT key, coalesce(branch_id::text, ''), singular, plural
		  FROM terminology WHERE locale = 'en'
		 ORDER BY key, branch_id NULLS FIRST`)
	if err != nil {
		return t, err
	}
	t.Overrides, err = pgx.CollectRows(rows, func(row pgx.CollectableRow) (api.TermOverride, error) {
		var o api.TermOverride
		return o, row.Scan(&o.Key, &o.BranchId, &o.One, &o.Other)
	})
	if t.Overrides == nil {
		t.Overrides = []api.TermOverride{}
	}
	return t, err
}

// knownBranches returns which of ids are branches of this organisation.
func knownBranches(ctx context.Context, tx pgx.Tx, ids []string) (map[string]bool, error) {
	rows, err := tx.Query(ctx, `SELECT id::text FROM branches WHERE id::text = ANY($1) AND deleted_at IS NULL`, ids)
	if err != nil {
		return nil, err
	}
	found, err := pgx.CollectRows(rows, pgx.RowTo[string])
	out := map[string]bool{}
	for _, id := range found {
		out[id] = true
	}
	return out, err
}

// replace saves the preset and swaps every English override for t's.
func replace(ctx context.Context, tx pgx.Tx, orgID string, t api.Terminology) error {
	if _, err := tx.Exec(ctx, `UPDATE orgs SET preset = $1 WHERE id = $2`, string(t.Preset), orgID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM terminology WHERE locale = 'en'`); err != nil {
		return err
	}
	for _, o := range t.Overrides {
		_, err := tx.Exec(ctx, `
			INSERT INTO terminology (org_id, branch_id, key, singular, plural)
			VALUES ($1, nullif($2, '')::uuid, $3, $4, $5)`, orgID, o.BranchId, o.Key, o.One, o.Other)
		if err != nil {
			return err
		}
	}
	return nil
}
