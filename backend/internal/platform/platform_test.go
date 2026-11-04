package platform_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/server"
)

type headerAuth struct{}

func (headerAuth) UserID(c fiber.Ctx) (string, error) { return c.Get("X-Test-User"), nil }

type directory struct {
	verified map[string][]string
	sent     []string
}

func (d *directory) VerifiedEmails(_ context.Context, user string) ([]string, error) {
	return d.verified[user], nil
}

func (d *directory) Invite(_ context.Context, email, _ string) error {
	d.sent = append(d.sent, email)
	return nil
}

type caller struct {
	t                 *testing.T
	app               *fiber.App
	user, org, viewAs string
}

func (c caller) do(code int, method, path string, body any) []byte {
	c.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", c.user)
	if c.org != "" {
		req.Header.Set("X-Org-Id", c.org)
	}
	if c.viewAs != "" {
		req.Header.Set("X-View-As", c.viewAs)
	}
	res, err := c.app.Test(req, fiber.TestConfig{Timeout: 0})
	if err != nil {
		c.t.Fatal(err)
	}
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode != code {
		c.t.Fatalf("%s %s as %s: status %d, want %d: %s", method, path, c.user, res.StatusCode, code, b)
	}
	return b
}

func into[T any](b []byte) T {
	var v T
	_ = json.Unmarshal(b, &v)
	return v
}

func code(b []byte) string { return into[api.Problem](b).Code }

