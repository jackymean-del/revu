// Package schemes serves the institution's schemes: drafts, versions,
// publishing, where each applies, board packs and the dry run (blueprint
// v3.3, v3.6 and v3.10 in their pilot form). A published version never
// changes; editing makes the next one. Publishing or reassigning marks
// every result it reaches stale, and the recompute loop works them out
// again. The arithmetic itself is only in internal/scheme.
package schemes

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/scheme"
	"github.com/jackymean-del/revu/internal/stale"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Routes serves schemes, board packs and assignments.
func Routes(g fiber.Router) {
	g.Get("/schemes", list)
	g.Post("/schemes", create)
	g.Get("/schemes/:id", get)
	g.Put("/schemes/:id", update)
	g.Delete("/schemes/:id", remove)
	g.Post("/schemes/:id/publish", publish)
	g.Post("/schemes/:id/versions", newVersion)
	g.Post("/schemes/:id/dry-run", dryRun)
	g.Get("/scheme-packs", listPacks)
	g.Post("/scheme-packs/:key/import", importPack)
	g.Get("/scheme-assignments", listAssignments)
	g.Post("/scheme-assignments", assign)
	g.Delete("/scheme-assignments/:id", unassign)
}

// summary and full follow the contract's SchemeSummary and Scheme; the
// definition is the engine's own type, so its decimals stay text.
type summary struct {
	ID          string `json:"id"`
	FamilyID    string `json:"familyId"`
	Name        string `json:"name"`
	Board       string `json:"board,omitempty"`
	Version     int    `json:"version"`
	Status      string `json:"status"`
	PackKey     string `json:"packKey,omitempty"`
	PublishedAt string `json:"publishedAt,omitempty"`
	UpdatedAt   string `json:"updatedAt"`
}

type full struct {
	summary
	Definition scheme.Definition `json:"definition"`
}

type input struct {
	Name       string          `json:"name"`
	Definition json.RawMessage `json:"definition"`
}

var errNotFound = problem.New(http.StatusNotFound, "scheme.not_found", "No scheme has this id.")

const columns = `id::text, family_id::text, name, coalesce(board, ''), version, status, coalesce(pack_key, ''),
	coalesce(to_char(published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
	to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`

func scan(r pgx.Row, s *summary, extra ...any) error {
	return r.Scan(append([]any{&s.ID, &s.FamilyID, &s.Name, &s.Board, &s.Version, &s.Status, &s.PackKey, &s.PublishedAt, &s.UpdatedAt}, extra...)...)
}

func load(ctx context.Context, tx pgx.Tx, id string) (full, error) {
	var f full
	if !records.UUIDShape.MatchString(id) {
		return f, errNotFound
	}
	var raw []byte
	err := scan(tx.QueryRow(ctx, `SELECT `+columns+`, definition FROM schemes WHERE id = $1::uuid AND deleted_at IS NULL`, id), &f.summary, &raw)
	if errors.Is(err, pgx.ErrNoRows) {
		return f, errNotFound
	}
	if err != nil {
		return f, err
	}
	// A stored definition is read as is: an older draft may break a rule
	// added since, and the editor shows what to fix.
	if err := json.Unmarshal(raw, &f.Definition); err != nil {
		return f, err
	}
	return f, nil
}

// mayWrite checks the person may change schemes, which apply across the
// institution.
func mayWrite(c fiber.Ctx) error {
	a, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	return policy.Check(a, policy.SchemeWrite, policy.Target{})
}

// parse reads a name and definition, and refuses one that breaks a rule
// with a field error per line (AT-v3-12).
func parse(c fiber.Ctx) (string, scheme.Definition, error) {
	var in input
	if err := httpx.Decode(c, &in); err != nil {
		return "", scheme.Definition{}, err
	}
	var f records.Fields
	f.Text("name", &in.Name, 1, 120)
	if len(in.Definition) == 0 {
		f.Add("definition", "required", "Give the scheme's definition.")
	}
	if len(f) > 0 {
		return "", scheme.Definition{}, problem.Invalid(f...)
	}
	d, err := scheme.Parse(in.Definition)
	var ps scheme.Problems
	if errors.As(err, &ps) {
		return "", d, invalid(ps)
	}
	return in.Name, d, err
}

func invalid(ps scheme.Problems) error {
	fields := make([]api.FieldError, len(ps))
	for i, p := range ps {
		field := "definition"
		if p.Path != "" {
			field += "." + p.Path
		}
		fields[i] = api.FieldError{Field: field, Code: "invalid", Message: p.Message}
	}
	return problem.Invalid(fields...)
}

