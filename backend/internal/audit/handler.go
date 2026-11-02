package audit

import (
	"encoding/base64"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Routes serves the audit log to those who may read it (audit.read:
// administrators and principals), inside a tenant-scoped router.
func Routes(g fiber.Router) {
	g.Get("/audit", list)
	g.Get("/audit/facets", facets)
}

// idShape matches an id. (The records engine has the same one but writes
// audit entries itself, so this package cannot import it.)
var idShape = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

func readable(c fiber.Ctx) error {
	m, _ := tenant.MemberFrom(c)
	return policy.Check(m.Actor(), policy.AuditRead, policy.Target{})
}

// actorName is the staff name linked to a sign-in id, if any.
const actorName = `(SELECT s.name FROM memberships m JOIN staff s ON s.id = m.staff_id
                    WHERE m.clerk_user_id = a.actor_id AND s.deleted_at IS NULL ORDER BY m.created_at LIMIT 1)`

const at = `to_char(a.at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`

func list(c fiber.Ctx) error {
	if err := readable(c); err != nil {
		return err
	}
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	limit := 50
	if v := c.Query("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 || n > 200 {
			return problem.Invalid(api.FieldError{Field: "limit", Code: "range", Message: "Use 1 to 200."})
		}
		limit = n
	}
	var where []string
	var args []any
	arg := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}
	var bad []api.FieldError
	add := func(field, code, msg string) {
		bad = append(bad, api.FieldError{Field: field, Code: code, Message: msg})
	}
	for _, f := range []struct{ param, column string }{{"entity", "a.entity"}, {"actor", "a.actor_id"}, {"action", "a.action"}} {
		if v := strings.TrimSpace(c.Query(f.param)); v != "" {
			where = append(where, f.column+" = "+arg(v))
		}
	}
	if v := c.Query("entityId"); v != "" {
		if !idShape.MatchString(v) {
			add("entityId", "unknown", "Not an id.")
		} else {
			where = append(where, "a.entity_id = "+arg(v)+"::uuid")
		}
	}
	for _, d := range []struct{ param, op string }{{"from", ">="}, {"to", "<"}} {
		v := c.Query(d.param)
		if v == "" {
			continue
		}
		day, err := time.Parse(time.DateOnly, v)
		if err != nil {
			add(d.param, "date", "Use a date like 2026-11-02.")
			continue
		}
		if d.param == "to" {
			day = day.AddDate(0, 0, 1) // the whole of the last day
		}
		where = append(where, "a.at "+d.op+" "+arg(day)+"::timestamptz")
	}
	if v := c.Query("cursor"); v != "" {
		raw, err := base64.RawURLEncoding.DecodeString(v)
		when, id, ok := strings.Cut(string(raw), "|")
		if err != nil || !ok || !idShape.MatchString(id) {
			add("cursor", "unknown", "Start again from the first page.")
		} else {
			where = append(where, "(a.at, a.id) < ("+arg(when)+"::timestamptz, "+arg(id)+"::uuid)")
		}
	}
	if len(bad) > 0 {
		return problem.Invalid(bad...)
	}
	sql := `SELECT a.id::text, ` + at + `, coalesce(a.actor_id, ''), coalesce(` + actorName + `, ''), a.action, a.entity,
	               coalesce(a.entity_id::text, ''), coalesce(a.request_id, ''), a.before, a.after
	          FROM audit_log a`
	if len(where) > 0 {
		sql += ` WHERE ` + strings.Join(where, ` AND `)
	}
	sql += ` ORDER BY a.at DESC, a.id DESC LIMIT ` + strconv.Itoa(limit+1)
	rows, err := tx.Query(c.Context(), sql, args...)
	if err != nil {
		return err
	}
	items, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (api.AuditEntry, error) {
		var e api.AuditEntry
		return e, r.Scan(&e.Id, &e.At, &e.ActorId, &e.ActorName, &e.Action, &e.Entity, &e.EntityId, &e.RequestId, &e.Before, &e.After)
	})
	if err != nil {
		return err
	}
	page := api.AuditPage{Items: items}
	if len(items) > limit {
		page.Items = items[:limit]
		last := page.Items[limit-1]
		page.NextCursor = base64.RawURLEncoding.EncodeToString([]byte(last.At + "|" + last.Id))
	}
	if page.Items == nil {
		page.Items = []api.AuditEntry{}
	}
	return c.JSON(page)
}

func facets(c fiber.Ctx) error {
	if err := readable(c); err != nil {
		return err
	}
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	out := api.AuditFacets{Entities: []string{}, Actions: []string{}, Actors: []api.AuditActor{}}
	for _, q := range []struct {
		sql  string
		into *[]string
	}{
		{`SELECT DISTINCT entity FROM audit_log ORDER BY 1`, &out.Entities},
		{`SELECT DISTINCT action FROM audit_log ORDER BY 1`, &out.Actions},
	} {
		rows, err := tx.Query(ctx, q.sql)
		if err != nil {
			return err
		}
		list, err := pgx.CollectRows(rows, pgx.RowTo[string])
		if err != nil {
			return err
		}
		*q.into = append(*q.into, list...)
	}
	rows, err := tx.Query(ctx, `
		SELECT a.actor_id, coalesce(`+actorName+`, a.actor_id)
		  FROM (SELECT DISTINCT actor_id FROM audit_log WHERE actor_id IS NOT NULL) a ORDER BY 2`)
	if err != nil {
		return err
	}
	actors, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (api.AuditActor, error) {
		var a api.AuditActor
		return a, r.Scan(&a.Id, &a.Name)
	})
	if err != nil {
		return err
	}
	out.Actors = append(out.Actors, actors...)
	return c.JSON(out)
}
