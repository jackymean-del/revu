package seed

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// The demo school's Class 6 Mathematics carried through every exam step, so
// each screen has something to show: Unit test 3 with an approved blueprint,
// two final sets given to the two sections, marks question by question and
// outcome tags; a re-exam of Periodic test 1, applied; approved notes on
// three holistic reports; and Unit test 4 left blank to try the steps by
// hand. All made up for the demo, and safe to run again.

type demoRow struct {
	lesson, qtype, level string
	questions            int
	marks                string
}

// Thirty marks over the four lessons, matching the demo question bank.
var unitTestBlueprint = []demoRow{
	{"Knowing our numbers", "Multiple choice", "remember", 2, "1"},
	{"Fractions", "Multiple choice", "remember", 3, "1"},
	{"Decimals", "Short answer", "understand", 1, "2"},
	{"Decimals", "Short answer", "apply", 1, "2"},
	{"Basic geometrical ideas", "Short answer", "understand", 2, "2"},
	{"Knowing our numbers", "Short answer", "apply", 1, "2"},
	{"Fractions", "Long answer", "analyse", 1, "5"},
	{"Decimals", "Long answer", "analyse", 1, "5"},
	{"Knowing our numbers", "Long answer", "analyse", 1, "5"},
}

var demoNotes = []string{
	"A strong term: numbers are read with confidence and problems are worked through step by step. Next term, word problems with more than one step will stretch this further; talking the steps through aloud at home will help.",
	"Steady effort all term, with real care in written work. Fractions with unlike denominators need more practice; ten minutes with everyday examples, such as sharing food, will make a difference.",
	"Quick with recall and always willing to try. The next step is explaining why an answer is right; asking for the reason at home, not only the answer, will build this.",
}