func list(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	rows, err := tx.Query(c.Context(), `SELECT `+columns+` FROM schemes WHERE deleted_at IS NULL ORDER BY family_id, version DESC`)
	if err != nil {
		return err
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (summary, error) {
		var s summary
		return s, scan(r, &s)
	})
	if err != nil {
		return err
	}
	if out == nil {
		out = []summary{}
	}
	return c.JSON(out)
}

func get(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	f, err := load(c.Context(), tx, c.Params("id"))
	if err != nil {
		return err
	}
	return c.JSON(f)
}

// insert adds version 1 of a new scheme.
func insert(c fiber.Ctx, tx pgx.Tx, name, board, packKey string, d scheme.Definition) (string, error) {
	m, _ := tenant.MemberFrom(c)
	var id string
	err := tx.QueryRow(c.Context(), `
		WITH n AS (SELECT uuidv7() AS id)
		INSERT INTO schemes (id, family_id, org_id, name, board, pack_key, definition, created_by)
		SELECT n.id, n.id, $1, $2, nullif($3, ''), nullif($4, ''), $5::jsonb, $6 FROM n
		ON CONFLICT DO NOTHING RETURNING id::text`, m.OrgID, name, board, packKey, string(d.JSON()), m.UserID).Scan(&id)
	return id, err
}

func create(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if err := mayWrite(c); err != nil {
		return err
	}
	name, d, err := parse(c)
	if err != nil {
		return err
	}
	id, err := insert(c, tx, name, "", "", d)
	if err != nil {
		return err
	}
	f, err := load(c.Context(), tx, id)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "create", Entity: "schemes", EntityID: id, After: f.summary}); err != nil {
		return err
	}
	return c.Status(http.StatusCreated).JSON(f)
}

var errImmutable = problem.New(http.StatusConflict, "scheme.immutable", "A published scheme never changes. Make a new version to change it.")

func update(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if err := mayWrite(c); err != nil {
		return err
	}
	ctx := c.Context()
	before, err := load(ctx, tx, c.Params("id"))
	if err != nil {
		return err
	}
	if before.Status != "draft" {
		return errImmutable
	}
	name, d, err := parse(c)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE schemes SET name = $2, definition = $3::jsonb WHERE id = $1::uuid`, before.ID, name, string(d.JSON())); err != nil {
		return err
	}
	after, err := load(ctx, tx, before.ID)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "schemes", EntityID: before.ID, Before: before.summary, After: after.summary}); err != nil {
		return err
	}
	return c.JSON(after)
}

func remove(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if err := mayWrite(c); err != nil {
		return err
	}
	ctx := c.Context()
	f, err := load(ctx, tx, c.Params("id"))
	if err != nil {
		return err
	}
	if f.Status != "draft" {
		return problem.New(http.StatusConflict, "scheme.immutable", "A published version stays, for the results worked out with it.")
	}
	var assigned bool
	if err := tx.QueryRow(ctx, `SELECT f.version = 1 AND EXISTS (SELECT 1 FROM scheme_assignments WHERE family_id = f.family_id) FROM schemes f WHERE f.id = $1::uuid`, f.ID).Scan(&assigned); err != nil {
		return err
	}
	if assigned {
		return problem.New(http.StatusConflict, "scheme.assigned", "This scheme is set to apply somewhere. Remove that first.")
	}
	if _, err := tx.Exec(ctx, `UPDATE schemes SET deleted_at = now() WHERE id = $1::uuid`, f.ID); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "delete", Entity: "schemes", EntityID: f.ID, Before: f.summary}); err != nil {
		return err
	}
	return c.SendStatus(http.StatusNoContent)
}

// markFamily marks stale every result a scheme family's assignments reach.
func markFamily(ctx context.Context, tx pgx.Tx, familyID string) (int64, error) {
	rows, err := tx.Query(ctx, `SELECT coalesce(level_id::text, ''), coalesce(period_id::text, ''), coalesce(subject_id::text, '') FROM scheme_assignments WHERE family_id = $1::uuid`, familyID)
	if err != nil {
		return 0, err
	}
	scopes, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) ([3]string, error) {
		var s [3]string
		return s, r.Scan(&s[0], &s[1], &s[2])
	})
	if err != nil {
		return 0, err
	}
	var total int64
	for _, s := range scopes {
		n, err := stale.Scope(ctx, tx, s[0], s[1], s[2])
		if err != nil {
			return total, err
		}
		total += n
	}
	return total, nil
}

func publish(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if err := mayWrite(c); err != nil {
		return err
	}
	ctx := c.Context()
	f, err := load(ctx, tx, c.Params("id"))
	if err != nil {
		return err
	}
	if f.Status != "draft" {
		return problem.New(http.StatusConflict, "scheme.published", "This version is published already.")
	}
	if ps := f.Definition.Validate(); len(ps) > 0 {
		return invalid(ps)
	}
	m, _ := tenant.MemberFrom(c)
	if _, err := tx.Exec(ctx, `UPDATE schemes SET status = 'retired' WHERE family_id = $1::uuid AND status = 'published'`, f.FamilyID); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE schemes SET status = 'published', published_by = $2, published_at = now() WHERE id = $1::uuid`, f.ID, m.UserID); err != nil {
		return err
	}
	marked, err := markFamily(ctx, tx, f.FamilyID)
	if err != nil {
		return err
	}
	after, err := load(ctx, tx, f.ID)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "publish", Entity: "schemes", EntityID: f.ID,
		Before: map[string]any{"status": f.Status}, After: map[string]any{"status": after.Status, "version": after.Version, "marked": marked}}); err != nil {
		return err
	}
	return c.JSON(map[string]any{"scheme": after, "marked": marked})
}

