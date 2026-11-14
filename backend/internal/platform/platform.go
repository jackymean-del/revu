// Package platform serves the platform owner's console and the group pages
// (blueprint Parts 49, 56 and 77).
//
// The owner is a verified address in PLATFORM_OWNER_EMAILS, as the sign-in
// service reports it, never as the browser says. The owner creates
// institutions and invites their first administrator, forms groups and names
// their administrators. The owner sees each institution's name, type,
// administrators and counts, and nothing inside it: no student, staff
// member, mark or remark (Part 70.1, Part 77: Bhusku staff see nothing).
//
// A group administrator sees the status counts of the group's institutions,
// and opens one only where they also belong to it.
//
// These pages read across institutions, so they use the owner account (Deps
// in server); every query here returns names and counts only.
package platform

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"sync"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/auth"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/seed"
)

// Options is what the pages need: the owner account, sign-in, the
// directory of verified addresses, the owners' addresses and the app's URL.
type Options struct {
	Owner     *pgxpool.Pool
	Auth      auth.Authenticator
	Directory auth.Directory
	Owners    []string
	AppURL    string
	// DemoSuffix is added to the names of the sample institutions and their
	// group; empty outside tests, which get their own copies with it.
	DemoSuffix string
}

// Person is who is asking: their sign-in id and verified addresses.
type Person struct {
	User   string
	Emails []string
}

// Who reads the signed-in person and their verified addresses.
func Who(c fiber.Ctx, o Options) (Person, error) {
	user, err := o.Auth.UserID(c)
	if err != nil {
		return Person{}, err
	}
	p := Person{User: user}
	if o.Directory != nil {
		emails, err := o.Directory.VerifiedEmails(c.Context(), user)
		if err != nil {
			slog.Warn("could not read verified emails", "err", err)
		}
		for _, e := range emails {
			p.Emails = append(p.Emails, strings.ToLower(e))
		}
	}
	return p, nil
}

// IsOwner says whether one of the person's verified addresses runs the platform.
func IsOwner(p Person, owners []string) bool {
	for _, e := range p.Emails {
		if slices.Contains(owners, e) {
			return true
		}
	}
	return false
}

// GroupsOf lists the groups whose administrators include one of the addresses.
func GroupsOf(ctx context.Context, owner *pgxpool.Pool, emails []string) ([]api.GroupRef, error) {
	out := []api.GroupRef{}
	if owner == nil || len(emails) == 0 {
		return out, nil
	}
	rows, err := owner.Query(ctx, `
		SELECT DISTINCT g.id::text, g.name FROM groups g JOIN group_admins a ON a.group_id = g.id
		 WHERE a.email = ANY($1) ORDER BY g.name`, emails)
	if err != nil {
		return nil, err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (g api.GroupRef, err error) { return g, r.Scan(&g.Id, &g.Name) })
	if list == nil {
		list = out
	}
	return list, err
}

var (
	errNotOwner    = problem.New(http.StatusForbidden, "owner.forbidden", "Only the platform owner can do this.")
	errUnavailable = problem.New(http.StatusServiceUnavailable, "owner.unavailable", "The owner pages need the owner database account on this server.")
	errNoGroup     = problem.New(http.StatusNotFound, "group.not_found", "No group has this id.")
)

// Routes serves the owner console and the group pages.
func Routes(g fiber.Router, o Options) {
	owner := g.Group("/owner", func(c fiber.Ctx) error {
		if o.Owner == nil {
			return errUnavailable
		}
		p, err := Who(c, o)
		if err != nil {
			return err
		}
		if !IsOwner(p, o.Owners) {
			return errNotOwner
		}
		c.Locals(personKey, p)
		return c.Next()
	})
	owner.Get("/orgs", o.listOrgs)
	owner.Post("/orgs", o.createOrg)
	owner.Get("/groups", o.listGroups)
	owner.Post("/groups", o.createGroup)
	owner.Put("/groups/:id/members/:orgId", o.addMember)
	owner.Delete("/groups/:id/members/:orgId", o.removeMember)
	owner.Post("/groups/:id/admins", o.addAdmin)
	owner.Delete("/groups/:id/admins", o.removeAdmin)
	owner.Post("/demo", o.demo)
	owner.Get("/demo", o.getDemo)
	owner.Get("/access", access)
	g.Get("/groups", o.myGroups)
}

