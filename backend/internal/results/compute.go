// Package results keeps computed_results up to date and serves them. It
// reads marks in bulk, hands each student's subject to the scheme engine
// (internal/scheme, the only place a result is computed) and replaces the
// stored rows in one transaction. Recomputing is idempotent: the same marks
// and scheme give the same rows (blueprint Part 6.2).
package results

import (
	"context"
	"encoding/json"
	"fmt"
	"slices"

	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/evidence"
	"github.com/jackymean-del/revu/internal/scheme"
)

// Key is one student's result in one subject and period.
type Key struct{ StudentID, PeriodID, SubjectID string }

// Applied is the scheme version that applies somewhere.
type Applied struct {
	ID, FamilyID, Name string
	Version            int
	Definition         scheme.Definition
}

type assignment struct {
	levelID, periodID, subjectID string
	scheme                       Applied
}

// Schemes are the institution's assignments, each with the latest
// published version of its scheme.
type Schemes []assignment

// LoadSchemes reads the assignments in force.
func LoadSchemes(ctx context.Context, tx pgx.Tx) (Schemes, error) {
	var b pgx.Batch
	get := QueueSchemes(&b)
	if err := Send(ctx, tx, &b); err != nil {
		return nil, err
	}
	return get(), nil
}

// For is the scheme for a level, period and subject: the most specific
// assignment wins, a subject above a level above a period, and an
// assignment for everything comes last (Part 4.5).
func (s Schemes) For(levelID, periodID, subjectID string) (Applied, bool) {
	best, score := Applied{}, -1
	for _, a := range s {
		if a.levelID != "" && a.levelID != levelID || a.periodID != "" && a.periodID != periodID || a.subjectID != "" && a.subjectID != subjectID {
			continue
		}
		n := 0
		if a.subjectID != "" {
			n += 4
		}
		if a.levelID != "" {
			n += 2
		}
		if a.periodID != "" {
			n++
		}
		if n > score {
			best, score = a.scheme, n
		}
	}
	return best, score >= 0
}

// place is where a key's student sits and whether they take the subject.
type place struct {
	levelID, sectionID string
	applicable         bool
	choiceMissing      bool
}

// Inputs are everything the engine needs for a set of keys, read in a
// handful of queries.
type Inputs struct {
	places map[Key]place
	events map[Key][]scheme.Event
}

// ChoiceMissing says a subject is one of a group's options and the student
// has chosen none in the group.
const choiceMissing = `EXISTS (SELECT 1 FROM subject_group_options o JOIN subject_groups g ON g.id = o.group_id AND g.deleted_at IS NULL
	WHERE o.deleted_at IS NULL AND o.subject_id = a.subject_id AND g.level_id = a.level_id
	  AND NOT EXISTS (SELECT 1 FROM student_subject_choices c
	                   WHERE c.student_id = k.s AND c.group_id = g.id AND c.year_id = a.year_id
	                     AND c.effective_from <= ` + evidence.InForceDay + ` AND (c.effective_to IS NULL OR c.effective_to >= ` + evidence.InForceDay + `)))`

func arrays(keys []Key) (s, p, u []string) {
	for _, k := range keys {
		s, p, u = append(s, k.StudentID), append(p, k.PeriodID), append(u, k.SubjectID)
	}
	return
}

