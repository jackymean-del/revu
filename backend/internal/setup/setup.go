// Package setup reports how far an organisation's setup has come and lets
// an administrator mark it finished. The setup steps themselves use the
// ordinary structure, words and people endpoints, so nothing about setup is
// a special path.
package setup

import (
	"context"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Routes serves GET /setup and POST /setup/complete inside a tenant router.
func Routes(g fiber.Router) {
	g.Get("/setup", status)
	g.Post("/setup/complete", complete)
}

func load(ctx context.Context, tx pgx.Tx) (api.SetupStatus, error) {
	var s api.SetupStatus
	err := tx.QueryRow(ctx, `
		SELECT (SELECT count(*) FROM academic_years WHERE deleted_at IS NULL),
		       (SELECT count(*) FROM periods WHERE deleted_at IS NULL),
		       (SELECT count(*) FROM levels WHERE deleted_at IS NULL),
		       (SELECT count(*) FROM sections WHERE deleted_at IS NULL),
		       (SELECT count(*) FROM subjects WHERE deleted_at IS NULL),
		       (SELECT count(*) FROM level_subjects WHERE deleted_at IS NULL),
		       (SELECT count(*) FROM staff WHERE deleted_at IS NULL),
		       (SELECT count(*) FROM students WHERE deleted_at IS NULL),
		       (SELECT count(*) FROM invitations WHERE status = 'pending'),
		       coalesce((SELECT (settings ->> 'setupDone')::boolean FROM orgs), false),
		       (SELECT count(*) FROM assessments WHERE deleted_at IS NULL),
		       (SELECT count(*) FROM (SELECT 1 FROM evidence WHERE state <> 'pending' LIMIT 10000) e),
		       (SELECT count(*) FROM schemes WHERE status = 'published' AND deleted_at IS NULL),
		       (SELECT count(*) FROM (SELECT 1 FROM computed_results WHERE component_code = '_subject' AND state = 'complete' LIMIT 10000) r),
		       (SELECT count(*) FROM report_runs),
		       (SELECT count(*) FROM papers WHERE status = 'final'),
		       (SELECT count(*) FROM paper_assignments)`).
		Scan(&s.Years, &s.Periods, &s.Levels, &s.Sections, &s.Subjects, &s.LevelSubjects, &s.Staff, &s.Students, &s.Invitations, &s.Done,
			&s.Assessments, &s.Marks, &s.Schemes, &s.Results, &s.Reports, &s.Papers, &s.Assigned)
	return s, err
}

// Counts are not sensitive, so any member may see them. Beyond setup they
// say how far the year has come, for the next step on every screen.
func status(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	s, err := load(c.Context(), tx)
	if err != nil {
		return err
	}
	return c.JSON(s)
}

func complete(c fiber.Ctx) error {
	m, _ := tenant.MemberFrom(c)
	if err := policy.Check(m.Actor(), policy.StructureWrite, policy.Target{}); err != nil {
		return err
	}
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(c.Context(), `UPDATE orgs SET settings = settings || '{"setupDone": true}'::jsonb WHERE id = $1`, m.OrgID); err != nil {
		return err
	}
	s, err := load(c.Context(), tx)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "setup", After: map[string]any{"done": true}}); err != nil {
		return err
	}
	return c.JSON(s)
}
