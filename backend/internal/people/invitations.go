package people

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"net/mail"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Invitations give a role to whoever signs in with the invited address.
// The sign-in service emails the link when it is configured; without it
// (local work) the invitation is kept and claimed on sign-in all the same.

const invitationSelect = `
	SELECT id::text, email, role::text, coalesce(branch_id::text, ''), coalesce(staff_id::text, ''), status, sent,
	       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
	  FROM invitations`

func scanInvitation(r pgx.CollectableRow) (api.Invitation, error) {
	var i api.Invitation
	return i, r.Scan(&i.Id, &i.Email, &i.Role, &i.BranchId, &i.StaffId, &i.Status, &i.Sent, &i.CreatedAt)
}

type invitations struct {
	dir      auth.Directory // nil when no sign-in service is configured
	redirect string         // where the link lands: the app
}

func (h invitations) list(c fiber.Ctx) error {
	if err := manage(c, ""); err != nil {
		return err
	}
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	rows, err := tx.Query(c.Context(), invitationSelect+` WHERE status = 'pending' OR updated_at > now() - interval '30 days' ORDER BY created_at DESC`)
	if err != nil {
		return err
	}
	list, err := pgx.CollectRows(rows, scanInvitation)
	if err != nil {
		return err
	}
	return c.JSON(nonNil(list))
}

func oneInvitation(ctx context.Context, tx pgx.Tx, id string) (api.Invitation, error) {
	notFound := problem.New(http.StatusNotFound, "invitation.not_found", "Nothing here has this id.")
	if !records.UUIDShape.MatchString(id) {
		return api.Invitation{}, notFound
	}
	rows, err := tx.Query(ctx, invitationSelect+` WHERE id = $1::uuid`, id)
	if err != nil {
		return api.Invitation{}, err
	}
	inv, err := pgx.CollectExactlyOneRow(rows, scanInvitation)
	if errors.Is(err, pgx.ErrNoRows) {
		return inv, notFound
	}
	return inv, err
}

func (h invitations) create(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	var in api.InvitationInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	ctx := c.Context()
	var f records.Fields
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	if a, err := mail.ParseAddress(in.Email); err != nil || a.Address != in.Email || len(in.Email) > 200 {
		f.Add("email", "format", "Use an email address like name@example.com.")
	}
	switch in.Role {
	case "admin", "principal", "coordinator", "teacher", "class_teacher", "viewer":
	default:
		f.Add("role", "unknown", "Choose a role from the list.")
	}
	if in.BranchId != "" {
		if err := f.Live(ctx, tx, "branchId", "branches", in.BranchId); err != nil {
			return err
		}
	}
	if in.StaffId != "" {
		if err := f.Live(ctx, tx, "staffId", "staff", in.StaffId); err != nil {
			return err
		}
	}
	if len(f) > 0 {
		return problem.Invalid(f...)
	}
	if err := manage(c, in.BranchId); err != nil {
		return err
	}
	me, _ := tenant.MemberFrom(c)
	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO invitations (org_id, email, role, branch_id, staff_id, invited_by)
		VALUES ($1, $2, $3, nullif($4, '')::uuid, nullif($5, '')::uuid, $6) RETURNING id::text`,
		me.OrgID, in.Email, string(in.Role), in.BranchId, in.StaffId, me.UserID).Scan(&id)
	if err != nil {
		if p := records.DBProblem(err); p != err {
			return problem.New(http.StatusConflict, "invitation.open", "This address already has an open invitation for this role.")
		}
		return err
	}
	if h.dir != nil {
		if err := h.dir.Invite(ctx, in.Email, h.redirect); err != nil {
			// The invitation stands: signing in with this address still claims it.
			slog.Warn("invitation email not sent", "invitation", id, "err", err)
		} else if _, err := tx.Exec(ctx, `UPDATE invitations SET sent = true WHERE id = $1::uuid`, id); err != nil {
			return err
		}
	}
	inv, err := oneInvitation(ctx, tx, id)
	if err != nil {
		return err
	}
	// The address is personal data: the log keeps the role and whether it was sent (Part 70).
	if err := audit.Record(c, audit.Entry{Action: "create", Entity: "invitations", EntityID: id, After: map[string]any{"role": inv.Role, "sent": inv.Sent}}); err != nil {
		return err
	}
	return c.Status(http.StatusCreated).JSON(inv)
}

func (h invitations) revoke(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	inv, err := oneInvitation(c.Context(), tx, c.Params("id"))
	if err != nil {
		return err
	}
	if err := manage(c, inv.BranchId); err != nil {
		return err
	}
	if inv.Status != "pending" {
		return problem.New(http.StatusConflict, "invitation.answered", "This invitation was already accepted or withdrawn.")
	}
	if _, err := tx.Exec(c.Context(), `UPDATE invitations SET status = 'revoked' WHERE id = $1::uuid`, inv.Id); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "delete", Entity: "invitations", EntityID: inv.Id, Before: map[string]any{"role": inv.Role}}); err != nil {
		return err
	}
	return c.SendStatus(http.StatusNoContent)
}