// Load reads the marks, row statuses and choices behind keys.
func Load(ctx context.Context, tx pgx.Tx, keys []Key) (Inputs, error) {
	in := Inputs{places: map[Key]place{}, events: map[Key][]scheme.Event{}}
	if len(keys) == 0 {
		return in, nil
	}
	ss, ps, us := arrays(keys)
	rows, err := tx.Query(ctx, `
		SELECT DISTINCT ON (k.s, k.p, k.u) k.s::text, k.p::text, k.u::text, a.level_id::text, sec.id::text,
		       `+fmt.Sprintf(evidence.Applicable, "("+evidence.Selected+")", "k.s")+`, `+choiceMissing+`
		  FROM unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS k(s, p, u)
		  JOIN periods pe ON pe.id = k.p AND pe.deleted_at IS NULL
		  JOIN students st ON st.id = k.s AND st.deleted_at IS NULL
		  JOIN enrolments e ON e.student_id = k.s AND e.year_id = pe.year_id AND e.deleted_at IS NULL
		  JOIN sections sec ON sec.id = e.section_id AND sec.deleted_at IS NULL
		  CROSS JOIN LATERAL (SELECT sec.level_id, k.u AS subject_id, pe.year_id, pe.id AS period_id) a
		 ORDER BY k.s, k.p, k.u, e.created_at DESC`, ss, ps, us)
	if err != nil {
		return in, err
	}
	for rows.Next() {
		var k Key
		var pl place
		if err := rows.Scan(&k.StudentID, &k.PeriodID, &k.SubjectID, &pl.levelID, &pl.sectionID, &pl.applicable, &pl.choiceMissing); err != nil {
			return in, err
		}
		in.places[k] = pl
	}
	if err := rows.Err(); err != nil {
		return in, err
	}

	// Assessments held in these periods and subjects, with their sections.
	type assessment struct {
		event                        scheme.Event
		periodID, subjectID, levelID string
		sections                     []string
	}
	rows, err = tx.Query(ctx, `
		SELECT a.id::text, a.title, a.kind, coalesce(a.held_on::text, ''), a.period_id::text, a.subject_id::text, a.level_id::text,
		       array_agg(sc.section_id::text ORDER BY sc.section_id)
		  FROM assessments a JOIN assessment_scopes sc ON sc.assessment_id = a.id
		 WHERE a.deleted_at IS NULL AND a.status <> 'draft' AND a.period_id = ANY($1::uuid[]) AND a.subject_id = ANY($2::uuid[])
		 GROUP BY a.id`, uniq(ps), uniq(us))
	if err != nil {
		return in, err
	}
	var as []assessment
	byID := map[string]int{}
	for rows.Next() {
		var a assessment
		if err := rows.Scan(&a.event.AssessmentID, &a.event.Title, &a.event.Kind, &a.event.HeldOn, &a.periodID, &a.subjectID, &a.levelID, &a.sections); err != nil {
			return in, err
		}
		byID[a.event.AssessmentID] = len(as)
		as = append(as, a)
	}
	if err := rows.Err(); err != nil {
		return in, err
	}
	if len(as) == 0 {
		return in, nil
	}
	ids := make([]string, 0, len(as))
	for _, a := range as {
		ids = append(ids, a.event.AssessmentID)
	}
	rows, err = tx.Query(ctx, `
		SELECT assessment_id::text, id::text, name, kind::text, coalesce(component_code, ''), counts_in_total, max_marks::text
		  FROM assessment_parts WHERE assessment_id = ANY($1::uuid[]) AND deleted_at IS NULL ORDER BY assessment_id, seq`, ids)
	if err != nil {
		return in, err
	}
	for rows.Next() {
		var aid string
		var p scheme.Part
		if err := rows.Scan(&aid, &p.ID, &p.Name, &p.Kind, &p.ComponentCode, &p.CountsInTotal, &p.Max); err != nil {
			return in, err
		}
		a := &as[byID[aid]]
		a.event.Parts = append(a.event.Parts, p)
	}
	if err := rows.Err(); err != nil {
		return in, err
	}

	// The student's cells and row status in each.
	type cellKey struct{ student, part string }
	cells := map[cellKey][2]string{}
	rows, err = tx.Query(ctx, `
		SELECT student_id::text, part_id::text, state::text, coalesce(value::text, '')
		  FROM evidence WHERE assessment_id = ANY($1::uuid[]) AND student_id = ANY($2::uuid[])`, ids, uniq(ss))
	if err != nil {
		return in, err
	}
	for rows.Next() {
		var k cellKey
		var state, value string
		if err := rows.Scan(&k.student, &k.part, &state, &value); err != nil {
			return in, err
		}
		cells[k] = [2]string{state, value}
	}
	if err := rows.Err(); err != nil {
		return in, err
	}
	status := map[[2]string]string{}
	rows, err = tx.Query(ctx, `
		SELECT assessment_id::text, student_id::text, status FROM assessment_participation
		 WHERE assessment_id = ANY($1::uuid[]) AND student_id = ANY($2::uuid[])`, ids, uniq(ss))
	if err != nil {
		return in, err
	}
	for rows.Next() {
		var a, s, st string
		if err := rows.Scan(&a, &s, &st); err != nil {
			return in, err
		}
		status[[2]string{a, s}] = st
	}
	if err := rows.Err(); err != nil {
		return in, err
	}

	for _, k := range keys {
		pl, ok := in.places[k]
		if !ok || !pl.applicable {
			continue
		}
		for _, a := range as {
			if a.periodID != k.PeriodID || a.subjectID != k.SubjectID || a.levelID != pl.levelID || !slices.Contains(a.sections, pl.sectionID) {
				continue
			}
			e := a.event
			e.RowStatus = status[[2]string{e.AssessmentID, k.StudentID}]
			e.Parts = make([]scheme.Part, len(a.event.Parts))
			for i, p := range a.event.Parts {
				c := cells[cellKey{k.StudentID, p.ID}]
				p.State, p.Value = c[0], c[1]
				e.Parts[i] = p
			}
			in.events[k] = append(in.events[k], e)
		}
	}
	return in, nil
}

func uniq(xs []string) []string {
	out := slices.Clone(xs)
	slices.Sort(out)
	return slices.Compact(out)
}

// Outcome is what the engine gives for one key, or why it gives nothing.
type Outcome struct {
	Key     Key
	Scheme  Applied
	Result  scheme.Result
	Skip    bool   // no stored result: no scheme applies, or the student does not take the subject
	Because string // why a result was skipped
}

