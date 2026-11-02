package clerksync_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"net/http/httptest"
	"slices"
	"strconv"
	"testing"
	"time"

	"crypto/hmac"
	"crypto/sha256"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/clerksync"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/server"
)

var now = time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)

const secret = "whsec_" + "dGVzdC1zZWNyZXQtZm9yLXJldnUtd2ViaG9vaw==" // base64 of a test-only secret

func signed(body string, at time.Time, key string) map[string]string {
	raw, _ := base64.StdEncoding.DecodeString(key[len("whsec_"):])
	id := fmt.Sprintf("msg_%d", at.UnixNano())
	ts := strconv.FormatInt(at.Unix(), 10)
	mac := hmac.New(sha256.New, raw)
	mac.Write([]byte(id + "." + ts + "." + body))
	return map[string]string{"svix-id": id, "svix-timestamp": ts, "svix-signature": "v1," + base64.StdEncoding.EncodeToString(mac.Sum(nil))}
}

func TestRoleFor(t *testing.T) {
	cases := map[string]policy.Role{
		"org:admin": policy.Admin, "org:teacher": policy.Teacher, "org:class_teacher": policy.ClassTeacher,
		"org:member": policy.Viewer, "org:owner": policy.Viewer, "": policy.Viewer,
	}
	for in, want := range cases {
		if got := clerksync.RoleFor(in); got != want {
			t.Errorf("RoleFor(%q) = %s, want %s", in, got, want)
		}
	}
}

