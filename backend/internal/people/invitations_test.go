package people_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/seed"
	"github.com/jackymean-del/revu/internal/server"
)

// fakeDirectory stands in for the sign-in service.
type fakeDirectory struct {
	verified map[string][]string // user -> verified addresses
	sent     []string
	fail     bool
}

func (f *fakeDirectory) VerifiedEmails(_ context.Context, user string) ([]string, error) {
	return f.verified[user], nil
}

func (f *fakeDirectory) Invite(_ context.Context, email, redirect string) error {
	if f.fail {
		return errors.New("clerk is down")
	}
	f.sent = append(f.sent, email+" -> "+redirect)
	return nil
}

func TestInvitationsAndClaims(t *testing.T) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	ctx := context.Background()
	dir := &fakeDirectory{verified: map[string][]string{
		"user_new":   {"new.teacher@example.test"},
		"user_other": {"someone.else@example.test"},
	}}
	app := server.New(config.Config{Version: "test", AppURL: "https://app.revu.test"}, server.Deps{DB: appPool, Auth: headerAuth{}, Directory: dir})
	admin := caller{t, app, a.UserID, a.ID}
	me := func(user string) api.Me {
		t.Helper()
		var m api.Me
		caller{t, app, user, ""}.must(200, "GET", "/v1/me", nil).into(&m)
		return m
	}

	var inv api.Invitation
	admin.must(201, "POST", "/v1/invitations", api.InvitationInput{Email: " New.Teacher@Example.test ", Role: "teacher", StaffId: a.StaffID}).into(&inv)
	if inv.Email != "new.teacher@example.test" || !inv.Sent || inv.Status != "pending" {
		t.Fatalf("%+v", inv)
	}
	if len(dir.sent) != 1 || dir.sent[0] != "new.teacher@example.test -> https://app.revu.test" {
		t.Fatalf("sent %v", dir.sent)
	}

	t.Run("checks before inviting", func(t *testing.T) {
		if p := admin.must(409, "POST", "/v1/invitations", api.InvitationInput{Email: "new.teacher@example.test", Role: "teacher"}).problem(); p.Code != "invitation.open" {
			t.Fatalf("%+v", p)
		}
		admin.must(422, "POST", "/v1/invitations", api.InvitationInput{Email: "not an address", Role: "teacher"})
		if _, err := owner.Exec(ctx, `INSERT INTO memberships (org_id, clerk_user_id, role) VALUES ($1, 'user_viewer', 'viewer')`, a.ID); err != nil {
			t.Fatal(err)
		}
		caller{t, app, "user_viewer", a.ID}.must(403, "POST", "/v1/invitations", api.InvitationInput{Email: "x@example.test", Role: "admin"})
	})

	t.Run("signing in with the invited address gives the role, once", func(t *testing.T) {
		if got := me("user_other"); len(got.Orgs) != 0 {
			t.Fatalf("another address claimed it: %+v", got.Orgs)
		}
		got := me("user_new")
		if len(got.Orgs) != 1 || got.Orgs[0].Id != a.ID || got.Orgs[0].Roles[0] != "teacher" || got.Orgs[0].StaffId != a.StaffID {
			t.Fatalf("%+v", got.Orgs)
		}
		me("user_new")
		if n := count(t, owner, `SELECT count(*) FROM memberships WHERE clerk_user_id = 'user_new'`); n != 1 {
			t.Fatalf("%d memberships after two sign-ins", n)
		}
		var list []api.Invitation
		admin.must(200, "GET", "/v1/invitations", nil).into(&list)
		for _, i := range list {
			if i.Id == inv.Id && i.Status != "accepted" {
				t.Fatalf("invitation %+v", i)
			}
		}
	})

	t.Run("a withdrawn invitation gives nothing", func(t *testing.T) {
		var later api.Invitation
		admin.must(201, "POST", "/v1/invitations", api.InvitationInput{Email: "someone.else@example.test", Role: "admin"}).into(&later)
		admin.must(204, "DELETE", "/v1/invitations/"+later.Id, nil)
		admin.must(409, "DELETE", "/v1/invitations/"+later.Id, nil)
		if got := me("user_other"); len(got.Orgs) != 0 {
			t.Fatalf("a withdrawn invitation was claimed: %+v", got.Orgs)
		}
	})

	t.Run("when the email cannot be sent the invitation still stands", func(t *testing.T) {
		dir.fail = true
		defer func() { dir.fail = false }()
		var i api.Invitation
		admin.must(201, "POST", "/v1/invitations", api.InvitationInput{Email: "late@example.test", Role: "coordinator"}).into(&i)
		if i.Sent || i.Status != "pending" {
			t.Fatalf("%+v", i)
		}
	})

	t.Run("the log keeps the role, not the address", func(t *testing.T) {
		var after string
		if err := owner.QueryRow(ctx, `SELECT after::text FROM audit_log WHERE entity = 'invitations' AND entity_id = $1::uuid AND action = 'create'`, inv.Id).Scan(&after); err != nil {
			t.Fatal(err)
		}
		if strings.Contains(after, "@") || !strings.Contains(after, "teacher") {
			t.Fatalf("audit %s", after)
		}
	})
}

