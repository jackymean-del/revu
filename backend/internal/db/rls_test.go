package db_test

import (
	"context"
	"fmt"
	"slices"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackymean-del/revu/internal/db"
	"github.com/jackymean-del/revu/internal/db/dbtest"
)

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// unscopedTables lists public tables that are not fenced to one
// organisation: no tenant column, no RLS, or no tenant policy on app_org_id.
func unscopedTables(ctx context.Context, q querier) ([]string, error) {
	rows, err := q.Query(ctx, `
		SELECT c.relname
		  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relname <> 'schema_migrations'
		   AND NOT (
		     c.relrowsecurity
		     AND (c.relname = 'orgs' OR EXISTS (SELECT 1 FROM pg_attribute a
		           WHERE a.attrelid = c.oid AND a.attname = 'org_id' AND a.attnotnull AND NOT a.attisdropped))
		     AND EXISTS (SELECT 1 FROM pg_policies p
		           WHERE p.schemaname = 'public' AND p.tablename = c.relname AND p.cmd = 'ALL'
		             AND p.qual LIKE '%app_org_id()%' AND p.with_check LIKE '%app_org_id()%'))
		 ORDER BY 1`)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

// tenantTables lists every RLS table with its tenant column.
func tenantTables(t *testing.T, owner *pgxpool.Pool) map[string]string {
	t.Helper()
	rows, err := owner.Query(context.Background(), `
		SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
		 WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND c.relrowsecurity`)
	if err != nil {
		t.Fatal(err)
	}
	names, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]string{}
	for _, n := range names {
		out[n] = "org_id"
	}
	out["orgs"] = "id"
	return out
}

// inOrg runs fn in a transaction as revu_app with app.org_id set, the way
// the tenant middleware does, and always rolls back.
func inOrg(t *testing.T, app *pgxpool.Pool, orgID string, fn func(tx pgx.Tx)) {
	t.Helper()
	ctx := context.Background()
	tx, err := app.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if orgID != "" {
		if _, err := tx.Exec(ctx, `SELECT set_config('app.org_id', $1, true)`, orgID); err != nil {
			t.Fatal(err)
		}
	}
	fn(tx)
}

// refused runs sql in a savepoint and reports whether the database refused it.
func refused(tx pgx.Tx, sql string) bool {
	ctx := context.Background()
	sp, err := tx.Begin(ctx)
	if err != nil {
		return false
	}
	defer func() { _ = sp.Rollback(ctx) }()
	_, err = sp.Exec(ctx, sql)
	return err != nil
}

func TestMigrateIsRepeatable(t *testing.T) {
	owner, _ := dbtest.Open(t)
	var major int
	if err := owner.QueryRow(context.Background(), `SELECT current_setting('server_version_num')::int / 10000`).Scan(&major); err != nil || major < 18 {
		t.Fatalf("PostgreSQL %d (%v), want 18 or later (production runs 18)", major, err)
	}
	applied, err := db.Migrate(context.Background(), owner, dbtest.MigrationsDir())
	if err != nil || len(applied) != 0 {
		t.Fatalf("second run applied %v, err %v; want nothing", applied, err)
	}
}

// AT-v1-02: the application role cannot bypass row-level security and owns
// no table. The owner role is caught by the same check.
func TestAppRoleIsFencedIn(t *testing.T) {
	owner, app := dbtest.Open(t)
	ctx := context.Background()
	if err := db.CheckAppRole(ctx, app); err != nil {
		t.Fatalf("revu_app: %v", err)
	}
	if err := db.CheckAppRole(ctx, owner); err == nil {
		t.Fatal("the owner role passed the app role check; the check is not working")
	}
}

