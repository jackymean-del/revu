package people

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Memberships say who can sign in here and with which roles. Rows from the
// sign-in organisation (source clerk) follow it and change there; rows set
// here (source revu) change here. The last organisation-wide administrator
// cannot be removed or demoted, so an organisation is never locked out.

const membershipSelect = `
	SELECT m.id::text, m.clerk_user_id, m.role::text, coalesce(m.branch_id::text, ''), coalesce(m.staff_id::text, ''),
	       coalesce(s.name, ''), m.source
	  FROM memberships m LEFT JOIN staff s ON s.id = m.staff_id`

func scanMembership(r pgx.CollectableRow) (api.Membership, error) {
	var m api.Membership
	return m, r.Scan(&m.Id, &m.ClerkUserId, &m.Role, &m.BranchId, &m.StaffId, &m.StaffName, &m.Source)
}

var (
	errMemberNotFound = problem.New(http.StatusNotFound, "membership.not_found", "Nothing here has this id.")
	errLastAdmin      = problem.New(http.StatusConflict, "membership.last_admin", "This is the last administrator for the whole organisation. Give someone else that role first.")
	errFromSignIn     = problem.New(http.StatusConflict, "membership.from_sign_in", "This role follows the sign-in organisation. Change it there, or add a separate role here.")
)

// manage checks that the person may manage memberships: the people part of
// "structure and people, write", within the branch of the role if it has one.
func manage(c fiber.Ctx, branchID string) error {
	m, _ := tenant.MemberFrom(c)
	return policy.Check(m.Actor(), policy.StructureWrite, policy.Target{BranchID: branchID})
}

func listMemberships(c fiber.Ctx) error {
	if err := manage(c, ""); err != nil {
		return err
	}
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	rows, err := tx.Query(c.Context(), membershipSelect+` ORDER BY lower(coalesce(s.name, m.clerk_user_id)), m.role`)
	if err != nil {
		return err
	}
	list, err := pgx.CollectRows(rows, scanMembership)
	if err != nil {
		return err
	}
	if list == nil {
		list = []api.Membership{}
	}
	return c.JSON(list)
}

func oneMembership(ctx context.Context, tx pgx.Tx, id string) (api.Membership, error) {
	if !records.UUIDShape.MatchString(id) {
		return api.Membership{}, errMemberNotFound
	}
	rows, err := tx.Query(ctx, membershipSelect+` WHERE m.id = $1::uuid`, id)
	if err != nil {
		return api.Membership{}, err
	}
	m, err := pgx.CollectExactlyOneRow(rows, scanMembership)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, errMemberNotFound
	}
	return m, err
}

func membershipInput(c fiber.Ctx, tx pgx.Tx) (api.MembershipInput, error) {
	var in api.MembershipInput
	if err := httpx.Decode(c, &in); err != nil {
		return in, err
	}
	var f records.Fields
	in.ClerkUserId = strings.TrimSpace(in.ClerkUserId)
	if !strings.HasPrefix(in.ClerkUserId, "user_") || len(in.ClerkUserId) > 80 {
		f.Add("clerkUserId", "format", "Use the sign-in id, which starts with user_.")
	}
	switch in.Role {
	case "admin", "principal", "coordinator", "teacher", "class_teacher", "viewer":
	default:
		f.Add("role", "unknown", "Choose a role from the list.")
	}
	ctx := c.Context()
	if in.BranchId != "" {
		if err := f.Live(ctx, tx, "branchId", "branches", in.BranchId); err != nil {
			return in, err
		}
	}
	if in.StaffId != "" {
		if err := f.Live(ctx, tx, "staffId", "staff", in.StaffId); err != nil {
			return in, err
		}
	}
	if len(f) > 0 {
		return in, problem.Invalid(f...)
	}
	return in, nil
}

// otherOrgAdmins counts organisation-wide administrator rows other than id.
func otherOrgAdmins(ctx context.Context, tx pgx.Tx, id string) (int, error) {
	var n int
	err := tx.QueryRow(ctx, `SELECT count(*) FROM memberships WHERE role = 'admin' AND branch_id IS NULL AND id::text <> $1`, id).Scan(&n)
	return n, err
}

func isOrgAdmin(m api.Membership) bool { return m.Role == "admin" && m.BranchId == "" }

func createMembership(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	in, err := membershipInput(c, tx)
	if err != nil {
		return err
	}
	if err := manage(c, in.BranchId); err != nil {
		return err
	}
	me, _ := tenant.MemberFrom(c)
	var id string
	err = tx.QueryRow(c.Context(), `
		INSERT INTO memberships (org_id, clerk_user_id, role, branch_id, staff_id, source)
		VALUES ($1, $2, $3, nullif($4, '')::uuid, nullif($5, '')::uuid, 'revu') RETURNING id::text`,
		me.OrgID, in.ClerkUserId, string(in.Role), in.BranchId, in.StaffId).Scan(&id)
	if err != nil {
		return records.DBProblem(err)
	}
	m, err := oneMembership(c.Context(), tx, id)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "create", Entity: "memberships", EntityID: id, After: m}); err != nil {
		return err
	}
	return c.Status(http.StatusCreated).JSON(m)
}

func updateMembership(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	before, err := oneMembership(ctx, tx, c.Params("id"))
	if err != nil {
		return err
	}
	if err := manage(c, before.BranchId); err != nil {
		return err
	}
	in, err := membershipInput(c, tx)
	if err != nil {
		return err
	}
	if err := manage(c, in.BranchId); err != nil {
		return err
	}
	changesRole := string(in.Role) != string(before.Role) || in.BranchId != before.BranchId || in.ClerkUserId != before.ClerkUserId
	if before.Source == "clerk" && changesRole {
		return errFromSignIn // only the staff link may change on a synced role
	}
	if isOrgAdmin(before) && changesRole {
		if n, err := otherOrgAdmins(ctx, tx, before.Id); err != nil {
			return err
		} else if n == 0 {
			return errLastAdmin
		}
	}
	_, err = tx.Exec(ctx, `UPDATE memberships SET clerk_user_id = $2, role = $3, branch_id = nullif($4, '')::uuid, staff_id = nullif($5, '')::uuid WHERE id = $1::uuid`,
		before.Id, in.ClerkUserId, string(in.Role), in.BranchId, in.StaffId)
	if err != nil {
		return records.DBProblem(err)
	}
	after, err := oneMembership(ctx, tx, before.Id)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "memberships", EntityID: before.Id, Before: before, After: after}); err != nil {
		return err
	}
	return c.JSON(after)
}

func removeMembership(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	before, err := oneMembership(ctx, tx, c.Params("id"))
	if err != nil {
		return err
	}
	if err := manage(c, before.BranchId); err != nil {
		return err
	}
	if before.Source == "clerk" {
		return errFromSignIn
	}
	if isOrgAdmin(before) {
		if n, err := otherOrgAdmins(ctx, tx, before.Id); err != nil {
			return err
		} else if n == 0 {
			return errLastAdmin
		}
	}
	if _, err := tx.Exec(ctx, `DELETE FROM memberships WHERE id = $1::uuid`, before.Id); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "delete", Entity: "memberships", EntityID: before.Id, Before: before}); err != nil {
		return err
	}
	return c.SendStatus(http.StatusNoContent)
}