func TestSetupAndNewOrganisation(t *testing.T) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	ctx := context.Background()
	dir := &fakeDirectory{verified: map[string][]string{"user_head": {"head@new-school.test"}}}
	app := server.New(config.Config{Version: "test"}, server.Deps{DB: appPool, Auth: headerAuth{}, Directory: dir})
	admin := caller{t, app, a.UserID, a.ID}

	var s api.SetupStatus
	admin.must(200, "GET", "/v1/setup", nil).into(&s)
	if s.Years != 1 || s.Sections != 1 || s.Students != 1 || s.Invitations != 1 || s.Done {
		t.Fatalf("%+v", s)
	}
	if _, err := owner.Exec(ctx, `INSERT INTO memberships (org_id, clerk_user_id, role) VALUES ($1, 'user_teacher', 'teacher')`, a.ID); err != nil {
		t.Fatal(err)
	}
	caller{t, app, "user_teacher", a.ID}.must(200, "GET", "/v1/setup", nil)
	caller{t, app, "user_teacher", a.ID}.must(403, "POST", "/v1/setup/complete", nil)
	admin.must(200, "POST", "/v1/setup/complete", nil).into(&s)
	if !s.Done {
		t.Fatal("not marked done")
	}
	var m api.Me
	caller{t, app, a.UserID, ""}.must(200, "GET", "/v1/me", nil).into(&m)
	if !m.Orgs[0].SetupDone {
		t.Fatalf("%+v", m.Orgs)
	}

	// The platform owner creates a new client; its head signs in and is its administrator.
	orgID, _, err := seed.CreateOrg(ctx, owner, "Hill View School", "school", "Head@New-School.test")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		for _, table := range []string{"audit_log", "invitations", "memberships", "branches"} {
			_, _ = owner.Exec(ctx, `DELETE FROM `+table+` WHERE org_id = $1`, orgID)
		}
		_, _ = owner.Exec(ctx, `DELETE FROM orgs WHERE id = $1`, orgID)
	})
	caller{t, app, "user_head", ""}.must(200, "GET", "/v1/me", nil).into(&m)
	if len(m.Orgs) != 1 || m.Orgs[0].Name != "Hill View School" || m.Orgs[0].Roles[0] != "admin" || m.Orgs[0].SetupDone {
		t.Fatalf("%+v", m.Orgs)
	}
	head := caller{t, app, "user_head", orgID}
	head.must(200, "GET", "/v1/setup", nil).into(&s)
	if s.Years != 0 || s.Done {
		t.Fatalf("new organisation %+v", s)
	}
	var branches []api.Branch
	head.must(200, "GET", "/v1/branches", nil).into(&branches)
	if len(branches) != 1 || branches[0].Name != "Hill View School" {
		t.Fatalf("%+v", branches)
	}
}
