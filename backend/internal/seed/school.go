package seed

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackymean-del/revu/internal/reports"
	"github.com/jackymean-del/revu/internal/results"
	"github.com/jackymean-del/revu/internal/syllabus"
)

// The demo school's whole curriculum, made up for the demo: for every
// subject four competencies and four chapters of three learning outcomes
// each, used by every class that takes the subject. Each class and subject
// then gets a question bank, a Unit test 3 with an approved blueprint, two
// final sets given to its sections, and marks question by question.

type demoChapter struct {
	name     string
	outcomes [3]string
}

type demoSubject struct {
	competencies [4]string // chapter i builds competency i
	chapters     [4]demoChapter
}

var curriculum = map[string]demoSubject{
	"English": {[4]string{"Reading", "Writing", "Grammar and vocabulary", "Speaking and listening"}, [4]demoChapter{
		{"Reading comprehension", [3]string{"Identify the main idea of a passage.", "Explain what a character feels and why.", "Compare two texts on the same theme."}},
		{"Writing", [3]string{"List the parts of a paragraph.", "Describe a place using the five senses.", "Write a letter for a given purpose."}},
		{"Grammar", [3]string{"Name the parts of speech in a sentence.", "Explain when to use each tense.", "Use correct punctuation in direct speech."}},
		{"Poetry and speech", [3]string{"Recall a poem and its poet.", "Describe the mood of a poem.", "Demonstrate clear speech in a short talk."}},
	}},
	"Mathematics": {[4]string{"Number sense", "Operations", "Measurement and data", "Spatial reasoning"}, [4]demoChapter{
		{"Numbers and place value", [3]string{"Identify the place value of each digit.", "Compare and order numbers.", "Estimate by rounding off."}},
		{"The four operations", [3]string{"Recall number facts quickly.", "Explain the steps of a calculation.", "Solve word problems with two steps."}},
		{"Measurement and data", [3]string{"Name the units of length, weight and time.", "Describe what a bar graph shows.", "Calculate perimeter and area."}},
		{"Shapes and space", [3]string{"Identify common shapes and solids.", "Describe the properties of a shape.", "Compare shapes by their sides and angles."}},
	}},
	"Computer": {[4]string{"Digital literacy", "Logical thinking", "Creating with tools", "Safe use"}, [4]demoChapter{
		{"Parts of a computer", [3]string{"Name the parts of a computer.", "Explain what input and output devices do.", "Classify devices as input, output or storage."}},
		{"Thinking in steps", [3]string{"List the steps of a daily task in order.", "Explain what an algorithm is.", "Solve a puzzle by writing its steps."}},
		{"Working with documents", [3]string{"Identify the tools of a word processor.", "Describe how to save and open a file.", "Use formatting to make a notice."}},
		{"Staying safe online", [3]string{"Recall three rules of online safety.", "Explain why passwords are kept secret.", "Compare safe and unsafe messages."}},
	}},
	"EVS": {[4]string{"Observation", "Understanding nature", "Caring for surroundings", "Community"}, [4]demoChapter{
		{"Plants around us", [3]string{"Name the parts of a plant.", "Explain what a plant needs to grow.", "Compare two plants in the garden."}},
		{"Animals and their homes", [3]string{"Identify animals and where they live.", "Describe how animals care for their young.", "Classify animals by what they eat."}},
		{"Water and air", [3]string{"List the uses of water.", "Explain why clean air matters.", "Demonstrate one way to save water."}},
		{"Our neighbourhood", [3]string{"Name the helpers in our neighbourhood.", "Describe a festival celebrated nearby.", "Compare village and city life."}},
	}},
	"Science": {[4]string{"Scientific knowledge", "Investigation", "Application", "Reasoning"}, [4]demoChapter{
		{"Living things", [3]string{"Identify the features of living things.", "Explain how plants make food.", "Compare plant and animal cells."}},
		{"Matter and materials", [3]string{"Name the three states of matter.", "Describe how materials change on heating.", "Classify changes as reversible or not."}},
		{"Force and energy", [3]string{"List the kinds of force.", "Explain how friction affects motion.", "Calculate speed from distance and time."}},
		{"Earth and space", [3]string{"Recall the planets in order.", "Describe why we have day and night.", "Compare the seasons and their causes."}},
	}},
	"Social Science": {[4]string{"Knowledge of the past", "Understanding places", "Civic sense", "Using sources"}, [4]demoChapter{
		{"Early civilisations", [3]string{"Name the early river valley civilisations.", "Describe life in an ancient city.", "Compare two early civilisations."}},
		{"Maps and the globe", [3]string{"Identify the directions on a map.", "Explain what latitude and longitude show.", "Use a scale to find a distance."}},
		{"Our government", [3]string{"List the levels of government.", "Explain how a law is made.", "Compare the work of a panchayat and a municipality."}},
		{"Resources and livelihoods", [3]string{"Name the natural resources of our state.", "Describe how a crop reaches the market.", "Classify occupations by sector."}},
	}},
	"Hindi": {[4]string{"Reading", "Writing", "Grammar", "Speaking"}, [4]demoChapter{
		{"Stories", [3]string{"Identify the characters of a story.", "Explain the message of a story.", "Compare two characters."}},
		{"Poems", [3]string{"Recall a poem.", "Describe the feeling in a poem.", "Explain a line in your own words."}},
		{"Grammar", [3]string{"Name nouns and verbs in a sentence.", "Explain gender and number.", "Use the correct form in a sentence."}},
		{"Writing", [3]string{"List the parts of a letter.", "Describe a festival in a paragraph.", "Write a short application."}},
	}},
	"Odia": {[4]string{"Reading", "Writing", "Grammar", "Speaking"}, [4]demoChapter{
		{"Stories", [3]string{"Identify the characters of a story.", "Explain the message of a story.", "Compare two characters."}},
		{"Poems", [3]string{"Recall a poem.", "Describe the feeling in a poem.", "Explain a line in your own words."}},
		{"Grammar", [3]string{"Name nouns and verbs in a sentence.", "Explain gender and number.", "Use the correct form in a sentence."}},
		{"Writing", [3]string{"List the parts of a letter.", "Describe a festival in a paragraph.", "Write a short application."}},
	}},
}

