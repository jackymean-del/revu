package terminology

import (
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/tenant"
)

// Routes serves GET and PUT /terminology inside a tenant-scoped router.
func Routes(r fiber.Router) {
	r.Get("/terminology", get)
	r.Put("/terminology", put)
}

func get(c fiber.Ctx) error {
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	t, err := load(c.Context(), tx)
	if err != nil {
		return err
	}
	return c.JSON(t)
}

func put(c fiber.Ctx) error {
	ctx := c.Context()
	m, _ := tenant.MemberFrom(c)
	// Organisation-wide setting: a role limited to one branch cannot change it.
	if err := policy.Check(m.Actor(), policy.TerminologyWrite, policy.Target{}); err != nil {
		return err
	}
	var in api.Terminology
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	tx, err := tenant.Tx(c)
	if err != nil {
		return err
	}
	if err := validate(c, &in); err != nil {
		return err
	}
	before, err := load(ctx, tx)
	if err != nil {
		return err
	}
	if err := replace(ctx, tx, m.OrgID, in); err != nil {
		return err
	}
	after, err := load(ctx, tx)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "update", Entity: "terminology", Before: before, After: after}); err != nil {
		return err
	}
	return c.JSON(after)
}

var uuidShape = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// validate trims words and lists every problem at once, so the editor can
// mark each field.
func validate(c fiber.Ctx, in *api.Terminology) error {
	var fields []api.FieldError
	add := func(field, code, msg string) {
		fields = append(fields, api.FieldError{Field: field, Code: code, Message: msg})
	}
	if !IsPreset(string(in.Preset)) {
		add("preset", "unknown", "Choose school, college or university.")
	}
	seen := map[string]bool{}
	var branches []string
	for i := range in.Overrides {
		o := &in.Overrides[i]
		at := fmt.Sprintf("overrides[%d]", i)
		o.One, o.Other = strings.TrimSpace(o.One), strings.TrimSpace(o.Other)
		if !IsKey(o.Key) {
			add(at+".key", "unknown", "This word is not on the list.")
		}
		for _, f := range [2]struct{ name, v string }{{"one", o.One}, {"other", o.Other}} {
			if n := utf8.RuneCountInString(f.v); n == 0 || n > 60 {
				add(at+"."+f.name, "length", "Use 1 to 60 characters.")
			}
		}
		if o.BranchId != "" {
			if !uuidShape.MatchString(o.BranchId) {
				add(at+".branchId", "unknown", "No such branch.")
			} else {
				branches = append(branches, strings.ToLower(o.BranchId))
			}
		}
		k := o.Key + "|" + strings.ToLower(o.BranchId)
		if seen[k] {
			add(at+".key", "duplicate", "This word is set twice for the same place.")
		}
		seen[k] = true
	}
	if len(branches) > 0 {
		tx, err := tenant.Tx(c)
		if err != nil {
			return err
		}
		known, err := knownBranches(c.Context(), tx, branches)
		if err != nil {
			return err
		}
		for i, o := range in.Overrides {
			if o.BranchId != "" && uuidShape.MatchString(o.BranchId) && !known[strings.ToLower(o.BranchId)] {
				add(fmt.Sprintf("overrides[%d].branchId", i), "unknown", "No such branch.")
			}
		}
	}
	if len(fields) > 0 {
		return problem.Invalid(fields...)
	}
	return nil
}
