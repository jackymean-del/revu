package people

import (
	"context"
	"encoding/json"
	"net/mail"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
)

// A student's fields beyond the fixed ones (admission number, name,
// preferred name, date of birth, status) are the institution's own list:
// the blueprint's usual ones to start with, each renamed, hidden or made
// required, and any number added. Values live with the student; hiding a
// field keeps them.

// Field is one student field in the institution's list.
type Field struct {
	Key       string   `json:"key"`       // stable; never shown
	Label     string   `json:"label"`     // as the institution names it
	Type      string   `json:"type"`      // text, number, date, choice, yesno, phone, email, longtext
	Options   []string `json:"options"`   // for choice
	Area      string   `json:"area"`      // identity, contact, health, other
	Required  bool     `json:"required"`  // must be filled
	Hidden    bool     `json:"hidden"`    // not asked or shown; past values kept
	AdminOnly bool     `json:"adminOnly"` // only administrators see it (health and care)
	Unique    bool     `json:"unique"`    // no two students share a value; may be the sign-in name
	Custom    bool     `json:"custom"`    // added by the institution
}

// FieldSettings is the list, and which field families sign in with.
type FieldSettings struct {
	Fields []Field `json:"fields"`
	// UsernameField is the field a family signs in with: admissionNo, or
	// the key of a unique field.
	UsernameField string `json:"usernameField"`
}

var fieldTypes = []string{"text", "longtext", "number", "date", "choice", "yesno", "phone", "email"}
var fieldAreas = []string{"identity", "contact", "family", "health", "other"}
var keyShape = regexp.MustCompile(`^[a-z][a-zA-Z0-9]{0,39}$`)

// The blueprint's usual student fields, before the institution changes any.
func defaultFields() []Field {
	return []Field{
		{Key: "gender", Label: "Gender", Type: "choice", Options: []string{"Female", "Male", "Other"}, Area: "identity"},
		{Key: "bloodGroup", Label: "Blood group", Type: "choice", Options: []string{"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"}, Area: "health", AdminOnly: true},
		{Key: "phone", Label: "Phone", Type: "phone", Area: "contact"},
		{Key: "email", Label: "Email", Type: "email", Area: "contact"},
		{Key: "address", Label: "Address", Type: "longtext", Area: "contact"},
		{Key: "nationality", Label: "Nationality", Type: "text", Area: "identity"},
		{Key: "religion", Label: "Religion", Type: "text", Area: "identity", Hidden: true},
		{Key: "category", Label: "Category", Type: "text", Area: "identity", Hidden: true},
		{Key: "motherTongue", Label: "Mother tongue", Type: "text", Area: "identity"},
		{Key: "previousSchool", Label: "Previous institution", Type: "text", Area: "other"},
		{Key: "admittedOn", Label: "Date of admission", Type: "date", Area: "other"},
		{Key: "medicalNotes", Label: "Medical notes", Type: "longtext", Area: "health", AdminOnly: true},
	}
}

func loadFields(ctx context.Context, tx pgx.Tx) (FieldSettings, error) {
	s := FieldSettings{Fields: defaultFields(), UsernameField: "admissionNo"}
	var raw []byte
	if err := tx.QueryRow(ctx, `SELECT settings -> 'studentFields' FROM orgs WHERE id = app_org_id()`).Scan(&raw); err != nil {
		return s, err
	}
	if len(raw) > 0 && string(raw) != "null" {
		var got FieldSettings
		if json.Unmarshal(raw, &got) == nil && got.Fields != nil {
			s.Fields = got.Fields
			if got.UsernameField != "" {
				s.UsernameField = got.UsernameField
			}
		}
	}
	for i := range s.Fields {
		if s.Fields[i].Options == nil {
			s.Fields[i].Options = []string{}
		}
	}
	return s, nil
}

func getFields(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	s, err := loadFields(c.Context(), tx)
	if err != nil {
		return err
	}
	return c.JSON(s)
}