func lowerFirst(s string) string {
	s = strings.TrimSuffix(s, ".")
	return strings.ToLower(s[:1]) + s[1:]
}

// seedSchool gives every class and subject its syllabus, bank, tagged
// first-term marks, and a Unit test 3 carried through every step. Class 6
// Mathematics has its own, fuller content and is left as it is.
func seedSchool(ctx context.Context, tx pgx.Tx, org, year string) error {
	rows, err := tx.Query(ctx, `
		SELECT ls.level_id::text, l.name, ls.subject_id::text, sj.name
		  FROM level_subjects ls JOIN levels l ON l.id = ls.level_id JOIN subjects sj ON sj.id = ls.subject_id AND sj.kind = 'academic'
		 WHERE ls.org_id = $1 AND ls.deleted_at IS NULL ORDER BY l.seq, sj.name`, org)
	if err != nil {
		return err
	}
	type pair struct{ level, levelName, subject, subjectName string }
	pairs, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (pair, error) {
		var p pair
		return p, r.Scan(&p.level, &p.levelName, &p.subject, &p.subjectName)
	})
	if err != nil {
		return err
	}
	var term2 string
	if err := tx.QueryRow(ctx, `SELECT id::text FROM periods WHERE org_id = $1 AND year_id = $2::uuid AND deleted_at IS NULL ORDER BY seq DESC LIMIT 1`, org, year).Scan(&term2); err != nil {
		return err
	}
	for _, p := range pairs {
		cur, ok := curriculum[p.subjectName]
		if !ok || (p.levelName == "Class 6" && p.subjectName == "Mathematics") {
			continue
		}
		byLesson := make([][]string, 4)
		for i, ch := range cur.chapters {
			comp, err := ensure(ctx, tx,
				`SELECT id::text FROM competencies WHERE org_id = $1 AND subject_id = $2::uuid AND name = $3 AND deleted_at IS NULL`,
				`INSERT INTO competencies (org_id, subject_id, name, seq) VALUES ($1, $2::uuid, $3, $4) RETURNING id::text`, 3,
				org, p.subject, cur.competencies[i], i+1)
			if err != nil {
				return err
			}
			lesson, err := ensure(ctx, tx,
				`SELECT id::text FROM lessons WHERE org_id = $1 AND level_id = $2::uuid AND subject_id = $3::uuid AND name = $4`,
				`INSERT INTO lessons (org_id, level_id, subject_id, name, seq) VALUES ($1, $2::uuid, $3::uuid, $4, $5) RETURNING id::text`, 4,
				org, p.level, p.subject, ch.name, i+1)
			if err != nil {
				return err
			}
			for j, text := range ch.outcomes {
				id, err := ensure(ctx, tx,
					`SELECT id::text FROM learning_outcomes WHERE org_id = $1 AND lesson_id = $2::uuid AND text = $3`,
					`INSERT INTO learning_outcomes (org_id, lesson_id, text, level_id, subject_id, bloom, seq, competency_id) VALUES ($1, $2::uuid, $3, $4::uuid, $5::uuid, $6, $7, $8::uuid) RETURNING id::text`, 3,
					org, lesson, text, p.level, p.subject, syllabus.SuggestBloom(text), j+1, comp)
				if err != nil {
					return err
				}
				byLesson[i] = append(byLesson[i], id)
			}
			// The bank: three recall choices, an explain, an apply and a long answer.
			others, _ := json.Marshal([]string{cur.chapters[0].name, cur.chapters[1].name, cur.chapters[2].name, cur.chapters[3].name})
			type q struct {
				qtype, marks, bloom, text, answer, opts string
				outcome                                 int
			}
			qs := []q{
				{"Short answer", "2", "understand", "In your own words: " + lowerFirst(ch.outcomes[1]) + ".", "Any clear explanation with an example (2).", "[]", 1},
				{"Short answer", "2", "apply", "Show with an example that you can " + lowerFirst(ch.outcomes[2]) + ".", "A correct example (1) with working or reason (1).", "[]", 2},
				{"Long answer", "5", "analyse", "From the chapter " + ch.name + ": " + lowerFirst(ch.outcomes[2]) + ". Give reasons and two examples.", "Two examples (2), reasons (2), clear conclusion (1).", "[]", 2},
			}
			for j, o := range ch.outcomes {
				qs = append(qs, q{"Multiple choice", "1", "remember", "Which chapter teaches you to " + lowerFirst(o) + "?", ch.name, string(others), j})
			}
			for _, x := range qs {
				if _, err := tx.Exec(ctx, `
					INSERT INTO questions (org_id, level_id, subject_id, lesson_id, outcome_id, bloom, qtype, marks, text, options, answer, created_by)
					SELECT $1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8::numeric, $9, $10::jsonb, $11, 'demo'
					 WHERE NOT EXISTS (SELECT 1 FROM questions WHERE org_id = $1 AND lesson_id = $4::uuid AND text = $9)`,
					org, p.level, p.subject, lesson, byLesson[i][x.outcome], x.bloom, x.qtype, x.marks, x.text, x.opts, x.answer); err != nil {
					return fmt.Errorf("question: %w", err)
				}
			}
		}
		if err := tagFirstTerm(ctx, tx, org, year, p.level, p.subject, byLesson); err != nil {
			return err
		}
		exam, err := ensure(ctx, tx,
			`SELECT id::text FROM assessments WHERE org_id = $1 AND period_id = $2::uuid AND level_id = $3::uuid AND subject_id = $4::uuid AND title = $5 AND deleted_at IS NULL`,
			`INSERT INTO assessments (org_id, period_id, level_id, subject_id, title, year_id, kind, entry_mode, held_on, status)
			 VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, 'periodic_test', 'total', '2026-11-20', 'open') RETURNING id::text`, 5,
			org, term2, p.level, p.subject, "Unit test 3", year)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks)
			SELECT $1, $2::uuid, 1, 'Total', 30 WHERE NOT EXISTS (SELECT 1 FROM assessment_parts WHERE assessment_id = $2::uuid)`, org, exam); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO assessment_scopes (org_id, assessment_id, section_id)
			SELECT $1, $2::uuid, s.id FROM sections s WHERE s.org_id = $1 AND s.level_id = $3::uuid AND s.year_id = $4::uuid AND s.deleted_at IS NULL
			ON CONFLICT DO NOTHING`, org, exam, p.level, year); err != nil {
			return err
		}
		var done bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM blueprints WHERE assessment_id = $1::uuid)`, exam).Scan(&done); err != nil {
			return err
		}
		if !done {
			c := cur.chapters
			bp := []demoRow{
				{c[0].name, "Multiple choice", "remember", 2, "1"}, {c[1].name, "Multiple choice", "remember", 3, "1"},
				{c[2].name, "Short answer", "understand", 1, "2"}, {c[2].name, "Short answer", "apply", 1, "2"},
				{c[3].name, "Short answer", "understand", 1, "2"}, {c[3].name, "Short answer", "apply", 1, "2"},
				{c[0].name, "Short answer", "apply", 1, "2"},
				{c[1].name, "Long answer", "analyse", 1, "5"}, {c[2].name, "Long answer", "analyse", 1, "5"}, {c[0].name, "Long answer", "analyse", 1, "5"},
			}
			if err := seedPaper(ctx, tx, org, year, p.level, p.subject, exam, bp); err != nil {
				return fmt.Errorf("%s %s paper: %w", p.levelName, p.subjectName, err)
			}
		}
	}
	// Activities for every class, rated for everyone.
	if _, err := tx.Exec(ctx, `
		INSERT INTO level_subjects (org_id, level_id, subject_id)
		SELECT $1, l.id, sj.id FROM levels l, subjects sj
		 WHERE l.org_id = $1 AND l.deleted_at IS NULL AND sj.org_id = $1 AND sj.name = 'Activities' AND sj.deleted_at IS NULL
		   AND NOT EXISTS (SELECT 1 FROM level_subjects x WHERE x.level_id = l.id AND x.subject_id = sj.id AND x.deleted_at IS NULL)`, org); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO holistic_ratings (org_id, student_id, period_id, competency_id, level, rated_by)
		SELECT $1, e.student_id, p.id, c.id, 1 + abs(hashtext(e.student_id::text || c.id::text)) % 4, 'demo'
		  FROM enrolments e
		  JOIN periods p ON p.year_id = e.year_id AND p.deleted_at IS NULL AND p.seq = 1
		  JOIN subjects sj ON sj.org_id = $1 AND sj.name = 'Activities' AND sj.deleted_at IS NULL
		  JOIN competencies c ON c.subject_id = sj.id AND c.deleted_at IS NULL
		 WHERE e.org_id = $1 AND e.year_id = $2::uuid AND e.deleted_at IS NULL
		ON CONFLICT (student_id, period_id, competency_id) DO NOTHING`, org, year); err != nil {
		return err
	}
	// Every result of both terms queued to work out.
	_, err = tx.Exec(ctx, `
		INSERT INTO result_stale_intents (org_id, student_id, period_id, subject_id, marked_at)
		SELECT DISTINCT $1::uuid, e.student_id, a.period_id, a.subject_id, now() - interval '1 minute'
		  FROM assessments a JOIN assessment_scopes sc ON sc.assessment_id = a.id
		  JOIN enrolments e ON e.section_id = sc.section_id AND e.year_id = a.year_id AND e.deleted_at IS NULL
		 WHERE a.org_id = $1 AND a.deleted_at IS NULL AND a.title = 'Unit test 3'
		   AND EXISTS (SELECT 1 FROM evidence ev WHERE ev.assessment_id = a.id AND ev.student_id = e.student_id)
		ON CONFLICT (student_id, period_id, subject_id) DO NOTHING`, org)
	return err
}

