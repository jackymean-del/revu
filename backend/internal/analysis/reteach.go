package analysis

import (
	"context"
	"net/http"
	"slices"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/results"
	"github.com/jackymean-del/revu/internal/scheme"
	"github.com/jackymean-del/revu/internal/tenant"
)

// The reteach list reads in three round trips whatever the number of
// students or paper parts (decision D30): the assessment and section; the
// roster, marks and follow-up assessments; the follow-ups' marks.

type loaded struct {
	id, title, kind, mode, held, period, subject, level, year string
	parts                                                     []Part
	found                                                     bool
}

func queueAssessment(b *pgx.Batch, id string) *loaded {
	a := &loaded{parts: []Part{}}
	b.Queue(`
		SELECT id::text, title, kind, entry_mode, coalesce(held_on::text, ''), period_id::text, subject_id::text, level_id::text, year_id::text
		  FROM assessments WHERE id = $1::uuid AND deleted_at IS NULL`, id).
		Query(func(rows pgx.Rows) error {
			for rows.Next() {
				a.found = true
				if err := rows.Scan(&a.id, &a.title, &a.kind, &a.mode, &a.held, &a.period, &a.subject, &a.level, &a.year); err != nil {
					return err
				}
			}
			return rows.Err()
		})
	b.Queue(`
		SELECT id::text, name, max_marks::text, kind = 'main' AND counts_in_total
		  FROM assessment_parts WHERE assessment_id = $1::uuid AND deleted_at IS NULL ORDER BY seq`, id).
		Query(func(rows pgx.Rows) error {
			for rows.Next() {
				var p Part
				if err := rows.Scan(&p.ID, &p.Name, &p.Max, &p.Main); err != nil {
					return err
				}
				a.parts = append(a.parts, p)
			}
			return rows.Err()
		})
	return a
}

func loadAssessment(ctx context.Context, tx pgx.Tx, id string) (loaded, error) {
	var b pgx.Batch
	a := queueAssessment(&b, id)
	if err := results.Send(ctx, tx, &b); err != nil {
		return loaded{}, err
	}
	if !a.found {
		return loaded{}, pgx.ErrNoRows
	}
	return *a, nil
}

// marks are the stored cells of some assessments for one section's
// students, and their row status.
type marks struct {
	cells  map[[3]string]scheme.Cell // assessment, student, part
	status map[[2]string]string      // assessment, student
}

func queueMarks(b *pgx.Batch, assessmentIDs []string, sectionID string) *marks {
	m := &marks{cells: map[[3]string]scheme.Cell{}, status: map[[2]string]string{}}
	b.Queue(`
		SELECT assessment_id::text, student_id::text, part_id::text, state::text, coalesce(value::text, '')
		  FROM evidence
		 WHERE assessment_id = ANY($1::uuid[])
		   AND student_id IN (SELECT student_id FROM enrolments WHERE section_id = $2::uuid AND deleted_at IS NULL)`, assessmentIDs, sectionID).
		Query(func(rows pgx.Rows) error {
			for rows.Next() {
				var a, s, p string
				var c scheme.Cell
				if err := rows.Scan(&a, &s, &p, &c.State, &c.Value); err != nil {
					return err
				}
				m.cells[[3]string{a, s, p}] = c
			}
			return rows.Err()
		})
	b.Queue(`
		SELECT assessment_id::text, student_id::text, status FROM assessment_participation
		 WHERE assessment_id = ANY($1::uuid[])
		   AND student_id IN (SELECT student_id FROM enrolments WHERE section_id = $2::uuid AND deleted_at IS NULL)`, assessmentIDs, sectionID).
		Query(func(rows pgx.Rows) error {
			for rows.Next() {
				var a, s, status string
				if err := rows.Scan(&a, &s, &status); err != nil {
					return err
				}
				m.status[[2]string{a, s}] = status
			}
			return rows.Err()
		})
	return m
}