func seedFlow(ctx context.Context, tx pgx.Tx, org, year, level, subject, exam string) error {
	var done bool
	if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM blueprints WHERE assessment_id = $1::uuid)`, exam).Scan(&done); err != nil {
		return err
	}
	if !done {
		if err := seedPaper(ctx, tx, org, year, level, subject, exam, unitTestBlueprint); err != nil {
			return fmt.Errorf("paper: %w", err)
		}
	}
	if err := seedReexam(ctx, tx, org, year, level, subject); err != nil {
		return fmt.Errorf("re-exam: %w", err)
	}
	// Approved notes for the first three children of section A, first term.
	for i, text := range demoNotes {
		if _, err := tx.Exec(ctx, `
			INSERT INTO holistic_notes (org_id, student_id, period_id, text, status, written_by, approved_by, approved_at)
			SELECT $1, x.student_id, (SELECT id FROM periods WHERE org_id = $1 AND year_id = $3::uuid AND deleted_at IS NULL ORDER BY seq LIMIT 1), $5::text, 'approved', 'demo', 'demo', now()
			  FROM (SELECT e.student_id FROM enrolments e JOIN sections s ON s.id = e.section_id AND s.level_id = $2::uuid AND s.name = 'A' AND s.year_id = $3::uuid
			         WHERE e.deleted_at IS NULL ORDER BY e.roll_no OFFSET $4 LIMIT 1) x
			ON CONFLICT DO NOTHING`, org, level, year, i, text); err != nil {
			return fmt.Errorf("notes: %w", err)
		}
	}
	// Results of the class's Mathematics, both terms, queued to work out.
	_, err := tx.Exec(ctx, `
		INSERT INTO result_stale_intents (org_id, student_id, period_id, subject_id, marked_at)
		SELECT $1, e.student_id, p.id, $3::uuid, now() - interval '1 minute'
		  FROM enrolments e JOIN sections s ON s.id = e.section_id AND s.level_id = $2::uuid AND s.year_id = $4::uuid
		  JOIN periods p ON p.year_id = s.year_id AND p.deleted_at IS NULL
		 WHERE e.org_id = $1 AND e.deleted_at IS NULL
		ON CONFLICT (student_id, period_id, subject_id) DO UPDATE SET marked_at = excluded.marked_at`, org, level, subject, year)
	return err
}

func seedPaper(ctx context.Context, tx pgx.Tx, org, year, level, subject, exam string, blueprint []demoRow) error {
	var bp string
	if err := tx.QueryRow(ctx, `INSERT INTO blueprints (org_id, assessment_id, taxonomy, status, created_by, submitted_by, submitted_at, approved_by, approved_at)
		VALUES ($1, $2::uuid, 'bloom', 'approved', 'demo', 'demo', now(), 'demo', now()) RETURNING id::text`, org, exam).Scan(&bp); err != nil {
		return err
	}
	// Rows of one chapter and type share a row; each level is a cell.
	for i, r := range blueprint {
		if _, err := tx.Exec(ctx, `
			WITH l AS (SELECT id FROM lessons WHERE org_id = $1 AND level_id = $3::uuid AND subject_id = $4::uuid AND name = $5),
			r AS (
				INSERT INTO blueprint_rows (org_id, blueprint_id, seq, lesson_id, chapter, qtype)
				SELECT $1, $2::uuid, $6, (SELECT id FROM l), $5, $7
				 WHERE NOT EXISTS (SELECT 1 FROM blueprint_rows WHERE blueprint_id = $2::uuid AND chapter = $5 AND qtype = $7)
				RETURNING id)
			INSERT INTO blueprint_cells (org_id, row_id, level, questions, marks_each)
			SELECT $1, coalesce((SELECT id FROM r), (SELECT id FROM blueprint_rows WHERE blueprint_id = $2::uuid AND chapter = $5 AND qtype = $7)), $8, $9, $10::numeric`,
			org, bp, level, subject, r.lesson, i+1, r.qtype, r.level, r.questions, r.marks); err != nil {
			return err
		}
	}
	// Two sets: the same slots, Set B with the next question of the bank
	// where there is one.
	var papers []string
	for shift, name := range []string{"Set A", "Set B"} {
		var paper string
		if err := tx.QueryRow(ctx, `INSERT INTO papers (org_id, assessment_id, set_label, taxonomy, blueprint_version, status, created_by, finalised_by, finalised_at)
			VALUES ($1, $2::uuid, $3, 'bloom', 1, 'final', 'demo', 'demo', now() + $4 * interval '1 second') RETURNING id::text`, org, exam, name, shift).Scan(&paper); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO paper_items (org_id, paper_id, seq, section, chapter, lesson_id, level, marks)
			SELECT $1, $2::uuid, row_number() OVER (ORDER BY sec.first, r.seq, array_position(ARRAY['remember','understand','apply','analyse','evaluate','create'], c.level), g.n),
			       r.qtype, r.chapter, r.lesson_id, c.level, c.marks_each
			  FROM blueprint_rows r JOIN blueprint_cells c ON c.row_id = r.id
			  JOIN (SELECT qtype, min(seq) AS first FROM blueprint_rows WHERE blueprint_id = $3::uuid GROUP BY qtype) sec ON sec.qtype = r.qtype
			  CROSS JOIN LATERAL generate_series(1, c.questions) g(n)
			 WHERE r.blueprint_id = $3::uuid`, org, paper, bp); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			WITH slots AS (
				SELECT i.id, i.lesson_id, lower(i.section) AS t, i.marks, i.level,
				       row_number() OVER (PARTITION BY i.lesson_id, lower(i.section), i.marks, i.level ORDER BY i.seq) AS rn
				  FROM paper_items i WHERE i.paper_id = $1::uuid),
			bank AS (
				SELECT q.id, q.lesson_id, lower(q.qtype) AS t, q.marks, q.bloom,
				       row_number() OVER (PARTITION BY q.lesson_id, lower(q.qtype), q.marks, q.bloom ORDER BY q.created_at, q.id) AS rn,
				       count(*) OVER (PARTITION BY q.lesson_id, lower(q.qtype), q.marks, q.bloom) AS n
				  FROM questions q WHERE q.level_id = $2::uuid AND q.subject_id = $3::uuid AND q.status = 'approved')
			UPDATE paper_items i SET question_id = b.id
			  FROM slots s JOIN bank b ON b.lesson_id = s.lesson_id AND b.t = s.t AND b.marks = s.marks AND b.bloom = s.level
			   AND b.rn = ((s.rn - 1 + $4) % b.n) + 1
			 WHERE i.id = s.id`, paper, level, subject, shift); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `SELECT revu_paper_sections($1::uuid)`, paper); err != nil {
			return err
		}
		papers = append(papers, paper)
	}
	// Marks are entered question by question: one part per question.
	if _, err := tx.Exec(ctx, `UPDATE assessment_parts SET deleted_at = now() WHERE assessment_id = $1::uuid AND deleted_at IS NULL`, exam); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `UPDATE assessments SET entry_mode = 'sections', marks_by = 'questions' WHERE id = $1::uuid`, exam); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks)
		SELECT $1, $3::uuid, seq, 'Q' || seq, marks FROM paper_items WHERE paper_id = $2::uuid ORDER BY seq`, org, papers[0], exam); err != nil {
		return err
	}
	for i, paper := range papers {
		if _, err := tx.Exec(ctx, `
			INSERT INTO part_tags (org_id, part_id, outcome_id, paper_id)
			SELECT $1, ap.id, q.outcome_id, $2::uuid
			  FROM paper_items it JOIN questions q ON q.id = it.question_id AND q.outcome_id IS NOT NULL
			  JOIN assessment_parts ap ON ap.assessment_id = $3::uuid AND ap.deleted_at IS NULL AND ap.seq = it.seq
			 WHERE it.paper_id = $2::uuid ON CONFLICT DO NOTHING`, org, paper, exam); err != nil {
			return err
		}
		// Section A sits Set A, section B Set B.
		if _, err := tx.Exec(ctx, `
			INSERT INTO paper_assignments (org_id, paper_id, section_id, sit_on, created_by)
			SELECT $1, $2::uuid, s.id, '2026-11-20', 'demo' FROM sections s
			 WHERE s.org_id = $1 AND s.level_id = $3::uuid AND s.year_id = $4::uuid AND s.name = $5 AND s.deleted_at IS NULL`, org, paper, level, year, string(rune('A'+i))); err != nil {
			return err
		}
	}
	// Marks for every question, spread like a real class: recall goes
	// better than long answers; one child in twenty is absent, never zero.
	_, err := tx.Exec(ctx, `
		INSERT INTO evidence (org_id, student_id, assessment_id, part_id, value, state, source)
		SELECT $1, e.student_id, $2::uuid, p.id,
		       CASE WHEN x.absent THEN NULL
		            ELSE round(p.max_marks * greatest(0.0, least(1.0,
		                   0.35 + (abs(hashtext(e.student_id::text)) % 60) / 100.0
		                 + ((abs(hashtext(e.student_id::text || p.id::text)) % 41) - 20) / 100.0
		                 + CASE WHEN p.max_marks = 1 THEN 0.10 WHEN p.max_marks >= 5 THEN -0.12 ELSE 0 END)) * 2) / 2 END,
		       (CASE WHEN x.absent THEN 'absent' ELSE 'scored' END)::value_state, 'import'
		  FROM assessment_parts p
		  JOIN assessment_scopes sc ON sc.assessment_id = p.assessment_id
		  JOIN enrolments e ON e.section_id = sc.section_id AND e.year_id = $3::uuid AND e.deleted_at IS NULL
		  CROSS JOIN LATERAL (SELECT abs(hashtext(e.student_id::text || $2::uuid::text)) % 20 = 0 AS absent) x
		 WHERE p.assessment_id = $2::uuid AND p.deleted_at IS NULL
		   -- Only those who take the subject: a language is taken by those who chose it.
		   AND (NOT EXISTS (SELECT 1 FROM subject_group_options o JOIN subject_groups g ON g.id = o.group_id AND g.deleted_at IS NULL
		                     WHERE o.subject_id = $5::uuid AND g.level_id = $4::uuid AND o.deleted_at IS NULL)
		        OR EXISTS (SELECT 1 FROM student_subject_choices c WHERE c.student_id = e.student_id AND c.subject_id = $5::uuid AND c.effective_to IS NULL))
		ON CONFLICT (student_id, part_id) DO NOTHING`, org, exam, year, level, subject)
	return err
}

