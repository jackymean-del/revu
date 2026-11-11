package holistic

import (
	"bytes"
	"errors"
	"fmt"
	"html/template"
	"math"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/reports"
	"github.com/jackymean-del/revu/internal/tenant"
)

// The four tones a level shows in, lowest to highest; a scale of another
// length spreads over them.
var tones = []struct{ bg, fg string }{{"#fdecea", "#9f1d14"}, {"#fff4db", "#8a5a00"}, {"#e3f2fd", "#0b5394"}, {"#e6f4ea", "#1e6b35"}}

var bloomNames = map[string]string{"remember": "Remember", "understand": "Understand", "apply": "Apply", "analyse": "Analyse", "evaluate": "Evaluate", "create": "Create"}

type chipView struct {
	Name, Word, Dots, Bg, Fg, Hint string
}

type pageView struct {
	School string
	R      Report
	Scores []struct {
		Subject, Pct, Grade, Class string
		Trend                      template.HTML
	}
	Overall string
	Profile []struct {
		Subject string
		Chips   []chipView
	}
	Blooms []struct {
		Name     string
		Width    float64
		Class    float64
		HasClass bool
		Label    string
	}
	NotYet     string // thinking skills with too little evidence, in one line
	Activities []chipView
	Legend     []chipView
}

func chip(scale []Level, name string, level, marks int) chipView {
	if level < 1 {
		return chipView{Name: name, Word: "Too little evidence", Dots: "", Bg: "#f3f3f6", Fg: "#5a5870", Hint: fmt.Sprintf("%d marks so far", marks)}
	}
	t := tones[0]
	if len(scale) > 1 {
		t = tones[int(math.Round(float64(level-1)*float64(len(tones)-1)/float64(len(scale)-1)))]
	}
	dots := strings.Repeat("●", level) + strings.Repeat("○", len(scale)-level)
	hint := ""
	if marks > 0 {
		hint = fmt.Sprintf("on %d marks", marks)
	}
	return chipView{Name: name, Word: scale[level-1].Name, Dots: dots, Bg: t.bg, Fg: t.fg, Hint: hint}
}

func pct(p *float64) string {
	if p == nil {
		return ""
	}
	return strings.TrimSuffix(strings.TrimSuffix(fmt.Sprintf("%.1f", *p), "0"), ".") + "%"
}

// spark is a small line of the term's assessments, 0 to 100.
func spark(xs []float64) template.HTML {
	if len(xs) < 2 {
		return ""
	}
	var pts []string
	for i, x := range xs {
		pts = append(pts, fmt.Sprintf("%.1f,%.1f", float64(i)*60/float64(len(xs)-1), 16-x*14/100))
	}
	return template.HTML(`<svg width="62" height="18" viewBox="-1 -1 62 18" aria-hidden="true"><polyline fill="none" stroke="#5b4bd5" stroke-width="1.6" points="` + strings.Join(pts, " ") + `"/></svg>`)
}

func view(school string, r Report) pageView {
	v := pageView{School: school, R: r, Overall: pct(r.Overall)}
	for _, s := range r.Scores {
		v.Scores = append(v.Scores, struct {
			Subject, Pct, Grade, Class string
			Trend                      template.HTML
		}{s.Subject, pct(s.Pct), s.Grade, pct(s.ClassPct), spark(s.Trend)})
	}
	for _, p := range r.Profile {
		x := struct {
			Subject string
			Chips   []chipView
		}{Subject: p.Subject}
		for _, c := range p.Competencies {
			x.Chips = append(x.Chips, chip(r.Scale, c.Name, c.Level, c.Marks))
		}
		v.Profile = append(v.Profile, x)
	}
	// Only the thinking skills with evidence get a bar; the rest are named
	// in one line, so the report stays short.
	var notYet []string
	for _, b := range r.Blooms {
		if b.Pct == nil {
			notYet = append(notYet, bloomNames[b.Level])
			continue
		}
		x := struct {
			Name     string
			Width    float64
			Class    float64
			HasClass bool
			Label    string
		}{Name: bloomNames[b.Level], Width: *b.Pct, Label: pct(b.Pct)}
		if b.ClassPct != nil {
			x.Class, x.HasClass = *b.ClassPct, true
		}
		v.Blooms = append(v.Blooms, x)
	}
	if len(v.Blooms) > 0 && len(notYet) > 0 {
		v.NotYet = "Not yet assessed enough: " + strings.Join(notYet, ", ") + "."
	}
	for _, a := range r.Activities {
		if a.Level > 0 {
			v.Activities = append(v.Activities, chip(r.Scale, a.Name, a.Level, 0))
		}
	}
	for i, l := range r.Scale {
		c := chip(r.Scale, "", i+1, 0)
		c.Name = fmt.Sprintf("from %g%%", l.Min)
		v.Legend = append(v.Legend, c)
	}
	return v
}

