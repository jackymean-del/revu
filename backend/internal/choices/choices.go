package choices

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// place is where a student sits in a year: the section of a level, its
// branch, and the year's days.
type place struct {
	studentID, name                    string
	sectionID, branchID, levelID, year string
	starts, ends                       string // the year's first and last day
}

// group is what assigning needs to know about a subject group.
type group struct {
	id, name, levelID string
	min, max          int
}

const placeSelect = `
	SELECT st.id::text, st.name, s.id::text, s.branch_id::text, s.level_id::text, y.id::text, y.starts_on::text, y.ends_on::text
	  FROM enrolments e
	  JOIN students st ON st.id = e.student_id AND st.deleted_at IS NULL
	  JOIN sections s ON s.id = e.section_id AND s.deleted_at IS NULL
	  JOIN academic_years y ON y.id = e.year_id AND y.deleted_at IS NULL
	 WHERE e.deleted_at IS NULL`

func scanPlace(row pgx.CollectableRow) (p place, err error) {
	return p, row.Scan(&p.studentID, &p.name, &p.sectionID, &p.branchID, &p.levelID, &p.year, &p.starts, &p.ends)
}

// placeAt is the student's latest section of the level, or in the year when
// one is given.
func placeAt(ctx context.Context, tx pgx.Tx, studentID, levelID, yearID string) (place, bool, error) {
	rows, err := tx.Query(ctx, placeSelect+`
		   AND st.id::text = $1 AND s.level_id::text = $2 AND ($3 = '' OR y.id::text = $3)
		 ORDER BY y.starts_on DESC LIMIT 1`, studentID, levelID, yearID)
	if err != nil {
		return place{}, false, err
	}
	p, err := pgx.CollectExactlyOneRow(rows, scanPlace)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, false, nil
	}
	return p, err == nil, err
}

// sectionPlace is a section's year, level and branch.
func sectionPlace(ctx context.Context, tx pgx.Tx, sectionID string) (place, error) {
	var p place
	if !records.UUIDShape.MatchString(sectionID) {
		return p, errNoSection
	}
	err := tx.QueryRow(ctx, `
		SELECT s.id::text, s.branch_id::text, s.level_id::text, y.id::text, y.starts_on::text, y.ends_on::text
		  FROM sections s JOIN academic_years y ON y.id = s.year_id
		 WHERE s.id = $1::uuid AND s.deleted_at IS NULL`, sectionID).
		Scan(&p.sectionID, &p.branchID, &p.levelID, &p.year, &p.starts, &p.ends)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, errNoSection
	}
	return p, err
}

var errNoSection = problem.New(http.StatusNotFound, "structure.not_found", "Nothing here has this id.")

func loadGroup(ctx context.Context, tx pgx.Tx, id string) (group, bool, error) {
	g := group{id: id}
	if !records.UUIDShape.MatchString(id) {
		return g, false, nil
	}
	err := tx.QueryRow(ctx, `SELECT name, level_id::text, min_choices, max_choices FROM subject_groups WHERE id = $1::uuid AND deleted_at IS NULL`, id).
		Scan(&g.name, &g.levelID, &g.min, &g.max)
	if errors.Is(err, pgx.ErrNoRows) {
		return g, false, nil
	}
	return g, err == nil, err
}