func newVersion(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if err := mayWrite(c); err != nil {
		return err
	}
	ctx := c.Context()
	f, err := load(ctx, tx, c.Params("id"))
	if err != nil {
		return err
	}
	var draft string
	err = tx.QueryRow(ctx, `SELECT id::text FROM schemes WHERE family_id = $1::uuid AND status = 'draft' AND deleted_at IS NULL`, f.FamilyID).Scan(&draft)
	if err == nil {
		d, err := load(ctx, tx, draft)
		if err != nil {
			return err
		}
		return c.JSON(d)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	m, _ := tenant.MemberFrom(c)
	var id string
	if err := tx.QueryRow(ctx, `
		INSERT INTO schemes (org_id, family_id, name, board, version, definition, created_by)
		SELECT $1, family_id, name, board, (SELECT max(version) + 1 FROM schemes WHERE family_id = s.family_id), definition, $3
		  FROM schemes s WHERE id = $2::uuid RETURNING id::text`, m.OrgID, f.ID, m.UserID).Scan(&id); err != nil {
		return err
	}
	out, err := load(ctx, tx, id)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "create", Entity: "schemes", EntityID: id, After: out.summary}); err != nil {
		return err
	}
	return c.JSON(out)
}

func listPacks(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	packs, err := scheme.Packs()
	if err != nil {
		return err
	}
	rows, err := tx.Query(c.Context(), `SELECT pack_key, id::text FROM schemes WHERE pack_key IS NOT NULL AND version = 1 AND deleted_at IS NULL`)
	if err != nil {
		return err
	}
	imported := map[string]string{}
	for rows.Next() {
		var k, id string
		if err := rows.Scan(&k, &id); err != nil {
			return err
		}
		imported[k] = id
	}
	if err := rows.Err(); err != nil {
		return err
	}
	out := make([]api.SchemePack, 0, len(packs))
	for _, p := range packs {
		out = append(out, api.SchemePack{Key: p.Key, Name: p.Name, Board: p.Board, Stage: p.Stage, Version: p.Version, Description: p.Description, SchemeId: imported[p.Key]})
	}
	return c.JSON(out)
}

// importPack makes a draft from a board pack. It is idempotent by the
// pack's key (AT-v3-11).
func importPack(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if err := mayWrite(c); err != nil {
		return err
	}
	ctx := c.Context()
	p, ok := scheme.ShippedPack(c.Params("key"))
	if !ok {
		return problem.New(http.StatusNotFound, "pack.not_found", "No board pack has this key.")
	}
	var id string
	err = tx.QueryRow(ctx, `SELECT id::text FROM schemes WHERE pack_key = $1 AND version = 1 AND deleted_at IS NULL`, p.Key).Scan(&id)
	created := false
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		if id, err = insert(c, tx, p.Name, p.Board, p.Key, p.Definition); err != nil {
			return err
		}
		created = true
	case err != nil:
		return err
	}
	f, err := load(ctx, tx, id)
	if err != nil {
		return err
	}
	if created {
		if err := audit.Record(c, audit.Entry{Action: "import", Entity: "schemes", EntityID: id, After: f.summary}); err != nil {
			return err
		}
	}
	return c.JSON(map[string]any{"scheme": f, "created": created})
}

