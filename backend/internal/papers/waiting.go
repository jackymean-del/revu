package papers

import (
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Waiting is one thing waiting on the person asking: a blueprint or a set
// to approve, or one sent back to them to change.
type Waiting struct {
	Kind   string `json:"kind"`   // blueprint_to_approve, blueprint_returned, set_to_approve, set_returned
	Title  string `json:"title"`  // what to do, in a line
	Detail string `json:"detail"` // the assessment, and any note
	Href   string `json:"href"`
	Since  string `json:"since"` // when it started waiting
}

// waiting lists what waits on this person, so the approval flow does not
// rest on anyone remembering to look: blueprints to approve for those who
// approve them, submitted sets for those who moderate, and for a teacher
// what was sent back to them, in the subjects and classes they teach.
func waiting(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	actor, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	mod, _, err := moderates(c, tx)
	if err != nil {
		return err
	}
	approves := policy.Decide(actor, policy.BlueprintApprove, policy.Target{}) != policy.None
	sections, subjects := []string{}, []string{}
	for _, as := range actor.Assignments {
		if as.SubjectID != "" {
			sections, subjects = append(sections, as.SectionID), append(subjects, as.SubjectID)
		}
	}
	// The assessment, named as a person reads it, and whether this person
	// teaches its subject in one of its class's sections.
	const named = `s.name || ', ' || a.title || ' · ' || l.name`
	const join = `JOIN subjects s ON s.id = a.subject_id JOIN levels l ON l.id = a.level_id`
	const theirs = `EXISTS (SELECT 1 FROM unnest($3::uuid[], $4::uuid[]) AS t(section_id, subject_id) JOIN sections x ON x.id = t.section_id
		WHERE x.level_id = a.level_id AND t.subject_id = a.subject_id)`
	rows, err := tx.Query(ctx, `
		SELECT kind, title, detail, href, at FROM (
			SELECT 'blueprint_to_approve' AS kind, 'Approve the blueprint' AS title, `+named+` AS detail,
			       '/papers?a=' || a.id || '&tab=blueprint' AS href, coalesce(b.submitted_at, b.updated_at) AS at
			  FROM blueprints b JOIN assessments a ON a.id = b.assessment_id AND a.deleted_at IS NULL `+join+`
			 WHERE $1 AND b.status = 'submitted'
			UNION ALL
			SELECT 'set_to_approve', 'Approve ' || p.set_label, `+named+`, '/papers?a=' || a.id || '&tab=sets&set=' || p.id, p.submitted_at
			  FROM papers p JOIN assessments a ON a.id = p.assessment_id AND a.deleted_at IS NULL `+join+`
			 WHERE $2 AND p.status = 'submitted'
			UNION ALL
			SELECT 'blueprint_returned', 'Blueprint sent back to change', `+named+` || coalesce(': ' || nullif(b.comment, ''), ''),
			       '/papers?a=' || a.id || '&tab=blueprint', b.updated_at
			  FROM blueprints b JOIN assessments a ON a.id = b.assessment_id AND a.deleted_at IS NULL `+join+`
			 WHERE b.status = 'returned' AND `+theirs+`
			UNION ALL
			SELECT 'set_returned', p.set_label || ' sent back to change', `+named+` || ': ' || p.review_note, '/papers?a=' || a.id || '&tab=sets&set=' || p.id, coalesce(p.submitted_at, p.created_at)
			  FROM papers p JOIN assessments a ON a.id = p.assessment_id AND a.deleted_at IS NULL `+join+`
			 WHERE p.status = 'draft' AND p.review_note <> '' AND `+theirs+`
		) w ORDER BY at DESC NULLS LAST LIMIT 50`,
		approves, mod, sections, subjects)
	if err != nil {
		return err
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Waiting, error) {
		var w Waiting
		var at *time.Time
		err := r.Scan(&w.Kind, &w.Title, &w.Detail, &w.Href, &at)
		if at != nil {
			w.Since = at.UTC().Format(time.RFC3339)
		}
		return w, err
	})
	if err != nil {
		return err
	}
	if out == nil {
		out = []Waiting{}
	}
	return c.JSON(out)
}
