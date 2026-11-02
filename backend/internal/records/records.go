// Package records is the shared engine for organisation records that have
// the same five operations: list, create, change, remove (soft) and restore.
// Structure and people modules define each record in a few lines of plain
// SQL and checks; the rules live here once.
//
// Rules for all of them: any member may read; changing needs the record's
// write action (structure.write by default, which also covers people:
// administrators, or a branch administrator inside their branch); removing
// is soft and refused while anything live still uses the item; restoring is
// refused while its parent is removed; every change is audited with the
// record before and after.
package records

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
type Column struct {
	Name, Cast string
	// Wrap, when set, places the parameter inside an SQL expression, for
	// example a value looked up from another row: "(SELECT year_id FROM sections WHERE id = %s::uuid)".
	Wrap string
}

// dependant is a table whose live rows, pointing at an item, stop it being
// removed. word names them in the organisation's words.
type Dependant struct {
	Table, Column string
	Word          func(words Words, n int) string
}

// parent is a column pointing at a row that must be live for a restore.
type Parent struct {
	Column, Table string
	Word          func(words Words) string
}

type Words func(key string, count int) string

func (c Column) mark(n int) string {
	p := fmt.Sprintf("$%d%s", n, c.Cast)
	if c.Wrap != "" {
		return fmt.Sprintf(c.Wrap, p)
	}
	return p
}

type Resource[T, In any] struct {
	Path, Table string
	// SelectList yields T's fields in scan order, followed by removedAt.
	SelectList string
	Scan       func(pgx.CollectableRow) (T, error)
	Order      string
	Filters    map[string]string // query parameter -> uuid column
	Columns    []Column
	Values     func(In) []any
	// Check trims and validates input, including that references are live
	// rows of this organisation.
	Check func(ctx context.Context, tx pgx.Tx, in *In) ([]api.FieldError, error)
	// BranchOf names the branch an item belongs to, for branch-limited
	// administrators: from the input when in is set, else from the stored
	// row id. nil means the item is organisation-wide.
	BranchOf func(ctx context.Context, tx pgx.Tx, in *In, id string) (string, error)
	// BeforeWrite runs after the checks and permission, before a create
	// (id "") or a change, for work such as clearing another primary contact.
	BeforeWrite func(ctx context.Context, tx pgx.Tx, in *In, id string) error
	Dependants  []Dependant
	Parents     []Parent
	Audited     string // entity name in the audit log
}

const removed = `coalesce(to_char(deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')`

// UUIDShape matches an id.
var UUIDShape = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

var errNotFound = problem.New(http.StatusNotFound, "structure.not_found", "Nothing here has this id.")

// Routes registers the five operations.
func (r Resource[T, In]) Routes(g fiber.Router) {
	g.Get("/"+r.Path, r.list)
	r.Writes(g)
}

// Writes registers create, change, remove and restore only, for records
// whose list needs its own query (search, paging).
func (r Resource[T, In]) Writes(g fiber.Router) {
	g.Post("/"+r.Path, r.create)
	g.Put("/"+r.Path+"/:id", r.update)
	g.Delete("/"+r.Path+"/:id", r.remove)
	g.Post("/"+r.Path+"/:id/restore", r.restore)
}

func (r Resource[T, In]) list(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	var where []string
	var args []any
	if c.Query("includeRemoved") != "true" {
		where = append(where, "deleted_at IS NULL")
	}
	for param, col := range r.Filters {
		v := c.Query(param)
		if v == "" {
			continue
		}
		if !UUIDShape.MatchString(v) {
			return problem.Invalid(api.FieldError{Field: param, Code: "unknown", Message: "Not an id."})
		}
		args = append(args, v)
		where = append(where, fmt.Sprintf("%s = $%d::uuid", col, len(args)))
	}
	sql := `SELECT ` + r.SelectList + `, ` + removed + ` FROM ` + r.Table
	if len(where) > 0 {
		sql += ` WHERE ` + strings.Join(where, ` AND `)
	}
	rows, err := tx.Query(c.Context(), sql+` ORDER BY `+r.Order, args...)
	if err != nil {
		return err
	}
	items, err := pgx.CollectRows(rows, r.Scan)
	if err != nil {
		return err
	}
	if items == nil {
		items = []T{}
	}
	return c.JSON(items)
}

// one reads an item; live chooses live (true) or removed (false) rows.
func (r Resource[T, In]) one(ctx context.Context, tx pgx.Tx, id string, live bool) (T, error) {
	var zero T
	if !UUIDShape.MatchString(id) {
		return zero, errNotFound
	}
	state := `deleted_at IS NULL`
	if !live {
		state = `deleted_at IS NOT NULL`
	}
	rows, err := tx.Query(ctx, `SELECT `+r.SelectList+`, `+removed+` FROM `+r.Table+` WHERE id = $1::uuid AND `+state, id)
	if err != nil {
		return zero, err
	}
	item, err := pgx.CollectExactlyOneRow(rows, r.Scan)
	if errors.Is(err, pgx.ErrNoRows) {
		return zero, errNotFound
	}
	return item, err
}

// allowed checks structure.write for the branch of the item.
func (r Resource[T, In]) allowed(c fiber.Ctx, tx pgx.Tx, in *In, id string) error {
	m, _ := tenant.MemberFrom(c)
	target := policy.Target{}
	if r.BranchOf != nil {
		b, err := r.BranchOf(c.Context(), tx, in, id)
		if err != nil {
			return err
		}
		target.BranchID = b
	}
	return policy.Check(m.Actor(), policy.StructureWrite, target)
}