type key int

const personKey key = iota

func person(c fiber.Ctx) Person { p, _ := c.Locals(personKey).(Person); return p }

// record writes what the owner did to the platform's own log.
func record(ctx context.Context, tx pgx.Tx, actor, action, entity, id string, detail map[string]any) error {
	_, err := tx.Exec(ctx, `INSERT INTO platform_audit (actor, action, entity, entity_id, detail) VALUES ($1, $2, $3, nullif($4, ''), $5)`, actor, action, entity, id, detail)
	return err
}

func (o Options) listOrgs(c fiber.Ctx) error {
	rows, err := o.Owner.Query(c.Context(), `
		SELECT o.id::text, o.name, o.institution_type::text, o.preset, to_char(o.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       coalesce(g.id::text, ''), coalesce(g.name, ''),
		       (SELECT count(DISTINCT clerk_user_id) FROM memberships m WHERE m.org_id = o.id AND m.role = 'admin')::int,
		       coalesce((SELECT array_agg(email ORDER BY email) FROM invitations i WHERE i.org_id = o.id AND i.role = 'admin' AND i.status = 'pending'), '{}'),
		       (SELECT count(*) FROM students s WHERE s.org_id = o.id AND s.deleted_at IS NULL)::int,
		       (SELECT count(*) FROM staff s WHERE s.org_id = o.id AND s.deleted_at IS NULL)::int,
		       coalesce(o.external_id LIKE 'demo-%', false)
		  FROM orgs o
		  LEFT JOIN group_members gm ON gm.org_id = o.id
		  LEFT JOIN groups g ON g.id = gm.group_id
		 ORDER BY lower(o.name)`)
	if err != nil {
		return err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (x api.OwnerOrg, err error) {
		return x, r.Scan(&x.Id, &x.Name, &x.Type, &x.Preset, &x.CreatedAt, &x.GroupId, &x.GroupName, &x.Admins, &x.PendingAdmins, &x.Students, &x.Staff, &x.Demo)
	})
	if err != nil {
		return err
	}
	if list == nil {
		list = []api.OwnerOrg{}
	}
	return c.JSON(list)
}

func validEmail(s string) bool {
	at := strings.Index(s, "@")
	return at > 0 && strings.Contains(s[at+1:], ".") && !strings.ContainsAny(s, " <>,;")
}

func (o Options) createOrg(c fiber.Ctx) error {
	var in api.OwnerOrgInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	in.Name, in.AdminEmail = strings.TrimSpace(in.Name), strings.ToLower(strings.TrimSpace(in.AdminEmail))
	var f []api.FieldError
	if in.Name == "" || len([]rune(in.Name)) > 160 {
		f = append(f, api.FieldError{Field: "name", Code: "required", Message: "Give the institution a name."})
	}
	if in.Type != "school" && in.Type != "college" && in.Type != "university" {
		f = append(f, api.FieldError{Field: "type", Code: "unknown", Message: "Choose school, college or university."})
	}
	if !validEmail(in.AdminEmail) {
		f = append(f, api.FieldError{Field: "adminEmail", Code: "email", Message: "Enter the administrator's email address."})
	}
	if len(f) > 0 {
		return problem.Invalid(f...)
	}
	ctx := c.Context()
	orgID, invID, err := seed.CreateOrg(ctx, o.Owner, in.Name, string(in.Type), in.AdminEmail)
	if err != nil {
		return err
	}
	out := api.OwnerOrgCreated{OrgId: orgID}
	if o.Directory != nil {
		if err := o.Directory.Invite(ctx, in.AdminEmail, o.AppURL); err != nil {
			slog.Warn("invitation email not sent; the administrator can still sign in with this address", "err", err)
		} else if err := seed.MarkSent(ctx, o.Owner, invID); err != nil {
			return err
		} else {
			out.Emailed = true
		}
	}
	if err := pgx.BeginFunc(ctx, o.Owner, func(tx pgx.Tx) error {
		return record(ctx, tx, person(c).User, "create", "orgs", orgID, map[string]any{"name": in.Name, "type": in.Type, "admin": in.AdminEmail})
	}); err != nil {
		return err
	}
	return c.Status(http.StatusCreated).JSON(out)
}

