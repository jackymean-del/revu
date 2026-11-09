package terminology

import (
	"context"

	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
)

// load reads the organisation's preset and overrides in one round trip.
// Row-level security limits both queries to the organisation of tx.
func load(ctx context.Context, tx pgx.Tx) (api.Terminology, error) {
	var b pgx.Batch
	get := queueLoad(&b)
	if err := tx.SendBatch(ctx, &b).Close(); err != nil {
		return api.Terminology{}, err
	}
	return get(), nil
}

func queueLoad(b *pgx.Batch) func() api.Terminology {
	t := api.Terminology{Overrides: []api.TermOverride{}}
	b.Queue(`SELECT preset FROM orgs`).QueryRow(func(r pgx.Row) error { return r.Scan(&t.Preset) })
	b.Queue(`
		SELECT key, coalesce(branch_id::text, ''), singular, plural
		  FROM terminology WHERE locale = 'en'
		 ORDER BY key, branch_id NULLS FIRST`).
		Query(func(rows pgx.Rows) error {
			for rows.Next() {
				var o api.TermOverride
				if err := rows.Scan(&o.Key, &o.BranchId, &o.One, &o.Other); err != nil {
					return err
				}
				t.Overrides = append(t.Overrides, o)
			}
			return rows.Err()
		})
	return func() api.Terminology { return t }
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

// Words loads the organisation's words for server-side text, such as a
// problem detail that names what still uses something.
func Words(ctx context.Context, tx pgx.Tx) (func(key string, count int) string, error) {
	t, err := load(ctx, tx)
	if err != nil {
		return nil, err
	}
	return wordsOf(t), nil
}

// QueueWords queues loading the words on b, for a screen that reads other
// things in the same round trip; call the getter after b is sent.
func QueueWords(b *pgx.Batch) func() func(key string, count int) string {
	get := queueLoad(b)
	return func() func(key string, count int) string { return wordsOf(get()) }
}

func wordsOf(t api.Terminology) func(key string, count int) string {
	overrides := make([]Override, 0, len(t.Overrides))
	for _, o := range t.Overrides {
		overrides = append(overrides, Override{Key: o.Key, BranchID: o.BranchId, Forms: Forms{One: o.One, Other: o.Other}})
	}
	return func(key string, count int) string {
		w, err := Word(string(t.Preset), overrides, "", key, count)
		if err != nil {
			return key
		}
		return w
	}
}
