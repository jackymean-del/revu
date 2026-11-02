// Package dashboard builds each person's home tiles (blueprint Part 76.3):
// at most six, exceptions first, each a number with a status, and the list
// behind the number for those who may see it (Part 77). A tile's number is
// the length of its list, computed by the same query, so the two can never
// disagree (AT-DB-01). Tiles for marks, papers and reports join as those
// arrive; each is one entry in the table below.
package dashboard

import (
	"context"
	"errors"
	"net/http"
	"slices"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Routes serves the tiles and the list behind each.
func Routes(g fiber.Router) {
	g.Get("/dashboard", tiles)
	g.Get("/dashboard/:key", list)
}

const maxTiles = 6

// scope is what a tile counts within: the year under way, the person, and
// for a person whose role covers some branches only, those branches.
type scope struct {
	year     string   // "" before any year exists
	staffID  string   // "" when the person has no linked staff record
	branches []string // nil for the whole organisation
}

type kind int

const (
	exception kind = iota // attention when there is anything, ok when there is nothing
	total                 // a plain count
)

type tile struct {
	key   string
	kind  kind
	roles []string // who gets the tile
	// needsStaff: the tile is about the person's own classes.
	needsStaff bool
	// wholeOrg: the tile counts what belongs to no branch, so only roles
	// over the whole organisation get it.
	wholeOrg bool
	// sql returns id, title, detail, from @year, @staff and @branches.
	sql string
}

// sectionName reads as "Grade 6 A".
const sectionName = `(SELECT l.name || ' ' || s.name FROM levels l WHERE l.id = s.level_id)`

// Branch limits for section s and student st, and the person's sections.
const (
	sectionInBranch = `(@branches::uuid[] IS NULL OR s.branch_id = ANY(@branches::uuid[]))`
	studentInBranch = `(@branches::uuid[] IS NULL OR EXISTS (
		SELECT 1 FROM enrolments e JOIN sections s ON s.id = e.section_id AND s.deleted_at IS NULL
		 WHERE e.student_id = st.id AND e.deleted_at IS NULL AND e.year_id::text = @year AND s.branch_id = ANY(@branches::uuid[])))`
	mine = `(SELECT section_id FROM teaching_assignments WHERE staff_id::text = @staff AND deleted_at IS NULL`
)

var leaders = []string{"admin", "principal", "coordinator"}

// noChoice lists students below a subject group's minimum on today, kept
// inside the year (Part 74.1), with the groups they still have to choose
// for. The middle part limits which sections count.
const (
	noChoiceHead = `
		SELECT st.id::text, st.name, string_agg(g.name, ', ' ORDER BY g.name)
		  FROM enrolments e
		  JOIN students st ON st.id = e.student_id AND st.deleted_at IS NULL AND st.status = 'active'
		  JOIN sections s ON s.id = e.section_id AND s.deleted_at IS NULL
		  JOIN academic_years y ON y.id = e.year_id
		  JOIN subject_groups g ON g.level_id = s.level_id AND g.deleted_at IS NULL AND g.min_choices > 0
		 WHERE e.year_id::text = @year AND e.deleted_at IS NULL AND `
	noChoiceTail = `
		   AND (SELECT count(*) FROM student_subject_choices c
		          JOIN subject_group_options o ON o.group_id = c.group_id AND o.subject_id = c.subject_id AND o.deleted_at IS NULL
		         WHERE c.student_id = st.id AND c.group_id = g.id AND c.year_id = y.id
		           AND c.effective_from <= greatest(least(current_date, y.ends_on), y.starts_on)
		           AND (c.effective_to IS NULL OR c.effective_to >= greatest(least(current_date, y.ends_on), y.starts_on))) < g.min_choices
		 GROUP BY st.id, st.name
		 ORDER BY lower(st.name)`
)

var all = []tile{
	{key: "my_classes", kind: total, roles: []string{"teacher", "class_teacher"}, needsStaff: true, sql: `
		SELECT a.id::text, ` + sectionName + `, coalesce(sub.name, '')
		  FROM teaching_assignments a
		  JOIN sections s ON s.id = a.section_id AND s.deleted_at IS NULL AND s.year_id::text = @year
		  LEFT JOIN subjects sub ON sub.id = a.subject_id
		 WHERE a.staff_id::text = @staff AND a.deleted_at IS NULL
		 ORDER BY (SELECT seq FROM levels WHERE id = s.level_id), lower(s.name), sub.name NULLS FIRST`},
	{key: "my_students", kind: total, roles: []string{"teacher", "class_teacher"}, needsStaff: true, sql: `
		SELECT id, name, section FROM (
		  SELECT DISTINCT ON (st.id) st.id::text AS id, st.name, ` + sectionName + ` AS section
		    FROM enrolments e
		    JOIN students st ON st.id = e.student_id AND st.deleted_at IS NULL AND st.status = 'active'
		    JOIN sections s ON s.id = e.section_id AND s.deleted_at IS NULL
		   WHERE e.year_id::text = @year AND e.deleted_at IS NULL AND e.section_id IN ` + mine + `)
		   ORDER BY st.id) x
		 ORDER BY lower(name)`},
	{key: "my_class_no_contact", kind: exception, roles: []string{"class_teacher"}, needsStaff: true, sql: `
		SELECT st.id::text, st.name, ` + sectionName + `
		  FROM enrolments e
		  JOIN students st ON st.id = e.student_id AND st.deleted_at IS NULL AND st.status = 'active'
		  JOIN sections s ON s.id = e.section_id AND s.deleted_at IS NULL
		 WHERE e.year_id::text = @year AND e.deleted_at IS NULL AND e.section_id IN ` + mine + ` AND subject_id IS NULL)
		   AND NOT EXISTS (SELECT 1 FROM guardians g WHERE g.student_id = st.id AND g.deleted_at IS NULL)
		 ORDER BY lower(st.name)`},
	{key: "my_class_no_choice", kind: exception, roles: []string{"class_teacher"}, needsStaff: true,
		sql: noChoiceHead + `e.section_id IN ` + mine + ` AND subject_id IS NULL)` + noChoiceTail},
	{key: "missing_setup", kind: exception, roles: leaders, wholeOrg: true, sql: `
		SELECT k, k, '' FROM (VALUES
		  (1, 'years', (SELECT count(*) FROM academic_years WHERE deleted_at IS NULL)),
		  (2, 'periods', (SELECT count(*) FROM periods WHERE deleted_at IS NULL AND year_id::text = @year)),
		  (3, 'levels', (SELECT count(*) FROM levels WHERE deleted_at IS NULL)),
		  (4, 'sections', (SELECT count(*) FROM sections WHERE deleted_at IS NULL AND year_id::text = @year)),
		  (5, 'subjects', (SELECT count(*) FROM subjects WHERE deleted_at IS NULL)),
		  (6, 'level_subjects', (SELECT count(*) FROM level_subjects WHERE deleted_at IS NULL))
		) AS c(i, k, n) WHERE n = 0 ORDER BY i`},
	{key: "unplaced_students", kind: exception, roles: leaders, wholeOrg: true, sql: `
		SELECT st.id::text, st.name, st.admission_no
		  FROM students st
		 WHERE st.deleted_at IS NULL AND st.status = 'active'
		   AND NOT EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = st.id AND e.deleted_at IS NULL AND e.year_id::text = @year)
		 ORDER BY lower(st.name)`},
	{key: "no_contact", kind: exception, roles: leaders, sql: `
		SELECT st.id::text, st.name, st.admission_no
		  FROM students st
		 WHERE st.deleted_at IS NULL AND st.status = 'active' AND ` + studentInBranch + `
		   AND NOT EXISTS (SELECT 1 FROM guardians g WHERE g.student_id = st.id AND g.deleted_at IS NULL)
		 ORDER BY lower(st.name)`},
	{key: "missing_choices", kind: exception, roles: leaders, sql: noChoiceHead + sectionInBranch + noChoiceTail},
	{key: "no_class_teacher", kind: exception, roles: leaders, sql: `
		SELECT s.id::text, ` + sectionName + `, ''
		  FROM sections s
		 WHERE s.deleted_at IS NULL AND s.year_id::text = @year AND ` + sectionInBranch + `
		   AND NOT EXISTS (SELECT 1 FROM teaching_assignments a WHERE a.section_id = s.id AND a.subject_id IS NULL AND a.deleted_at IS NULL)
		 ORDER BY (SELECT seq FROM levels WHERE id = s.level_id), lower(s.name)`},
	{key: "open_invitations", kind: total, roles: []string{"admin"}, sql: `
		SELECT id::text, email, role::text FROM invitations
		 WHERE status = 'pending' AND (@branches::uuid[] IS NULL OR branch_id = ANY(@branches::uuid[]))
		 ORDER BY created_at`},
	{key: "staff_without_sign_in", kind: total, roles: []string{"admin"}, wholeOrg: true, sql: `
		SELECT s.id::text, s.name, coalesce(s.email, '')
		  FROM staff s
		 WHERE s.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM memberships m WHERE m.staff_id = s.id)
		 ORDER BY lower(s.name)`},
	{key: "total_students", kind: total, roles: []string{"viewer"}, sql: `
		SELECT st.id::text, st.name, '' FROM students st
		 WHERE st.deleted_at IS NULL AND st.status = 'active' AND ` + studentInBranch + `
		 ORDER BY lower(st.name)`},
	{key: "total_sections", kind: total, roles: []string{"viewer"}, sql: `
		SELECT s.id::text, ` + sectionName + `, '' FROM sections s
		 WHERE s.deleted_at IS NULL AND s.year_id::text = @year AND ` + sectionInBranch + `
		 ORDER BY (SELECT seq FROM levels WHERE id = s.level_id), lower(s.name)`},
}

// listable says who may open the list behind a number: view-only sees
// counts and status only (Part 77).
func listable(m tenant.Member) bool {
	for _, r := range m.Roles {
		if r.Name != "viewer" {
			return true
		}
	}
	return false
}

// reach is where the person holds one of the roles: the whole organisation,
// some branches, or nowhere.
func reach(m tenant.Member, roles []string) (held, whole bool, branches []string) {
	for _, r := range m.Roles {
		if !slices.Contains(roles, r.Name) {
			continue
		}
		held = true
		if r.BranchID == "" {
			whole = true
		} else {
			branches = append(branches, r.BranchID)
		}
	}
	return held, whole, branches
}

// staffOf is the person's linked staff record, if any.
func staffOf(ctx context.Context, tx pgx.Tx, user string) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `SELECT coalesce(staff_id::text, '') FROM memberships WHERE clerk_user_id = $1 AND staff_id IS NOT NULL LIMIT 1`, user).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return id, err
}

