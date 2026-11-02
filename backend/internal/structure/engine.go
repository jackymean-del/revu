// Package structure serves the institution's structure: branches, years,
// periods, levels, sections, subjects, the subjects of each level, and who
// teaches what. Every resource has the same five operations (list, create,
// change, remove, restore), so they share one engine; each resource is a
// short definition in resources.go with its own checks, in plain SQL.
//
// Rules for all of them: any member may read; changing needs
// structure.write (administrators, or a branch administrator inside their
// branch); removing is soft and refused while anything live still uses the
// item; restoring is refused while its parent is removed; every change is
// audited with the record before and after.
package structure

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/tenant"
	"github.com/jackymean-del/revu/internal/terminology"
)

// column is a writable column and the cast its parameter needs.
type column struct{ name, cast string }

// dependant is a table whose live rows, pointing at an item, stop it being
// removed. word names them in the organisation's words.
type dependant struct {
	table, column string
	word          func(words wordsFn, n int) string
}

// parent is a column pointing at a row that must be live for a restore.
type parent struct {
	column, table string
	word          func(words wordsFn) string
}

type wordsFn func(key string, count int) string

type resource[T, In any] struct {
	path, table string
	// selectList yields T's fields in scan order, followed by removedAt.
	selectList string
	scan       func(pgx.CollectableRow) (T, error)
	order      string
	filters    map[string]string // query parameter -> uuid column
	columns    []column
	values     func(In) []any
	// check trims and validates input, including that references are live
	// rows of this organisation.
	check func(ctx context.Context, tx pgx.Tx, in *In) ([]api.FieldError, error)
	// branchOf names the branch an item belongs to, for branch-limited
	// administrators: from the input when in is set, else from the stored
	// row id. nil means the item is organisation-wide.
	branchOf   func(ctx context.Context, tx pgx.Tx, in *In, id string) (string, error)
	dependants []dependant
	parents    []parent
	audited    string // entity name in the audit log
}

const removed = `coalesce(to_char(deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')`

var uuidShape = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

var errNotFound = problem.New(http.StatusNotFound, "structure.not_found", "Nothing here has this id.")

func (r resource[T, In]) routes(g fiber.Router) {
	g.Get("/"+r.path, r.list)
	g.Post("/"+r.path, r.create)
	g.Put("/"+r.path+"/:id", r.update)
	g.Delete("/"+r.path+"/:id", r.remove)
	g.Post("/"+r.path+"/:id/restore", r.restore)
}

func (r resource[T, In]) list(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	var where []string
	var args []any
	if c.Query("includeRemoved") != "true" {
		where = append(where, "deleted_at IS NULL")
	}
	for param, col := range r.filters {
		v := c.Query(param)
		if v == "" {
			continue
		}
		if !uuidShape.MatchString(v) {
			return problem.Invalid(api.FieldError{Field: param, Code: "unknown", Message: "Not an id."})
		}
		args = append(args, v)
		where = append(where, fmt.Sprintf("%s = $%d::uuid", col, len(args)))
	}
	sql := `SELECT ` + r.selectList + `, ` + removed + ` FROM ` + r.table
	if len(where) > 0 {
		sql += ` WHERE ` + strings.Join(where, ` AND `)
	}
	rows, err := tx.Query(c.Context(), sql+` ORDER BY `+r.order, args...)
	if err != nil {
		return err
	}
	items, err := pgx.CollectRows(rows, r.scan)
	if err != nil {
		return err
	}
	if items == nil {
		items = []T{}
	}
	return c.JSON(items)
}

// one reads an item; live chooses live (true) or removed (false) rows.
func (r resource[T, In]) one(ctx context.Context, tx pgx.Tx, id string, live bool) (T, error) {
	var zero T
	if !uuidShape.MatchString(id) {
		return zero, errNotFound
	}
	state := `deleted_at IS NULL`
	if !live {
		state = `deleted_at IS NOT NULL`
	}
	rows, err := tx.Query(ctx, `SELECT `+r.selectList+`, `+removed+` FROM `+r.table+` WHERE id = $1::uuid AND `+state, id)
	if err != nil {
		return zero, err
	}
	item, err := pgx.CollectExactlyOneRow(rows, r.scan)
	if errors.Is(err, pgx.ErrNoRows) {
		return zero, errNotFound
	}
	return item, err
}

// allowed checks structure.write for the branch of the item.
func (r resource[T, In]) allowed(c fiber.Ctx, tx pgx.Tx, in *In, id string) error {
	m, _ := tenant.MemberFrom(c)
	target := policy.Target{}
	if r.branchOf != nil {
		b, err := r.branchOf(c.Context(), tx, in, id)
		if err != nil {
			return err
		}
		target.BranchID = b
	}
	return policy.Check(m.Actor(), policy.StructureWrite, target)
}

func (r resource[T, In]) input(c fiber.Ctx, tx pgx.Tx) (In, error) {
	var in In
	if err := httpx.Decode(c, &in); err != nil {
		return in, err
	}
	fields, err := r.check(c.Context(), tx, &in)
	if err != nil {
		return in, err
	}
	if len(fields) > 0 {
		return in, problem.Invalid(fields...)
	}
	return in, nil
}