// putFields saves the list. A field is never dropped once it may hold
// values; it is hidden instead. Keys stay as they were.
func putFields(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	actor, err := tenant.Teaching(c)
	if err != nil {
		return err
	}
	if err := policy.Check(actor, policy.StructureWrite, policy.Target{}); err != nil {
		return err
	}
	var in FieldSettings
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	was, err := loadFields(c.Context(), tx)
	if err != nil {
		return err
	}
	var f records.Fields
	seen := map[string]bool{}
	for i := range in.Fields {
		x := &in.Fields[i]
		x.Label = strings.Join(strings.Fields(x.Label), " ")
		switch {
		case !keyShape.MatchString(x.Key) || seen[x.Key] || slices.Contains([]string{"admissionNo", "name", "preferredName", "dob", "status"}, x.Key):
			f.Add("fields", "key", "Each field needs its own key.")
		case x.Label == "" || len(x.Label) > 60:
			f.Add("fields", "label", "Name each field, up to 60 characters.")
		case !slices.Contains(fieldTypes, x.Type):
			f.Add("fields", "type", "Choose text, long text, number, date, choice, yes or no, phone or email.")
		case x.Type == "choice" && len(x.Options) == 0:
			f.Add("fields", "options", x.Label+" needs its choices.")
		}
		if !slices.Contains(fieldAreas, x.Area) {
			x.Area = "other"
		}
		if x.Type != "choice" {
			x.Options = []string{}
		}
		seen[x.Key] = true
	}
	// Nothing that may hold values goes away: a field left out comes back, hidden.
	for _, old := range was.Fields {
		if !seen[old.Key] {
			old.Hidden = true
			in.Fields = append(in.Fields, old)
		}
	}
	if in.UsernameField == "" {
		in.UsernameField = "admissionNo"
	}
	if in.UsernameField != "admissionNo" && !slices.ContainsFunc(in.Fields, func(x Field) bool { return x.Key == in.UsernameField && x.Unique && !x.Hidden }) {
		f.Add("usernameField", "unknown", "Families sign in with the admission number or a unique field that is shown.")
	}
	if len(f) > 0 {
		return problem.Invalid(f...)
	}
	raw, _ := json.Marshal(in)
	if _, err := tx.Exec(c.Context(), `UPDATE orgs SET settings = jsonb_set(coalesce(settings, '{}'::jsonb), '{studentFields}', $1::jsonb) WHERE id = app_org_id()`, string(raw)); err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "student_fields", After: in}); err != nil {
		return err
	}
	out, err := loadFields(c.Context(), tx)
	if err != nil {
		return err
	}
	return c.JSON(out)
}

// checkDetails keeps a student's field values to what each field allows,
// and holds the required ones to being filled. Values of fields not in the
// list, or hidden, are kept as they were.
func checkDetails(ctx context.Context, tx pgx.Tx, admissionNo string, details map[string]string, f *records.Fields) error {
	s, err := loadFields(ctx, tx)
	if err != nil {
		return err
	}
	for k, v := range details {
		details[k] = strings.TrimSpace(v)
	}
	for _, x := range s.Fields {
		v := details[x.Key]
		if x.Hidden {
			continue
		}
		if v == "" {
			if x.Required {
				f.Add("details."+x.Key, "required", x.Label+" is required.")
			}
			continue
		}
		bad := ""
		switch x.Type {
		case "number":
			if _, err := strconv.ParseFloat(v, 64); err != nil {
				bad = "Use a number."
			}
		case "date":
			if _, err := time.Parse("2006-01-02", v); err != nil {
				bad = "Use a date."
			}
		case "choice":
			if !slices.Contains(x.Options, v) {
				bad = "Choose one of the choices."
			}
		case "yesno":
			if v != "yes" && v != "no" {
				bad = "Choose yes or no."
			}
		case "email":
			if a, err := mail.ParseAddress(v); err != nil || a.Address != v {
				bad = "Use an email address."
			}
		case "phone":
			if !phoneShape.MatchString(v) {
				bad = "Use a phone number."
			}
		}
		if len(v) > 2000 {
			bad = "Up to 2000 characters."
		}
		if bad != "" {
			f.Add("details."+x.Key, "invalid", x.Label+": "+bad)
			continue
		}
		if x.Unique {
			var taken bool
			if err := tx.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM students WHERE details ->> $1 = $2 AND deleted_at IS NULL AND admission_no <> $3)`, x.Key, v, admissionNo).Scan(&taken); err != nil {
				return err
			}
			if taken {
				f.Add("details."+x.Key, "taken", "Another student already has this "+strings.ToLower(x.Label)+".")
			}
		}
	}
	return nil
}

// visibleDetails is what of a student's values this person may see: all
// of them for an administrator, those of fields not kept to administrators
// for anyone else.
func visibleDetails(ctx context.Context, tx pgx.Tx, actor policy.Actor, details map[string]string) (map[string]string, error) {
	if policy.Decide(actor, policy.StructureWrite, policy.Target{}) != policy.None {
		return details, nil
	}
	s, err := loadFields(ctx, tx)
	if err != nil {
		return nil, err
	}
	out := map[string]string{}
	for k, v := range details {
		if !slices.ContainsFunc(s.Fields, func(x Field) bool { return x.Key == k && x.AdminOnly }) {
			out[k] = v
		}
	}
	return out, nil
}