// tagFirstTerm tags the first term's parts with outcomes: A recalls the
// first chapter, B the second, C the third and fourth; the half-yearly
// total covers every chapter.
func tagFirstTerm(ctx context.Context, tx pgx.Tx, org, year, level, subject string, byLesson [][]string) error {
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
			   AND p.deleted_at IS NULL AND a.deleted_at IS NULL AND a.title <> 'Unit test 3'
			   AND NOT EXISTS (SELECT 1 FROM part_tags t WHERE t.part_id = p.id AND t.outcome_id = o)`, org, level, subject, x.outcomes, x.part, year); err != nil {
			return fmt.Errorf("tags: %w", err)
		}
	}
	return nil
}

// GenerateReports works out the queued results of a demo organisation and
// makes one report run for each section in the first term, as the server
// does when a class teacher makes the PDFs. It runs as the server's own
// role, so the organisation's fence applies. Sections that already have a
// run are left alone.
//
// A running server works the same queue; when the two meet, the database
// stops one of them, and this tries again.
func GenerateReports(ctx context.Context, owner *pgxpool.Pool, org string) error {
	var err error
	for try := range 5 {
		err = generateReports(ctx, owner, org)
		var pg *pgconn.PgError
		if err == nil || !errors.As(err, &pg) || pg.Code != "40P01" {
			return err
		}
		time.Sleep(time.Duration(try+1) * 500 * time.Millisecond)
	}
	return err
}

func generateReports(ctx context.Context, owner *pgxpool.Pool, org string) error {
	tx, err := owner.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(context.Background()) }()
	if _, err := tx.Exec(ctx, `SET LOCAL ROLE revu_app`); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `SELECT set_config('app.org_id', $1, true)`, org); err != nil {
		return err
	}
	rows, err := tx.Query(ctx, `SELECT student_id::text, period_id::text, subject_id::text FROM result_stale_intents ORDER BY student_id, period_id, subject_id FOR UPDATE SKIP LOCKED`)
	if err != nil {
		return err
	}
	keys, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (results.Key, error) {
		var k results.Key
		return k, r.Scan(&k.StudentID, &k.PeriodID, &k.SubjectID)
	})
	if err != nil {
		return err
	}
	for len(keys) > 0 {
		n := min(len(keys), 500)
		if _, err := results.Recompute(ctx, tx, keys[:n]); err != nil {
			return fmt.Errorf("results: %w", err)
		}
		keys = keys[n:]
	}
	cfg := reports.DefaultConfig()
	raw, _ := json.Marshal(cfg)
	var tpl string
	var version int
	if err := tx.QueryRow(ctx, `
		WITH n AS (INSERT INTO report_templates (org_id, name, config) SELECT app_org_id(), 'Report card', $1::jsonb
		            WHERE NOT EXISTS (SELECT 1 FROM report_templates) RETURNING id, version)
		SELECT id::text, version FROM n UNION ALL SELECT id::text, version FROM report_templates LIMIT 1`, string(raw)).Scan(&tpl, &version); err != nil {
		return fmt.Errorf("template: %w", err)
	}
	if cfg, err = reports.TemplateConfig(ctx, tx); err != nil {
		return err
	}
	rows, err = tx.Query(ctx, `
		SELECT s.id::text, s.branch_id::text, s.level_id::text, s.year_id::text, p.id::text
		  FROM sections s JOIN periods p ON p.year_id = s.year_id AND p.deleted_at IS NULL AND p.seq = 1
		 WHERE s.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM report_runs r WHERE r.section_id = s.id AND r.period_id = p.id)`)
	if err != nil {
		return err
	}
	type target struct {
		sec    results.Section
		period string
	}
	targets, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (target, error) {
		var t target
		return t, r.Scan(&t.sec.ID, &t.sec.BranchID, &t.sec.LevelID, &t.sec.YearID, &t.period)
	})
	if err != nil {
		return err
	}
	for _, t := range targets {
		facts, err := reports.Gather(ctx, tx, t.sec, t.period, nil, cfg, time.Now())
		if err != nil {
			return fmt.Errorf("facts: %w", err)
		}
		if len(facts) == 0 {
			continue
		}
		var run string
		if err := tx.QueryRow(ctx, `
			INSERT INTO report_runs (org_id, section_id, period_id, template_id, template_version, branding_version, options, students, pages, created_by)
			VALUES (app_org_id(), $1::uuid, $2::uuid, $3::uuid, $4, nullif($5, 0), $6::jsonb, $7, $7, 'demo') RETURNING id::text`,
			t.sec.ID, t.period, tpl, version, facts[0].Institution.Version, string(raw), len(facts)).Scan(&run); err != nil {
			return err
		}
		for _, f := range facts {
			one, _ := json.Marshal(f)
			if _, err := tx.Exec(ctx, `INSERT INTO report_run_items (org_id, run_id, student_id, facts, pages) VALUES (app_org_id(), $1::uuid, $2::uuid, $3::jsonb, 1)`, run, f.Student.ID, string(one)); err != nil {
				return err
			}
		}
	}
	return tx.Commit(ctx)
}