// Every table is fenced to one organisation. The guard is proven on a
// planted table without a policy, inside a transaction that is rolled back.
func TestEveryTableIsTenantScoped(t *testing.T) {
	owner, _ := dbtest.Open(t)
	ctx := context.Background()
	bad, err := unscopedTables(ctx, owner)
	if err != nil {
		t.Fatal(err)
	}
	if len(bad) > 0 {
		t.Fatalf("tables without org_id, RLS and a tenant policy: %v (register them with revu_tenant_table)", bad)
	}

	tx, err := owner.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `CREATE TABLE planted_unscoped (id uuid, org_id uuid NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	bad, err = unscopedTables(ctx, tx)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Contains(bad, "planted_unscoped") {
		t.Fatal("a table without row-level security was not detected")
	}
}

// AT-v1-01 at the database: organisation A sees none of organisation B's
// rows and cannot write into B, for every tenant table; with no
// organisation set the application sees nothing at all.
func TestNoCrossTenantAccess(t *testing.T) {
	owner, app := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	b := dbtest.SeedOrg(t, owner, "Org B")
	ctx := context.Background()

	for table, col := range tenantTables(t, owner) {
		t.Run(table, func(t *testing.T) {
			inOrg(t, app, a.ID, func(tx pgx.Tx) {
				var mine, theirs int
				q := fmt.Sprintf(`SELECT count(*) FILTER (WHERE %[1]s = $1), count(*) FILTER (WHERE %[1]s <> $1) FROM %[2]s`, col, table)
				if err := tx.QueryRow(ctx, q, a.ID).Scan(&mine, &theirs); err != nil {
					t.Fatal(err)
				}
				if mine == 0 {
					t.Fatalf("no seeded rows for %s: add some to dbtest.SeedOrg so this table is proven", table)
				}
				if theirs != 0 {
					t.Fatalf("organisation A sees %d rows of another organisation", theirs)
				}
				if !refused(tx, fmt.Sprintf(`UPDATE %s SET %s = '%s' WHERE %s = '%s'`, table, col, b.ID, col, a.ID)) {
					t.Fatal("organisation A moved a row into organisation B")
				}
			})
			inOrg(t, app, "", func(tx pgx.Tx) {
				var n int
				if err := tx.QueryRow(ctx, `SELECT count(*) FROM `+table).Scan(&n); err != nil {
					t.Fatal(err)
				}
				if n != 0 {
					t.Fatalf("with no organisation set, %d rows are visible", n)
				}
			})
		})
	}
}

// A row cannot point at another organisation's row even when its id is
// known: foreign keys include org_id.
func TestReferencesStayInsideTheOrg(t *testing.T) {
	owner, app := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	b := dbtest.SeedOrg(t, owner, "Org B")
	inOrg(t, app, a.ID, func(tx pgx.Tx) {
		sql := fmt.Sprintf(`INSERT INTO sections (org_id, branch_id, level_id, year_id, name) VALUES ('%s', '%s', '%s', '%s', 'X')`,
			a.ID, b.BranchID, a.LevelID, a.YearID)
		if !refused(tx, sql) {
			t.Fatal("a section in A was linked to a branch of B")
		}
		ok := fmt.Sprintf(`INSERT INTO sections (org_id, branch_id, level_id, year_id, name) VALUES ('%s', '%s', '%s', '%s', 'X')`,
			a.ID, a.BranchID, a.LevelID, a.YearID)
		if refused(tx, ok) {
			t.Fatal("a valid section in A was refused")
		}
	})
}

// The audit log is append-only for the application.
func TestAuditLogIsAppendOnly(t *testing.T) {
	owner, app := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	inOrg(t, app, a.ID, func(tx pgx.Tx) {
		if refused(tx, fmt.Sprintf(`INSERT INTO audit_log (org_id, action, entity) VALUES ('%s', 'update', 'students')`, a.ID)) {
			t.Fatal("the application could not write an audit entry")
		}
		if !refused(tx, `UPDATE audit_log SET action = 'tampered'`) || !refused(tx, `DELETE FROM audit_log`) {
			t.Fatal("the application changed or removed audit entries")
		}
	})
}
