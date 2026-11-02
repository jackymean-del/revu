package people

import (
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// The cursor is the last row's sort key: its lower-case name and id.
func encodeCursor(name, id string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strings.ToLower(name) + "\x1f" + id))
}

func decodeCursor(c string) (string, string, bool) {
	b, err := base64.RawURLEncoding.DecodeString(c)
	if err != nil {
		return "", "", false
	}
	name, id, ok := strings.Cut(string(b), "\x1f")
	return name, id, ok && records.UUIDShape.MatchString(id)
}

func likePattern(q string) string {
	r := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`)
	return "%" + r.Replace(q) + "%"
}

// listStudents returns one page of students by name, each with where they
// are placed in the latest year they are enrolled.
func listStudents(c fiber.Ctx) error {
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
	if c.Query("includeRemoved") != "true" {
		where = append(where, "s.deleted_at IS NULL")
	}
	if q := strings.TrimSpace(c.Query("q")); q != "" {
		p := arg(likePattern(q))
		where = append(where, fmt.Sprintf("(s.name ILIKE %s OR s.admission_no ILIKE %s OR s.preferred_name ILIKE %s)", p, p, p))
	}
	if v := c.Query("sectionId"); v != "" {
		if !records.UUIDShape.MatchString(v) {
			return problem.Invalid(api.FieldError{Field: "sectionId", Code: "unknown", Message: "Not an id."})
		}
		where = append(where, fmt.Sprintf("EXISTS (SELECT 1 FROM enrolments x WHERE x.student_id = s.id AND x.section_id = %s::uuid AND x.deleted_at IS NULL)", arg(v)))
	}
	if v := c.Query("cursor"); v != "" {
		name, id, ok := decodeCursor(v)
		if !ok {
			return problem.Invalid(api.FieldError{Field: "cursor", Code: "unknown", Message: "Start again from the first page."})
		}
		where = append(where, fmt.Sprintf("(lower(s.name), s.id) > (%s, %s::uuid)", arg(name), arg(id)))
	}
	sql := `
		SELECT s.id::text, s.admission_no, s.name, coalesce(s.preferred_name, ''), coalesce(s.dob::text, ''), s.status,
		       coalesce(to_char(s.deleted_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
		       coalesce(p.id::text, ''), coalesce(p.section_id::text, ''), coalesce(p.year_id::text, ''), coalesce(p.roll_no, '')
		  FROM students s
		  LEFT JOIN LATERAL (
		    SELECT e.id, e.section_id, e.year_id, e.roll_no
		      FROM enrolments e JOIN academic_years y ON y.id = e.year_id
		     WHERE e.student_id = s.id AND e.deleted_at IS NULL
		     ORDER BY y.starts_on DESC LIMIT 1) p ON true`
	if len(where) > 0 {
		sql += ` WHERE ` + strings.Join(where, ` AND `)
	}
	sql += ` ORDER BY lower(s.name), s.id LIMIT ` + strconv.Itoa(limit+1)
	rows, err := tx.Query(c.Context(), sql, args...)
	if err != nil {
		return err
	}
	items, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (api.Student, error) {
		var s api.Student
		var p api.Placement
		err := r.Scan(&s.Id, &s.AdmissionNo, &s.Name, &s.PreferredName, &s.Dob, &s.Status, &s.RemovedAt, &p.EnrolmentId, &p.SectionId, &p.YearId, &p.RollNo)
		if p.EnrolmentId != "" {
			s.Placement = &p
		}
		return s, err
	})
	if err != nil {
		return err
	}
	page := api.StudentPage{Items: items}
	if len(items) > limit {
		page.Items = items[:limit]
		last := page.Items[limit-1]
		page.NextCursor = encodeCursor(last.Name, last.Id)
	}
	if page.Items == nil {
		page.Items = []api.Student{}
	}
	return c.JSON(page)
}
