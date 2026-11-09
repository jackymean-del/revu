package reports

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"html/template"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/results"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Options are what the report routes need from outside.
type Options struct {
	Renderer Renderer
	AppURL   string // where a report's QR code points
	Now      func() time.Time
}

// Routes serves templates, branding, report previews, PDFs and marksheets.
func Routes(g fiber.Router, o Options) {
	if o.Now == nil {
		o.Now = time.Now
	}
	g.Get("/report-template", getTemplate)
	g.Put("/report-template", putTemplate)
	g.Get("/branding", getBranding)
	g.Put("/branding", putBranding)
	g.Get("/branding/logo", getLogo)
	g.Put("/branding/logo", putLogo)
	g.Delete("/branding/logo", deleteLogo)
	g.Get("/reports/status", o.status)
	g.Get("/reports/html", o.html)
	g.Post("/reports/pdf", o.pdf)
	g.Get("/marksheets.xlsx", o.marksheet)
	g.Get("/report-items/:id/html", o.itemHTML)
}

type templateOut struct {
	ID      string `json:"id,omitempty"`
	Version int    `json:"version"`
	Config  Config `json:"config"`
}

// loadTemplate reads the institution's template, or the default when none
// was saved.
func loadTemplate(ctx context.Context, tx pgx.Tx) (templateOut, error) {
	var b pgx.Batch
	get := queueTemplate(&b)
	if err := results.Send(ctx, tx, &b); err != nil {
		return templateOut{}, err
	}
	return get()
}

func queueTemplate(b *pgx.Batch) func() (templateOut, error) {
	t := templateOut{Config: DefaultConfig()}
	var err error
	b.Queue(`SELECT id::text, version, config FROM report_templates`).Query(func(rows pgx.Rows) error {
		for rows.Next() {
			var raw []byte
			if e := rows.Scan(&t.ID, &t.Version, &raw); e != nil {
				return e
			}
			cfg, ps := Parse(raw)
			if len(ps) > 0 {
				err = fmt.Errorf("stored report template is invalid: %s", ps[0].Message)
				continue
			}
			t.Config = cfg
		}
		return rows.Err()
	})
	return func() (templateOut, error) { return t, err }
}

// TemplateConfig is the institution's report template, or the default: its
// subject order is the order analysis screens use too.
func TemplateConfig(ctx context.Context, tx pgx.Tx) (Config, error) {
	t, err := loadTemplate(ctx, tx)
	return t.Config, err
}

// QueueTemplateConfig queues reading TemplateConfig on b.
func QueueTemplateConfig(b *pgx.Batch) func() (Config, error) {
	get := queueTemplate(b)
	return func() (Config, error) {
		t, err := get()
		return t.Config, err
	}
}

func getTemplate(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	t, err := loadTemplate(c.Context(), tx)
	if err != nil {
		return err
	}
	return c.JSON(t)
}

func mayConfigure(c fiber.Ctx, act policy.Action) error {
	a, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	return policy.Check(a, act, policy.Target{})
}

