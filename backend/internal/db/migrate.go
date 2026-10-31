package db

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"slices"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var migrationName = regexp.MustCompile(`^\d{3}_[a-z0-9_]+\.sql$`)

// migrateLock keeps two servers starting at once from migrating together.
const migrateLock = 7_270_011

// Migrate applies every database/migrations file not yet recorded in
// schema_migrations, in name order, each in its own transaction. It must run
// as the owner role. It returns the files it applied.
func Migrate(ctx context.Context, owner *pgxpool.Pool, dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read migrations: %w", err)
	}
	var files []string
	for _, e := range entries {
		if e.IsDir() || filepath.Ext(e.Name()) != ".sql" {
			continue
		}
		if !migrationName.MatchString(e.Name()) {
			return nil, fmt.Errorf("migration %q: name it NNN_words.sql", e.Name())
		}
		files = append(files, e.Name())
	}
	slices.Sort(files)

	conn, err := owner.Acquire(ctx)
	if err != nil {
		return nil, err
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, migrateLock); err != nil {
		return nil, err
	}
	defer func() { _, _ = conn.Exec(context.Background(), `SELECT pg_advisory_unlock($1)`, migrateLock) }()

	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`); err != nil {
		return nil, err
	}
	rows, err := conn.Query(ctx, `SELECT version FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	done, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return nil, err
	}

	var applied []string
	for _, f := range files {
		if slices.Contains(done, f) {
			continue
		}
		sql, err := os.ReadFile(filepath.Join(dir, f))
		if err != nil {
			return applied, err
		}
		err = pgx.BeginFunc(ctx, conn, func(tx pgx.Tx) error {
			if _, err := tx.Exec(ctx, string(sql)); err != nil {
				return err
			}
			_, err := tx.Exec(ctx, `INSERT INTO schema_migrations (version) VALUES ($1)`, f)
			return err
		})
		if err != nil {
			return applied, fmt.Errorf("migration %s: %w", f, err)
		}
		applied = append(applied, f)
	}
	return applied, nil
}

// SetAppPassword lets revu_app log in with this password. The server calls
// it at start with APP_DB_PASSWORD, so the password lives only in the
// environment, never in a migration.
func SetAppPassword(ctx context.Context, owner *pgxpool.Pool, password string) error {
	var stmt string
	if err := owner.QueryRow(ctx, `SELECT format('ALTER ROLE revu_app LOGIN PASSWORD %L', $1::text)`, password).Scan(&stmt); err != nil {
		return err
	}
	_, err := owner.Exec(ctx, stmt)
	return err
}

// CheckAppRole fails when the pool's role could see past row-level security:
// a superuser, a role with BYPASSRLS, or the owner of any table.
func CheckAppRole(ctx context.Context, pool *pgxpool.Pool) error {
	var role string
	var super, bypass bool
	var owned int
	err := pool.QueryRow(ctx, `
		SELECT r.rolname, r.rolsuper, r.rolbypassrls,
		       (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND pg_has_role(current_user, c.relowner, 'USAGE'))
		  FROM pg_roles r WHERE r.rolname = current_user`).Scan(&role, &super, &bypass, &owned)
	if err != nil {
		return err
	}
	switch {
	case super:
		return fmt.Errorf("database role %s is a superuser, so row-level security does not apply; connect DATABASE_URL as revu_app", role)
	case bypass:
		return fmt.Errorf("database role %s has BYPASSRLS; connect DATABASE_URL as revu_app", role)
	case owned > 0:
		return fmt.Errorf("database role %s owns %d tables, so row-level security does not apply to it; connect DATABASE_URL as revu_app", role, owned)
	}
	return nil
}