func loadGroup(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, id string) (api.OwnerGroup, error) {
	g := api.OwnerGroup{Admins: []string{}, OrgIds: []string{}}
	err := q.QueryRow(ctx, `
		SELECT g.id::text, g.name,
		       coalesce((SELECT array_agg(email ORDER BY email) FROM group_admins WHERE group_id = g.id), '{}'),
		       coalesce((SELECT array_agg(org_id::text ORDER BY org_id) FROM group_members WHERE group_id = g.id), '{}')
		  FROM groups g WHERE g.id::text = $1`, id).Scan(&g.Id, &g.Name, &g.Admins, &g.OrgIds)
	if errors.Is(err, pgx.ErrNoRows) {
		return g, errNoGroup
	}
	return g, err
}

func (o Options) listGroups(c fiber.Ctx) error {
	rows, err := o.Owner.Query(c.Context(), `SELECT id::text FROM groups ORDER BY lower(name)`)
	if err != nil {
		return err
	}
	ids, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	out := []api.OwnerGroup{}
	for _, id := range ids {
		g, err := loadGroup(c.Context(), o.Owner, id)
		if err != nil {
			return err
		}
		out = append(out, g)
	}
	return c.JSON(out)
}

// change runs one owner change to a group in a transaction, audits it and
// answers with the group as it now is.
func (o Options) change(c fiber.Ctx, id, action string, detail map[string]any, work func(ctx context.Context, tx pgx.Tx) error) error {
	ctx := c.Context()
	var out api.OwnerGroup
	err := pgx.BeginFunc(ctx, o.Owner, func(tx pgx.Tx) error {
		if _, err := loadGroup(ctx, tx, id); err != nil {
			return err
		}
		if err := work(ctx, tx); err != nil {
			return err
		}
		if err := record(ctx, tx, person(c).User, action, "groups", id, detail); err != nil {
			return err
		}
		var err error
		out, err = loadGroup(ctx, tx, id)
		return err
	})
	if err != nil {
		return err
	}
	return c.JSON(out)
}

func (o Options) createGroup(c fiber.Ctx) error {
	var in api.GroupInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	in.Name = strings.TrimSpace(in.Name)
	if in.Name == "" || len([]rune(in.Name)) > 160 {
		return problem.Invalid(api.FieldError{Field: "name", Code: "required", Message: "Give the group a name."})
	}
	ctx := c.Context()
	var out api.OwnerGroup
	err := pgx.BeginFunc(ctx, o.Owner, func(tx pgx.Tx) error {
		var id string
		err := tx.QueryRow(ctx, `INSERT INTO groups (name, created_by) VALUES ($1, $2) ON CONFLICT (lower(name)) DO NOTHING RETURNING id::text`, in.Name, person(c).User).Scan(&id)
		if errors.Is(err, pgx.ErrNoRows) {
			return problem.New(http.StatusConflict, "group.name_taken", "A group already has this name.")
		}
		if err != nil {
			return err
		}
		if err := record(ctx, tx, person(c).User, "create", "groups", id, map[string]any{"name": in.Name}); err != nil {
			return err
		}
		out, err = loadGroup(ctx, tx, id)
		return err
	})
	if err != nil {
		return err
	}
	return c.Status(http.StatusCreated).JSON(out)
}

func (o Options) addMember(c fiber.Ctx) error {
	id, org := c.Params("id"), c.Params("orgId")
	return o.change(c, id, "add_member", map[string]any{"orgId": org}, func(ctx context.Context, tx pgx.Tx) error {
		tag, err := tx.Exec(ctx, `
			INSERT INTO group_members (org_id, group_id, added_by) SELECT o.id, $2::uuid, $3 FROM orgs o WHERE o.id::text = $1
			ON CONFLICT (org_id) DO UPDATE SET group_id = EXCLUDED.group_id, added_by = EXCLUDED.added_by, added_at = now()`, org, id, person(c).User)
		if err == nil && tag.RowsAffected() == 0 {
			return problem.New(http.StatusNotFound, "org.not_found", "No institution has this id.")
		}
		return err
	})
}