func putTemplate(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if err := mayConfigure(c, policy.LayoutInstitution); err != nil {
		return err
	}
	var in struct {
		Config json.RawMessage `json:"config"`
	}
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	cfg, ps := Parse(in.Config)
	if len(ps) > 0 {
		fields := make([]api.FieldError, len(ps))
		for i, p := range ps {
			fields[i] = api.FieldError{Field: p.Field, Code: "invalid", Message: p.Message}
		}
		return problem.Invalid(fields...)
	}
	raw, _ := json.Marshal(cfg)
	ctx := c.Context()
	m, _ := tenant.MemberFrom(c)
	var out templateOut
	if err := tx.QueryRow(ctx, `
		INSERT INTO report_templates (org_id, name, config, updated_by) VALUES ($1, 'Report card', $2::jsonb, $3)
		ON CONFLICT (org_id) DO UPDATE SET config = EXCLUDED.config, version = report_templates.version + 1, updated_by = EXCLUDED.updated_by
		RETURNING id::text, version`, m.OrgID, string(raw), m.UserID).Scan(&out.ID, &out.Version); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO report_template_versions (org_id, template_id, version, config, created_by) VALUES ($1, $2::uuid, $3, $4::jsonb, $5)`,
		m.OrgID, out.ID, out.Version, string(raw), m.UserID); err != nil {
		return err
	}
	out.Config = cfg
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "report_templates", EntityID: out.ID, After: map[string]any{"version": out.Version}}); err != nil {
		return err
	}
	return c.JSON(out)
}

func getBranding(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	b, err := LoadBranding(c.Context(), tx)
	if err != nil {
		return err
	}
	return c.JSON(b)
}

// saveBranding adds a branding version with these details and logo.
func saveBranding(c fiber.Ctx, b Branding, logo []byte, kind string) (Branding, error) {
	tx, err := tenant.Tx(c)
	if err != nil {
		return b, err
	}
	m, _ := tenant.MemberFrom(c)
	var k any
	if kind != "" {
		k = kind
	}
	if err := tx.QueryRow(c.Context(), `
		INSERT INTO branding_versions (org_id, version, display_name, address, contact, affiliation, header_note, logo, logo_type, created_by)
		SELECT $1, coalesce(max(version), 0) + 1, $2, nullif($3, ''), nullif($4, ''), nullif($5, ''), nullif($6, ''), $7, $8, $9 FROM branding_versions
		RETURNING version`, m.OrgID, b.DisplayName, b.Address, b.Contact, b.Affiliation, b.HeaderNote, logo, k, m.UserID).Scan(&b.Version); err != nil {
		return b, err
	}
	b.HasLogo = logo != nil
	return b, audit.Record(c, audit.Entry{Action: "update", Entity: "branding", After: map[string]any{"version": b.Version, "logo": b.HasLogo}})
}

func putBranding(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if err := mayConfigure(c, policy.StructureWrite); err != nil {
		return err
	}
	var in api.BrandingInput
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	var f records.Fields
	f.Text("displayName", &in.DisplayName, 1, 160)
	f.Text("address", &in.Address, 0, 300)
	f.Text("contact", &in.Contact, 0, 200)
	f.Text("affiliation", &in.Affiliation, 0, 200)
	f.Text("headerNote", &in.HeaderNote, 0, 200)
	if len(f) > 0 {
		return problem.Invalid(f...)
	}
	cur, err := LoadBranding(c.Context(), tx)
	if err != nil {
		return err
	}
	logo, kind, err := Logo(c.Context(), tx, cur.Version)
	if err != nil {
		return err
	}
	b, err := saveBranding(c, Branding{DisplayName: in.DisplayName, Address: in.Address, Contact: in.Contact, Affiliation: in.Affiliation, HeaderNote: in.HeaderNote}, logo, kind)
	if err != nil {
		return err
	}
	return c.JSON(b)
}

func getLogo(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	b, err := LoadBranding(c.Context(), tx)
	if err != nil {
		return err
	}
	data, kind, err := Logo(c.Context(), tx, b.Version)
	if err != nil {
		return err
	}
	if data == nil {
		return problem.New(http.StatusNotFound, "branding.no_logo", "No logo has been added.")
	}
	c.Set(fiber.HeaderContentType, kind)
	return c.Send(data)
}

func putLogo(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if err := mayConfigure(c, policy.StructureWrite); err != nil {
		return err
	}
	fh, err := c.FormFile("logo")
	if err != nil {
		return problem.Invalid(api.FieldError{Field: "logo", Code: "required", Message: "Choose a PNG or JPEG image."})
	}
	if fh.Size > 256<<10 {
		return problem.Invalid(api.FieldError{Field: "logo", Code: "too_large", Message: "Use an image of at most 256 KB."})
	}
	file, err := fh.Open()
	if err != nil {
		return err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 256<<10+1))
	if err != nil {
		return err
	}
	kind := http.DetectContentType(data)
	if kind != "image/png" && kind != "image/jpeg" {
		return problem.Invalid(api.FieldError{Field: "logo", Code: "type", Message: "Choose a PNG or JPEG image."})
	}
	cur, err := LoadBranding(c.Context(), tx)
	if err != nil {
		return err
	}
	b, err := saveBranding(c, cur, data, kind)
	if err != nil {
		return err
	}
	return c.JSON(b)
}

func deleteLogo(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if err := mayConfigure(c, policy.StructureWrite); err != nil {
		return err
	}
	cur, err := LoadBranding(c.Context(), tx)
	if err != nil {
		return err
	}
	b, err := saveBranding(c, cur, nil, "")
	if err != nil {
		return err
	}
	return c.JSON(b)
}

// section reads a section and period from the query or body and checks
// that the person may build its reports.
func section(c fiber.Ctx, sectionID, periodID string) (results.Section, error) {
	tx, err := tenant.Tx(c)
	if err != nil {
		return results.Section{}, err
	}
	s, err := results.LoadSection(c.Context(), tx, sectionID, periodID)
	if err != nil {
		return s, err
	}
	a, err := tenant.Teaching(c)
	if err != nil {
		return s, err
	}
	return s, policy.Check(a, policy.ReportsBuild, policy.Target{BranchID: s.BranchID, SectionID: s.ID})
}

type statusOut struct {
	Students []Student        `json:"students"`
	Counts   api.ResultCounts `json:"counts"`
	PDF      bool             `json:"pdf"`
}

// status lists a section's students and how ready their results are.
func (o Options) status(c fiber.Ctx) error {
	s, err := section(c, c.Query("sectionId"), c.Query("periodId"))
	if err != nil {
		return err
	}
	tx, _ := tenant.Tx(c)
	t, err := loadTemplate(c.Context(), tx)
	if err != nil {
		return err
	}
	facts, err := Gather(c.Context(), tx, s, c.Query("periodId"), nil, t.Config, o.Now())
	if err != nil {
		return err
	}
	out := statusOut{Students: []Student{}, PDF: o.Renderer.URL != ""}
	for _, f := range facts {
		out.Students = append(out.Students, f.Student)
		for _, sub := range f.Subjects {
			switch sub.State {
			case "complete":
				out.Counts.Complete++
			case "provisional":
				out.Counts.Provisional++
			case "blocked":
				out.Counts.Blocked++
			default:
				out.Counts.NotAssessed++
			}
			if sub.Stale {
				out.Counts.Stale++
			}
		}
	}
	return c.JSON(out)
}

// page draws reports, with the logo of the branding they were made with.
func page(c fiber.Ctx, tx pgx.Tx, cfg Config, reports []Report, branding int, preview bool) (string, error) {
	data, kind, err := Logo(c.Context(), tx, branding)
	if err != nil {
		return "", err
	}
	return Render(Page{Config: cfg, Reports: reports, Logo: DataURL(kind, data), Preview: preview})
}

func sendHTML(c fiber.Ctx, html string) error {
	c.Set(fiber.HeaderContentType, "text/html; charset=utf-8")
	c.Set("Content-Security-Policy", "default-src 'none'; img-src data:; style-src 'unsafe-inline'")
	return c.SendString(html)
}

// html previews one student's report, or the whole section's.
func (o Options) html(c fiber.Ctx) error {
	s, err := section(c, c.Query("sectionId"), c.Query("periodId"))
	if err != nil {
		return err
	}
	tx, _ := tenant.Tx(c)
	t, err := loadTemplate(c.Context(), tx)
	if err != nil {
		return err
	}
	var only []string
	if id := c.Query("studentId"); id != "" {
		only = []string{id}
	}
	facts, err := Gather(c.Context(), tx, s, c.Query("periodId"), only, t.Config, o.Now())
	if err != nil {
		return err
	}
	reports := make([]Report, len(facts))
	for i, f := range facts {
		reports[i] = Report{Facts: f}
	}
	branding := 0
	if len(facts) > 0 {
		branding = facts[0].Institution.Version
	}
	h, err := page(c, tx, t.Config, reports, branding, true)
	if err != nil {
		return err
	}
	return sendHTML(c, h)
}

type pdfIn struct {
	SectionID  string   `json:"sectionId"`
	PeriodID   string   `json:"periodId"`
	StudentIDs []string `json:"studentIds,omitempty"`
}

// pdf builds the reports of a section (or of some students) as one PDF.
// Results are worked out afresh first; the facts of every report are
// stored with the run, and each report's QR code points at its stored copy.
func (o Options) pdf(c fiber.Ctx) error {
	var in pdfIn
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	for _, id := range in.StudentIDs {
		if !records.UUIDShape.MatchString(id) {
			return problem.Invalid(api.FieldError{Field: "studentIds", Code: "unknown", Message: "Not an id."})
		}
	}
	s, err := section(c, in.SectionID, in.PeriodID)
	if err != nil {
		return err
	}
	if o.Renderer.URL == "" {
		return problem.New(http.StatusServiceUnavailable, "pdf.unavailable", "PDF making is not set up here. Use Print from the browser instead.")
	}
	tx, _ := tenant.Tx(c)
	ctx := c.Context()
	keys, err := results.SectionKeys(ctx, tx, s, in.PeriodID, "")
	if err != nil {
		return err
	}
	if _, err := results.Recompute(ctx, tx, keys); err != nil {
		return err
	}
	t, err := loadTemplate(ctx, tx)
	if err != nil {
		return err
	}
	if t.ID == "" { // the default template, saved so the run can refer to it
		raw, _ := json.Marshal(t.Config)
		m, _ := tenant.MemberFrom(c)
		if err := tx.QueryRow(ctx, `INSERT INTO report_templates (org_id, name, config, updated_by) VALUES ($1, 'Report card', $2::jsonb, $3) RETURNING id::text, version`,
			m.OrgID, string(raw), m.UserID).Scan(&t.ID, &t.Version); err != nil {
			return err
		}
	}
	facts, err := Gather(ctx, tx, s, in.PeriodID, in.StudentIDs, t.Config, o.Now())
	if err != nil {
		return err
	}
	if len(facts) == 0 {
		return problem.New(http.StatusUnprocessableEntity, "reports.none", "There are no students to make reports for.")
	}
	m, _ := tenant.MemberFrom(c)
	branding := facts[0].Institution.Version
	var runID string
	if err := tx.QueryRow(ctx, `
		INSERT INTO report_runs (org_id, section_id, period_id, template_id, template_version, branding_version, options, students, created_by)
		VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5, nullif($6, 0), $7::jsonb, $8, $9) RETURNING id::text`,
		m.OrgID, s.ID, in.PeriodID, t.ID, t.Version, branding, mustJSON(t.Config), len(facts), m.UserID).Scan(&runID); err != nil {
		return err
	}
	reports := make([]Report, len(facts))
	itemIDs := make([]string, len(facts))
	for i, f := range facts {
		if err := tx.QueryRow(ctx, `INSERT INTO report_run_items (org_id, run_id, student_id, facts) VALUES ($1, $2::uuid, $3::uuid, $4::jsonb) RETURNING id::text`,
			m.OrgID, runID, f.Student.ID, mustJSON(f)).Scan(&itemIDs[i]); err != nil {
			return err
		}
		reports[i] = Report{Facts: f}
		if t.Config.QR && o.AppURL != "" {
			if reports[i].QR, err = QR(o.AppURL + "/report/" + itemIDs[i]); err != nil {
				return err
			}
		}
	}
	logo, kind, err := Logo(ctx, tx, branding)
	if err != nil {
		return err
	}
	docs, err := o.renderEach(ctx, t.Config, reports, DataURL(kind, logo))
	if err != nil {
		return problem.New(http.StatusBadGateway, "pdf.failed", "The PDF could not be made. Try again, or print from the browser.")
	}
	out, pages, err := Assemble(docs, t.Config)
	if err != nil {
		return err
	}
	total := 0
	for i, n := range pages {
		total += n
		if _, err := tx.Exec(ctx, `UPDATE report_run_items SET pages = $2 WHERE id = $1::uuid`, itemIDs[i], n); err != nil {
			return err
		}
	}
	if _, err := tx.Exec(ctx, `UPDATE report_runs SET pages = $2 WHERE id = $1::uuid`, runID, total); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "create", Entity: "report_runs", EntityID: runID,
		After: map[string]any{"sectionId": s.ID, "periodId": in.PeriodID, "students": len(facts), "pages": total, "templateVersion": t.Version, "brandingVersion": branding}}); err != nil {
		return err
	}
	name := "reports.pdf"
	if len(facts) == 1 {
		name = "report-" + safeName(facts[0].Student.AdmissionNo) + ".pdf"
	}
	c.Set(fiber.HeaderContentType, "application/pdf")
	c.Set(fiber.HeaderContentDisposition, `attachment; filename="`+name+`"`)
	return c.Send(out)
}

// renderEach makes one PDF per report, a few at a time.
func (o Options) renderEach(ctx context.Context, cfg Config, reports []Report, logo template.URL) ([][]byte, error) {
	docs := make([][]byte, len(reports))
	errs := make([]error, len(reports))
	sem := make(chan struct{}, 4)
	var wg sync.WaitGroup
	for i := range reports {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			h, err := Render(Page{Config: cfg, Reports: reports[i : i+1], Logo: logo})
			if err == nil {
				docs[i], err = o.Renderer.PDF(ctx, h)
			}
			errs[i] = err
		}(i)
	}
	wg.Wait()
	return docs, errors.Join(errs...)
}

func mustJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		panic(err)
	}
	return string(b)
}

func safeName(s string) string {
	return strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' {
			return r
		}
		return '-'
	}, s)
}

// marksheet downloads a section's marksheet as Excel.
func (o Options) marksheet(c fiber.Ctx) error {
	s, err := section(c, c.Query("sectionId"), c.Query("periodId"))
	if err != nil {
		return err
	}
	tx, _ := tenant.Tx(c)
	t, err := loadTemplate(c.Context(), tx)
	if err != nil {
		return err
	}
	facts, err := Gather(c.Context(), tx, s, c.Query("periodId"), nil, t.Config, o.Now())
	if err != nil {
		return err
	}
	b, err := Marksheet(facts, t.Config)
	if err != nil {
		return err
	}
	c.Set(fiber.HeaderContentType, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	c.Set(fiber.HeaderContentDisposition, `attachment; filename="results.xlsx"`)
	return c.Send(b)
}

// itemHTML shows a report exactly as it was made, for its QR code.
func (o Options) itemHTML(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	id := c.Params("id")
	notFound := problem.New(http.StatusNotFound, "report.not_found", "No report has this id.")
	if !records.UUIDShape.MatchString(id) {
		return notFound
	}
	var raw, opts []byte
	var sectionID, periodID string
	var branding int
	err = tx.QueryRow(ctx, `
		SELECT i.facts, r.options, r.section_id::text, r.period_id::text, coalesce(r.branding_version, 0)
		  FROM report_run_items i JOIN report_runs r ON r.id = i.run_id WHERE i.id = $1::uuid`, id).Scan(&raw, &opts, &sectionID, &periodID, &branding)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound
	}
	if err != nil {
		return err
	}
	if _, err := section(c, sectionID, periodID); err != nil {
		return err
	}
	var f Facts
	if err := json.Unmarshal(raw, &f); err != nil {
		return err
	}
	cfg, ps := Parse(opts)
	if len(ps) > 0 {
		cfg = DefaultConfig()
	}
	r := Report{Facts: f}
	if cfg.QR && o.AppURL != "" {
		if r.QR, err = QR(o.AppURL + "/report/" + id); err != nil {
			return err
		}
	}
	h, err := page(c, tx, cfg, []Report{r}, branding, false)
	if err != nil {
		return err
	}
	return sendHTML(c, h)
}
