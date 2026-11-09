package seed

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/scheme"
)

// A term's work for a demo school, so every step can be tried end to end:
// Periodic test 1 entered part by part, a half-yearly exam entered as one
// total, and Periodic test 2 later with the same parts, so the reteach
// list has a follow-up to compare with. Marks are spread like a real class
// (a few strong, a few weak, part B harder, a little better the second
// time), about one student in forty is absent from each, and nothing is
// written as zero for an absence.

type examPart struct {
	name string
	max  int
}

type exam struct {
	title, kind, mode, held string
	parts                   []examPart
}

var term1Exams = []exam{
	{"Periodic test 1", "periodic_test", "sections", "2026-05-15", []examPart{{"A", 10}, {"B", 10}, {"C", 20}}},
	{"Periodic test 2", "periodic_test", "sections", "2026-08-05", []examPart{{"A", 10}, {"B", 10}, {"C", 20}}},
	{"Half-yearly exam", "midterm", "total", "2026-09-10", []examPart{{"Total", 80}}},
}

// demoScheme is how the term's marks become a result: the periodic tests
// averaged to 20, the half-yearly exam to 80, in the bands the pilot school
// uses. An absence from the half-yearly exam withholds the result until a
// makeup; an absence from one periodic test leaves the other to count.
const demoScheme = `{"schema": 1, "rounding": {"mode": "half_up", "places": 2, "at": "components"},
  "components": [
    {"code": "PT", "name": "Periodic tests", "from": {"kinds": ["periodic_test"], "part_kind": "main"}, "aggregate": {"fn": "avg"}, "scale_to": "20", "on_absent": "exclude"},
    {"code": "HY", "name": "Half-yearly exam", "from": {"kinds": ["midterm"], "part_kind": "main"}, "aggregate": {"fn": "sum"}, "scale_to": "80", "on_absent": "wait_makeup"}],
  "subject": {"expr": "PT + HY", "max": "100"},
  "grading": {"from": "rounded", "bands": [
    {"label": "A1", "min_pct": "90"}, {"label": "A2", "min_pct": "80"}, {"label": "B1", "min_pct": "70"},
    {"label": "B2", "min_pct": "60"}, {"label": "C", "min_pct": "0"}]},
  "pass": {"subject_min_pct": "33"}}`

