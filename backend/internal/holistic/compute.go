package holistic

import (
	"context"
	"slices"
	"sort"

	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/results"
	"github.com/jackymean-del/revu/internal/syllabus"
)

// facts is everything read for a section and period, before it is shaped
// into reports.
type facts struct {
	students []Student
	comp     map[[2]string]tally // student, competency
	bloom    map[[2]string]tally // student, Bloom level
	outcomes map[string][]outRow // student
	ratings  map[[2]string]int   // student, competency
	voices   map[string]*Voices
	notes    map[string]Note
	scores   map[[2]string]result // student, subject
	subjects []subj
	trend    map[[2]string][]float64 // student, subject
}

type outRow struct {
	text, subject, bloom string
	t                    tally
}

type result struct {
	pct      *float64
	grade    string
	val, max float64
}

type subj struct{ id, name string }

// marksFrom is the marks behind levels: scored marks only, on parts of the
// period's assessments, of the section's students; absent, exempt and not
// assessed never count. joins come after the part.
func marksFrom(joins string) string {
	return `FROM evidence e
		  JOIN assessment_parts p ON p.id = e.part_id AND p.deleted_at IS NULL
		  JOIN assessments a ON a.id = e.assessment_id AND a.period_id = $2::uuid AND a.deleted_at IS NULL
		  ` + joins + `
		 WHERE e.student_id IN (SELECT student_id FROM enrolments WHERE section_id = $1::uuid AND deleted_at IS NULL)
		   AND e.state = 'scored' AND e.value IS NOT NULL` + notExcused
}

// notExcused leaves out marks of a child marked absent, exempt, not
// applicable or left for the whole assessment.
const notExcused = `
		   AND NOT EXISTS (SELECT 1 FROM assessment_participation ap WHERE ap.assessment_id = e.assessment_id AND ap.student_id = e.student_id)`

func tallies(into map[[2]string]tally) func(pgx.Rows) error {
	return func(rows pgx.Rows) error {
		for rows.Next() {
			var k [2]string
			var t tally
			if err := rows.Scan(&k[0], &k[1], &t.got, &t.max, &t.marks); err != nil {
				return err
			}
			into[k] = t
		}
		return rows.Err()
	}
}