func (r resource[T, In]) create(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	in, err := r.input(c, tx)
	if err != nil {
		return err
	}
	if err := r.allowed(c, tx, &in, ""); err != nil {
		return err
	}
	m, _ := tenant.MemberFrom(c)
	names, marks := []string{"org_id"}, []string{"$1"}
	args := append([]any{m.OrgID}, r.values(in)...)
	for i, col := range r.columns {
		names = append(names, col.name)
		marks = append(marks, fmt.Sprintf("$%d%s", i+2, col.cast))
	}
	var id string
	err = tx.QueryRow(c.Context(), `INSERT INTO `+r.table+` (`+strings.Join(names, ", ")+`) VALUES (`+strings.Join(marks, ", ")+`) RETURNING id::text`, args...).Scan(&id)
	if err != nil {
		return dbProblem(err)
	}
	item, err := r.one(c.Context(), tx, id, true)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "create", Entity: r.audited, EntityID: id, After: item}); err != nil {
		return err
	}
	return c.Status(http.StatusCreated).JSON(item)
}

func (r resource[T, In]) update(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	id := c.Params("id")
	before, err := r.one(c.Context(), tx, id, true)
	if err != nil {
		return err
	}
	if err := r.allowed(c, tx, nil, id); err != nil { // the branch it is in now
		return err
	}
	in, err := r.input(c, tx)
	if err != nil {
		return err
	}
	if err := r.allowed(c, tx, &in, id); err != nil { // and the branch it moves to
		return err
	}
	sets := make([]string, len(r.columns))
	for i, col := range r.columns {
		sets[i] = fmt.Sprintf("%s = $%d%s", col.name, i+2, col.cast)
	}
	args := append([]any{id}, r.values(in)...)
	if _, err := tx.Exec(c.Context(), `UPDATE `+r.table+` SET `+strings.Join(sets, ", ")+` WHERE id = $1::uuid AND deleted_at IS NULL`, args...); err != nil {
		return dbProblem(err)
	}
	after, err := r.one(c.Context(), tx, id, true)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: r.audited, EntityID: id, Before: before, After: after}); err != nil {
		return err
	}
	return c.JSON(after)
}

func (r resource[T, In]) remove(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	id := c.Params("id")
	before, err := r.one(ctx, tx, id, true)
	if err != nil {
		return err
	}
	if err := r.allowed(c, tx, nil, id); err != nil {
		return err
	}
	var users []string
	var words wordsFn
	for _, d := range r.dependants {
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM `+d.table+` WHERE `+d.column+` = $1::uuid AND deleted_at IS NULL`, id).Scan(&n); err != nil {
			return err
		}
		if n == 0 {
			continue
		}
		if words == nil {
			if words, err = terminology.Words(ctx, tx); err != nil {
				return err
			}
		}
		users = append(users, fmt.Sprintf("%d %s", n, d.word(words, n)))
	}
	if len(users) > 0 {
		return problem.New(http.StatusConflict, "structure.in_use",
			"Still used by "+strings.Join(users, " and ")+". Remove or move those first.")
	}
	if _, err := tx.Exec(ctx, `UPDATE `+r.table+` SET deleted_at = now() WHERE id = $1::uuid`, id); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "delete", Entity: r.audited, EntityID: id, Before: before}); err != nil {
		return err
	}
	return c.SendStatus(http.StatusNoContent)
}

func (r resource[T, In]) restore(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	id := c.Params("id")
	if _, err := r.one(ctx, tx, id, false); err != nil {
		return err
	}
	if err := r.allowed(c, tx, nil, id); err != nil {
		return err
	}
	for _, p := range r.parents {
		var live bool
		err := tx.QueryRow(ctx, `SELECT coalesce((SELECT deleted_at IS NULL FROM `+p.table+` WHERE id = t.`+p.column+`), true) FROM `+r.table+` t WHERE t.id = $1::uuid`, id).Scan(&live)
		if err != nil {
			return err
		}
		if !live {
			words, err := terminology.Words(ctx, tx)
			if err != nil {
				return err
			}
			return problem.New(http.StatusConflict, "structure.parent_removed", "Restore its "+p.word(words)+" first.")
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE `+r.table+` SET deleted_at = NULL WHERE id = $1::uuid`, id); err != nil {
		return dbProblem(err)
	}
	after, err := r.one(ctx, tx, id, true)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "restore", Entity: r.audited, EntityID: id, After: after}); err != nil {
		return err
	}
	return c.JSON(after)
}

// dbProblem turns constraint failures into problems a person can act on.
func dbProblem(err error) error {
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		switch pe.Code {
		case "23505":
			return problem.New(http.StatusConflict, "structure.name_taken", "This name is already used here. Choose another, or restore the removed one.")
		case "23514":
			return problem.New(http.StatusUnprocessableEntity, "validation.failed", "A value is outside what is allowed.")
		}
	}
	return err
}

// field helpers for checks.

type fields []api.FieldError

func (f *fields) add(field, code, msg string) {
	*f = append(*f, api.FieldError{Field: field, Code: code, Message: msg})
}

// text trims s in place and checks its length.
func (f *fields) text(field string, s *string, min, max int) {
	*s = strings.TrimSpace(*s)
	if n := len([]rune(*s)); n < min || n > max {
		if min > 0 && n == 0 {
			f.add(field, "required", "Fill this in.")
			return
		}
		f.add(field, "length", fmt.Sprintf("Use at most %d characters.", max))
	}
}

// live checks that id is a live row of table in this organisation.
func (f *fields) live(ctx context.Context, tx pgx.Tx, field, table, id string) error {
	if !uuidShape.MatchString(id) {
		f.add(field, "unknown", "Choose one from the list.")
		return nil
	}
	var ok bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM `+table+` WHERE id = $1::uuid AND deleted_at IS NULL)`, id).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		f.add(field, "unknown", "Choose one from the list.")
	}
	return nil
}