func (o Options) removeMember(c fiber.Ctx) error {
	id, org := c.Params("id"), c.Params("orgId")
	return o.change(c, id, "remove_member", map[string]any{"orgId": org}, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `DELETE FROM group_members WHERE group_id::text = $1 AND org_id::text = $2`, id, org)
		return err
	})
}

func (o Options) addAdmin(c fiber.Ctx) error {
	var in api.GroupAdminInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	email := strings.ToLower(strings.TrimSpace(in.Email))
	if !validEmail(email) {
		return problem.Invalid(api.FieldError{Field: "email", Code: "email", Message: "Enter the group administrator's email address."})
	}
	id := c.Params("id")
	return o.change(c, id, "add_admin", map[string]any{"email": email}, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `INSERT INTO group_admins (group_id, email, added_by) VALUES ($1::uuid, $2, $3) ON CONFLICT DO NOTHING`, id, email, person(c).User)
		return err
	})
}

func (o Options) removeAdmin(c fiber.Ctx) error {
	id, email := c.Params("id"), strings.ToLower(strings.TrimSpace(c.Query("email")))
	return o.change(c, id, "remove_admin", map[string]any{"email": email}, func(ctx context.Context, tx pgx.Tx) error {
		_, err := tx.Exec(ctx, `DELETE FROM group_admins WHERE group_id::text = $1 AND email = $2`, id, email)
		return err
	})
}

// access is the permission matrix exactly as the server enforces it.
func access(c fiber.Ctx) error {
	out := api.AccessMatrix{Roles: []string{}, Rows: []api.AccessRow{}}
	for _, r := range policy.Roles {
		out.Roles = append(out.Roles, string(r))
	}
	for _, a := range policy.Actions {
		row := api.AccessRow{Action: string(a)}
		for _, r := range policy.Roles {
			row.Rules = append(row.Rules, api.AccessRowRules(policy.Matrix[a][r].String()))
		}
		out.Rows = append(out.Rows, row)
	}
	return c.JSON(out)
}

// demoLoad is the one load of the sample institutions that may run at a
// time, and how the last one ended. It lives with the server process: a
// restart forgets it, and the next load picks up where the data stands.
var demoLoad struct {
	sync.Mutex
	status string // "", loading, done or failed
	detail string
}

func demoStatus() api.DemoStatus {
	demoLoad.Lock()
	defer demoLoad.Unlock()
	st := demoLoad.status
	if st == "" {
		st = "idle"
	}
	return api.DemoStatus{Status: api.DemoStatusStatus(st), Detail: demoLoad.detail}
}

func (o Options) getDemo(c fiber.Ctx) error { return c.JSON(demoStatus()) }

// demo gives the owner the sample institutions, with every role there, in a
// demo group they administer, so each view can be previewed honestly. One
// of them is a whole school with a term's work done: every subject with its
// chapters, learning outcomes, competencies and question bank, papers made
// and given out, marks entered, results worked out and reports made.
//
// That is thousands of rows, so it loads in the background and this answers
// at once; the status says when it is done. Loading again adds only what is
// missing.
func (o Options) demo(c fiber.Ctx) error {
	ctx := c.Context()
	p := person(c)
	var id string
	err := pgx.BeginFunc(ctx, o.Owner, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `
			INSERT INTO groups (name, created_by) VALUES ($2, $1)
			ON CONFLICT (lower(name)) DO UPDATE SET name = groups.name RETURNING id::text`, p.User, "Demo group"+o.DemoSuffix).Scan(&id); err != nil {
			return err
		}
		for _, e := range p.Emails {
			if _, err := tx.Exec(ctx, `INSERT INTO group_admins (group_id, email, added_by) VALUES ($1::uuid, $2, $3) ON CONFLICT DO NOTHING`, id, e, p.User); err != nil {
				return err
			}
		}
		return record(ctx, tx, p.User, "demo", "groups", id, map[string]any{"institutions": len(seed.Demos)})
	})
	if err != nil {
		return err
	}
	demoLoad.Lock()
	start := demoLoad.status != "loading"
	if start {
		demoLoad.status, demoLoad.detail = "loading", ""
	}
	demoLoad.Unlock()
	if start {
		go o.loadDemo(p.User, id)
	}
	return c.Status(http.StatusAccepted).JSON(demoStatus())
}

