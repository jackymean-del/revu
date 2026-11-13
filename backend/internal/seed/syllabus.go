package seed

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/syllabus"
)

// A small made-up syllabus and question bank for the demo school's Class 6
// Mathematics, and a unit test with no marks yet, so Create question paper
// can be tried end to end: a blueprint from the lessons, a paper filled
// from the bank, and parts tagged with outcomes once it is final. All of it
// is invented for the demo.

type demoQuestion struct {
	qtype, marks, bloom, text, answer string
	options                           []string
}

type demoLesson struct {
	name      string
	outcomes  []string
	questions []demoQuestion
}

var mc = "Multiple choice"

var class6Maths = []demoLesson{
	{"Knowing our numbers", []string{
		"Read and write numbers up to one crore in words and figures.",
		"Compare and order large numbers.",
		"Estimate sums and differences by rounding off.",
	}, []demoQuestion{
		{mc, "1", "remember", "Which is the number seventy lakh four thousand and twelve?", "70,04,012", []string{"70,04,012", "7,04,012", "70,40,012", "7,00,412"}},
		{mc, "1", "remember", "How many thousands make one lakh?", "100", []string{"10", "100", "1000", "10,000"}},
		{mc, "1", "remember", "Which is the greatest?", "9,80,001", []string{"9,08,100", "9,80,001", "9,79,999", "8,99,999"}},
		{"Short answer", "2", "apply", "Round 48,672 to the nearest thousand and to the nearest hundred.", "49,000 (1); 48,700 (1)", nil},
		{"Short answer", "2", "apply", "Estimate 5,290 + 17,986 by rounding each to the nearest thousand.", "5,000 + 18,000 = 23,000 (1 for rounding, 1 for sum)", nil},
		{"Long answer", "5", "analyse", "Arrange 4,05,213; 4,50,213; 4,05,312 and 45,213 in ascending order, and explain how you compared the numbers with the same number of digits.", "45,213 < 4,05,213 < 4,05,312 < 4,50,213 (2); compare digit by digit from the left (3)", nil},
	}},
	{"Fractions", []string{
		"Identify proper, improper and mixed fractions.",
		"Find equivalent fractions and reduce a fraction to its simplest form.",
		"Add and subtract fractions with unlike denominators.",
	}, []demoQuestion{
		{mc, "1", "remember", "Which is an improper fraction?", "7/4", []string{"3/5", "7/4", "1/2", "2/9"}},
		{mc, "1", "remember", "Which fraction is equivalent to 2/3?", "8/12", []string{"4/9", "8/12", "6/8", "3/2"}},
		{mc, "1", "remember", "What is 18/24 in its simplest form?", "3/4", []string{"9/12", "6/8", "3/4", "2/3"}},
		{"Short answer", "2", "apply", "Add 2/5 and 1/3.", "11/15 (1 for common denominator, 1 for answer)", nil},
		{"Short answer", "2", "apply", "Subtract 3/8 from 5/6.", "11/24 (1 for common denominator, 1 for answer)", nil},
		{"Long answer", "5", "analyse", "Rina ate 2/7 of a cake and Sohan ate 1/3. Who ate more, by how much, and what part of the cake is left?", "Sohan, by 1/21 (2); 8/21 left (3)", nil},
	}},
	{"Decimals", []string{
		"Write fractions with denominators 10 and 100 as decimals.",
		"Compare decimals.",
		"Use decimals with money, length and weight.",
	}, []demoQuestion{
		{mc, "1", "remember", "What is 7/100 as a decimal?", "0.07", []string{"0.7", "0.07", "7.00", "0.007"}},
		{mc, "1", "remember", "Which is the largest?", "0.8", []string{"0.75", "0.8", "0.09", "0.705"}},
		{mc, "1", "remember", "How many rupees are 345 paise?", "3.45", []string{"34.5", "3.45", "0.345", "345"}},
		{"Short answer", "2", "apply", "A ribbon is 2.75 m long. A piece of 1.4 m is cut off. How long is the rest?", "1.35 m (1 working, 1 answer)", nil},
		{"Short answer", "2", "understand", "Explain why 0.5 and 0.50 are equal.", "Both are 5 tenths; 50 hundredths equals 5 tenths (2)", nil},
		{"Long answer", "5", "analyse", "A shop sells pens at Rs 12.50 and notebooks at Rs 35.75. Meena buys 3 pens and 2 notebooks and pays with Rs 150. Work out her change and show each step.", "37.50 + 71.50 = 109 (3); change Rs 41 (2)", nil},
	}},
	{"Basic geometrical ideas", []string{
		"Name points, lines, line segments and rays.",
		"Describe angles, triangles and quadrilaterals.",
		"Identify the parts of a circle.",
	}, []demoQuestion{
		{mc, "1", "remember", "How many end points does a ray have?", "One", []string{"None", "One", "Two", "Many"}},
		{mc, "1", "remember", "The longest chord of a circle is its", "diameter", []string{"radius", "arc", "diameter", "sector"}},
		{mc, "1", "remember", "How many diagonals does a quadrilateral have?", "2", []string{"1", "2", "3", "4"}},
		{"Short answer", "2", "understand", "Explain the difference between a line and a line segment.", "A line goes on without end; a segment has two end points (2)", nil},
		{"Short answer", "2", "understand", "Describe the parts of a triangle.", "Three sides, three angles, three vertices (2)", nil},
		{"Long answer", "5", "evaluate", "Asha says every square is a rectangle but not every rectangle is a square. Is she right? Justify with properties.", "Yes (1); a square has all rectangle properties plus equal sides (4)", nil},
	}},
}