var page = template.Must(template.New("holistic").Parse(`{{define "report"}}<article class="report">
<header><div><h1>{{.School}}</h1><p>Holistic progress report · {{.R.Period}}</p></div>
<div class="who"><b>{{.R.Student.Name}}</b><span>{{.R.Section}}{{if .R.Student.RollNo}} · Roll {{.R.Student.RollNo}}{{end}} · {{.R.Student.AdmissionNo}}</span></div></header>
{{if .Scores}}<section><h2>Scores{{if .Overall}} <span class="right">Overall {{.Overall}}</span>{{end}}</h2>
<table><thead><tr><th>Subject</th><th>Result</th><th>Band</th><th>Class average</th><th>Across the term</th></tr></thead><tbody>
{{range .Scores}}<tr><td>{{.Subject}}</td><td class="n">{{if .Pct}}{{.Pct}}{{else}}<span class="muted">to come</span>{{end}}</td><td>{{.Grade}}</td><td class="n muted">{{.Class}}</td><td>{{.Trend}}</td></tr>{{end}}
</tbody></table></section>{{end}}
{{if .Profile}}<section><h2>Learning profile</h2>
{{range .Profile}}<div class="subj"><span class="sname">{{.Subject}}</span><span class="chips">{{range .Chips}}<span class="chip" style="background:{{.Bg}};color:{{.Fg}}"><b>{{.Name}}</b> {{.Word}} <i>{{.Dots}}</i>{{if .Hint}} <small>{{.Hint}}</small>{{end}}</span>{{end}}</span></div>{{end}}
</section>{{end}}
{{if .Blooms}}<section><h2>Thinking skills <span class="right muted">bar: {{.R.Student.Name}} · mark: class average</span></h2>
<div class="blooms">{{range .Blooms}}<div class="brow"><span>{{.Name}}</span><span class="bar"><span class="fill" style="width:{{.Width}}%"></span>{{if .HasClass}}<span class="mark" style="left:{{.Class}}%"></span>{{end}}</span><span class="n">{{.Label}}</span></div>{{end}}</div>{{if .NotYet}}<p class="muted small">{{.NotYet}}</p>{{end}}</section>{{end}}
{{if .Activities}}<section><h2>Beyond academics</h2><div class="chips">{{range .Activities}}<span class="chip" style="background:{{.Bg}};color:{{.Fg}}"><b>{{.Name}}</b> {{.Word}} <i>{{.Dots}}</i></span>{{end}}</div></section>{{end}}
{{if or .R.Strengths .R.Focus}}<section class="two">
<div><h2>Strengths</h2>{{range .R.Strengths}}<p class="out"><b>{{.Text}}</b> <span class="muted">{{.Subject}}</span></p>{{else}}<p class="muted">More marks are needed to name strengths.</p>{{end}}</div>
<div><h2>To work on</h2>{{range .R.Focus}}<p class="out"><b>{{.Text}}</b> <span class="muted">{{.Subject}}</span><br><span class="tip">At home: {{.Tip}}</span></p>{{else}}<p class="muted">Nothing stands out to work on.</p>{{end}}</div>
</section>{{end}}
{{with .R.Voices}}{{if or .Self .Peer .Parent .Ambition}}<section><h2>Voices</h2>
{{if .Self}}<p><b>In their words:</b> {{.Self}}</p>{{end}}{{if .Peer}}<p><b>A classmate says:</b> {{.Peer}}</p>{{end}}{{if .Parent}}<p><b>At home:</b> {{.Parent}}</p>{{end}}{{if .Ambition}}<p><b>Ambition:</b> {{.Ambition}}</p>{{end}}
</section>{{end}}{{end}}
{{if eq .R.Note.Status "approved"}}<section><h2>Teacher's note</h2><p class="note">{{.R.Note.Text}}</p></section>{{end}}
<footer><span class="legend">{{range .Legend}}<span class="chip" style="background:{{.Bg}};color:{{.Fg}}">{{.Word}} <small>{{.Name}}</small></span>{{end}}</span>
<span class="sign"><span>Class teacher</span><span>Principal</span><span>Parent</span></span></footer>
</article>{{end}}<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Holistic progress report</title><style>
@page{size:A4;margin:12mm}
body{font-family:system-ui,"Segoe UI",sans-serif;color:#17152b;margin:0;font-size:11.5px;line-height:1.4}
.report{max-width:186mm;margin:auto;padding:4mm 0;page-break-after:always}.report:last-child{page-break-after:auto}
header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #5b4bd5;padding-bottom:6px;margin-bottom:8px}
h1{font-size:16px;margin:0}header p{margin:2px 0 0;color:#5a5870}.who{text-align:right}.who b{font-size:15px;display:block}.who span{color:#5a5870}
section{margin:8px 0;break-inside:avoid}h2{font-size:12.5px;margin:0 0 4px;color:#3b2fb0;display:flex;justify-content:space-between}
.right{font-weight:600;color:#17152b}.muted{color:#6b6880;font-weight:400}
table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10.5px;color:#6b6880;font-weight:600;border-bottom:1px solid #ddd}td{padding:2px 0;border-bottom:1px solid #f0eff5}.n{text-align:right;padding-right:10px}
.subj{display:flex;gap:8px;margin:3px 0}.sname{width:30mm;flex:none;font-weight:600}.chips{display:flex;flex-wrap:wrap;gap:4px}
.chip{border-radius:999px;padding:1px 8px;font-size:10.5px;white-space:nowrap}.chip i{font-style:normal;letter-spacing:-1px}.chip small{opacity:.75}
.blooms{display:grid;gap:3px}.brow{display:grid;grid-template-columns:24mm 1fr 26mm;align-items:center;gap:6px}
.bar{position:relative;height:8px;background:#efeef7;border-radius:4px}.fill{position:absolute;inset:0 auto 0 0;background:#7a6cf0;border-radius:4px}
.mark{position:absolute;top:-3px;width:2px;height:14px;background:#17152b}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.out{margin:3px 0}.tip{color:#1e6b35}
.note{white-space:pre-wrap;margin:0}.small{font-size:10px;margin:3px 0 0}
footer{margin-top:10px;border-top:1px solid #ddd;padding-top:6px;display:flex;justify-content:space-between;gap:10px;align-items:flex-end}
.legend{display:flex;gap:4px;flex-wrap:wrap}.sign{display:flex;gap:18px}.sign span{border-top:1px solid #999;padding-top:2px;min-width:24mm;text-align:center;color:#6b6880}
</style></head><body>{{range .}}{{template "report" .}}{{end}}</body></html>`))

