package results

import (
	"context"
	"errors"
	"fmt"
	"net/http"

	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/evidence"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/scheme"
)

// Reads a screen needs together are queued on one pgx.Batch and sent in a
// single round trip (decision D30). Each Queue function returns a getter
// to call after the batch is sent; a "not found" answer is kept for the
// getter, while a database error fails the batch.

// Send sends b when anything is queued on it.
func Send(ctx context.Context, tx pgx.Tx, b *pgx.Batch) error {
	if b.Len() == 0 {
		return nil
	}
	return tx.SendBatch(ctx, b).Close()
}

// QueueSection queues reading a section and, when periodID is given,
// whether that period is in the section's year.
func QueueSection(b *pgx.Batch, sectionID, periodID string) func() (Section, error) {
	s := Section{ID: sectionID}
	for _, f := range []struct{ field, v string }{{"sectionId", sectionID}, {"periodId", periodID}} {
		if f.field == "periodId" && periodID == "" {
			continue
		}
		if !records.UUIDShape.MatchString(f.v) {
			bad := problem.Invalid(api.FieldError{Field: f.field, Code: "unknown", Message: "Not an id."})
			return func() (Section, error) { return s, bad }
		}
	}
	var err error
	b.Queue(`
		SELECT branch_id::text, level_id::text, year_id::text,
		       $2 = '' OR EXISTS (SELECT 1 FROM periods p WHERE p.id = nullif($2, '')::uuid AND p.year_id = s.year_id AND p.deleted_at IS NULL)
		  FROM sections s WHERE s.id = $1::uuid AND s.deleted_at IS NULL`, sectionID, periodID).
		QueryRow(func(r pgx.Row) error {
			var inYear bool
			e := r.Scan(&s.BranchID, &s.LevelID, &s.YearID, &inYear)
			switch {
			case errors.Is(e, pgx.ErrNoRows):
				err = problem.New(http.StatusNotFound, "section.not_found", "No section has this id.")
			case e != nil:
				return e
			case !inYear:
				err = problem.Invalid(api.FieldError{Field: "periodId", Code: "unknown", Message: "This period is not in the section's year."})
			}
			return nil
		})
	return func() (Section, error) { return s, err }
}

// Place is whether a student takes a subject, and whether a choice they
// must make for it is missing.
type Place struct{ Takes, ChoiceMissing bool }

// Roster is a section's students in roll order, and where each stands in
// every subject of the level.
type Roster struct {
	Students []Student
	Places   map[[2]string]Place // by student id and subject id
}

// QueueRoster queues the section's students for every subject of its
// level at once, so a screen across subjects reads them in one go.
func QueueRoster(b *pgx.Batch, s Section, periodID string) func() Roster {
	out := Roster{Places: map[[2]string]Place{}}
	b.Queue(`
		SELECT a.subject_id::text, st.id::text, st.name, st.admission_no, coalesce(e.roll_no, ''),
		       `+fmt.Sprintf(evidence.Applicable, "("+evidence.Selected+")", "st.id")+`, `+choiceMissing+`
		  FROM enrolments e
		  JOIN students st ON st.id = e.student_id AND st.deleted_at IS NULL
		  CROSS JOIN LATERAL (SELECT st.id AS s) k
		  CROSS JOIN (SELECT $2::uuid AS level_id, ls.subject_id, $3::uuid AS year_id, $4::uuid AS period_id
		                FROM level_subjects ls JOIN subjects sj ON sj.id = ls.subject_id AND sj.deleted_at IS NULL
		               WHERE ls.level_id = $2::uuid AND ls.deleted_at IS NULL) a
		 WHERE e.section_id = $1::uuid AND e.year_id = $3::uuid AND e.deleted_at IS NULL
		 ORDER BY e.roll_no IS NULL, lpad(e.roll_no, 12, '0'), st.name, st.id`, s.ID, s.LevelID, s.YearID, periodID).
		Query(func(rows pgx.Rows) error {
			seen := map[string]bool{}
			for rows.Next() {
				var subject string
				var x Student
				if err := rows.Scan(&subject, &x.ID, &x.Name, &x.AdmissionNo, &x.RollNo, &x.Takes, &x.ChoiceMissing); err != nil {
					return err
				}
				if !seen[x.ID] {
					seen[x.ID] = true
					out.Students = append(out.Students, Student{ID: x.ID, Name: x.Name, AdmissionNo: x.AdmissionNo, RollNo: x.RollNo})
				}
				out.Places[[2]string{x.ID, subject}] = Place{x.Takes, x.ChoiceMissing}
			}
			return rows.Err()
		})
	return func() Roster { return out }
}

// QueueSchemes queues reading the assignments in force.
func QueueSchemes(b *pgx.Batch) func() Schemes {
	var out Schemes
	b.Queue(`
		SELECT coalesce(sa.level_id::text, ''), coalesce(sa.period_id::text, ''), coalesce(sa.subject_id::text, ''),
		       s.id::text, s.family_id::text, s.name, s.version, s.definition
		  FROM scheme_assignments sa
		  JOIN LATERAL (SELECT id, family_id, name, version, definition FROM schemes
		                 WHERE family_id = sa.family_id AND status = 'published' AND deleted_at IS NULL
		                 ORDER BY version DESC LIMIT 1) s ON true`).
		Query(func(rows pgx.Rows) error {
			for rows.Next() {
				var a assignment
				var raw []byte
				if err := rows.Scan(&a.levelID, &a.periodID, &a.subjectID, &a.scheme.ID, &a.scheme.FamilyID, &a.scheme.Name, &a.scheme.Version, &raw); err != nil {
					return err
				}
				d, err := scheme.Parse(raw)
				if err != nil {
					return fmt.Errorf("scheme %s v%d is stored invalid: %w", a.scheme.Name, a.scheme.Version, err)
				}
				a.scheme.Definition = d
				out = append(out, a)
			}
			return rows.Err()
		})
	return func() Schemes { return out }
}
