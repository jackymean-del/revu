// Package stale records that results must be worked out again: it writes a
// recompute intent for each student, period and subject touched, and marks
// the results already stored for them stale, in the caller's transaction
// (blueprint Part 6.1, AT-v3-06). The recompute loop in internal/results
// consumes the intents. Reads never compute; a stale result is shown with a
// marker until it is fresh.
package stale

import (
	"context"

	"github.com/jackc/pgx/v5"
)

// keys is a query that yields (student_id, period_id, subject_id); mark
// writes an intent for each and marks their stored results stale.
func mark(ctx context.Context, tx pgx.Tx, keys string, args ...any) (int64, error) {
	var n int64
	err := tx.QueryRow(ctx, `
		WITH k AS (`+keys+`),
		     i AS (INSERT INTO result_stale_intents (org_id, student_id, period_id, subject_id)
		           SELECT app_org_id(), student_id, period_id, subject_id FROM k
		           ON CONFLICT (student_id, period_id, subject_id) DO UPDATE SET marked_at = now()
		           RETURNING 1),
		     u AS (UPDATE computed_results r SET stale = true
		             FROM k WHERE r.student_id = k.student_id AND r.period_id = k.period_id AND r.subject_id = k.subject_id AND NOT r.stale
		           RETURNING 1)
		SELECT count(*) FROM i`, args...).Scan(&n)
	return n, err
}

// Student marks one student's result in one subject and period.
func Student(ctx context.Context, tx pgx.Tx, studentID, periodID, subjectID string) error {
	_, err := mark(ctx, tx, `SELECT $1::uuid AS student_id, $2::uuid AS period_id, $3::uuid AS subject_id`, studentID, periodID, subjectID)
	return err
}

// Assessment marks the result of every student an assessment covers, after
// its columns, kind, sections or existence change.
func Assessment(ctx context.Context, tx pgx.Tx, assessmentID string) error {
	_, err := mark(ctx, tx, `
		SELECT DISTINCT e.student_id, a.period_id, a.subject_id
		  FROM assessments a
		  JOIN assessment_scopes sc ON sc.assessment_id = a.id
		  JOIN enrolments e ON e.section_id = sc.section_id AND e.year_id = a.year_id AND e.deleted_at IS NULL
		 WHERE a.id = $1::uuid`, assessmentID)
	return err
}

// Scope marks every result a scheme assignment reaches: students of the
// level (or every level) in the period (or every period), in the subject
// (or every subject the level teaches). An empty id means all. It returns
// how many results it marked.
func Scope(ctx context.Context, tx pgx.Tx, levelID, periodID, subjectID string) (int64, error) {
	return mark(ctx, tx, `
		SELECT DISTINCT e.student_id, p.id AS period_id, ls.subject_id
		  FROM periods p
		  JOIN sections s ON s.year_id = p.year_id AND s.deleted_at IS NULL
		  JOIN enrolments e ON e.section_id = s.id AND e.year_id = p.year_id AND e.deleted_at IS NULL
		  JOIN level_subjects ls ON ls.level_id = s.level_id AND ls.deleted_at IS NULL
		 WHERE p.deleted_at IS NULL
		   AND ($1 = '' OR s.level_id::text = $1) AND ($2 = '' OR p.id::text = $2) AND ($3 = '' OR ls.subject_id::text = $3)`,
		levelID, periodID, subjectID)
}