// read gathers a section's facts for a period in one round trip.
func read(ctx context.Context, tx pgx.Tx, cl *Class) (facts, error) {
	f := facts{comp: map[[2]string]tally{}, bloom: map[[2]string]tally{}, outcomes: map[string][]outRow{}, ratings: map[[2]string]int{},
		voices: map[string]*Voices{}, notes: map[string]Note{}, scores: map[[2]string]result{}, trend: map[[2]string][]float64{}}
	sid, pid := cl.SectionID, cl.PeriodID
	var b pgx.Batch
	b.Queue(`SELECT coalesce((SELECT l.name || ' ' || x.name FROM sections x JOIN levels l ON l.id = x.level_id WHERE x.id = $1::uuid), ''),
		coalesce((SELECT name FROM periods WHERE id = $2::uuid), '')`, sid, pid).QueryRow(func(r pgx.Row) error { return r.Scan(&cl.Section, &cl.Period) })
	b.Queue(`
		SELECT st.id::text, st.name, st.admission_no, coalesce(e.roll_no, '')
		  FROM enrolments e JOIN students st ON st.id = e.student_id AND st.deleted_at IS NULL
		 WHERE e.section_id = $1::uuid AND e.deleted_at IS NULL
		 ORDER BY coalesce(e.roll_no, '') = '', length(coalesce(e.roll_no, '')), e.roll_no, st.name`, sid).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var x Student
			if err := rows.Scan(&x.ID, &x.Name, &x.AdmissionNo, &x.RollNo); err != nil {
				return err
			}
			f.students = append(f.students, x)
		}
		return rows.Err()
	})
	// A part counts once for each competency it tests, tagged through an
	// outcome or directly, and once for each Bloom level of its outcomes.
	b.Queue(`WITH tags AS (
			SELECT DISTINCT t.part_id, t.paper_id, coalesce(t.competency_id, o.competency_id) AS k
			  FROM part_tags t LEFT JOIN learning_outcomes o ON o.id = t.outcome_id AND o.deleted_at IS NULL
			 WHERE coalesce(t.competency_id, o.competency_id) IS NOT NULL)
		SELECT e.student_id::text, tags.k::text, sum(e.value)::float8, sum(p.max_marks)::float8, count(*)::int
		  `+marksFrom(`JOIN tags ON tags.part_id = p.id AND (tags.paper_id IS NULL OR tags.paper_id = revu_paper_sat(a.id, e.student_id))`)+` GROUP BY 1, 2`, sid, pid).Query(tallies(f.comp))
	b.Queue(`WITH tags AS (SELECT DISTINCT t.part_id, t.paper_id, o.bloom AS k FROM part_tags t JOIN learning_outcomes o ON o.id = t.outcome_id AND o.deleted_at IS NULL)
		SELECT e.student_id::text, tags.k, sum(e.value)::float8, sum(p.max_marks)::float8, count(*)::int
		  `+marksFrom(`JOIN tags ON tags.part_id = p.id AND (tags.paper_id IS NULL OR tags.paper_id = revu_paper_sat(a.id, e.student_id))`)+` GROUP BY 1, 2`, sid, pid).Query(tallies(f.bloom))
	b.Queue(`SELECT e.student_id::text, o.text, sj.name, o.bloom, sum(e.value)::float8, sum(p.max_marks)::float8, count(*)::int
		  `+marksFrom(`JOIN part_tags t ON t.part_id = p.id AND (t.paper_id IS NULL OR t.paper_id = revu_paper_sat(a.id, e.student_id)) JOIN learning_outcomes o ON o.id = t.outcome_id AND o.deleted_at IS NULL JOIN subjects sj ON sj.id = o.subject_id`)+`
		 GROUP BY e.student_id, o.id, o.text, sj.name, o.bloom`, sid, pid).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var student string
			var o outRow
			if err := rows.Scan(&student, &o.text, &o.subject, &o.bloom, &o.t.got, &o.t.max, &o.t.marks); err != nil {
				return err
			}
			f.outcomes[student] = append(f.outcomes[student], o)
		}
		return rows.Err()
	})
	// How fine the tagged marks are: by question only when every tagged
	// assessment is; total when none is finer.
	b.Queue(`
		SELECT coalesce(bool_and(coalesce(a.marks_by, 'sections') IN ('questions', 'bits')), false), coalesce(bool_and(a.marks_by = 'total'), false)
		  FROM assessments a
		 WHERE a.period_id = $2::uuid AND a.deleted_at IS NULL AND a.level_id = (SELECT level_id FROM sections WHERE id = $1::uuid)
		   AND EXISTS (SELECT 1 FROM assessment_parts p JOIN part_tags t ON t.part_id = p.id WHERE p.assessment_id = a.id AND p.deleted_at IS NULL)`, sid, pid).
		QueryRow(func(r pgx.Row) error {
			var questions, total bool
			if err := r.Scan(&questions, &total); err != nil {
				return err
			}
			cl.Detail = "sections"
			if questions {
				cl.Detail = "questions"
			} else if total {
				cl.Detail = "total"
			}
			return nil
		})
	// The competencies of the subjects the section's level takes; those of
	// co-curricular subjects are rated, the rest worked out from marks.
	b.Queue(`
		SELECT c.id::text, c.name, sj.id::text, sj.name, sj.kind = 'co_curricular'
		  FROM competencies c JOIN subjects sj ON sj.id = c.subject_id AND sj.deleted_at IS NULL
		  JOIN level_subjects ls ON ls.subject_id = sj.id AND ls.level_id = (SELECT level_id FROM sections WHERE id = $1::uuid) AND ls.deleted_at IS NULL
		 WHERE c.deleted_at IS NULL AND (c.level_id IS NULL OR c.level_id = ls.level_id)
		 ORDER BY sj.kind, sj.name, c.seq, c.name`, sid).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var x comp
			if err := rows.Scan(&x.id, &x.name, &x.subjectID, &x.subject, &x.activity); err != nil {
				return err
			}
			cl.comps = append(cl.comps, x)
		}
		return rows.Err()
	})
	b.Queue(`SELECT student_id::text, competency_id::text, level FROM holistic_ratings WHERE period_id = $2::uuid
		AND student_id IN (SELECT student_id FROM enrolments WHERE section_id = $1::uuid AND deleted_at IS NULL)`, sid, pid).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var k [2]string
			var l int
			if err := rows.Scan(&k[0], &k[1], &l); err != nil {
				return err
			}
			f.ratings[k] = l
		}
		return rows.Err()
	})
	b.Queue(`SELECT student_id::text, kind, text FROM holistic_voices WHERE period_id = $2::uuid
		AND student_id IN (SELECT student_id FROM enrolments WHERE section_id = $1::uuid AND deleted_at IS NULL)`, sid, pid).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var student, kind, text string
			if err := rows.Scan(&student, &kind, &text); err != nil {
				return err
			}
			v := f.voices[student]
			if v == nil {
				v = &Voices{}
				f.voices[student] = v
			}
			switch kind {
			case "self":
				v.Self = text
			case "peer":
				v.Peer = text
			case "parent":
				v.Parent = text
			case "ambition":
				v.Ambition = text
			}
		}
		return rows.Err()
	})
	b.Queue(`SELECT student_id::text, text, status, from_ai FROM holistic_notes WHERE period_id = $2::uuid
		AND student_id IN (SELECT student_id FROM enrolments WHERE section_id = $1::uuid AND deleted_at IS NULL)`, sid, pid).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var student string
			var n Note
			if err := rows.Scan(&student, &n.Text, &n.Status, &n.FromAI); err != nil {
				return err
			}
			f.notes[student] = n
		}
		return rows.Err()
	})
	// Subject results as the scheme worked them out.
	b.Queue(`
		SELECT r.student_id::text, r.subject_id::text, sj.name, r.pct::float8, coalesce(r.grade, ''), coalesce(r.value, 0)::float8, coalesce(r.max, 0)::float8, r.state = 'complete'
		  FROM computed_results r JOIN subjects sj ON sj.id = r.subject_id
		 WHERE r.period_id = $2::uuid AND r.component_code = '_subject'
		   AND r.student_id IN (SELECT student_id FROM enrolments WHERE section_id = $1::uuid AND deleted_at IS NULL)
		 ORDER BY sj.name`, sid, pid).Query(func(rows pgx.Rows) error {
		seen := map[string]bool{}
		for rows.Next() {
			var student, subjectID, name string
			var r result
			var complete bool
			if err := rows.Scan(&student, &subjectID, &name, &r.pct, &r.grade, &r.val, &r.max, &complete); err != nil {
				return err
			}
			if !complete {
				r.pct, r.grade = nil, ""
			}
			f.scores[[2]string{student, subjectID}] = r
			if !seen[subjectID] {
				seen[subjectID] = true
				f.subjects = append(f.subjects, subj{subjectID, name})
			}
		}
		return rows.Err()
	})
	// Each assessment of the term as a percentage, in the order held, for
	// the trend.
	b.Queue(`
		SELECT e.student_id::text, a.subject_id::text, (sum(e.value) * 100 / nullif(sum(p.max_marks), 0))::float8
		  FROM evidence e
		  JOIN assessment_parts p ON p.id = e.part_id AND p.deleted_at IS NULL AND p.kind = 'main' AND p.counts_in_total
		  JOIN assessments a ON a.id = e.assessment_id AND a.period_id = $2::uuid AND a.deleted_at IS NULL
		 WHERE e.student_id IN (SELECT student_id FROM enrolments WHERE section_id = $1::uuid AND deleted_at IS NULL)
		   AND e.state = 'scored' AND e.value IS NOT NULL`+notExcused+`
		 GROUP BY e.student_id, a.subject_id, a.id, a.held_on, a.created_at
		 ORDER BY a.held_on NULLS LAST, a.created_at`, sid, pid).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var k [2]string
			var pct *float64
			if err := rows.Scan(&k[0], &k[1], &pct); err != nil {
				return err
			}
			if pct != nil {
				f.trend[k] = append(f.trend[k], round1(*pct))
			}
		}
		return rows.Err()
	})
	return f, tx.SendBatch(ctx, &b).Close()
}