func TestWebhook(t *testing.T) {
	owner, app := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	b := dbtest.SeedOrg(t, owner, "Org B")
	ctx := context.Background()
	clerkA, clerkB := "org_A_"+a.ID[:8], "org_B_"+b.ID[:8]
	if _, err := owner.Exec(ctx, `UPDATE orgs SET clerk_org_id = $1 WHERE id = $2`, clerkA, a.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := owner.Exec(ctx, `UPDATE orgs SET clerk_org_id = $1 WHERE id = $2`, clerkB, b.ID); err != nil {
		t.Fatal(err)
	}
	h := server.New(config.Config{Version: "test", ClerkWebhook: secret}, server.Deps{DB: app, Now: func() time.Time { return now }})

	send := func(body string, headers map[string]string) int {
		t.Helper()
		req := httptest.NewRequest("POST", "/v1/webhooks/clerk", bytes.NewBufferString(body))
		req.Header.Set("Content-Type", "application/json")
		for k, v := range headers {
			req.Header.Set(k, v)
		}
		res, err := h.Test(req, fiber.TestConfig{Timeout: 0})
		if err != nil {
			t.Fatal(err)
		}
		_, _ = io.Copy(io.Discard, res.Body)
		return res.StatusCode
	}
	event := func(typ, org, user, role string) string {
		return fmt.Sprintf(`{"type":%q,"data":{"role":%q,"organization":{"id":%q},"public_user_data":{"user_id":%q}}}`, typ, role, org, user)
	}
	roles := func(org, user string) []string {
		t.Helper()
		rows, err := owner.Query(ctx, `SELECT role::text || '/' || source FROM memberships WHERE org_id = $1 AND clerk_user_id = $2 ORDER BY 1`, org, user)
		if err != nil {
			t.Fatal(err)
		}
		defer rows.Close()
		var out []string
		for rows.Next() {
			var s string
			_ = rows.Scan(&s)
			out = append(out, s)
		}
		return out
	}
	audits := func(org string) int {
		var n int
		_ = owner.QueryRow(ctx, `SELECT count(*) FROM audit_log WHERE org_id = $1 AND action = 'sync'`, org).Scan(&n)
		return n
	}
	user := a.UserID + "_new"

	t.Run("a new member of a linked organisation gets the mapped role", func(t *testing.T) {
		body := event("organizationMembership.created", clerkA, user, "org:teacher")
		if code := send(body, signed(body, now, secret)); code != 204 {
			t.Fatalf("status %d", code)
		}
		if got := roles(a.ID, user); !slices.Equal(got, []string{"teacher/clerk"}) {
			t.Fatalf("roles %v", got)
		}
	})

	t.Run("a role change replaces the synced role, and a repeat changes nothing", func(t *testing.T) {
		body := event("organizationMembership.updated", clerkA, user, "org:admin")
		before := audits(a.ID)
		send(body, signed(body, now, secret))
		send(body, signed(body, now.Add(time.Second), secret)) // Svix may deliver twice
		if got := roles(a.ID, user); !slices.Equal(got, []string{"admin/clerk"}) {
			t.Fatalf("roles %v", got)
		}
		if n := audits(a.ID) - before; n != 1 {
			t.Fatalf("%d audit entries for one change", n)
		}
	})

	t.Run("a role set inside revU is never touched by the sync", func(t *testing.T) {
		// the seeded user is admin of A, set inside revU
		body := event("organizationMembership.updated", clerkA, a.UserID, "org:member")
		send(body, signed(body, now, secret))
		if got := roles(a.ID, a.UserID); !slices.Equal(got, []string{"admin/revu", "viewer/clerk"}) {
			t.Fatalf("roles %v", got)
		}
	})

	t.Run("an organisation not linked to revU changes nothing", func(t *testing.T) {
		body := event("organizationMembership.created", "org_unlinked", user, "org:admin")
		if code := send(body, signed(body, now, secret)); code != 204 {
			t.Fatalf("status %d", code)
		}
	})

	refused := []struct {
		name    string
		headers func(string) map[string]string
		code    int
	}{
		{"an unsigned delivery is refused", func(string) map[string]string { return nil }, 401},
		{"a delivery signed with another secret is refused", func(b string) map[string]string { return signed(b, now, "whsec_"+"b3RoZXItc2VjcmV0") }, 401},
		{"an old delivery is refused (replay)", func(b string) map[string]string { return signed(b, now.Add(-10*time.Minute), secret) }, 401},
	}
	for _, tc := range refused {
		t.Run(tc.name, func(t *testing.T) {
			body := event("organizationMembership.created", clerkA, "user_attacker", "org:admin")
			if code := send(body, tc.headers(body)); code != tc.code {
				t.Fatalf("status %d, want %d", code, tc.code)
			}
			if got := roles(a.ID, "user_attacker"); len(got) != 0 {
				t.Fatalf("an unverified delivery made %v", got)
			}
		})
	}

	t.Run("leaving the organisation ends every membership there", func(t *testing.T) {
		body := event("organizationMembership.deleted", clerkA, a.UserID, "org:member")
		send(body, signed(body, now, secret))
		if got := roles(a.ID, a.UserID); len(got) != 0 {
			t.Fatalf("roles left %v", got)
		}
	})

	t.Run("a deleted account loses every membership everywhere", func(t *testing.T) {
		in := event("organizationMembership.created", clerkB, user, "org:teacher")
		send(in, signed(in, now, secret))
		body := fmt.Sprintf(`{"type":"user.deleted","data":{"id":%q,"deleted":true}}`, user)
		send(body, signed(body, now, secret))
		if got := append(roles(a.ID, user), roles(b.ID, user)...); len(got) != 0 {
			t.Fatalf("roles left %v", got)
		}
	})

	t.Run("without a secret the endpoint is off", func(t *testing.T) {
		off := server.New(config.Config{Version: "test"}, server.Deps{DB: app})
		body := event("organizationMembership.created", clerkA, user, "org:admin")
		req := httptest.NewRequest("POST", "/v1/webhooks/clerk", bytes.NewBufferString(body))
		res, _ := off.Test(req, fiber.TestConfig{Timeout: 0})
		if res.StatusCode != 503 {
			t.Fatalf("status %d", res.StatusCode)
		}
	})
}