// currentYear is the year that includes today, or else the latest one.
func currentYear(ctx context.Context, tx pgx.Tx) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `
		SELECT id::text FROM academic_years WHERE deleted_at IS NULL
		 ORDER BY (current_date BETWEEN starts_on AND ends_on) DESC, starts_on DESC LIMIT 1`).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", nil
	}
	return id, err
}

// load reads the year and the person; each tile adds its branches.
func load(c fiber.Ctx) (pgx.Tx, tenant.Member, scope, error) {
	tx, err := tenant.Tx(c)
	if err != nil {
		return nil, tenant.Member{}, scope{}, err
	}
	m, _ := tenant.MemberFrom(c)
	var s scope
	if s.year, err = currentYear(c.Context(), tx); err != nil {
		return nil, m, s, err
	}
	s.staffID, err = staffOf(c.Context(), tx, m.UserID)
	return tx, m, s, err
}

// within says whether the person gets the tile, and the scope it counts in.
func (t tile) within(m tenant.Member, s scope) (scope, bool) {
	held, whole, branches := reach(m, t.roles)
	switch {
	case !held, t.needsStaff && s.staffID == "", t.wholeOrg && !whole:
		return s, false
	case !whole:
		s.branches = branches
	}
	return s, true
}

func rows(ctx context.Context, tx pgx.Tx, t tile, s scope) ([]api.DashboardRow, error) {
	r, err := tx.Query(ctx, t.sql, pgx.NamedArgs{"year": s.year, "staff": s.staffID, "branches": s.branches})
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(r, func(row pgx.CollectableRow) (api.DashboardRow, error) {
		var d api.DashboardRow
		return d, row.Scan(&d.Id, &d.Title, &d.Detail)
	})
	if list == nil {
		list = []api.DashboardRow{}
	}
	return list, err
}

