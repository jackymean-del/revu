package reports

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

func init() {
	// pdfcpu keeps no configuration on disk here: the server's file system
	// is read-only in production.
	model.ConfigPath = "disable"
}

// ErrNoRenderer means no PDF renderer is configured.
var ErrNoRenderer = errors.New("reports: no PDF renderer configured")

// Renderer turns HTML into PDF through Gotenberg (Chromium).
type Renderer struct {
	URL    string // for example http://gotenberg:3000; empty means none
	Client *http.Client
}

// PDF renders one HTML document. The page size and margins come from the
// document's own @page rule.
func (r Renderer) PDF(ctx context.Context, html string) ([]byte, error) {
	if r.URL == "" {
		return nil, ErrNoRenderer
	}
	var body bytes.Buffer
	w := multipart.NewWriter(&body)
	f, err := w.CreateFormFile("files", "index.html")
	if err != nil {
		return nil, err
	}
	if _, err := io.WriteString(f, html); err != nil {
		return nil, err
	}
	for k, v := range map[string]string{"preferCssPageSize": "true", "printBackground": "true", "marginTop": "0", "marginBottom": "0", "marginLeft": "0", "marginRight": "0"} {
		if err := w.WriteField(k, v); err != nil {
			return nil, err
		}
	}
	if err := w.Close(); err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimRight(r.URL, "/")+"/forms/chromium/convert/html", &body)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", w.FormDataContentType())
	client := r.Client
	if client == nil {
		client = &http.Client{Timeout: 60 * time.Second}
	}
	res, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("pdf renderer: %w", err)
	}
	defer res.Body.Close()
	out, err := io.ReadAll(io.LimitReader(res.Body, 64<<20))
	if err != nil {
		return nil, err
	}
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("pdf renderer answered %d", res.StatusCode)
	}
	return out, nil
}

// Pages counts a PDF's pages.
func Pages(doc []byte) (int, error) {
	return api.PageCount(context.Background(), bytes.NewReader(doc), nil)
}

// padTo adds blank pages at the end until the page count is a multiple of n.
func padTo(doc []byte, n int) ([]byte, int, error) {
	count, err := Pages(doc)
	if err != nil {
		return nil, 0, err
	}
	for count%n != 0 {
		var out bytes.Buffer
		if err := api.InsertPages(context.Background(), bytes.NewReader(doc), &out, []string{strconv.Itoa(count)}, false, nil, nil); err != nil {
			return nil, 0, fmt.Errorf("pad pages: %w", err)
		}
		doc = out.Bytes()
		count++
	}
	return doc, count, nil
}

// bookletSheet is the sheet a folded booklet of these pages prints on.
var bookletSheet = map[string]string{"A5": "A4", "A4": "A3", "Letter": "Ledger"}

// Assemble prepares each student's PDF for printing and joins them: in a
// booklet, each report is padded to a multiple of four pages and imposed
// two to a side for folding; otherwise, with even padding on, a report of an
// odd number of pages gets a blank page, so every report starts on a new
// sheet when printed on both sides. It returns the joined PDF and each
// report's page count.
func Assemble(docs [][]byte, cfg Config) ([]byte, []int, error) {
	pages := make([]int, len(docs))
	ready := make([]io.ReadSeeker, len(docs))
	for i, doc := range docs {
		var err error
		switch {
		case cfg.Booklet:
			if doc, pages[i], err = padTo(doc, 4); err != nil {
				return nil, nil, err
			}
			nup, err := pdfcpu.PDFBookletConfig(2, "formsize:"+bookletSheet[cfg.Paper.Size]+", btype:booklet", nil)
			if err != nil {
				return nil, nil, err
			}
			var out bytes.Buffer
			if err := api.Booklet(context.Background(), bytes.NewReader(doc), &out, nil, nil, nup, nil); err != nil {
				return nil, nil, fmt.Errorf("booklet: %w", err)
			}
			doc = out.Bytes()
		case cfg.PadEven && len(docs) > 1:
			if doc, pages[i], err = padTo(doc, 2); err != nil {
				return nil, nil, err
			}
		default:
			if pages[i], err = Pages(doc); err != nil {
				return nil, nil, err
			}
		}
		ready[i] = bytes.NewReader(doc)
	}
	if len(ready) == 1 {
		b, _ := io.ReadAll(ready[0])
		return b, pages, nil
	}
	var out bytes.Buffer
	if err := api.MergeRaw(context.Background(), ready, &out, false, nil); err != nil {
		return nil, nil, fmt.Errorf("merge: %w", err)
	}
	return out.Bytes(), pages, nil
}
