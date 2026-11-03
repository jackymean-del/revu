package evidence

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Routes serves saving cells, bulk writes and their undo.
func Routes(g fiber.Router) {
	g.Post("/sync/evidence", sync)
	g.Post("/assessments/:id/bulk", bulk)
	g.Get("/assessments/:id/bulk-writes", listBulk)
	g.Post("/bulk-writes/:id/undo", undo)
}

func result(opID string, cell api.GridCell, err error) (api.OpResult, error) {
	r := api.OpResult{OpId: opID}
	var no *Refused
	switch {
	case err == nil:
		r.Outcome, r.Cell = "applied", cell
	case errors.As(err, &no) && no.Conflict != nil:
		r.Outcome, r.Code, r.Message, r.Cell = "conflict", no.Code, no.Message, *no.Conflict
	case errors.As(err, &no):
		r.Outcome, r.Code, r.Message = "refused", no.Code, no.Message
	default:
		return r, err
	}
	return r, nil
}

// sync applies edits in order (Part 6.3). Each op id is answered once: a
// replay returns the stored answer, so a retried batch applies once.
func sync(c fiber.Ctx) error {
	var in api.SyncInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if len(in.Ops) > 500 {
		return problem.Invalid(api.FieldError{Field: "ops", Code: "length", Message: "Send at most 500 edits at a time."})
	}
	s, err := New(c)
	if err != nil {
		return err
	}
	m, _ := tenant.MemberFrom(c)
	out := api.SyncResult{Results: make([]api.OpResult, 0, len(in.Ops))}
	for _, op := range in.Ops {
		if n := len(op.OpId); n < 8 || n > 80 {
			return problem.Invalid(api.FieldError{Field: "ops.opId", Code: "length", Message: "Each edit needs an id of 8 to 80 characters."})
		}
		var stored []byte
		err := s.tx.QueryRow(c.Context(), `SELECT result FROM sync_outbox_receipts WHERE op_id = $1`, op.OpId).Scan(&stored)
		if err == nil {
			var r api.OpResult
			if err := json.Unmarshal(stored, &r); err != nil {
				return err
			}
			out.Results = append(out.Results, r)
			continue
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		cell, err := s.Apply(Write{StudentID: op.StudentId, PartID: op.PartId, State: string(op.State), Value: op.Value, BaseVersion: op.BaseVersion, Reason: op.Reason})
		r, err := result(op.OpId, cell, err)
		if err != nil {
			return err
		}
		b, _ := json.Marshal(r)
		if _, err := s.tx.Exec(c.Context(), `INSERT INTO sync_outbox_receipts (org_id, op_id, device_id, result) VALUES ($1, $2, nullif($3, ''), $4)`,
			m.OrgID, op.OpId, in.DeviceId, b); err != nil {
			return err
		}
		out.Results = append(out.Results, r)
	}
	return c.JSON(out)
}

func checkSection(c fiber.Ctx, assessmentID, sectionID string) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if !records.UUIDShape.MatchString(assessmentID) || !records.UUIDShape.MatchString(sectionID) {
		return problem.New(http.StatusNotFound, "assessment.not_found", "No assessment covers this section.")
	}
	var ok bool
	if err := tx.QueryRow(c.Context(), `
		SELECT EXISTS (SELECT 1 FROM assessment_scopes sc JOIN assessments a ON a.id = sc.assessment_id AND a.deleted_at IS NULL
		                WHERE sc.assessment_id = $1::uuid AND sc.section_id = $2::uuid)`, assessmentID, sectionID).Scan(&ok); err != nil {
		return err
	}
	if !ok {
		return problem.New(http.StatusNotFound, "assessment.not_found", "No assessment covers this section.")
	}
	return nil
}

// bulk applies many cells as one undoable step (Part 59.7). Cells the
// person may not change are listed with the reason, never applied.
func bulk(c fiber.Ctx) error {
	var in api.BulkInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	id := c.Params("id")
	if err := checkSection(c, id, in.SectionId); err != nil {
		return err
	}
	switch in.Kind {
	case "upload", "paste", "blanks_not_applicable", "component_absent":
	default:
		return problem.Invalid(api.FieldError{Field: "kind", Code: "unknown", Message: "Unknown kind of bulk write."})
	}
	if n := len(in.Cells); n < 1 || n > 5000 {
		return problem.Invalid(api.FieldError{Field: "cells", Code: "length", Message: "Send between 1 and 5000 cells."})
	}
	s, err := New(c)
	if err != nil {
		return err
	}
	m, _ := tenant.MemberFrom(c)
	var bulkID string
	if err := s.tx.QueryRow(c.Context(), `
		INSERT INTO bulk_writes (org_id, assessment_id, section_id, kind, created_by) VALUES ($1, $2::uuid, $3::uuid, $4, $5) RETURNING id::text`,
		m.OrgID, id, in.SectionId, in.Kind, m.UserID).Scan(&bulkID); err != nil {
		return err
	}
	source := "grid"
	if in.Kind == "upload" {
		source = "import"
	}
	res := api.BulkResult{Id: bulkID, Refused: []api.BulkRefusal{}}
	for _, cell := range in.Cells {
		refuse := func(msg string) {
			res.Refused = append(res.Refused, api.BulkRefusal{Message: msg, PartId: cell.PartId, StudentId: cell.StudentId})
		}
		p, err := s.part(cell.PartId)
		if err == nil && p.assessmentID != id {
			err = outside("This column belongs to another assessment.")
		}
		if err == nil {
			var pl place
			if pl, err = s.place(p, cell.StudentId); err == nil && pl.sectionID != in.SectionId {
				err = outside("This student is in another section.")
			}
		}
		if err == nil {
			_, err = s.Apply(Write{StudentID: cell.StudentId, PartID: cell.PartId, State: string(cell.State), Value: cell.Value,
				BaseVersion: AnyVersion, Reason: in.Reason, Source: source, BulkID: bulkID})
		}
		var no *Refused
		switch {
		case err == nil:
			res.Applied++
		case errors.As(err, &no):
			refuse(no.Message)
		default:
			return err
		}
	}
	if res.Applied == 0 {
		if _, err := s.tx.Exec(c.Context(), `DELETE FROM bulk_writes WHERE id = $1::uuid`, bulkID); err != nil {
			return err
		}
		res.Id = ""
	} else if _, err := s.tx.Exec(c.Context(), `UPDATE bulk_writes SET cells = $2 WHERE id = $1::uuid`, bulkID, res.Applied); err != nil {
		return err
	}
	return c.JSON(res)
}

