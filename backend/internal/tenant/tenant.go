// Package tenant runs each request inside one database transaction scoped to
// one organisation. The organisation the client asks for is only a request:
// access is granted when the signed-in user holds a membership there, read
// through row-level security with app.org_id set for this transaction only,
// so a pooled connection never carries a tenant into the next request.
package tenant

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"regexp"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
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

// Identify returns the signed-in user and the organisation the request asks
// for. Sign-in (v1.4) provides it; an error is written as the response.
type Identify func(r *http.Request) (userID, orgID string, err error)

var errNoOrg = problem.New(http.StatusNotFound, "org.not_found", "No organisation found for you at this address.")

var uuidShape = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type ctxKey int

const (
	txKey ctxKey = iota
	memberKey
)

// Middleware opens the transaction, sets app.org_id, checks membership and
// commits only when the handler answered below 400. The response is held
// until the commit succeeds, so a client never sees success for work that
// was rolled back.
func Middleware(pool *pgxpool.Pool, identify Identify) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			userID, orgID, err := identify(r)
			if err != nil {
				problem.Write(w, r, err)
				return
			}
			// Not found rather than forbidden: an outsider learns nothing
			// about which organisations exist.
			if userID == "" || !uuidShape.MatchString(orgID) {
				problem.Write(w, r, errNoOrg)
				return
			}

			ctx := r.Context()
			tx, err := pool.Begin(ctx)
			if err != nil {
				problem.Write(w, r, err)
				return
			}
			defer func() { _ = tx.Rollback(context.Background()) }()

			m, err := enter(ctx, tx, userID, orgID)
			if err != nil {
				problem.Write(w, r, err)
				return
			}

			buf := &heldWriter{ResponseWriter: w, status: http.StatusOK}
			ctx = context.WithValue(context.WithValue(ctx, txKey, tx), memberKey, m)
			next.ServeHTTP(buf, r.WithContext(ctx))

			if buf.status < 400 {
				if err := tx.Commit(ctx); err != nil {
					problem.Write(w, r, err)
					return
				}
			}
			w.WriteHeader(buf.status)
			_, _ = w.Write(buf.body.Bytes())
		})
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
func Tx(ctx context.Context) (pgx.Tx, error) {
	tx, ok := ctx.Value(txKey).(pgx.Tx)
	if !ok {
		return nil, errors.New("tenant: no transaction; is the route behind tenant.Middleware?")
	}
	return tx, nil
}

// MemberFrom is who is acting in this request.
func MemberFrom(ctx context.Context) (Member, bool) {
	m, ok := ctx.Value(memberKey).(Member)
	return m, ok
}

// heldWriter keeps the status and body until the transaction is settled.
type heldWriter struct {
	http.ResponseWriter
	status int
	wrote  bool
	body   bytes.Buffer
}

func (h *heldWriter) WriteHeader(code int) {
	if !h.wrote {
		h.status, h.wrote = code, true
	}
}

func (h *heldWriter) Write(b []byte) (int, error) {
	h.wrote = true
	return h.body.Write(b)
}