func seedSyllabus(ctx context.Context, tx pgx.Tx, org, year string) error {
	var level, subject string
	err := tx.QueryRow(ctx, `SELECT (SELECT id::text FROM levels WHERE org_id = $1 AND name = 'Class 6' AND deleted_at IS NULL),
		(SELECT id::text FROM subjects WHERE org_id = $1 AND name = 'Mathematics' AND deleted_at IS NULL)`, org).Scan(&level, &subject)
	if err != nil {
		return fmt.Errorf("class 6 mathematics: %w", err)
	}
	byLesson := make([][]string, len(class6Maths))
	for i, l := range class6Maths {
		lesson, err := ensure(ctx, tx,
			`SELECT id::text FROM lessons WHERE org_id = $1 AND level_id = $2::uuid AND subject_id = $3::uuid AND name = $4`,
			`INSERT INTO lessons (org_id, level_id, subject_id, name, seq) VALUES ($1, $2::uuid, $3::uuid, $4, $5) RETURNING id::text`, 4,
			org, level, subject, l.name, i+1)
		if err != nil {
			return err
		}
		var outcomes []string
		for j, text := range l.outcomes {
			id, err := ensure(ctx, tx,
				`SELECT id::text FROM learning_outcomes WHERE org_id = $1 AND lesson_id = $2::uuid AND text = $3`,
				`INSERT INTO learning_outcomes (org_id, lesson_id, text, level_id, subject_id, bloom, seq) VALUES ($1, $2::uuid, $3, $4::uuid, $5::uuid, $6, $7) RETURNING id::text`, 3,
				org, lesson, text, level, subject, syllabus.SuggestBloom(text), j+1)
			if err != nil {
				return err
			}
			outcomes = append(outcomes, id)
		}
		byLesson[i] = outcomes
		for k, q := range l.questions {
			// Recall questions test the first outcome, the rest the next ones.
			outcome := outcomes[min(k/3+k%2, len(outcomes)-1)]
			if q.qtype == "Long answer" {
				outcome = outcomes[len(outcomes)-1]
			}
			opts, _ := json.Marshal(append([]string{}, q.options...))
			if _, err := tx.Exec(ctx, `
				INSERT INTO questions (org_id, level_id, subject_id, lesson_id, outcome_id, bloom, qtype, marks, text, options, answer, created_by)
				SELECT $1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6, $7, $8::numeric, $9, $10::jsonb, $11, 'demo'
				 WHERE NOT EXISTS (SELECT 1 FROM questions WHERE org_id = $1 AND lesson_id = $4::uuid AND text = $9)`,
				org, level, subject, lesson, outcome, q.bloom, q.qtype, q.marks, q.text, string(opts), q.answer); err != nil {
				return fmt.Errorf("question %q: %w", q.text, err)
			}
		}
	}
	if err := seedHolistic(ctx, tx, org, year, level, subject, byLesson); err != nil {
		return err
	}
	// A unit test of the second term with no marks yet, for its paper to
	// be made: 30 marks.
	var term string
	if err := tx.QueryRow(ctx, `SELECT id::text FROM periods WHERE org_id = $1 AND year_id = $2::uuid AND deleted_at IS NULL ORDER BY seq DESC LIMIT 1`, org, year).Scan(&term); err != nil {
		return err
	}
	// Unit test 3 is carried through every step; Unit test 4 is left blank
	// to try the steps by hand.
	var first string
	for i, title := range []string{"Unit test 3", "Unit test 4"} {
		exam, err := ensure(ctx, tx,
			`SELECT id::text FROM assessments WHERE org_id = $1 AND period_id = $2::uuid AND level_id = $3::uuid AND subject_id = $4::uuid AND title = $5 AND deleted_at IS NULL`,
			`INSERT INTO assessments (org_id, period_id, level_id, subject_id, title, year_id, kind, entry_mode, held_on, status)
			 VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, $6::uuid, 'periodic_test', 'total', $7::date, 'open') RETURNING id::text`, 5,
			org, term, level, subject, title, year, []string{"2026-11-20", "2026-12-18"}[i])
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
			ON CONFLICT DO NOTHING`, org, exam, level, year); err != nil {
			return err
		}
		if i == 0 {
			first = exam
		}
	}
	return seedFlow(ctx, tx, org, year, level, subject, first)
}