func (r Resource[T, In]) input(c fiber.Ctx, tx pgx.Tx) (In, error) {
	var in In
	if err := httpx.Decode(c, &in); err != nil {
		return in, err
	}
	fields, err := r.Check(c.Context(), tx, &in)
	if err != nil {
		return in, err
	}
	if len(fields) > 0 {
		return in, problem.Invalid(fields...)
	}
	return in, nil
}

func (r Resource[T, In]) create(c fiber.Ctx) error {
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
	if r.BeforeWrite != nil {
		if err := r.BeforeWrite(c.Context(), tx, &in, ""); err != nil {
			return err
		}
	}
	m, _ := tenant.MemberFrom(c)
	names, marks := []string{"org_id"}, []string{"$1"}
	args := append([]any{m.OrgID}, r.Values(in)...)
	for i, col := range r.Columns {
		names = append(names, col.Name)
		marks = append(marks, col.mark(i+2))
	}
	var id string
	err = tx.QueryRow(c.Context(), `INSERT INTO `+r.Table+` (`+strings.Join(names, ", ")+`) VALUES (`+strings.Join(marks, ", ")+`) RETURNING id::text`, args...).Scan(&id)
	if err != nil {
		return DBProblem(err)
	}
	item, err := r.one(c.Context(), tx, id, true)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "create", Entity: r.Audited, EntityID: id, After: item}); err != nil {
		return err
	}
	return c.Status(http.StatusCreated).JSON(item)
}

func (r Resource[T, In]) update(c fiber.Ctx) error {
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
	if r.BeforeWrite != nil {
		if err := r.BeforeWrite(c.Context(), tx, &in, id); err != nil {
			return err
		}
	}
	sets := make([]string, len(r.Columns))
	for i, col := range r.Columns {
		sets[i] = col.Name + " = " + col.mark(i+2)
	}
	args := append([]any{id}, r.Values(in)...)
	if _, err := tx.Exec(c.Context(), `UPDATE `+r.Table+` SET `+strings.Join(sets, ", ")+` WHERE id = $1::uuid AND deleted_at IS NULL`, args...); err != nil {
		return DBProblem(err)
	}
	after, err := r.one(c.Context(), tx, id, true)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: r.Audited, EntityID: id, Before: before, After: after}); err != nil {
		return err
	}
	return c.JSON(after)
}

func (r Resource[T, In]) remove(c fiber.Ctx) error {
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
	var words Words
	for _, d := range r.Dependants {
		var n int
		if err := tx.QueryRow(ctx, `SELECT count(*) FROM `+d.Table+` WHERE `+d.Column+` = $1::uuid AND deleted_at IS NULL`, id).Scan(&n); err != nil {
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
		users = append(users, fmt.Sprintf("%d %s", n, d.Word(words, n)))
	}
	if len(users) > 0 {
		return problem.New(http.StatusConflict, "structure.in_use",
			"Still used by "+strings.Join(users, " and ")+". Remove or move those first.")
	}
	if _, err := tx.Exec(ctx, `UPDATE `+r.Table+` SET deleted_at = now() WHERE id = $1::uuid`, id); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "delete", Entity: r.Audited, EntityID: id, Before: before}); err != nil {
		return err
	}
	return c.SendStatus(http.StatusNoContent)
}

func (r Resource[T, In]) restore(c fiber.Ctx) error {
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
	for _, p := range r.Parents {
		var live bool
		err := tx.QueryRow(ctx, `SELECT coalesce((SELECT deleted_at IS NULL FROM `+p.Table+` WHERE id = t.`+p.Column+`), true) FROM `+r.Table+` t WHERE t.id = $1::uuid`, id).Scan(&live)
		if err != nil {
			return err
		}
		if !live {
			words, err := terminology.Words(ctx, tx)
			if err != nil {
				return err
			}
			return problem.New(http.StatusConflict, "structure.parent_removed", "Restore its "+p.Word(words)+" first.")
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE `+r.Table+` SET deleted_at = NULL WHERE id = $1::uuid`, id); err != nil {
		return DBProblem(err)
	}
	after, err := r.one(ctx, tx, id, true)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "restore", Entity: r.Audited, EntityID: id, After: after}); err != nil {
		return err
	}
	return c.JSON(after)
}

// DBProblem turns constraint failures into problems a person can act on.
func DBProblem(err error) error {
	var pe *pgconn.PgError
	if errors.As(err, &pe) {
		switch pe.Code {
		case "23505":
			return problem.New(http.StatusConflict, "structure.name_taken", "This name or number is already used here. Choose another, or restore the removed one.")
		case "23514":
			return problem.New(http.StatusUnprocessableEntity, "validation.failed", "A value is outside what is allowed.")
		}
	}
	return err
}

// Fields collects field problems for one input.

type Fields []api.FieldError

func (f *Fields) Add(field, code, msg string) {
	*f = append(*f, api.FieldError{Field: field, Code: code, Message: msg})
}

// text trims s in place and checks its length.
func (f *Fields) Text(field string, s *string, min, max int) {
	*s = strings.TrimSpace(*s)
	if n := len([]rune(*s)); n < min || n > max {
		if min > 0 && n == 0 {
			f.Add(field, "required", "Fill this in.")
			return
		}
		f.Add(field, "length", fmt.Sprintf("Use at most %d characters.", max))
	}
}

// live checks that id is a live row of table in this organisation.
func (f *Fields) Live(ctx context.Context, tx pgx.Tx, field, table, id string) error {
	if !UUIDShape.MatchString(id) {
		f.Add(field, "unknown", "Choose one from the list.")
		return nil
	}
	var ok bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM `+table+` WHERE id = $1::uuid AND deleted_at IS NULL)`, id).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		f.Add(field, "unknown", "Choose one from the list.")
	}
	return nil
}
