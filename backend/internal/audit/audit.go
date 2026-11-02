// Package audit records who changed what, with the record before and after,
// in the same transaction as the change: if the change rolls back, so does
// its entry. The application can only add entries (see 002_core.sql).
package audit

import (
	"encoding/json"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Entry is one change. Before is nil for a create, After nil for a delete.
type Entry struct {
	Action   string // create, update, delete, restore, import, ...
	Entity   string // table or module name, for example terminology
	EntityID string // "" when the change is to a whole collection
	Before   any
	After    any
}

// Record writes e for the current request's organisation and person.
func Record(c fiber.Ctx, e Entry) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	m, _ := tenant.MemberFrom(c)
	before, err := doc(e.Before)
	if err != nil {
		return err
	}
	after, err := doc(e.After)
	if err != nil {
		return err
	}
	_, err = tx.Exec(c.Context(), `
		INSERT INTO audit_log (org_id, actor_id, action, entity, entity_id, before, after, request_id)
		VALUES ($1, nullif($2, ''), $3, $4, nullif($5, '')::uuid, $6::jsonb, $7::jsonb, nullif($8, ''))`,
		m.OrgID, m.UserID, e.Action, e.Entity, e.EntityID, before, after, requestid.FromContext(c))
	return err
}

func doc(v any) (*string, error) {
	if v == nil {
		return nil, nil
	}
	b, err := json.Marshal(v)
	if err != nil {
		return nil, err
	}
	s := string(b)
	return &s, nil
}