func round1(x float64) float64 { return float64(int64(x*10+0.5)) / 10 }

// build works out every child's report in a section for a period.
func build(ctx context.Context, tx pgx.Tx, s results.Section, periodID string) (Class, error) {
	cl := Class{SectionID: s.ID, PeriodID: periodID}
	st, err := loadSettings(ctx, tx)
	if err != nil {
		return cl, err
	}
	cl.Scale = st.Levels
	f, err := read(ctx, tx, &cl)
	if err != nil {
		return cl, err
	}

	// Class figures, from children with enough evidence only.
	classBloom := map[string][]float64{}
	classSubject := map[string][]float64{}
	for _, x := range f.students {
		for _, lv := range syllabus.Blooms {
			if t, ok := f.bloom[[2]string{x.ID, lv}]; ok && t.marks >= enough {
				classBloom[lv] = append(classBloom[lv], t.pct())
			}
		}
		for _, sj := range f.subjects {
			if r := f.scores[[2]string{x.ID, sj.id}]; r.pct != nil {
				classSubject[sj.id] = append(classSubject[sj.id], *r.pct)
			}
		}
	}
	proficient := 60.0
	if len(st.Levels) >= 3 {
		proficient = st.Levels[len(st.Levels)/2].Min
	}

	for _, x := range f.students {
		r := Report{Student: x, Section: cl.Section, SectionID: cl.SectionID, Period: cl.Period, PeriodID: cl.PeriodID, Scale: st.Levels, Detail: cl.Detail,
			Scores: []Score{}, Profile: []Profile{}, Blooms: []Bloom{}, Activities: []Activity{}, Strengths: []Outcome{}, Focus: []Outcome{}}
		var got, max float64
		for _, sj := range f.subjects {
			res, ok := f.scores[[2]string{x.ID, sj.id}]
			if !ok {
				continue
			}
			sc := Score{SubjectID: sj.id, Subject: sj.name, Pct: res.pct, Grade: res.grade, ClassPct: avg(classSubject[sj.id]), Trend: f.trend[[2]string{x.ID, sj.id}]}
			if sc.Trend == nil {
				sc.Trend = []float64{}
			}
			if res.pct != nil {
				got += res.val
				max += res.max
			}
			r.Scores = append(r.Scores, sc)
		}
		if max > 0 {
			r.Overall = ptr(round1(got * 100 / max))
		}
		for _, c := range cl.comps {
			if c.activity {
				r.Activities = append(r.Activities, Activity{CompetencyID: c.id, Name: c.name, Subject: c.subject, Level: f.ratings[[2]string{x.ID, c.id}]})
				continue
			}
			t, ok := f.comp[[2]string{x.ID, c.id}]
			if !ok {
				continue
			}
			chip := Chip{ID: c.id, Name: c.name, Pct: t.pct(), Marks: t.marks}
			if t.marks >= enough {
				chip.Level = st.levelOf(chip.Pct)
			}
			i := slices.IndexFunc(r.Profile, func(p Profile) bool { return p.SubjectID == c.subjectID })
			if i < 0 {
				r.Profile = append(r.Profile, Profile{SubjectID: c.subjectID, Subject: c.subject})
				i = len(r.Profile) - 1
			}
			r.Profile[i].Competencies = append(r.Profile[i].Competencies, chip)
		}
		any := false
		for _, lv := range syllabus.Blooms {
			t, ok := f.bloom[[2]string{x.ID, lv}]
			bl := Bloom{Level: lv, ClassPct: avg(classBloom[lv])}
			if ok {
				bl.Marks = t.marks
				if t.marks >= enough {
					bl.Pct = ptr(t.pct())
					any = true
				}
			}
			r.Blooms = append(r.Blooms, bl)
		}
		if !any {
			r.Blooms = []Bloom{}
		}
		// Three strengths and three focus areas, from outcomes with enough
		// marks behind them, in plain words.
		var outs []Outcome
		for _, o := range f.outcomes[x.ID] {
			if o.t.max < 2 {
				continue
			}
			outs = append(outs, Outcome{Text: o.text, Subject: o.subject, Bloom: o.bloom, Pct: o.t.pct(), Tip: homeTip[o.bloom]})
		}
		sort.SliceStable(outs, func(i, j int) bool { return outs[i].Pct > outs[j].Pct })
		for _, o := range outs {
			if o.Pct >= proficient && len(r.Strengths) < 3 {
				r.Strengths = append(r.Strengths, o)
			}
		}
		for i := len(outs) - 1; i >= 0 && len(r.Focus) < 3; i-- {
			if outs[i].Pct < proficient {
				r.Focus = append(r.Focus, outs[i])
			}
		}
		if v := f.voices[x.ID]; v != nil {
			r.Voices = *v
		}
		r.Note = f.notes[x.ID]
		cl.Reports = append(cl.Reports, r)
	}
	return cl, nil
}