// loadDemo seeds the sample institutions, puts each in the demo group as it
// is ready, and makes the reports of those with a term's work.
func (o Options) loadDemo(user, group string) {
	ctx := context.Background()
	err := func() (err error) {
		defer func() {
			if r := recover(); r != nil {
				err = errors.New("the load stopped unexpectedly")
				slog.Error("demo load panicked", "panic", r)
			}
		}()
		results, err := seed.RunWith(ctx, o.Owner, user, o.DemoSuffix)
		for _, r := range results {
			if _, e := o.Owner.Exec(ctx, `
				INSERT INTO group_members (org_id, group_id, added_by) VALUES ($1::uuid, $2::uuid, $3)
				ON CONFLICT (org_id) DO UPDATE SET group_id = EXCLUDED.group_id`, r.OrgID, group, user); e != nil && err == nil {
				err = e
			}
		}
		if err != nil {
			return err
		}
		for i, d := range seed.Demos {
			if d.Exams && i < len(results) {
				if err := seed.GenerateReports(ctx, o.Owner, results[i].OrgID); err != nil {
					return err
				}
			}
		}
		return nil
	}()
	demoLoad.Lock()
	defer demoLoad.Unlock()
	if err != nil {
		slog.Error("demo load failed", "err", err)
		demoLoad.status, demoLoad.detail = "failed", "The sample institutions did not finish loading. Load them again to carry on from where it stopped."
		return
	}
	demoLoad.status = "done"
}

// myGroups answers a group administrator with status counts per institution.
func (o Options) myGroups(c fiber.Ctx) error {
	if o.Owner == nil {
		return c.JSON([]api.MyGroup{})
	}
	p, err := Who(c, o)
	if err != nil {
		return err
	}
	ctx := c.Context()
	refs, err := GroupsOf(ctx, o.Owner, p.Emails)
	if err != nil {
		return err
	}
	out := []api.MyGroup{}
	for _, ref := range refs {
		rows, err := o.Owner.Query(ctx, `
			SELECT o.id::text, o.name, o.institution_type::text,
			       EXISTS (SELECT 1 FROM memberships m WHERE m.org_id = o.id AND m.clerk_user_id = $2),
			       (SELECT count(*) FROM students s WHERE s.org_id = o.id AND s.deleted_at IS NULL AND s.status = 'active')::int,
			       (SELECT count(*) FROM sections s JOIN academic_years y ON y.id = s.year_id
			         WHERE s.org_id = o.id AND s.deleted_at IS NULL AND current_date BETWEEN y.starts_on AND y.ends_on)::int,
			       (SELECT count(*) FROM assessments a WHERE a.org_id = o.id AND a.deleted_at IS NULL AND a.status = 'open')::int,
			       (SELECT count(*) FROM evidence e WHERE e.org_id = o.id AND e.state <> 'pending')::int
			  FROM group_members gm JOIN orgs o ON o.id = gm.org_id
			 WHERE gm.group_id::text = $1 ORDER BY lower(o.name)`, ref.Id, p.User)
		if err != nil {
			return err
		}
		list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (x api.GroupInstitution, err error) {
			return x, r.Scan(&x.Id, &x.Name, &x.Type, &x.Member, &x.Students, &x.Sections, &x.Assessments, &x.MarksEntered)
		})
		if err != nil {
			return err
		}
		if list == nil {
			list = []api.GroupInstitution{}
		}
		out = append(out, api.MyGroup{Id: ref.Id, Name: ref.Name, Institutions: list})
	}
	return c.JSON(out)
}