func offers(ctx context.Context, tx pgx.Tx, groupID, subjectID string) (bool, error) {
	var ok bool
	if !records.UUIDShape.MatchString(subjectID) {
		return false, nil
	}
	err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM subject_group_options WHERE group_id = $1::uuid AND subject_id = $2::uuid AND deleted_at IS NULL)`, groupID, subjectID).Scan(&ok)
	return ok, err
}

// actor is the person with the sections they teach, for the class
// teacher's own-section rule.
func actor(c fiber.Ctx, tx pgx.Tx) (policy.Actor, error) {
	m, _ := tenant.MemberFrom(c)
	a := m.Actor()
	rows, err := tx.Query(c.Context(), `
		SELECT DISTINCT a.section_id::text, coalesce(a.subject_id::text, '')
		  FROM teaching_assignments a JOIN memberships m ON m.staff_id = a.staff_id
		 WHERE m.clerk_user_id = $1 AND a.deleted_at IS NULL`, m.UserID)
	if err != nil {
		return a, err
	}
	a.Assignments, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (as policy.Assignment, err error) {
		return as, r.Scan(&as.SectionID, &as.SubjectID)
	})
	return a, err
}

func canWrite(a policy.Actor, p place) error {
	return policy.Check(a, policy.SubjectChoices, policy.Target{BranchID: p.branchID, SectionID: p.sectionID})
}

// canRead: whoever may change the section's choices, its leaders, and its
// teachers, who need to know who takes their subject.
func canRead(a policy.Actor, p place) error {
	if canWrite(a, p) == nil {
		return nil
	}
	for _, r := range a.Roles {
		if (r.Role == policy.Admin || r.Role == policy.Principal || r.Role == policy.Coordinator) && (r.BranchID == "" || r.BranchID == p.branchID) {
			return nil
		}
	}
	for _, as := range a.Assignments {
		if as.SectionID == p.sectionID {
			return nil
		}
	}
	return problem.New(http.StatusForbidden, "auth.forbidden", "Your role does not allow this here.")
}

// day is the asked day, or today, kept inside the year.
func day(ctx context.Context, tx pgx.Tx, asked string, p place) (string, error) {
	if asked != "" {
		if _, err := time.Parse(time.DateOnly, asked); err != nil {
			return "", problem.Invalid(api.FieldError{Field: "on", Code: "date", Message: "Use a date like 2026-11-02."})
		}
	}
	var d string
	err := tx.QueryRow(ctx, `SELECT greatest(least(coalesce(nullif($1, '')::date, current_date), $3::date), $2::date)::text`, asked, p.starts, p.ends).Scan(&d)
	return d, err
}

const (
	assigned  = "assigned"
	changed   = "changed"
	unchanged = "unchanged"
	full      = "full" // the group allows no more, and replacing was not asked for
)

type running struct{ id, subjectID, from string }

func runningIn(ctx context.Context, tx pgx.Tx, p place, groupID string) ([]running, bool, error) {
	rows, err := tx.Query(ctx, `
		SELECT id::text, subject_id::text, effective_from::text, effective_to IS NULL
		  FROM student_subject_choices WHERE student_id::text = $1 AND year_id::text = $2 AND group_id = $3::uuid
		 ORDER BY effective_from`, p.studentID, p.year, groupID)
	if err != nil {
		return nil, false, err
	}
	var out []running
	history := false
	for rows.Next() {
		var r running
		var open bool
		if err := rows.Scan(&r.id, &r.subjectID, &r.from, &open); err != nil {
			return nil, false, err
		}
		if open {
			out = append(out, r)
		} else {
			history = true
		}
	}
	return out, history, rows.Err()
}

func choiceByID(ctx context.Context, tx pgx.Tx, id string) (api.SubjectChoice, error) {
	var ch api.SubjectChoice
	err := tx.QueryRow(ctx, `
		SELECT id::text, student_id::text, group_id::text, subject_id::text, effective_from::text, coalesce(effective_to::text, ''), source
		  FROM student_subject_choices WHERE id = $1::uuid`, id).
		Scan(&ch.Id, &ch.StudentId, &ch.GroupId, &ch.SubjectId, &ch.EffectiveFrom, &ch.EffectiveTo, &ch.Source)
	return ch, err
}

// assign gives one student one option. from is the day a change applies;
// "" means today for a change and the start of the year for a first choice.
// With replace, a group that allows one option ends the earlier choice the
// day before. Every change is audited with the rows' ids.
func assign(c fiber.Ctx, tx pgx.Tx, p place, g group, subjectID, from, source string, replace bool) (string, error) {
	ctx := c.Context()
	now, history, err := runningIn(ctx, tx, p, g.id)
	if err != nil {
		return "", err
	}
	for _, r := range now {
		if r.subjectID == subjectID {
			return unchanged, nil
		}
	}
	var ended *running
	if len(now) >= g.max {
		if !replace || g.max != 1 {
			return full, nil
		}
		ended = &now[0]
	}
	start := from
	if start == "" && (ended != nil || history) {
		if start, err = day(ctx, tx, "", p); err != nil {
			return "", err
		}
	} else if start == "" {
		start = p.starts
	}
	var before any
	if ended != nil {
		if start < ended.from {
			start = ended.from // a correction on or before its first day replaces it outright
		}
		b, err := choiceByID(ctx, tx, ended.id)
		if err != nil {
			return "", err
		}
		before = b
		if _, err := tx.Exec(ctx, `UPDATE student_subject_choices SET effective_to = $2::date - 1 WHERE id = $1::uuid`, ended.id, start); err != nil {
			return "", err
		}
	}
	m, _ := tenant.MemberFrom(c)
	var id string
	err = tx.QueryRow(ctx, `
		INSERT INTO student_subject_choices (org_id, student_id, year_id, group_id, subject_id, effective_from, source)
		VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::date, $7) RETURNING id::text`,
		m.OrgID, p.studentID, p.year, g.id, subjectID, start, source).Scan(&id)
	if err != nil {
		return "", err
	}
	after, err := choiceByID(ctx, tx, id)
	if err != nil {
		return "", err
	}
	action, outcome := "create", assigned
	if ended != nil {
		action, outcome = "update", changed
	}
	if err := audit.Record(c, audit.Entry{Action: action, Entity: "student_subject_choices", EntityID: id, Before: before, After: after}); err != nil {
		return "", err
	}
	return outcome, nil
}

func count(r *api.ChoiceResult, outcome string) {
	switch outcome {
	case assigned:
		r.Assigned++
	case changed:
		r.Changed++
	case unchanged:
		r.Unchanged++
	default:
		r.Skipped++
	}
}

func listChoices(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	p, err := sectionPlace(ctx, tx, c.Query("sectionId"))
	if err != nil {
		return err
	}
	a, err := actor(c, tx)
	if err != nil {
		return err
	}
	if err := canRead(a, p); err != nil {
		return err
	}
	d, err := day(ctx, tx, c.Query("on"), p)
	if err != nil {
		return err
	}
	rows, err := tx.Query(ctx, `
		SELECT c.id::text, c.student_id::text, c.group_id::text, c.subject_id::text, c.effective_from::text, coalesce(c.effective_to::text, ''), c.source
		  FROM student_subject_choices c
		  JOIN enrolments e ON e.student_id = c.student_id AND e.section_id = $1::uuid AND e.deleted_at IS NULL
		 WHERE c.year_id::text = $2 AND c.effective_from <= $3::date AND (c.effective_to IS NULL OR c.effective_to >= $3::date)
		 ORDER BY c.student_id, c.group_id, c.effective_from`, p.sectionID, p.year, d)
	if err != nil {
		return err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (ch api.SubjectChoice, err error) {
		return ch, r.Scan(&ch.Id, &ch.StudentId, &ch.GroupId, &ch.SubjectId, &ch.EffectiveFrom, &ch.EffectiveTo, &ch.Source)
	})
	if err != nil {
		return err
	}
	if list == nil {
		list = []api.SubjectChoice{}
	}
	return c.JSON(list)
}

func assignChoices(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	var in api.SubjectChoiceInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	var f records.Fields
	g, ok, err := loadGroup(ctx, tx, in.GroupId)
	if err != nil {
		return err
	}
	if !ok {
		f.Add("groupId", "unknown", "Choose one from the list.")
	} else if ok, err := offers(ctx, tx, g.id, in.SubjectId); err != nil {
		return err
	} else if !ok {
		f.Add("subjectId", "unknown", "Choose one of the group's options.")
	}
	if n := len(in.StudentIds); n < 1 || n > 500 {
		f.Add("studentIds", "length", "Choose between 1 and 500 students.")
	}
	if in.EffectiveFrom != "" {
		if _, err := time.Parse(time.DateOnly, in.EffectiveFrom); err != nil {
			f.Add("effectiveFrom", "date", "Use a date like 2026-11-02.")
		}
	}
	if len(f) > 0 {
		return problem.Invalid(f...)
	}
	a, err := actor(c, tx)
	if err != nil {
		return err
	}
	places := make([]place, 0, len(in.StudentIds))
	var unplaced, outside []string
	for _, id := range in.StudentIds {
		p, ok, err := placeAt(ctx, tx, id, g.levelID, "")
		if err != nil {
			return err
		}
		if !ok {
			unplaced = append(unplaced, id)
			continue
		}
		if err := canWrite(a, p); err != nil {
			return err
		}
		if in.EffectiveFrom != "" && (in.EffectiveFrom < p.starts || in.EffectiveFrom > p.ends) {
			outside = append(outside, p.name)
		}
		places = append(places, p)
	}
	if len(unplaced) > 0 {
		f.Add("studentIds", "unplaced", fmt.Sprintf("%d of these are not placed in a section of this group's level.", len(unplaced)))
	}
	if len(outside) > 0 {
		f.Add("effectiveFrom", "outside", "Keep the date inside the year.")
	}
	if len(f) > 0 {
		return problem.Invalid(f...)
	}
	var res api.ChoiceResult
	var refused []string
	for _, p := range places {
		outcome, err := assign(c, tx, p, g, in.SubjectId, in.EffectiveFrom, "manual", true)
		if err != nil {
			return err
		}
		if outcome == full {
			refused = append(refused, p.name)
		}
		count(&res, outcome)
	}
	if len(refused) > 0 {
		return problem.New(http.StatusConflict, "choices.full",
			fmt.Sprintf("%s already %s as many options of %s as it allows. End one first.", names(refused), has(len(refused)), g.name))
	}
	return c.JSON(res)
}

func names(list []string) string {
	if len(list) > 3 {
		return strings.Join(list[:3], ", ") + fmt.Sprintf(" and %d more", len(list)-3)
	}
	return strings.Join(list, ", ")
}

func has(n int) string {
	if n == 1 {
		return "has"
	}
	return "have"
}

func endChoice(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	id := c.Params("id")
	notFound := problem.New(http.StatusNotFound, "choices.not_found", "No running choice has this id.")
	if !records.UUIDShape.MatchString(id) {
		return notFound
	}
	var levelID, yearID string
	before, err := choiceByID(ctx, tx, id)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && before.EffectiveTo != "") {
		return notFound
	}
	if err != nil {
		return err
	}
	if err := tx.QueryRow(ctx, `SELECT g.level_id::text, c.year_id::text FROM student_subject_choices c JOIN subject_groups g ON g.id = c.group_id WHERE c.id = $1::uuid`, id).Scan(&levelID, &yearID); err != nil {
		return err
	}
	p, ok, err := placeAt(ctx, tx, before.StudentId, levelID, yearID)
	if err != nil {
		return err
	}
	if !ok {
		return notFound
	}
	a, err := actor(c, tx)
	if err != nil {
		return err
	}
	if err := canWrite(a, p); err != nil {
		return err
	}
	d, err := day(ctx, tx, c.Query("on"), p)
	if err != nil {
		return err
	}
	if d < before.EffectiveFrom {
		d = before.EffectiveFrom // withdrawn before it began
	}
	if _, err := tx.Exec(ctx, `UPDATE student_subject_choices SET effective_to = $2::date - 1 WHERE id = $1::uuid`, id, d); err != nil {
		return err
	}
	after, err := choiceByID(ctx, tx, id)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "student_subject_choices", EntityID: id, Before: before, After: after}); err != nil {
		return err
	}
	return c.SendStatus(http.StatusNoContent)
}

// students lists who is placed in the section.
func students(ctx context.Context, tx pgx.Tx, section place) ([]place, error) {
	rows, err := tx.Query(ctx, placeSelect+` AND s.id = $1::uuid AND st.status = 'active' ORDER BY lower(st.name)`, section.sectionID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, scanPlace)
}

func copyChoices(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	var in api.ChoiceCopyInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	section, err := sectionPlace(ctx, tx, in.SectionId)
	if err != nil {
		return err
	}
	a, err := actor(c, tx)
	if err != nil {
		return err
	}
	if err := canWrite(a, section); err != nil {
		return err
	}
	var lastDay string
	err = tx.QueryRow(ctx, `
		SELECT ends_on::text FROM academic_years
		 WHERE deleted_at IS NULL AND starts_on < $1::date ORDER BY starts_on DESC LIMIT 1`, section.starts).Scan(&lastDay)
	if errors.Is(err, pgx.ErrNoRows) {
		return problem.New(http.StatusUnprocessableEntity, "choices.no_earlier_year", "There is no earlier year to copy from.")
	}
	if err != nil {
		return err
	}
	list, err := students(ctx, tx, section)
	if err != nil {
		return err
	}
	var res api.ChoiceResult
	for _, p := range list {
		// Last year's options, and the group of this year's level offering each.
		rows, err := tx.Query(ctx, `
			SELECT c.subject_id::text, coalesce((
			  SELECT g.id::text FROM subject_groups g JOIN subject_group_options o ON o.group_id = g.id AND o.deleted_at IS NULL
			   WHERE g.deleted_at IS NULL AND g.level_id = $3::uuid AND o.subject_id = c.subject_id LIMIT 1), '')
			  FROM student_subject_choices c
			 WHERE c.student_id = $1::uuid AND c.effective_from <= $2::date AND (c.effective_to IS NULL OR c.effective_to >= $2::date)
			   AND c.year_id <> $4::uuid`, p.studentID, lastDay, section.levelID, section.year)
		if err != nil {
			return err
		}
		type pair struct{ subject, group string }
		pairs, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (x pair, err error) { return x, r.Scan(&x.subject, &x.group) })
		if err != nil {
			return err
		}
		for _, x := range pairs {
			if x.group == "" {
				res.Skipped++
				continue
			}
			g, _, err := loadGroup(ctx, tx, x.group)
			if err != nil {
				return err
			}
			outcome, err := assign(c, tx, p, g, x.subject, "", "copied", false)
			if err != nil {
				return err
			}
			count(&res, outcome)
		}
	}
	return c.JSON(res)
}

func completeness(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	section, err := sectionPlace(ctx, tx, c.Params("id"))
	if err != nil {
		return err
	}
	a, err := actor(c, tx)
	if err != nil {
		return err
	}
	if err := canRead(a, section); err != nil {
		return err
	}
	d, err := day(ctx, tx, c.Query("on"), section)
	if err != nil {
		return err
	}
	out := api.ChoiceCompleteness{SectionId: section.sectionID, On: d, Groups: []api.GroupCompleteness{}}
	if err := tx.QueryRow(ctx, `
		SELECT count(*) FROM enrolments e JOIN students st ON st.id = e.student_id AND st.deleted_at IS NULL AND st.status = 'active'
		 WHERE e.section_id = $1::uuid AND e.deleted_at IS NULL`, section.sectionID).Scan(&out.Students); err != nil {
		return err
	}
	rows, err := tx.Query(ctx, `SELECT id::text, name, rule, min_choices, max_choices FROM subject_groups WHERE level_id = $1::uuid AND deleted_at IS NULL ORDER BY lower(name)`, section.levelID)
	if err != nil {
		return err
	}
	gs, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (g api.GroupCompleteness, err error) {
		return g, r.Scan(&g.GroupId, &g.Name, &g.Rule, &g.MinChoices, &g.MaxChoices)
	})
	if err != nil {
		return err
	}
	// A student's choices in force on the day, for a group's live options.
	const inForce = `
		FROM student_subject_choices c
		JOIN subject_group_options o ON o.group_id = c.group_id AND o.subject_id = c.subject_id AND o.deleted_at IS NULL
		WHERE c.group_id = $2::uuid AND c.year_id = $4::uuid AND c.effective_from <= $3::date AND (c.effective_to IS NULL OR c.effective_to >= $3::date)`
	for _, g := range gs {
		rows, err := tx.Query(ctx, `
			SELECT o.subject_id::text, (SELECT count(DISTINCT c.student_id) `+inForce+` AND c.subject_id = o.subject_id
			   AND c.student_id IN (SELECT student_id FROM enrolments WHERE section_id = $1::uuid AND deleted_at IS NULL))
			  FROM subject_group_options o JOIN subjects s ON s.id = o.subject_id
			 WHERE o.group_id = $2::uuid AND o.deleted_at IS NULL ORDER BY lower(s.name)`, section.sectionID, g.GroupId, d, section.year)
		if err != nil {
			return err
		}
		if g.Options, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (o api.OptionCount, err error) {
			return o, r.Scan(&o.SubjectId, &o.Students)
		}); err != nil {
			return err
		}
		rows, err = tx.Query(ctx, `
			SELECT * FROM (
			  SELECT st.id::text, st.name, (SELECT count(*) `+inForce+` AND c.student_id = st.id)::int AS chosen
			    FROM enrolments e JOIN students st ON st.id = e.student_id AND st.deleted_at IS NULL AND st.status = 'active'
			   WHERE e.section_id = $1::uuid AND e.deleted_at IS NULL) x
			 WHERE chosen < $5 ORDER BY lower(name)`, section.sectionID, g.GroupId, d, section.year, g.MinChoices)
		if err != nil {
			return err
		}
		if g.Missing, err = pgx.CollectRows(rows, func(r pgx.CollectableRow) (m api.MissingChoice, err error) {
			return m, r.Scan(&m.StudentId, &m.Name, &m.Chosen)
		}); err != nil {
			return err
		}
		if g.Options == nil {
			g.Options = []api.OptionCount{}
		}
		if g.Missing == nil {
			g.Missing = []api.MissingChoice{}
		}
		out.Groups = append(out.Groups, g)
	}
	return c.JSON(out)
}