// ClassView is the heatmap: children against the competencies worked out
// from marks, each cell a level or too little evidence.
type ClassView struct {
	Section      string     `json:"section"`
	Period       string     `json:"period"`
	Scale        []Level    `json:"scale"`
	CanEdit      bool       `json:"canEdit"`
	Detail       string     `json:"detail"`
	Students     []Row      `json:"students"`
	Competencies []Column   `json:"competencies"`
	Cells        [][]Cell   `json:"cells"`
	Activities   []Column   `json:"activities"`
	Summary      []LevelSum `json:"summary"`
}

// Row is a child in the heatmap.
type Row struct {
	Student
	Overall *float64 `json:"overall,omitempty"`
	Note    string   `json:"note"`  // draft, approved or empty
	Rated   int      `json:"rated"` // activity ratings given
	Voices  int      `json:"voices"`
}

// Column is a competency in the heatmap.
type Column struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Subject string `json:"subject"`
}

// Cell is one child's level in one competency; Level 0 is too little evidence.
type Cell struct {
	Level int     `json:"level"`
	Pct   float64 `json:"pct"`
	Marks int     `json:"marks"`
}

// LevelSum is how many children reach each level in a competency.
type LevelSum struct {
	ID     string `json:"id"`
	Counts []int  `json:"counts"` // by level, index 0 too little evidence
}

