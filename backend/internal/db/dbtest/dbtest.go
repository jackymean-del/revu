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
	ID, UserID, BranchID, YearID, LevelID, SectionID, SubjectID, StaffID, StudentID, GroupID string
	PeriodID, AssessmentID, PartID, SchemeID                                                 string
}

// seedTemplate is a valid report template: every section on, A4 portrait.
const seedTemplate = `{"title": "Progress report", "sections": [{"key": "identity", "on": true}, {"key": "marks", "on": true},
  {"key": "components", "on": true}, {"key": "overall", "on": true}, {"key": "legend", "on": true}, {"key": "signoff", "on": true}],
  "subjectOrder": [], "signoff": ["person.class_teacher", "person.principal", "person.guardian"],
  "paper": {"size": "A4", "orientation": "portrait"}, "booklet": false, "padEven": true, "qr": false}`

// seedScheme is a valid scheme: one component, the periodic tests' total.
const seedScheme = `{"schema": 1, "rounding": {"mode": "half_up", "places": 2, "at": "components"},
  "components": [{"code": "T", "name": "Tests", "from": {"kinds": ["periodic_test"], "part_kind": "main"},
                  "aggregate": {"fn": "sum"}, "scale_to": "100", "on_absent": "wait_makeup"}],
  "subject": {"expr": "T", "max": "100"}}`

