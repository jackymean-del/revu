// Package tenant runs each request inside one database transaction scoped to
// one organisation (one institution or campus, decision D2). The
// organisation the client asks for is only a request: access is granted
// when the signed-in user holds a membership there, read through row-level
// security with app.org_id set for this transaction only, so a pooled
// connection never carries a tenant into the next request.
package tenant

import (
	"context"
	"errors"
	"net/http"
	"regexp"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/problem"
)

// Role is one membership: a role for the whole organisation, or limited to
// one branch.
type Role struct {
	Name     string
	BranchID string // "" for the whole organisation
}

// Member is who is acting, and in which organisation.
type Member struct {
	OrgID  string
	UserID string
	Roles  []Role
}

// Actor is the member as the permission policy sees them. Modules that act
// on sections add the person's teaching assignments.
func (m Member) Actor() policy.Actor {
	var a policy.Actor
	for _, r := range m.Roles {
		a.Roles = append(a.Roles, policy.RoleIn{Role: policy.Role(r.Name), BranchID: r.BranchID})
	}
	return a
}

// Identify returns the signed-in user and the organisation the request asks
// for. Sign-in provides it; an error is written as the response.
type Identify func(c fiber.Ctx) (userID, orgID string, err error)

var errNoOrg = problem.New(http.StatusNotFound, "org.not_found", "No organisation found for you at this address.")

var uuidShape = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type localKey int

const (
	txKey localKey = iota
	memberKey
)

// Middleware opens the transaction, sets app.org_id, checks membership and
// commits only when the handler succeeded with a status below 400. Fiber
// sends the response after this returns, so a failed commit replaces the
// handler's answer with a 500: a client never sees success for work that
// was rolled back.
func Middleware(pool *pgxpool.Pool, identify Identify) fiber.Handler {
	return func(c fiber.Ctx) error {
		userID, orgID, err := identify(c)
		if err != nil {
			return err
		}
		// Not found rather than forbidden: an outsider learns nothing about
		// which organisations exist.
		if userID == "" || !uuidShape.MatchString(orgID) {
			return errNoOrg
		}

		ctx := c.Context()
		tx, err := pool.Begin(ctx)
		if err != nil {
			return err
		}
		defer func() { _ = tx.Rollback(context.Background()) }()

		m, err := enter(ctx, tx, userID, orgID)
		if err != nil {
			return err
		}
		c.Locals(txKey, tx)
		c.Locals(memberKey, m)

		if err := c.Next(); err != nil {
			return err
		}
		if c.Response().StatusCode() >= 400 {
			return nil
		}
		return tx.Commit(ctx)
	}
}

// enter scopes tx to the organisation and loads the user's roles there.
func enter(ctx context.Context, tx pgx.Tx, userID, orgID string) (Member, error) {
	if _, err := tx.Exec(ctx, `SELECT set_config('app.org_id', $1, true)`, orgID); err != nil {
		return Member{}, err
	}
	rows, err := tx.Query(ctx, `SELECT role::text, coalesce(branch_id::text, '') FROM memberships WHERE clerk_user_id = $1 ORDER BY 1, 2`, userID)
	if err != nil {
		return Member{}, err
	}
	roles, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (Role, error) {
		var r Role
		return r, row.Scan(&r.Name, &r.BranchID)
	})
	if err != nil {
		return Member{}, err
	}
	if len(roles) == 0 {
		return Member{}, errNoOrg
	}
	return Member{OrgID: orgID, UserID: userID, Roles: roles}, nil
}

// Tx is the request's organisation-scoped transaction. Repositories run every
// query through it.
func Tx(c fiber.Ctx) (pgx.Tx, error) {
	tx, ok := c.Locals(txKey).(pgx.Tx)
	if !ok {
		return nil, errors.New("tenant: no transaction; is the route behind tenant.Middleware?")
	}
	return tx, nil
}

// MemberFrom is who is acting in this request.
func MemberFrom(c fiber.Ctx) (Member, bool) {
	m, ok := c.Locals(memberKey).(Member)
	return m, ok
}

// Teaching is the acting person as the policy sees them, with the sections
// and subjects they teach, for rules about their own sections.
func Teaching(c fiber.Ctx) (policy.Actor, error) {
	tx, err := Tx(c)
	if err != nil {
		return policy.Actor{}, err
	}
	m, _ := MemberFrom(c)
	a := m.Actor()
	rows, err := tx.Query(c.Context(), `
		SELECT DISTINCT a.section_id::text, coalesce(a.subject_id::text, '')
		  FROM teaching_assignments a JOIN memberships m ON m.staff_id = a.staff_id
		 WHERE m.clerk_user_id = $1 AND a.deleted_at IS NULL`, m.UserID)
	if err != nil {
		return a, err
	}
	a.Assignments, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (as policy.Assignment, err error) {
		return as, r.Scan(&as.SectionID, &as.SubjectID)
	})
	return a, err
}