func TestPlatform(t *testing.T) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	b := dbtest.SeedOrg(t, owner, "Org B")
	ctx := context.Background()
	r := make([]byte, 4)
	_, _ = rand.Read(r)
	tag := hex.EncodeToString(r)
	boss, head, newAdmin := "owner@bhusku.test", "head-"+tag+"@group.test", "admin-"+tag+"@client.test"
	dir := &directory{verified: map[string][]string{
		"user_boss_" + tag: {boss}, "user_head_" + tag: {head}, "user_new_" + tag: {newAdmin}, a.UserID: {"asha-" + tag + "@a.test"},
	}}
	app := server.New(config.Config{Version: "test", PlatformOwners: []string{boss}, AppURL: "https://revu.test"},
		server.Deps{DB: appPool, Owner: owner, Auth: headerAuth{}, Directory: dir})
	as := func(user string) caller { return caller{t: t, app: app, user: user} }
	ownerC, headC, newC, adminA := as("user_boss_"+tag), as("user_head_"+tag), as("user_new_"+tag), as(a.UserID)
	var made []string
	var groupID string
	t.Cleanup(func() {
		for _, id := range made {
			for _, table := range []string{"audit_log", "invitations", "memberships", "group_members", "branches"} {
				_, _ = owner.Exec(ctx, `DELETE FROM `+table+` WHERE org_id = $1`, id)
			}
			_, _ = owner.Exec(ctx, `DELETE FROM orgs WHERE id = $1`, id)
		}
		_, _ = owner.Exec(ctx, `DELETE FROM groups WHERE id::text = $1`, groupID)
		_, _ = owner.Exec(ctx, `DELETE FROM platform_audit WHERE actor = $1`, "user_boss_"+tag)
	})

	t.Run("only a verified owner address opens the console", func(t *testing.T) {
		if c := code(adminA.do(403, "GET", "/v1/owner/orgs", nil)); c != "owner.forbidden" {
			t.Fatalf("an institution's administrator: %q", c)
		}
		if me := into[api.Me](ownerC.do(200, "GET", "/v1/me", nil)); !me.PlatformOwner || len(me.Orgs) != 0 {
			t.Fatalf("owner me %+v", me)
		}
		if me := into[api.Me](adminA.do(200, "GET", "/v1/me", nil)); me.PlatformOwner {
			t.Fatal("an administrator is reported as owner")
		}
	})

	// Part 77: the owner sees names and counts, never a record inside.
	t.Run("the owner sees institutions by counts, nothing inside them", func(t *testing.T) {
		body := ownerC.do(200, "GET", "/v1/owner/orgs", nil)
		list := into[[]api.OwnerOrg](body)
		i := slices.IndexFunc(list, func(o api.OwnerOrg) bool { return o.Id == a.ID })
		if i < 0 || list[i].Students != 1 || list[i].Staff != 1 || list[i].Admins != 1 {
			t.Fatalf("Org A %+v", list)
		}
		for _, private := range []string{"Ravi Kumar", "Asha Rao", "Meena Kumar"} {
			if strings.Contains(string(body), private) {
				t.Fatalf("the owner's list shows %s", private)
			}
		}
		ownerC.org = a.ID
		ownerC.do(404, "GET", "/v1/dashboard", nil)
		ownerC.org = ""
	})

	t.Run("the owner creates an institution; its invited administrator gets it, the owner does not", func(t *testing.T) {
		if c := code(ownerC.do(422, "POST", "/v1/owner/orgs", api.OwnerOrgInput{Name: "Hill View " + tag, Type: "school", AdminEmail: "not an address"})); c != "validation.failed" {
			t.Fatalf("a bad address: %q", c)
		}
		created := into[api.OwnerOrgCreated](ownerC.do(201, "POST", "/v1/owner/orgs", api.OwnerOrgInput{Name: "Hill View " + tag, Type: "school", AdminEmail: " " + strings.ToUpper(newAdmin)}))
		made = append(made, created.OrgId)
		if !created.Emailed || !slices.Contains(dir.sent, newAdmin) {
			t.Fatalf("invitation %+v, sent %v", created, dir.sent)
		}
		list := into[[]api.OwnerOrg](ownerC.do(200, "GET", "/v1/owner/orgs", nil))
		i := slices.IndexFunc(list, func(o api.OwnerOrg) bool { return o.Id == created.OrgId })
		if i < 0 || !slices.Equal(list[i].PendingAdmins, []string{newAdmin}) {
			t.Fatalf("pending administrators %+v", list[i])
		}
		me := into[api.Me](newC.do(200, "GET", "/v1/me", nil))
		if len(me.Orgs) != 1 || me.Orgs[0].Id != created.OrgId || me.Orgs[0].Roles[0] != "admin" {
			t.Fatalf("the invited administrator %+v", me.Orgs)
		}
		if me := into[api.Me](ownerC.do(200, "GET", "/v1/me", nil)); len(me.Orgs) != 0 {
			t.Fatal("creating an institution gave the owner access to it")
		}
		var n int
		if err := owner.QueryRow(ctx, `SELECT count(*) FROM platform_audit WHERE actor = $1 AND entity_id = $2`, "user_boss_"+tag, created.OrgId).Scan(&n); err != nil || n != 1 {
			t.Fatalf("%d audit rows, %v", n, err)
		}
	})

	t.Run("a group names institutions; its administrator sees their counts", func(t *testing.T) {
		g := into[api.OwnerGroup](ownerC.do(201, "POST", "/v1/owner/groups", api.GroupInput{Name: "Riverside group " + tag}))
		groupID = g.Id
		if c := code(ownerC.do(409, "POST", "/v1/owner/groups", api.GroupInput{Name: "RIVERSIDE GROUP " + tag})); c != "group.name_taken" {
			t.Fatalf("a repeated name: %q", c)
		}
		ownerC.do(200, "PUT", "/v1/owner/groups/"+g.Id+"/members/"+a.ID, nil)
		ownerC.do(200, "PUT", "/v1/owner/groups/"+g.Id+"/members/"+b.ID, nil)
		g = into[api.OwnerGroup](ownerC.do(200, "POST", "/v1/owner/groups/"+g.Id+"/admins", api.GroupAdminInput{Email: head}))
		if len(g.OrgIds) != 2 || !slices.Equal(g.Admins, []string{head}) {
			t.Fatalf("group %+v", g)
		}
		if me := into[api.Me](headC.do(200, "GET", "/v1/me", nil)); len(me.Groups) != 1 || me.Groups[0].Id != g.Id || len(me.Orgs) != 0 {
			t.Fatalf("the group administrator %+v", me)
		}
		mine := into[[]api.MyGroup](headC.do(200, "GET", "/v1/groups", nil))
		if len(mine) != 1 || len(mine[0].Institutions) != 2 || mine[0].Institutions[0].Students != 1 || mine[0].Institutions[0].Member {
			t.Fatalf("group page %+v", mine)
		}
		// Status only: opening an institution needs a membership of it.
		headC.org = a.ID
		headC.do(404, "GET", "/v1/dashboard", nil)
		if got := into[[]api.MyGroup](adminA.do(200, "GET", "/v1/groups", nil)); len(got) != 0 {
			t.Fatalf("a person who administers no group sees %+v", got)
		}
		g = into[api.OwnerGroup](ownerC.do(200, "DELETE", "/v1/owner/groups/"+g.Id+"/members/"+b.ID, nil))
		if len(g.OrgIds) != 1 {
			t.Fatalf("after removing B %+v", g)
		}
		if c := code(adminA.do(403, "POST", "/v1/owner/groups", api.GroupInput{Name: "Mine"})); c != "owner.forbidden" {
			t.Fatalf("an administrator made a group: %q", c)
		}
	})

	t.Run("the owner reads the matrix the server enforces", func(t *testing.T) {
		m := into[api.AccessMatrix](ownerC.do(200, "GET", "/v1/owner/access", nil))
		teacher := slices.Index(m.Roles, "teacher")
		i := slices.IndexFunc(m.Rows, func(r api.AccessRow) bool { return r.Action == "evidence.enter" })
		if teacher < 0 || i < 0 || m.Rows[i].Rules[teacher] != "own_sections" || len(m.Rows[i].Rules) != len(m.Roles) {
			t.Fatalf("matrix %+v", m)
		}
		adminA.do(403, "GET", "/v1/owner/access", nil)
	})

	// Part 31: a permission preview, enforced by the server and read-only.
	t.Run("an administrator previews a role, honestly and without changing anything", func(t *testing.T) {
		admin := adminA
		admin.org = a.ID
		own := into[api.Dashboard](admin.do(200, "GET", "/v1/dashboard", nil))
		admin.viewAs = "viewer"
		viewer := into[api.Dashboard](admin.do(200, "GET", "/v1/dashboard", nil))
		keys := func(d api.Dashboard) (k []string) {
			for _, t := range d.Tiles {
				k = append(k, t.Key)
			}
			return k
		}
		if slices.Equal(keys(own), keys(viewer)) || !slices.Contains(keys(viewer), "total_students") || viewer.Tiles[0].Listable {
			t.Fatalf("own %v, as viewer %v", keys(own), keys(viewer))
		}
		if c := code(admin.do(403, "POST", "/v1/branches", api.BranchInput{Name: "Annexe"})); c != "preview.read_only" {
			t.Fatalf("a change during a preview: %q", c)
		}
		admin.viewAs = "owner"
		admin.do(422, "GET", "/v1/dashboard", nil)
		viewerOnly := caller{t: t, app: app, user: a.UserID + "-v", org: a.ID, viewAs: "teacher"}
		if _, err := owner.Exec(ctx, `INSERT INTO memberships (org_id, clerk_user_id, role) VALUES ($1, $2, 'viewer')`, a.ID, viewerOnly.user); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _, _ = owner.Exec(ctx, `DELETE FROM memberships WHERE clerk_user_id = $1`, viewerOnly.user) })
		if c := code(viewerOnly.do(403, "GET", "/v1/dashboard", nil)); c != "preview.not_allowed" {
			t.Fatalf("a view-only member previewing: %q", c)
		}
	})
}