// Evaluate runs the engine for each key over the loaded inputs. Scheme
// may be given to try a version that is not in force (a dry run).
func Evaluate(keys []Key, in Inputs, schemes Schemes, override *Applied) []Outcome {
	out := make([]Outcome, 0, len(keys))
	for _, k := range keys {
		o := Outcome{Key: k}
		pl, ok := in.places[k]
		switch {
		case !ok:
			o.Skip, o.Because = true, "not_enrolled"
		case !pl.applicable && !pl.choiceMissing:
			o.Skip, o.Because = true, "not_taken"
		}
		if o.Skip {
			out = append(out, o)
			continue
		}
		if override != nil {
			o.Scheme = *override
		} else if s, found := schemes.For(pl.levelID, k.PeriodID, k.SubjectID); found {
			o.Scheme = s
		} else {
			o.Skip, o.Because = true, "no_scheme"
			out = append(out, o)
			continue
		}
		o.Result = scheme.Evaluate(o.Scheme.Definition, scheme.Input{Events: in.events[k], ChoiceMissing: !pl.applicable && pl.choiceMissing})
		if o.Result.State == "not_assessed" && o.Result.Reason == "no_evidence" {
			o.Skip, o.Because = true, "no_evidence"
		}
		out = append(out, o)
	}
	return out
}

// Recompute works out keys afresh and replaces their stored rows and
// recompute intents, in the caller's transaction. It returns how many
// subject results it stored.
func Recompute(ctx context.Context, tx pgx.Tx, keys []Key) (int, error) {
	if len(keys) == 0 {
		return 0, nil
	}
	schemes, err := LoadSchemes(ctx, tx)
	if err != nil {
		return 0, err
	}
	in, err := Load(ctx, tx, keys)
	if err != nil {
		return 0, err
	}
	outcomes := Evaluate(keys, in, schemes, nil)

	var cols struct {
		s, p, u, code, state, scheme []string
		value, max, pct, grade       []*string
		reason, detail               []*string
		version                      []int32
	}
	str := func(s string) *string {
		if s == "" {
			return nil
		}
		return &s
	}
	stored := 0
	for _, o := range outcomes {
		if o.Skip {
			continue
		}
		stored++
		r := o.Result
		detail, err := json.Marshal(r)
		if err != nil {
			return 0, err
		}
		row := func(code, state, value, max, pct, grade, reason string, detail []byte) {
			cols.s, cols.p, cols.u = append(cols.s, o.Key.StudentID), append(cols.p, o.Key.PeriodID), append(cols.u, o.Key.SubjectID)
			cols.code, cols.state, cols.scheme = append(cols.code, code), append(cols.state, state), append(cols.scheme, o.Scheme.ID)
			cols.value, cols.max, cols.pct, cols.grade = append(cols.value, str(value)), append(cols.max, str(max)), append(cols.pct, str(pct)), append(cols.grade, str(grade))
			cols.reason = append(cols.reason, str(reason))
			if detail != nil {
				d := string(detail)
				cols.detail = append(cols.detail, &d)
			} else {
				cols.detail = append(cols.detail, nil)
			}
			cols.version = append(cols.version, int32(o.Scheme.Version))
		}
		row("_subject", r.State, r.Value, r.Max, r.Pct, r.Grade, r.Reason, detail)
		for _, c := range r.Components {
			state, reason := c.State, c.Reason
			if state == "left_out" {
				state, reason = "not_assessed", "left_out"
			}
			value := c.Value
			if state == "blocked" || state == "not_assessed" {
				value = ""
			}
			row(c.Code, state, value, c.Max, c.Pct, "", reason, nil)
		}
	}

	ss, ps, us := arrays(keys)
	if _, err := tx.Exec(ctx, `
		DELETE FROM computed_results r USING unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS k(s, p, u)
		 WHERE r.student_id = k.s AND r.period_id = k.p AND r.subject_id = k.u`, ss, ps, us); err != nil {
		return 0, err
	}
	if len(cols.s) > 0 {
		if _, err := tx.Exec(ctx, `
			INSERT INTO computed_results (org_id, student_id, period_id, subject_id, component_code, value, max, pct, grade, state, reason, detail, scheme_id, scheme_version)
			SELECT app_org_id(), s, p, u, code, value::numeric, max::numeric, pct::numeric, grade, state::result_state, reason, detail::jsonb, scheme, version
			  FROM unnest($1::uuid[], $2::uuid[], $3::uuid[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::text[], $12::uuid[], $13::int[])
			       AS x(s, p, u, code, value, max, pct, grade, state, reason, detail, scheme, version)`,
			cols.s, cols.p, cols.u, cols.code, cols.value, cols.max, cols.pct, cols.grade, cols.state, cols.reason, cols.detail, cols.scheme, cols.version); err != nil {
			return 0, err
		}
	}
	if _, err := tx.Exec(ctx, `
		DELETE FROM result_stale_intents r USING unnest($1::uuid[], $2::uuid[], $3::uuid[]) AS k(s, p, u)
		 WHERE r.student_id = k.s AND r.period_id = k.p AND r.subject_id = k.u`, ss, ps, us); err != nil {
		return 0, err
	}
	return stored, nil
}
