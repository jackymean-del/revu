package papers

import (
	"context"
	"net/http"
	"slices"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/tenant"
)

// A set goes from the teacher who writes it to those who moderate it, and
// from them to final. While it is a draft its subject's teachers work on it
// and see it as it will print, without printing it. Once submitted it is
// the moderators' alone: they change it, send it back with a note, or
// approve it, which makes it final. A teacher no longer sees its questions
// then, and may only copy it as the next set to rewrite. Only an
// administrator prints, and only a final set.

// May is what the person asking may do with a set.
type May struct {
	Edit    bool `json:"edit"`    // change its sections and questions
	Submit  bool `json:"submit"`  // send it to the moderators
	Approve bool `json:"approve"` // make it final
	Return  bool `json:"return"`  // send it back to its teacher
	Print   bool `json:"print"`
}

// moderates says whether the person moderates papers (an administrator, or
// one holding a role the administrator named for it) and whether they are
// an administrator.
func moderates(c fiber.Ctx, tx pgx.Tx) (moderator, admin bool, err error) {
	actor, err := tenant.Teaching(c)
	if err != nil {
		return false, false, err
	}
	s, err := loadSettings(c.Context(), tx)
	if err != nil {
		return false, false, err
	}
	for _, r := range actor.Roles {
		admin = admin || r.Role == policy.Admin
		moderator = moderator || slices.Contains(s.Moderators, string(r.Role))
	}
	return moderator || admin, admin, nil
}

// permit works out what the person may do with the set, and whether they
// see its questions at all.
func permit(c fiber.Ctx, tx pgx.Tx, p *Paper) error {
	mod, admin, err := moderates(c, tx)
	if err != nil {
		return err
	}
	p.open = p.Status == "draft" || mod
	p.May = May{
		Edit:    p.open && p.Status != "final",
		Submit:  p.Status == "draft" && !mod,
		Approve: mod && p.Status != "final",
		Return:  mod && p.Status == "submitted",
		Print:   admin && p.Status == "final",
	}
	return nil
}

// veiled is the set without its questions, for someone who may know it
// exists and who sits it, but not what it asks.
func veiled(p Paper) Paper {
	p.Veiled = true
	p.Sections, p.Items, p.BySection, p.ByLevel = []Section{}, []Item{}, []Gap{}, []Gap{}
	return p
}

// markSame notes which questions of a copied set are still the ones it was
// copied with, so its teacher sees what is left to rewrite.
func markSame(ctx context.Context, tx pgx.Tx, p *Paper) error {
	if p.copiedFromID == "" {
		return nil
	}
	rows, err := tx.Query(ctx, `SELECT question_id::text FROM paper_items WHERE paper_id = $1::uuid AND question_id IS NOT NULL`, p.copiedFromID)
	if err != nil {
		return err
	}
	theirs, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	for i := range p.Items {
		p.Items[i].Same = p.Items[i].Question != nil && slices.Contains(theirs, p.Items[i].Question.ID)
	}
	return nil
}

// submitPaper sends a complete draft to the moderators.
func submitPaper(c fiber.Ctx) error {
	tx, p, _, err := draft(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	if p.Status != "draft" {
		return problem.New(http.StatusConflict, "paper.submitted", "This set has already been submitted.")
	}
	if p.Filled < len(p.Items) || len(p.Items) == 0 {
		return problem.New(http.StatusConflict, "paper.incomplete", "Add at least one question, and put a question in every empty slot, first.")
	}
	m, _ := tenant.MemberFrom(c)
	if _, err := tx.Exec(ctx, `UPDATE papers SET status = 'submitted', submitted_by = $2, submitted_at = now(), review_note = '' WHERE id = $1::uuid`, p.ID, m.UserID); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "submit", Entity: "papers", EntityID: p.ID, After: map[string]any{"set": p.Set}}); err != nil {
		return err
	}
	p.Status, p.ReviewNote = "submitted", ""
	if err := permit(c, tx, &p); err != nil {
		return err
	}
	if !p.open {
		return c.JSON(veiled(p))
	}
	return c.JSON(p)
}

// returnPaper sends a submitted set back to its teacher with a note.
func returnPaper(c fiber.Ctx) error {
	tx, p, _, err := draft(c)
	if err != nil {
		return err
	}
	if !p.May.Return {
		return problem.New(http.StatusConflict, "paper.not_submitted", "Only a submitted set is sent back, by those who moderate.")
	}
	var in struct {
		Note string `json:"note"`
	}
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	in.Note = strings.TrimSpace(in.Note)
	if len(in.Note) > 1000 {
		in.Note = in.Note[:1000]
	}
	if _, err := tx.Exec(c.Context(), `UPDATE papers SET status = 'draft', review_note = $2 WHERE id = $1::uuid`, p.ID, in.Note); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "return", Entity: "papers", EntityID: p.ID, After: map[string]any{"set": p.Set, "note": in.Note}}); err != nil {
		return err
	}
	p.Status, p.ReviewNote = "draft", in.Note
	if err := permit(c, tx, &p); err != nil {
		return err
	}
	return c.JSON(p)
}
