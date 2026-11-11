package seed

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// The competencies each Class 6 Mathematics lesson builds, in lesson order.
var class6Competencies = []string{"Number sense", "Operations", "Measurement and data", "Spatial reasoning"}

// The activities rated each term, as one co-curricular subject.
var activities = []string{"Art", "Music", "Sport", "General knowledge"}

var demoVoiceKinds = []string{"self", "peer", "parent", "ambition"}
var demoVoiceTexts = []string{
	"I liked the fraction games; long division is still hard.",
	"Always helps others in group work.",
	"Practises tables at home with a sibling.",
	"To become a scientist.",
}

// seedHolistic gives the demo school's Class 6 a holistic report to look
// at: competencies for each lesson, the term's Mathematics marks tagged
// with outcomes, an activities subject with the teacher's ratings, and a
// few voices. All made up for the demo.
func seedHolistic(ctx context.Context, tx pgx.Tx, org, year, level, subject string, byLesson [][]string) error {
	for i, name := range class6Competencies {
		comp, err := ensure(ctx, tx,
			`SELECT id::text FROM competencies WHERE org_id = $1 AND subject_id = $2::uuid AND name = $3 AND deleted_at IS NULL`,
			`INSERT INTO competencies (org_id, subject_id, name, seq) VALUES ($1, $2::uuid, $3, $4) RETURNING id::text`, 3,
			org, subject, name, i+1)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE learning_outcomes SET competency_id = $2::uuid WHERE id = ANY($1::uuid[]) AND competency_id IS NULL`, byLesson[i], comp); err != nil {
			return err
		}
	}
	// The term's tests: part A recalls numbers, B works with fractions, C
	// with decimals and shapes; the half-yearly total covers every lesson.
	for _, x := range []struct {
		part     string
		outcomes []string
	}{
		{"A", []string{byLesson[0][0]}},
		{"B", []string{byLesson[1][2]}},
		{"C", []string{byLesson[2][2], byLesson[3][1]}},
		{"Total", []string{byLesson[0][1], byLesson[1][1], byLesson[2][0], byLesson[3][0]}},
	} {
		if _, err := tx.Exec(ctx, `
			INSERT INTO part_tags (org_id, part_id, outcome_id)
			SELECT $1, p.id, o FROM assessment_parts p JOIN assessments a ON a.id = p.assessment_id
			  CROSS JOIN unnest($4::uuid[]) o
			 WHERE a.org_id = $1 AND a.level_id = $2::uuid AND a.subject_id = $3::uuid AND a.year_id = $6::uuid AND p.name = $5
			   AND p.deleted_at IS NULL AND a.deleted_at IS NULL
			   AND NOT EXISTS (SELECT 1 FROM part_tags t WHERE t.part_id = p.id AND t.outcome_id = o)`, org, level, subject, x.outcomes, x.part, year); err != nil {
			return fmt.Errorf("tags: %w", err)
		}
	}
	act, err := ensure(ctx, tx,
		`SELECT id::text FROM subjects WHERE org_id = $1 AND name = $2 AND deleted_at IS NULL`,
		`INSERT INTO subjects (org_id, name, kind) VALUES ($1, $2, 'co_curricular') RETURNING id::text`, 2, org, "Activities")
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO level_subjects (org_id, level_id, subject_id) SELECT $1, $2::uuid, $3::uuid
		WHERE NOT EXISTS (SELECT 1 FROM level_subjects WHERE level_id = $2::uuid AND subject_id = $3::uuid AND deleted_at IS NULL)`, org, level, act); err != nil {
		return err
	}
	var first string
	if err := tx.QueryRow(ctx, `SELECT id::text FROM periods WHERE org_id = $1 AND year_id = $2::uuid AND deleted_at IS NULL ORDER BY seq LIMIT 1`, org, year).Scan(&first); err != nil {
		return err
	}
	for i, name := range activities {
		comp, err := ensure(ctx, tx,
			`SELECT id::text FROM competencies WHERE org_id = $1 AND subject_id = $2::uuid AND name = $3 AND deleted_at IS NULL`,
			`INSERT INTO competencies (org_id, subject_id, name, seq) VALUES ($1, $2::uuid, $3, $4) RETURNING id::text`, 3,
			org, act, name, i+1)
		if err != nil {
			return err
		}
		// Section A's children rated, spread like a real class.
		if _, err := tx.Exec(ctx, `
			INSERT INTO holistic_ratings (org_id, student_id, period_id, competency_id, level, rated_by)
			SELECT $1, e.student_id, $3::uuid, $4::uuid, 1 + abs(hashtext(e.student_id::text || $4)) % 4, 'demo'
			  FROM enrolments e JOIN sections s ON s.id = e.section_id AND s.level_id = $2::uuid AND s.name = 'A' AND s.year_id = $5::uuid
			 WHERE e.deleted_at IS NULL
			ON CONFLICT (student_id, period_id, competency_id) DO NOTHING`, org, level, first, comp, year); err != nil {
			return err
		}
	}
	// Voices for the first three children of section A.
	_, err = tx.Exec(ctx, `
		INSERT INTO holistic_voices (org_id, student_id, period_id, kind, text, recorded_by)
		SELECT $1, x.student_id, $3::uuid, v.kind, v.text, 'demo'
		  FROM (SELECT e.student_id FROM enrolments e JOIN sections s ON s.id = e.section_id AND s.level_id = $2::uuid AND s.name = 'A' AND s.year_id = $4::uuid
		         WHERE e.deleted_at IS NULL ORDER BY e.roll_no LIMIT 3) x
		  CROSS JOIN unnest($5::text[], $6::text[]) v(kind, text)
		ON CONFLICT (student_id, period_id, kind) DO NOTHING`, org, level, first, year, demoVoiceKinds, demoVoiceTexts)
	return err
}
