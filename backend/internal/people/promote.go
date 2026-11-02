package people

import (
	"net/http"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// previewPromotion shows where each section of one year would go in the
// next: the section of the same name, in the same branch, at the next level
// (by order). Students of the last level are leaving. Nothing changes; the
// apply step arrives with the year-end tools.
func previewPromotion(c fiber.Ctx) error {
	if err := manage(c, ""); err != nil {
		return err
	}
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	var in api.PromotionRequest
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	ctx := c.Context()
	var f records.Fields
	if err := f.Live(ctx, tx, "fromYearId", "academic_years", in.FromYearId); err != nil {
		return err
	}
	if err := f.Live(ctx, tx, "toYearId", "academic_years", in.ToYearId); err != nil {
		return err
	}
	if len(f) == 0 {
		var later bool
		if err := tx.QueryRow(ctx, `SELECT (SELECT starts_on FROM academic_years WHERE id = $2::uuid) > (SELECT starts_on FROM academic_years WHERE id = $1::uuid)`, in.FromYearId, in.ToYearId).Scan(&later); err != nil {
			return err
		}
		if !later {
			f.Add("toYearId", "order", "Choose a year that starts after the one students move from.")
		}
	}
	if len(f) > 0 {
		return problem.Invalid(f...)
	}

	rows, err := tx.Query(ctx, `
		WITH next_level AS (
		  SELECT l.id, (SELECT n.id FROM levels n WHERE n.deleted_at IS NULL AND n.seq > l.seq ORDER BY n.seq, lower(n.name) LIMIT 1) AS next_id
		    FROM levels l
		)
		SELECT s.id::text, l.name || ' ' || s.name,
		       (SELECT count(*) FROM enrolments e JOIN students st ON st.id = e.student_id
		         WHERE e.section_id = s.id AND e.deleted_at IS NULL AND st.deleted_at IS NULL AND st.status = 'active'),
		       (SELECT count(*) FROM enrolments e JOIN students st ON st.id = e.student_id
		         WHERE e.section_id = s.id AND e.deleted_at IS NULL AND st.deleted_at IS NULL AND st.status = 'active'
		           AND EXISTS (SELECT 1 FROM enrolments x WHERE x.student_id = e.student_id AND x.year_id = $2::uuid AND x.deleted_at IS NULL)),
		       nl.next_id IS NULL,
		       coalesce(t.id::text, ''), coalesce(tl.name || ' ' || t.name, '')
		  FROM sections s
		  JOIN levels l ON l.id = s.level_id
		  JOIN next_level nl ON nl.id = l.id
		  LEFT JOIN sections t ON t.year_id = $2::uuid AND t.level_id = nl.next_id AND t.branch_id = s.branch_id
		                       AND lower(t.name) = lower(s.name) AND t.deleted_at IS NULL
		  LEFT JOIN levels tl ON tl.id = t.level_id
		 WHERE s.year_id = $1::uuid AND s.deleted_at IS NULL
		 ORDER BY l.seq, lower(s.name)`, in.FromYearId, in.ToYearId)
	if err != nil {
		return err
	}
	moves, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (api.PromotionMove, error) {
		var m api.PromotionMove
		var last bool
		err := r.Scan(&m.FromSectionId, &m.FromName, &m.Students, &m.AlreadyPlaced, &last, &m.ToSectionId, &m.ToName)
		switch {
		case last:
			m.Outcome, m.ToSectionId, m.ToName = "leaving", "", ""
		case m.ToSectionId != "":
			m.Outcome = "promote"
		default:
			m.Outcome = "no_match"
		}
		return m, err
	})
	if err != nil {
		return err
	}
	out := api.PromotionPreview{Moves: nonNil(moves)}
	for _, m := range moves {
		out.Students += m.Students
	}
	return c.Status(http.StatusOK).JSON(out)
}
