// Package dbtest builds a real test database from database/migrations and
// seeds organisations into it. Tests that use it are skipped when
// TEST_DATABASE_URL (an owner connection) is not set.
package dbtest

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackymean-del/revu/internal/db"
)

const appPassword = "revu-app-test"

// MigrationsDir is database/migrations at the repository root.
func MigrationsDir() string {
	_, file, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(file), "..", "..", "..", "..", "database", "migrations")
}

// Open migrates the test database and returns an owner pool and a pool
// connected as revu_app, the role the server uses.
func Open(t *testing.T) (owner, app *pgxpool.Pool) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	owner, err := db.Connect(ctx, url)
	if err != nil {
		t.Fatalf("connect owner: %v", err)
	}
	t.Cleanup(owner.Close)
	if _, err := db.Migrate(ctx, owner, MigrationsDir()); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if err := db.SetAppPassword(ctx, owner, appPassword); err != nil {
		t.Fatalf("app password: %v", err)
	}

	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.User = "revu_app"
	cfg.ConnConfig.Password = appPassword
	app, err = pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("connect app: %v", err)
	}
	t.Cleanup(app.Close)
	return owner, app
}

// Org is a seeded organisation and the ids of the rows created for it.
type Org struct {
	ID, UserID, BranchID, YearID, LevelID, SectionID, SubjectID, StaffID, StudentID string
}

// Tenant tables in the order rows can be deleted. Every tenant table must be
// listed and seeded below; the cross-tenant test fails on one that is not.
var tenantTables = []string{
	"import_jobs", "audit_log", "feature_flags", "terminology", "memberships", "teaching_assignments",
	"enrolments", "guardians", "students", "staff", "level_subjects", "subjects", "sections",
	"levels", "periods", "academic_years", "branches",
}

// SeedOrg creates an organisation with at least one row in every tenant
// table, as the owner, and removes it all when the test ends.
func SeedOrg(t *testing.T, owner *pgxpool.Pool, name string) Org {
	t.Helper()
	ctx := context.Background()
	o := Org{UserID: "user_" + randomHex(6)}
	one := func(sql string, args ...any) string {
		t.Helper()
		var id string
		if err := owner.QueryRow(ctx, sql, args...).Scan(&id); err != nil {
			t.Fatalf("seed %s: %v\n%s", name, err, sql)
		}
		return id
	}
	o.ID = one(`INSERT INTO orgs (name) VALUES ($1) RETURNING id`, name)
	t.Cleanup(func() {
		for _, table := range tenantTables {
			_, _ = owner.Exec(ctx, `DELETE FROM `+table+` WHERE org_id = $1`, o.ID)
		}
		_, _ = owner.Exec(ctx, `DELETE FROM orgs WHERE id = $1`, o.ID)
	})
	o.BranchID = one(`INSERT INTO branches (org_id, name) VALUES ($1, $2) RETURNING id`, o.ID, name+" main")
	o.YearID = one(`INSERT INTO academic_years (org_id, label, starts_on, ends_on) VALUES ($1, '2026-27', '2026-04-01', '2027-03-31') RETURNING id`, o.ID)
	one(`INSERT INTO periods (org_id, year_id, name, seq, starts_on, ends_on) VALUES ($1, $2, 'Term 1', 1, '2026-04-01', '2026-09-30') RETURNING id`, o.ID, o.YearID)
	o.LevelID = one(`INSERT INTO levels (org_id, name, seq) VALUES ($1, 'Grade 6', 6) RETURNING id`, o.ID)
	o.SectionID = one(`INSERT INTO sections (org_id, branch_id, level_id, year_id, name) VALUES ($1, $2, $3, $4, 'A') RETURNING id`, o.ID, o.BranchID, o.LevelID, o.YearID)
	o.SubjectID = one(`INSERT INTO subjects (org_id, name) VALUES ($1, 'Mathematics') RETURNING id`, o.ID)
	one(`INSERT INTO level_subjects (org_id, level_id, subject_id) VALUES ($1, $2, $3) RETURNING id`, o.ID, o.LevelID, o.SubjectID)
	o.StaffID = one(`INSERT INTO staff (org_id, name, email, clerk_user_id) VALUES ($1, 'Asha Rao', 'asha@example.test', $2) RETURNING id`, o.ID, o.UserID)
	o.StudentID = one(`INSERT INTO students (org_id, admission_no, name) VALUES ($1, 'A-001', 'Ravi Kumar') RETURNING id`, o.ID)
	one(`INSERT INTO guardians (org_id, student_id, name, relation, phone, is_primary) VALUES ($1, $2, 'Meena Kumar', 'mother', '+910000000000', true) RETURNING id`, o.ID, o.StudentID)
	one(`INSERT INTO enrolments (org_id, student_id, section_id, year_id, roll_no) VALUES ($1, $2, $3, $4, '1') RETURNING id`, o.ID, o.StudentID, o.SectionID, o.YearID)
	one(`INSERT INTO teaching_assignments (org_id, staff_id, section_id, subject_id) VALUES ($1, $2, $3, $4) RETURNING id`, o.ID, o.StaffID, o.SectionID, o.SubjectID)
	one(`INSERT INTO memberships (org_id, clerk_user_id, role, staff_id) VALUES ($1, $2, 'admin', $3) RETURNING id`, o.ID, o.UserID, o.StaffID)
	one(`INSERT INTO audit_log (org_id, actor_id, action, entity, entity_id) VALUES ($1, $2, 'create', 'students', $3) RETURNING id`, o.ID, o.UserID, o.StudentID)
	one(`INSERT INTO terminology (org_id, key, singular, plural) VALUES ($1, 'group.section', 'Section', 'Sections') RETURNING id`, o.ID)
	one(`INSERT INTO import_jobs (org_id, kind, file_name, total_rows) VALUES ($1, 'students', 'class.csv', 0) RETURNING id`, o.ID)
	one(`INSERT INTO feature_flags (org_id, key, enabled) VALUES ($1, 'scan_grading', true) RETURNING id`, o.ID)
	return o
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
