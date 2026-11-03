// Package tables reads the spreadsheets people upload: .csv in any common
// separator, or the first sheet of an .xlsx file.
package tables

import (
	"bytes"
	"encoding/csv"
	"errors"
	"io"
	"strings"
	"unicode"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/xuri/excelize/v2"
)

// Norm reduces a heading or name to lower-case letters and digits, so
// "Adm. No" matches "adm no".
func Norm(s string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(s) {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// Read returns the rows of a .csv or .xlsx file, first row headings.
func Read(name string, data []byte) ([][]string, error) {
	if strings.HasSuffix(strings.ToLower(name), ".xlsx") || bytes.HasPrefix(data, []byte("PK\x03\x04")) {
		f, err := excelize.OpenReader(bytes.NewReader(data))
		if err != nil {
			return nil, errors.New("this Excel file could not be opened")
		}
		defer f.Close()
		sheets := f.GetSheetList()
		if len(sheets) == 0 {
			return nil, errors.New("this Excel file has no sheets")
		}
		return f.GetRows(sheets[0])
	}
	data = bytes.TrimPrefix(data, []byte("\xef\xbb\xbf"))
	first, _, _ := bytes.Cut(data, []byte("\n"))
	sep := ','
	for _, c := range []rune{';', '\t'} {
		if bytes.Count(first, []byte(string(c))) > bytes.Count(first, []byte(string(sep))) {
			sep = c
		}
	}
	r := csv.NewReader(bytes.NewReader(data))
	r.Comma = sep
	r.FieldsPerRecord = -1
	r.LazyQuotes = true
	rows, err := r.ReadAll()
	if err != nil {
		return nil, errors.New("this file could not be read as CSV: " + err.Error())
	}
	return rows, nil
}

// Routes serves reading an uploaded file as text, for previews built in the
// app. Nothing is stored.
func Routes(g fiber.Router) {
	g.Post("/tables/read", read)
}

func read(c fiber.Ctx) error {
	fh, err := c.FormFile("file")
	if err != nil {
		return problem.Invalid(api.FieldError{Field: "file", Code: "required", Message: "Choose a .csv or .xlsx file."})
	}
	file, err := fh.Open()
	if err != nil {
		return err
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, 5<<20))
	if err != nil {
		return err
	}
	rows, err := Read(fh.Filename, data)
	if err != nil {
		return problem.Invalid(api.FieldError{Field: "file", Code: "format", Message: err.Error() + "."})
	}
	out := api.TableText{Header: []string{}, Rows: [][]string{}}
	if len(rows) > 0 {
		out.Header = rows[0]
		out.Rows = rows[1:]
	}
	return c.JSON(out)
}