// grid is each student's cell in each part of one assessment, with the row
// status applied: absent makes every cell absent, exempt exempt, and not
// applicable or left not applicable. A cell with no mark is pending.
func (m *marks) grid(assessmentID string, students []string, parts []Part) map[string]map[string]scheme.Cell {
	out := map[string]map[string]scheme.Cell{}
	for _, s := range students {
		out[s] = map[string]scheme.Cell{}
		status, hasStatus := m.status[[2]string{assessmentID, s}]
		rowState := map[string]string{"absent": "absent", "exempt": "exempt"}[status]
		if hasStatus && rowState == "" {
			rowState = "not_applicable"
		}
		for _, p := range parts {
			if rowState != "" {
				out[s][p.ID] = scheme.Cell{State: rowState, Max: p.Max}
				continue
			}
			c := m.cells[[3]string{assessmentID, s, p.ID}]
			c.Max = p.Max
			out[s][p.ID] = c
		}
	}
	return out
}

func normal(name string) string { return strings.ToLower(strings.Join(strings.Fields(name), " ")) }

type next struct{ assessmentID, title, partID, max string }

func assessment(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	id, sectionID := c.Query("assessmentId"), c.Query("sectionId")
	notFound := problem.New(http.StatusNotFound, "assessment.not_found", "No assessment has this id.")
	if !records.UUIDShape.MatchString(id) {
		return notFound
	}
	notHere := problem.New(http.StatusNotFound, "assessment.not_found", "This assessment does not cover that section.")
	if !records.UUIDShape.MatchString(sectionID) {
		return notHere
	}

	// The assessment, its section, the settings and the decisions so far.
	var b pgx.Batch
	a := queueAssessment(&b, id)
	var covers bool
	b.Queue(`SELECT EXISTS (SELECT 1 FROM assessment_scopes WHERE assessment_id = $1::uuid AND section_id = $2::uuid)`, id, sectionID).
		QueryRow(func(r pgx.Row) error { return r.Scan(&covers) })
	getSection := results.QueueSection(&b, sectionID, "")
	getSettings := queueSettings(&b)
	status := map[string]string{}
	b.Queue(`SELECT part_id::text, status FROM reteach_marks WHERE assessment_id = $1::uuid AND section_id = $2::uuid`, id, sectionID).
		Query(func(rows pgx.Rows) error {
			for rows.Next() {
				var p, s string
				if err := rows.Scan(&p, &s); err != nil {
					return err
				}
				status[p] = s
			}
			return rows.Err()
		})
	if err := results.Send(ctx, tx, &b); err != nil {
		return err
	}
	if !a.found {
		return notFound
	}
	if !covers {
		return notHere
	}
	sec, err := getSection()
	if err != nil {
		return err
	}
	actor, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	if err := policy.Check(actor, policy.ResultsRead, policy.Target{BranchID: sec.BranchID, SectionID: sec.ID, SubjectID: a.subject}); err != nil {
		return err
	}
	settings := getSettings()

	var main []Part
	var names []string
	for _, p := range a.parts {
		if p.Main {
			main = append(main, p)
			names = append(names, normal(p.Name))
		}
	}
	reteach := a.mode == "sections" && len(main) >= 2

	// The roster, the marks, and the next assessment with each part's name.
	b = pgx.Batch{}
	getRoster := results.QueueStudents(&b, sec, a.period, a.subject)
	m := queueMarks(&b, []string{id}, sec.ID)
	nextOf := map[string]next{}
	if reteach {
		b.Queue(`
			SELECT DISTINCT ON (pn.name) pn.name, x.id::text, x.title, pt.id::text, pt.max_marks::text
			  FROM unnest($5::text[]) AS pn(name)
			  JOIN assessments me ON me.id = $1::uuid
			  JOIN assessments x ON x.deleted_at IS NULL AND x.id <> me.id AND x.subject_id = $2::uuid AND x.level_id = $3::uuid
			       AND (coalesce(x.held_on, x.created_at::date), x.created_at) > (coalesce(me.held_on, me.created_at::date), me.created_at)
			  JOIN assessment_scopes sc ON sc.assessment_id = x.id AND sc.section_id = $4::uuid
			  JOIN assessment_parts pt ON pt.assessment_id = x.id AND pt.deleted_at IS NULL AND pt.kind = 'main'
			       AND lower(regexp_replace(btrim(pt.name), '\s+', ' ', 'g')) = pn.name
			 ORDER BY pn.name, coalesce(x.held_on, x.created_at::date), x.created_at, pt.seq`,
			a.id, a.subject, a.level, sec.ID, names).
			Query(func(rows pgx.Rows) error {
				for rows.Next() {
					var name string
					var n next
					if err := rows.Scan(&name, &n.assessmentID, &n.title, &n.partID, &n.max); err != nil {
						return err
					}
					nextOf[name] = n
				}
				return rows.Err()
			})
	}
	if err := results.Send(ctx, tx, &b); err != nil {
		return err
	}
	roster := slices.DeleteFunc(getRoster(), func(s results.Student) bool { return !s.Takes })
	ids := make([]string, len(roster))
	for i, s := range roster {
		ids[i] = s.ID
	}
	grid := m.grid(id, ids, a.parts)

	out := AssessmentView{ID: a.id, Title: a.title, Kind: a.kind, EntryMode: a.mode, HeldOn: a.held, Parts: a.parts, Students: []StudentScore{}, Settings: settings,
		Reteach: Reteach{Items: []Item{}}}
	for _, s := range roster {
		var cs []scheme.Cell
		for _, p := range main {
			cs = append(cs, grid[s.ID][p.ID])
		}
		out.Students = append(out.Students, StudentScore{ID: s.ID, Name: s.Name, RollNo: s.RollNo, Score: scheme.AssessmentScore(cs)})
	}
	switch {
	case a.mode != "sections":
		out.Reteach.Reason = "total_marks"
	case len(main) < 2:
		out.Reteach.Reason = "one_section"
	default:
		out.Reteach.Available = true
	}
	if !reteach {
		return c.JSON(out)
	}

	// The follow-ups' marks, when there are any.
	var later []string
	for _, n := range nextOf {
		if !slices.Contains(later, n.assessmentID) {
			later = append(later, n.assessmentID)
		}
	}
	after := &marks{}
	if len(later) > 0 {
		b = pgx.Batch{}
		after = queueMarks(&b, later, sec.ID)
		if err := results.Send(ctx, tx, &b); err != nil {
			return err
		}
	}

	for _, p := range main {
		cs := make([]scheme.Cell, len(roster))
		for i, s := range roster {
			cs[i] = grid[s.ID][p.ID]
		}
		m := scheme.SectionMastery(cs, settings.MasteryPct, settings.ReteachSharePct, settings.MinEvidence)
		item := Item{PartID: p.ID, Name: p.Name, Max: p.Max, Mastery: m, Students: []string{}, Status: status[p.ID]}
		for _, i := range m.BelowIDs {
			item.Students = append(item.Students, roster[i].Name)
		}
		// The same part in the next assessment that has it; it says what
		// changed, never why.
		if n, ok := nextOf[normal(p.Name)]; ok {
			g := after.grid(n.assessmentID, ids, []Part{{ID: n.partID, Max: n.max}})
			later := make([]scheme.Cell, len(ids))
			for i, s := range ids {
				later[i] = g[s][n.partID]
			}
			am := scheme.SectionMastery(later, settings.MasteryPct, settings.ReteachSharePct, settings.MinEvidence)
			item.FollowUp = &FollowUp{AssessmentID: n.assessmentID, Title: n.title, SharePct: am.SharePct}
			if m.Enough && am.Enough {
				item.FollowUp.Trend = scheme.Trend(m.SharePct, am.SharePct)
			}
		}
		out.Reteach.Items = append(out.Reteach.Items, item)
	}
	return c.JSON(out)
}