func listAssignments(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	rows, err := tx.Query(c.Context(), `
		SELECT sa.id::text, sa.family_id::text, latest.name, coalesce(pub.version, 0),
		       coalesce(sa.level_id::text, ''), coalesce(sa.period_id::text, ''), coalesce(sa.subject_id::text, '')
		  FROM scheme_assignments sa
		  JOIN LATERAL (SELECT name FROM schemes WHERE family_id = sa.family_id AND deleted_at IS NULL ORDER BY version DESC LIMIT 1) latest ON true
		  LEFT JOIN LATERAL (SELECT version FROM schemes WHERE family_id = sa.family_id AND status = 'published' AND deleted_at IS NULL ORDER BY version DESC LIMIT 1) pub ON true
		 ORDER BY sa.created_at`)
	if err != nil {
		return err
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (api.SchemeAssignment, error) {
		var a api.SchemeAssignment
		return a, r.Scan(&a.Id, &a.FamilyId, &a.SchemeName, &a.PublishedVersion, &a.LevelId, &a.PeriodId, &a.SubjectId)
	})
	if err != nil {
		return err
	}
	if out == nil {
		out = []api.SchemeAssignment{}
	}
	return c.JSON(out)
}

func assign(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if err := mayWrite(c); err != nil {
		return err
	}
	ctx := c.Context()
	var in api.SchemeAssignmentInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	var f records.Fields
	for _, ref := range []struct{ field, table, id string }{{"levelId", "levels", in.LevelId}, {"periodId", "periods", in.PeriodId}, {"subjectId", "subjects", in.SubjectId}} {
		if ref.id == "" {
			continue
		}
		if err := f.Live(ctx, tx, ref.field, ref.table, ref.id); err != nil {
			return err
		}
	}
	family, err := load(ctx, tx, in.FamilyId)
	if err != nil || family.Version != 1 {
		f.Add("familyId", "unknown", "Choose a scheme.")
	}
	if len(f) > 0 {
		return problem.Invalid(f...)
	}
	m, _ := tenant.MemberFrom(c)
	var prev string
	_ = tx.QueryRow(ctx, `SELECT family_id::text FROM scheme_assignments
		WHERE level_id IS NOT DISTINCT FROM nullif($1, '')::uuid AND period_id IS NOT DISTINCT FROM nullif($2, '')::uuid AND subject_id IS NOT DISTINCT FROM nullif($3, '')::uuid`,
		in.LevelId, in.PeriodId, in.SubjectId).Scan(&prev)
	var out api.SchemeAssignment
	if err := tx.QueryRow(ctx, `
		INSERT INTO scheme_assignments (org_id, family_id, level_id, period_id, subject_id, created_by)
		VALUES ($1, $2::uuid, nullif($3, '')::uuid, nullif($4, '')::uuid, nullif($5, '')::uuid, $6)
		ON CONFLICT (org_id, level_id, period_id, subject_id) DO UPDATE SET family_id = EXCLUDED.family_id
		RETURNING id::text`, m.OrgID, in.FamilyId, in.LevelId, in.PeriodId, in.SubjectId, m.UserID).Scan(&out.Id); err != nil {
		return err
	}
	out.FamilyId, out.SchemeName, out.LevelId, out.PeriodId, out.SubjectId = in.FamilyId, family.Name, in.LevelId, in.PeriodId, in.SubjectId
	_ = tx.QueryRow(ctx, `SELECT version FROM schemes WHERE family_id = $1::uuid AND status = 'published' AND deleted_at IS NULL ORDER BY version DESC LIMIT 1`, in.FamilyId).Scan(&out.PublishedVersion)
	marked, err := stale.Scope(ctx, tx, in.LevelId, in.PeriodId, in.SubjectId)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "scheme_assignments", EntityID: out.Id,
		Before: map[string]string{"familyId": prev}, After: map[string]any{"familyId": in.FamilyId, "levelId": in.LevelId, "periodId": in.PeriodId, "subjectId": in.SubjectId}}); err != nil {
		return err
	}
	return c.JSON(map[string]any{"assignment": out, "marked": marked})
}

func unassign(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if err := mayWrite(c); err != nil {
		return err
	}
	ctx := c.Context()
	id := c.Params("id")
	if !records.UUIDShape.MatchString(id) {
		return problem.New(http.StatusNotFound, "assignment.not_found", "No assignment has this id.")
	}
	var scope [4]string
	err = tx.QueryRow(ctx, `DELETE FROM scheme_assignments WHERE id = $1::uuid
		RETURNING family_id::text, coalesce(level_id::text, ''), coalesce(period_id::text, ''), coalesce(subject_id::text, '')`, id).
		Scan(&scope[0], &scope[1], &scope[2], &scope[3])
	if errors.Is(err, pgx.ErrNoRows) {
		return problem.New(http.StatusNotFound, "assignment.not_found", "No assignment has this id.")
	}
	if err != nil {
		return err
	}
	if _, err := stale.Scope(ctx, tx, scope[1], scope[2], scope[3]); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "delete", Entity: "scheme_assignments", EntityID: id,
		Before: map[string]string{"familyId": scope[0], "levelId": scope[1], "periodId": scope[2], "subjectId": scope[3]}}); err != nil {
		return err
	}
	return c.SendStatus(http.StatusNoContent)
}
