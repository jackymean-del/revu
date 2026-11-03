// Package layout keeps how a person arranges a screen (blueprint Part 73,
// P0 stage): on an entry grid, the order of its columns, which are shown
// and pinned, and how students are sorted. A layout changes what is shown,
// never what is calculated, and a personal view changes nobody else's.
package layout

import (
	"errors"
	"net/http"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Routes serves resolving and saving a layout.
func Routes(g fiber.Router) {
	g.Get("/layouts/resolve", resolve)
	g.Put("/layouts/mine", save)
}

// byDefault is the platform default for an entry grid: paper order, every
// column shown, students by roll number then admission number.
func byDefault(surface, scope string) api.Layout {
	return api.Layout{Surface: surface, ScopeId: scope, Items: []api.LayoutItem{},
		Sort: []api.SortRule{{Field: "roll_no", Direction: "asc"}, {Field: "admission_no", Direction: "asc"}}}
}

func checkScope(c fiber.Ctx, tx pgx.Tx, surface, scope string) error {
	if surface != "entry_grid" {
		return problem.Invalid(api.FieldError{Field: "surface", Code: "unknown", Message: "Only entry grids have layouts for now."})
	}
	var ok bool
	if records.UUIDShape.MatchString(scope) {
		if err := tx.QueryRow(c.Context(), `SELECT EXISTS (SELECT 1 FROM assessments WHERE id = $1::uuid AND deleted_at IS NULL)`, scope).Scan(&ok); err != nil {
			return err
		}
	}
	if !ok {
		return problem.New(http.StatusNotFound, "layout.scope_not_found", "No assessment has this id.")
	}
	return nil
}

func read(c fiber.Ctx, tx pgx.Tx, surface, scope string) (api.Layout, error) {
	m, _ := tenant.MemberFrom(c)
	out := byDefault(surface, scope)
	var id string
	err := tx.QueryRow(c.Context(), `
		SELECT id::text FROM layout_profiles WHERE surface = $1 AND scope_kind = 'user' AND scope_id = $2 AND user_id = $3`,
		surface, scope, m.UserID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	out.Personal = true
	rows, err := tx.Query(c.Context(), `SELECT item_id, position, visible, pinned FROM layout_items WHERE profile_id = $1::uuid ORDER BY position`, id)
	if err != nil {
		return out, err
	}
	if out.Items, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (i api.LayoutItem, err error) {
		return i, r.Scan(&i.ItemId, &i.Position, &i.Visible, &i.Pinned)
	}); err != nil {
		return out, err
	}
	rows, err = tx.Query(c.Context(), `SELECT field, direction FROM layout_sort_rules WHERE profile_id = $1::uuid ORDER BY seq`, id)
	if err != nil {
		return out, err
	}
	sort, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (s api.SortRule, err error) {
		return s, r.Scan(&s.Field, &s.Direction)
	})
	if len(sort) > 0 {
		out.Sort = sort
	}
	if out.Items == nil {
		out.Items = []api.LayoutItem{}
	}
	return out, err
}

func resolve(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	surface, scope := c.Query("surface"), c.Query("scopeId")
	if err := checkScope(c, tx, surface, scope); err != nil {
		return err
	}
	out, err := read(c, tx, surface, scope)
	if err != nil {
		return err
	}
	return c.JSON(out)
}

func save(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	var in api.LayoutInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if err := checkScope(c, tx, string(in.Surface), in.ScopeId); err != nil {
		return err
	}
	if len(in.Items) > 200 || len(in.Sort) > 3 {
		return problem.Invalid(api.FieldError{Field: "items", Code: "length", Message: "Too many items."})
	}
	seen := map[string]bool{}
	for _, s := range in.Sort {
		if (s.Field != "roll_no" && s.Field != "admission_no" && s.Field != "name") || (s.Direction != "asc" && s.Direction != "desc") || seen[string(s.Field)] {
			return problem.Invalid(api.FieldError{Field: "sort", Code: "unknown", Message: "Sort by roll number, admission number or name, once each."})
		}
		seen[string(s.Field)] = true
	}
	before, err := read(c, tx, string(in.Surface), in.ScopeId)
	if err != nil {
		return err
	}
	m, _ := tenant.MemberFrom(c)
	var id string
	if err := tx.QueryRow(ctx, `
		INSERT INTO layout_profiles (org_id, surface, scope_kind, scope_id, user_id) VALUES ($1, $2, 'user', $3, $4)
		ON CONFLICT (org_id, surface, scope_kind, scope_id, user_id) DO UPDATE SET version = layout_profiles.version + 1, updated_at = now()
		RETURNING id::text`, m.OrgID, in.Surface, in.ScopeId, m.UserID).Scan(&id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM layout_items WHERE profile_id = $1::uuid`, id); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `DELETE FROM layout_sort_rules WHERE profile_id = $1::uuid`, id); err != nil {
		return err
	}
	// Positions are renumbered from 1 in the order given.
	done := map[string]bool{}
	for _, it := range in.Items {
		if it.ItemId == "" || done[it.ItemId] {
			continue
		}
		done[it.ItemId] = true
		if _, err := tx.Exec(ctx, `
			INSERT INTO layout_items (org_id, profile_id, item_kind, item_id, position, visible, pinned) VALUES ($1, $2::uuid, 'part', $3, $4, $5, $6)`,
			m.OrgID, id, it.ItemId, len(done), it.Visible, it.Pinned); err != nil {
			return err
		}
	}
	for i, s := range in.Sort {
		if _, err := tx.Exec(ctx, `INSERT INTO layout_sort_rules (org_id, profile_id, seq, field, direction) VALUES ($1, $2::uuid, $3, $4, $5)`,
			m.OrgID, id, i+1, s.Field, s.Direction); err != nil {
			return err
		}
	}
	after, err := read(c, tx, string(in.Surface), in.ScopeId)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "layout_profiles", EntityID: id, Before: before, After: after}); err != nil {
		return err
	}
	return c.JSON(after)
}