func (cl Class) view() ClassView {
	v := ClassView{Section: cl.Section, Period: cl.Period, Scale: cl.Scale, CanEdit: cl.CanEdit, Detail: cl.Detail, Students: []Row{}, Competencies: []Column{}, Cells: [][]Cell{}, Activities: []Column{}, Summary: []LevelSum{}}
	// Only competencies some child has marks in.
	used := map[string]bool{}
	for _, r := range cl.Reports {
		for _, p := range r.Profile {
			for _, c := range p.Competencies {
				used[c.ID] = true
			}
		}
	}
	for _, c := range cl.comps {
		switch {
		case c.activity:
			v.Activities = append(v.Activities, Column{c.id, c.name, c.subject})
		case used[c.id]:
			v.Competencies = append(v.Competencies, Column{c.id, c.name, c.subject})
			v.Summary = append(v.Summary, LevelSum{ID: c.id, Counts: make([]int, len(cl.Scale)+1)})
		}
	}
	for _, r := range cl.Reports {
		row := Row{Student: r.Student, Overall: r.Overall, Note: r.Note.Status}
		for _, a := range r.Activities {
			if a.Level > 0 {
				row.Rated++
			}
		}
		for _, s := range []string{r.Voices.Self, r.Voices.Peer, r.Voices.Parent, r.Voices.Ambition} {
			if s != "" {
				row.Voices++
			}
		}
		v.Students = append(v.Students, row)
		cells := make([]Cell, len(v.Competencies))
		for _, p := range r.Profile {
			for _, c := range p.Competencies {
				if i := slices.IndexFunc(v.Competencies, func(x Column) bool { return x.ID == c.ID }); i >= 0 {
					cells[i] = Cell{Level: c.Level, Pct: c.Pct, Marks: c.Marks}
					v.Summary[i].Counts[c.Level]++
				}
			}
		}
		v.Cells = append(v.Cells, cells)
	}
	return v
}
