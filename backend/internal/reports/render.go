package reports

import (
	"bytes"
	"embed"
	"encoding/base64"
	"fmt"
	"html/template"
	"strings"

	qrcode "github.com/skip2/go-qrcode"
)

//go:embed report.html.tmpl
var files embed.FS

var reportTemplate = template.Must(template.New("report.html.tmpl").Funcs(template.FuncMap{
	"stateLabel": stateLabel,
	"plain":      plain,
	"on":         func(c Config, key string) bool { return c.On(key) },
	"word": func(r Report, key string) string {
		if w, ok := r.Words[key]; ok {
			return w
		}
		return key
	},
	"last": func(i, n int) bool { return i == n-1 },
}).ParseFS(files, "report.html.tmpl"))

// Report is one student's report as the template draws it.
type Report struct {
	Facts
	QR template.URL // a data URL, or empty
}

// Page is what the template receives.
type Page struct {
	Config   Config
	Reports  []Report
	Logo     template.URL
	WidthMM  float64
	HeightMM float64
	Preview  bool // marks the QR place instead of drawing a code
}

func stateLabel(s string) string {
	return map[string]string{"complete": "Final", "provisional": "Provisional", "blocked": "Withheld", "not_assessed": "Not assessed"}[s]
}

// plain writes 20.00 as 20 and 12.50 as 12.5, as a person writes marks.
func plain(s string) string {
	if !strings.Contains(s, ".") {
		return s
	}
	s = strings.TrimRight(s, "0")
	return strings.TrimSuffix(s, ".")
}

// DataURL encodes a file for embedding in the page.
func DataURL(kind string, data []byte) template.URL {
	if len(data) == 0 {
		return ""
	}
	// #nosec: kind is one of the two image types the database allows.
	return template.URL("data:" + kind + ";base64," + base64.StdEncoding.EncodeToString(data))
}

// QR draws a QR code for link.
func QR(link string) (template.URL, error) {
	png, err := qrcode.Encode(link, qrcode.Medium, 256)
	if err != nil {
		return "", err
	}
	return DataURL("image/png", png), nil
}

// Render draws reports as one HTML document, each on its own pages.
func Render(p Page) (string, error) {
	p.WidthMM, p.HeightMM = p.Config.PageMM()
	var b bytes.Buffer
	if err := reportTemplate.Execute(&b, p); err != nil {
		return "", fmt.Errorf("render report: %w", err)
	}
	return b.String(), nil
}