func render(views []pageView) (string, error) {
	var buf bytes.Buffer
	err := page.Execute(&buf, views)
	return buf.String(), err
}

// pages builds the printable reports: one child's, or the whole section's
// as a meeting pack.
func pages(c fiber.Ctx, tx pgx.Tx, periodID, studentID, sectionID string) (string, string, error) {
	ctx := c.Context()
	if studentID != "" {
		var err error
		if sectionID, err = sectionOf(ctx, tx, studentID, periodID); err != nil {
			return "", "", err
		}
	}
	s, _, err := access(c, tx, sectionID, periodID)
	if err != nil {
		return "", "", err
	}
	cl, err := build(ctx, tx, s, periodID)
	if err != nil {
		return "", "", err
	}
	var school string
	if err := tx.QueryRow(ctx, `SELECT coalesce((SELECT display_name FROM branding_versions ORDER BY version DESC LIMIT 1), (SELECT name FROM orgs WHERE id = app_org_id()))`).Scan(&school); err != nil {
		return "", "", err
	}
	var views []pageView
	name := "holistic-" + safe(cl.Section) + ".pdf"
	for _, r := range cl.Reports {
		if studentID != "" && r.Student.ID != studentID {
			continue
		}
		views = append(views, view(school, r))
		if studentID != "" {
			name = "holistic-" + safe(r.Student.AdmissionNo) + ".pdf"
		}
	}
	if len(views) == 0 {
		return "", "", problem.New(http.StatusNotFound, "student.not_found", "No child to show.")
	}
	html, err := render(views)
	return html, name, err
}

func safe(s string) string {
	return strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' {
			return r
		}
		return '-'
	}, s)
}

func pageHTML(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	html, _, err := pages(c, tx, c.Query("periodId"), c.Query("studentId"), c.Query("sectionId"))
	if err != nil {
		return err
	}
	c.Set(fiber.HeaderContentType, "text/html; charset=utf-8")
	return c.SendString(html)
}

func (o Options) pdf(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	var in struct {
		PeriodID  string `json:"periodId"`
		StudentID string `json:"studentId"`
		SectionID string `json:"sectionId"`
	}
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	html, name, err := pages(c, tx, in.PeriodID, in.StudentID, in.SectionID)
	if err != nil {
		return err
	}
	out, err := o.Renderer.PDF(c.Context(), html)
	if errors.Is(err, reports.ErrNoRenderer) {
		return problem.New(http.StatusServiceUnavailable, "pdf.off", "PDF making is not set up here; print the page from the browser instead.")
	}
	if err != nil {
		return err
	}
	c.Set(fiber.HeaderContentType, "application/pdf")
	c.Set(fiber.HeaderContentDisposition, `attachment; filename="`+name+`"`)
	return c.Send(out)
}