func outside(msg string) error { return &Refused{Code: "evidence.not_in_scope", Message: msg} }

func listBulk(c fiber.Ctx) error {
	id, section := c.Params("id"), c.Query("sectionId")
	if err := checkSection(c, id, section); err != nil {
		return err
	}
	tx, _ := tenant.Tx(c)
	rows, err := tx.Query(c.Context(), `
		SELECT id::text, kind, cells, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
		       coalesce(to_char(undone_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), '')
		  FROM bulk_writes WHERE assessment_id = $1::uuid AND section_id = $2::uuid ORDER BY created_at DESC LIMIT 20`, id, section)
	if err != nil {
		return err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (b api.BulkWrite, err error) {
		return b, r.Scan(&b.Id, &b.Kind, &b.Cells, &b.CreatedAt, &b.UndoneAt)
	})
	if err != nil {
		return err
	}
	if list == nil {
		list = []api.BulkWrite{}
	}
	return c.JSON(list)
}

// undo restores every cell of the last bulk write of a section to what it
// was before, as new versions marked as the undo. A cell changed since the
// bulk write is kept as it is and counted (AT-GR-04).
func undo(c fiber.Ctx) error {
	s, err := New(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	id := c.Params("id")
	notFound := problem.New(http.StatusNotFound, "bulk.not_found", "No bulk write has this id.")
	if !records.UUIDShape.MatchString(id) {
		return notFound
	}
	var assessmentID, sectionID string
	var undone, last bool
	err = s.tx.QueryRow(ctx, `
		SELECT assessment_id::text, section_id::text, undone_at IS NOT NULL,
		       NOT EXISTS (SELECT 1 FROM bulk_writes l WHERE l.assessment_id = b.assessment_id AND l.section_id = b.section_id
		                    AND l.undone_at IS NULL AND l.created_at > b.created_at)
		  FROM bulk_writes b WHERE id = $1::uuid FOR UPDATE`, id).Scan(&assessmentID, &sectionID, &undone, &last)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound
	}
	if err != nil {
		return err
	}
	if undone {
		return problem.New(http.StatusConflict, "bulk.undone", "This bulk write was already undone.")
	}
	if !last {
		return problem.New(http.StatusConflict, "bulk.not_last", "Only the last bulk write of this section can be undone.")
	}
	type step struct {
		studentID, partID, state, value string
		version, now                    int
	}
	rows, err := s.tx.Query(ctx, `
		SELECT e.student_id::text, e.part_id::text, h.version, e.version,
		       coalesce(p.state::text, 'pending'), coalesce(p.value::text, '')
		  FROM evidence_history h
		  JOIN evidence e ON e.id = h.evidence_id
		  LEFT JOIN evidence_history p ON p.evidence_id = h.evidence_id AND p.version = h.version - 1
		 WHERE h.bulk_id = $1::uuid`, id)
	if err != nil {
		return err
	}
	steps, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (x step, err error) {
		return x, r.Scan(&x.studentID, &x.partID, &x.version, &x.now, &x.state, &x.value)
	})
	if err != nil {
		return err
	}
	var res api.UndoResult
	for _, x := range steps {
		if x.now != x.version {
			res.Kept++
			continue
		}
		_, err := s.Apply(Write{StudentID: x.studentID, PartID: x.partID, State: x.state, Value: x.value, BaseVersion: x.version,
			Reason: "Undo of a bulk write", UndoOf: id})
		var no *Refused
		switch {
		case err == nil:
			res.Restored++
		case errors.As(err, &no):
			res.Kept++
		default:
			return err
		}
	}
	m, _ := tenant.MemberFrom(c)
	if _, err := s.tx.Exec(ctx, `UPDATE bulk_writes SET undone_at = now(), undone_by = $2 WHERE id = $1::uuid`, id, m.UserID); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "undo", Entity: "bulk_writes", EntityID: id, After: map[string]int{"restored": res.Restored, "kept": res.Kept}}); err != nil {
		return err
	}
	return c.JSON(res)
}