// Tenant tables in the order rows can be deleted. Every tenant table must be
// listed and seeded below; the cross-tenant test fails on one that is not.
var tenantTables = []string{
	"group_members", "report_run_items", "report_runs", "report_template_versions", "report_templates", "branding_versions", "computed_results", "scheme_assignments", "schemes", "sync_outbox_receipts", "layout_sort_rules", "layout_items", "layout_profiles", "result_stale_intents",
	"assessment_participation", "evidence_history", "evidence", "bulk_writes", "assessment_parts", "assessment_scopes", "assessments",
	"student_subject_choices", "subject_group_options", "subject_groups",
	"invitations", "import_jobs", "audit_log", "feature_flags", "terminology", "memberships", "teaching_assignments",
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
	o.PeriodID = one(`INSERT INTO periods (org_id, year_id, name, seq, starts_on, ends_on) VALUES ($1, $2, 'Term 1', 1, '2026-04-01', '2026-09-30') RETURNING id`, o.ID, o.YearID)
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
	one(`INSERT INTO invitations (org_id, email, role) VALUES ($1, $2, 'teacher') RETURNING id`, o.ID, "invitee-"+o.UserID+"@example.test")
	one(`INSERT INTO import_jobs (org_id, kind, file_name, total_rows) VALUES ($1, 'students', 'class.csv', 0) RETURNING id`, o.ID)
	o.GroupID = one(`INSERT INTO subject_groups (org_id, level_id, name, rule, min_choices, max_choices) VALUES ($1, $2, 'Second language', 'exactly_one', 1, 1) RETURNING id`, o.ID, o.LevelID)
	language := one(`INSERT INTO subjects (org_id, name, code) VALUES ($1, 'Hindi', 'HIN') RETURNING id`, o.ID)
	one(`INSERT INTO subject_group_options (org_id, group_id, subject_id) VALUES ($1, $2, $3) RETURNING id`, o.ID, o.GroupID, language)
	one(`INSERT INTO level_subjects (org_id, level_id, subject_id) VALUES ($1, $2, $3) RETURNING id`, o.ID, o.LevelID, language)
	one(`INSERT INTO student_subject_choices (org_id, student_id, year_id, group_id, subject_id, effective_from, source) VALUES ($1, $2, $3, $4, $5, '2026-04-01', 'manual') RETURNING id`,
		o.ID, o.StudentID, o.YearID, o.GroupID, language)
	o.AssessmentID = one(`INSERT INTO assessments (org_id, year_id, period_id, level_id, subject_id, title, entry_mode) VALUES ($1, $2, $3, $4, $5, 'Unit test 1', 'total') RETURNING id`,
		o.ID, o.YearID, o.PeriodID, o.LevelID, o.SubjectID)
	one(`INSERT INTO assessment_scopes (org_id, assessment_id, section_id) VALUES ($1, $2, $3) RETURNING section_id`, o.ID, o.AssessmentID, o.SectionID)
	o.PartID = one(`INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks) VALUES ($1, $2, 1, 'Total', 40) RETURNING id`, o.ID, o.AssessmentID)
	bulk := one(`INSERT INTO bulk_writes (org_id, assessment_id, section_id, kind, cells) VALUES ($1, $2, $3, 'upload', 1) RETURNING id`, o.ID, o.AssessmentID, o.SectionID)
	mark := one(`INSERT INTO evidence (org_id, student_id, assessment_id, part_id, value, state, source) VALUES ($1, $2, $3, $4, 31.5, 'scored', 'import') RETURNING id`,
		o.ID, o.StudentID, o.AssessmentID, o.PartID)
	one(`INSERT INTO evidence_history (org_id, evidence_id, version, value, state, source, bulk_id) VALUES ($1, $2, 1, 31.5, 'scored', 'import', $3) RETURNING evidence_id`, o.ID, mark, bulk)
	// The seeded assessment only: tests that enter marks make their own.
	one(`INSERT INTO assessment_participation (org_id, assessment_id, student_id, status) VALUES ($1, $2, $3, 'exempt') RETURNING student_id`, o.ID, o.AssessmentID, o.StudentID)
	one(`INSERT INTO sync_outbox_receipts (org_id, op_id, result) VALUES ($1, $2, '{}') RETURNING op_id`, o.ID, "seed-op-"+o.UserID)
	one(`INSERT INTO result_stale_intents (org_id, student_id, period_id, subject_id) VALUES ($1, $2, $3, $4) RETURNING student_id`, o.ID, o.StudentID, o.PeriodID, o.SubjectID)
	profile := one(`INSERT INTO layout_profiles (org_id, surface, scope_kind, scope_id, user_id) VALUES ($1, 'entry_grid', 'user', $2, $3) RETURNING id`, o.ID, o.AssessmentID, o.UserID)
	one(`INSERT INTO layout_items (org_id, profile_id, item_kind, item_id, position) VALUES ($1, $2, 'part', $3, 1) RETURNING item_id`, o.ID, profile, o.PartID)
	one(`INSERT INTO layout_sort_rules (org_id, profile_id, seq, field) VALUES ($1, $2, 1, 'name') RETURNING field`, o.ID, profile)
	o.SchemeID = one(`WITH n AS (SELECT uuidv7() AS id)
		INSERT INTO schemes (id, family_id, org_id, name, status, definition) SELECT n.id, n.id, $1, 'Seeded scheme', 'published', $2::jsonb FROM n RETURNING id`, o.ID, seedScheme)
	one(`INSERT INTO scheme_assignments (org_id, family_id, level_id) VALUES ($1, $2, $3) RETURNING id`, o.ID, o.SchemeID, o.LevelID)
	one(`INSERT INTO computed_results (org_id, student_id, period_id, subject_id, component_code, value, max, pct, state, scheme_id, scheme_version)
		VALUES ($1, $2, $3, $4, '_subject', 31.5, 40, 78.75, 'complete', $5, 1) RETURNING student_id`, o.ID, o.StudentID, o.PeriodID, o.SubjectID, o.SchemeID)
	one(`INSERT INTO branding_versions (org_id, version, display_name) VALUES ($1, 1, $2) RETURNING display_name`, o.ID, name)
	tpl := one(`INSERT INTO report_templates (org_id, name, config) VALUES ($1, 'Report card', $2::jsonb) RETURNING id`, o.ID, seedTemplate)
	one(`INSERT INTO report_template_versions (org_id, template_id, version, config) VALUES ($1, $2, 1, '{}') RETURNING template_id`, o.ID, tpl)
	run := one(`INSERT INTO report_runs (org_id, section_id, period_id, template_id, template_version) VALUES ($1, $2, $3, $4, 1) RETURNING id`, o.ID, o.SectionID, o.PeriodID, tpl)
	one(`INSERT INTO report_run_items (org_id, run_id, student_id, facts) VALUES ($1, $2, $3, '{}') RETURNING id`, o.ID, run, o.StudentID)
	group := one(`INSERT INTO groups (name) VALUES ($1) RETURNING id`, name+" group "+o.UserID)
	t.Cleanup(func() { _, _ = owner.Exec(context.Background(), `DELETE FROM groups WHERE id = $1`, group) })
	one(`INSERT INTO group_members (org_id, group_id) VALUES ($1, $2) RETURNING org_id`, o.ID, group)
	one(`INSERT INTO feature_flags (org_id, key, enabled) VALUES ($1, 'scan_grading', true) RETURNING id`, o.ID)
	return o
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