func seedExams(ctx context.Context, tx pgx.Tx, d Demo, org, year, term string) error {
	if _, err := scheme.Parse([]byte(demoScheme)); err != nil {
		return fmt.Errorf("demo scheme: %w", err)
	}

	// Every subject each level takes, the language options included.
	rows, err := tx.Query(ctx, `
		SELECT ls.level_id::text, ls.subject_id::text FROM level_subjects ls JOIN levels l ON l.id = ls.level_id
		 WHERE ls.org_id = $1 AND ls.deleted_at IS NULL ORDER BY l.seq`, org)
	if err != nil {
		return err
	}
	type pair struct{ level, subject string }
	pairs, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (pair, error) {
		var p pair
		return p, r.Scan(&p.level, &p.subject)
	})
	if err != nil {
		return err
	}

	for _, p := range pairs {
		for _, e := range term1Exams {
			id, err := ensure(ctx, tx,
				`SELECT id::text FROM assessments WHERE org_id = $1 AND period_id = $2::uuid AND level_id = $3::uuid AND subject_id = $4::uuid AND title = $5 AND deleted_at IS NULL`,
				`INSERT INTO assessments (org_id, period_id, level_id, subject_id, title, year_id, kind, entry_mode, held_on, status)
				 VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, $7, $8, $9::date, 'open') RETURNING id::text`, 5,
				org, term, p.level, p.subject, e.title, year, e.kind, e.mode, e.held)
			if err != nil {
				return err
			}
			for i, part := range e.parts {
				if _, err := tx.Exec(ctx, `
					INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks)
					SELECT $1, $2::uuid, $3, $4, $5
					 WHERE NOT EXISTS (SELECT 1 FROM assessment_parts WHERE assessment_id = $2::uuid AND seq = $3 AND deleted_at IS NULL)`,
					org, id, i+1, part.name, part.max); err != nil {
					return err
				}
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO assessment_scopes (org_id, assessment_id, section_id)
				SELECT $1, $2::uuid, s.id FROM sections s WHERE s.org_id = $1 AND s.level_id = $3::uuid AND s.year_id = $4::uuid AND s.deleted_at IS NULL
				ON CONFLICT DO NOTHING`, org, id, p.level, year); err != nil {
				return err
			}
		}
	}

	// Marks for every student who takes the subject, in one statement. A
	// student's level is steady across subjects, with some subjects better
	// than others; part B is harder; the second test goes a little better.
	if _, err := tx.Exec(ctx, `
		INSERT INTO evidence (org_id, student_id, assessment_id, part_id, value, state, source)
		SELECT $1, e.student_id, a.id, p.id,
		       CASE WHEN absent THEN NULL
		            ELSE round(p.max_marks * greatest(0.0, least(1.0,
		                   0.30 + (abs(hashtext(e.student_id::text)) % 66) / 100.0
		                 + ((abs(hashtext(e.student_id::text || a.subject_id::text)) % 21) - 10) / 100.0
		                 + ((abs(hashtext(e.student_id::text || p.id::text)) % 25) - 12) / 100.0
		                 + CASE WHEN p.name = 'B' THEN -0.18 ELSE 0 END
		                 + CASE WHEN a.title = 'Periodic test 2' THEN 0.07 ELSE 0 END)) * 2) / 2
		       END,
		       (CASE WHEN absent THEN 'absent' ELSE 'scored' END)::value_state, 'import'
		  FROM assessments a
		  JOIN assessment_parts p ON p.assessment_id = a.id AND p.deleted_at IS NULL
		  JOIN assessment_scopes sc ON sc.assessment_id = a.id
		  JOIN enrolments e ON e.section_id = sc.section_id AND e.year_id = a.year_id AND e.deleted_at IS NULL
		  CROSS JOIN LATERAL (SELECT abs(hashtext(e.student_id::text || a.id::text)) % 40 = 0 AS absent) x
		 WHERE a.org_id = $1 AND a.period_id = $2::uuid AND a.deleted_at IS NULL
		   AND (NOT EXISTS (SELECT 1 FROM subject_group_options o JOIN subject_groups g ON g.id = o.group_id AND g.deleted_at IS NULL
		                     WHERE o.subject_id = a.subject_id AND g.level_id = a.level_id AND o.deleted_at IS NULL)
		        OR EXISTS (SELECT 1 FROM student_subject_choices c WHERE c.student_id = e.student_id AND c.subject_id = a.subject_id AND c.effective_to IS NULL))
		ON CONFLICT (student_id, part_id) DO NOTHING`, org, term); err != nil {
		return fmt.Errorf("marks: %w", err)
	}

	// The scheme, published and applied to the whole school.
	family, err := ensure(ctx, tx,
		`SELECT family_id::text FROM schemes WHERE org_id = $1 AND name = $2 AND deleted_at IS NULL LIMIT 1`,
		`WITH n AS (SELECT uuidv7() AS id)
		 INSERT INTO schemes (id, family_id, org_id, name, status, definition, published_at, published_by)
		 SELECT n.id, n.id, $1, $2, 'published', $3::jsonb, now(), 'demo' FROM n RETURNING family_id::text`, 2,
		org, d.Name+" scheme", demoScheme)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO scheme_assignments (org_id, family_id) VALUES ($1, $2::uuid) ON CONFLICT DO NOTHING`, org, family); err != nil {
		return err
	}

	// The school's name on its documents.
	if _, err := tx.Exec(ctx, `
		INSERT INTO branding_versions (org_id, version, display_name, address, contact)
		SELECT $1, 1, $2, 'Bhubaneswar, Odisha', 'office@' || $3 WHERE NOT EXISTS (SELECT 1 FROM branding_versions WHERE org_id = $1)`,
		org, d.Name, d.Domain); err != nil {
		return err
	}

	// Every result queued for the server's recompute loop, which works
	// them out in the background (only internal/results writes results).
	_, err = tx.Exec(ctx, `
		INSERT INTO result_stale_intents (org_id, student_id, period_id, subject_id, marked_at)
		SELECT $1, e.student_id, $2::uuid, ls.subject_id, now() - interval '1 minute'
		  FROM enrolments e
		  JOIN sections s ON s.id = e.section_id
		  JOIN level_subjects ls ON ls.level_id = s.level_id AND ls.deleted_at IS NULL
		 WHERE e.org_id = $1 AND e.deleted_at IS NULL
		ON CONFLICT DO NOTHING`, org, term)
	return err
}