func tiles(c fiber.Ctx) error {
	tx, m, s, err := load(c)
	if err != nil {
		return err
	}
	var out []api.Tile
	for _, t := range all {
		in, ok := t.within(m, s)
		if !ok {
			continue
		}
		list, err := rows(c.Context(), tx, t, in)
		if err != nil {
			return err
		}
		status := "info"
		if t.kind == exception {
			status = "ok"
			if len(list) > 0 {
				status = "attention"
			}
		}
		out = append(out, api.Tile{Key: t.key, Count: len(list), Status: api.TileStatus(status), Listable: listable(m)})
	}
	// Exceptions that need doing first, then totals, then what is in order.
	rank := map[api.TileStatus]int{"attention": 0, "info": 1, "ok": 2}
	slices.SortStableFunc(out, func(a, b api.Tile) int { return rank[a.Status] - rank[b.Status] })
	if len(out) > maxTiles {
		out = out[:maxTiles]
	}
	if out == nil {
		out = []api.Tile{}
	}
	return c.JSON(api.Dashboard{YearId: s.year, Tiles: out})
}

var errUnknown = problem.New(http.StatusNotFound, "dashboard.unknown", "There is no such tile for you.")

func list(c fiber.Ctx) error {
	tx, m, s, err := load(c)
	if err != nil {
		return err
	}
	i := slices.IndexFunc(all, func(t tile) bool { return t.key == c.Params("key") })
	if i < 0 {
		return errUnknown
	}
	in, ok := all[i].within(m, s)
	if !ok {
		return errUnknown
	}
	if !listable(m) {
		return problem.New(http.StatusForbidden, "auth.forbidden", "Your role sees the number, not the list behind it.")
	}
	r, err := rows(c.Context(), tx, all[i], in)
	if err != nil {
		return err
	}
	return c.JSON(api.DashboardList{Key: all[i].key, Rows: r})
}