// seedReexam gives those below 40% in Periodic test 1 a re-exam, marked
// and applied under "the higher mark counts"; one of them is absent again.
func seedReexam(ctx context.Context, tx pgx.Tx, org, year, level, subject string) error {
	var src string
	var has bool
	if err := tx.QueryRow(ctx, `
		SELECT a.id::text, EXISTS (SELECT 1 FROM reexams x WHERE x.source_id = a.id)
		  FROM assessments a WHERE a.org_id = $1 AND a.level_id = $2::uuid AND a.subject_id = $3::uuid AND a.year_id = $4::uuid
		   AND a.title = 'Periodic test 1' AND a.retake_of IS NULL AND a.deleted_at IS NULL`, org, level, subject, year).Scan(&src, &has); err != nil {
		return err
	}
	if has {
		return nil
	}
	var id string
	if err := tx.QueryRow(ctx, `
		INSERT INTO assessments (org_id, year_id, period_id, level_id, subject_id, title, kind, entry_mode, held_on, created_by, retake_of, attempt, status)
		SELECT org_id, year_id, period_id, level_id, subject_id, title || ', re-exam', kind, entry_mode, '2026-05-29', 'demo', id, 2, 'open'
		  FROM assessments WHERE id = $1::uuid RETURNING id::text`, src).Scan(&id); err != nil {
		return err
	}
	for _, q := range []string{
		`INSERT INTO assessment_parts (org_id, assessment_id, seq, name, kind, component_code, counts_in_total, max_marks)
		 SELECT org_id, $2::uuid, seq, name, kind, component_code, counts_in_total, max_marks FROM assessment_parts WHERE assessment_id = $1::uuid AND deleted_at IS NULL`,
		`INSERT INTO assessment_scopes (org_id, assessment_id, section_id) SELECT org_id, $2::uuid, section_id FROM assessment_scopes WHERE assessment_id = $1::uuid`,
		`INSERT INTO reexams (assessment_id, org_id, source_id, policy, absent_rule, status, criteria, created_by, approved_by, approved_at, applied_by, applied_at)
		 SELECT $2::uuid, org_id, id, 'higher', 'keep', 'applied', '{"below": 40, "absent": false, "incomplete": false}', 'demo', 'demo', now(), 'demo', now() FROM assessments WHERE id = $1::uuid`,
		// Those below 40% of the original sit it.
		`INSERT INTO reexam_candidates (org_id, assessment_id, student_id, reason)
		 SELECT a.org_id, $2::uuid, e.student_id, 'Below 40%: ' || trim(trailing '.' from trim(trailing '0' from round(sum(e.value) * 100 / sum(p.max_marks), 1)::text)) || '%'
		   FROM evidence e JOIN assessment_parts p ON p.id = e.part_id AND p.deleted_at IS NULL JOIN assessments a ON a.id = e.assessment_id
		  WHERE e.assessment_id = $1::uuid AND e.state = 'scored'
		  GROUP BY a.org_id, e.student_id HAVING sum(e.value) * 100 / sum(p.max_marks) < 40`,
		`INSERT INTO assessment_participation (org_id, assessment_id, student_id, status, reason_code, set_by)
		 SELECT a.org_id, $2::uuid, e.student_id, 'not_applicable', 'not_retaking', 'demo'
		   FROM assessments a JOIN assessment_scopes sc ON sc.assessment_id = a.id
		   JOIN enrolments e ON e.section_id = sc.section_id AND e.year_id = a.year_id AND e.deleted_at IS NULL
		  WHERE a.id = $1::uuid AND NOT EXISTS (SELECT 1 FROM reexam_candidates c WHERE c.assessment_id = $2::uuid AND c.student_id = e.student_id)
		 ON CONFLICT DO NOTHING`,
		// Most do better by a fifth of the marks; the first by id is absent again.
		`INSERT INTO evidence (org_id, student_id, assessment_id, part_id, value, state, source)
		 SELECT c.org_id, c.student_id, $2::uuid, np.id,
		        CASE WHEN c.student_id = (SELECT min(student_id::text)::uuid FROM reexam_candidates WHERE assessment_id = $2::uuid) THEN NULL
		             ELSE least(np.max_marks, round((o.value + np.max_marks * (0.10 + (abs(hashtext(c.student_id::text)) % 20) / 100.0)) * 2) / 2) END,
		        (CASE WHEN c.student_id = (SELECT min(student_id::text)::uuid FROM reexam_candidates WHERE assessment_id = $2::uuid) THEN 'absent' ELSE 'scored' END)::value_state, 'makeup'
		   FROM reexam_candidates c
		   JOIN assessment_parts np ON np.assessment_id = $2::uuid AND np.deleted_at IS NULL
		   JOIN assessment_parts op ON op.assessment_id = $1::uuid AND op.deleted_at IS NULL AND op.seq = np.seq
		   JOIN evidence o ON o.part_id = op.id AND o.student_id = c.student_id AND o.state = 'scored'
		  WHERE c.assessment_id = $2::uuid
		 ON CONFLICT (student_id, part_id) DO NOTHING`,
	} {
		if _, err := tx.Exec(ctx, q, src, id); err != nil {
			return err
		}
	}
	return nil
}
