package dashboard_test

import (
	"context"
	"encoding/json"
	"io"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db/dbtest"
	"github.com/jackymean-del/revu/internal/server"
)

type headerAuth struct{}

func (headerAuth) UserID(c fiber.Ctx) (string, error) { return c.Get("X-Test-User"), nil }

type caller struct {
	t         *testing.T
	app       *fiber.App
	user, org string
}

func (c caller) get(code int, path string, v any) {
	c.t.Helper()
	req := httptest.NewRequest("GET", path, nil)
	req.Header.Set("X-Test-User", c.user)
	req.Header.Set("X-Org-Id", c.org)
	res, err := c.app.Test(req, fiber.TestConfig{Timeout: 0})
	if err != nil {
		c.t.Fatal(err)
	}
	b, _ := io.ReadAll(res.Body)
	if res.StatusCode != code {
		c.t.Fatalf("%s as %s: status %d, want %d: %s", path, c.user, res.StatusCode, code, b)
	}
	if v != nil {
		if err := json.Unmarshal(b, v); err != nil {
			c.t.Fatal(err)
		}
	}
}

func (c caller) tiles() map[string]api.Tile {
	c.t.Helper()
	var d api.Dashboard
	c.get(200, "/v1/dashboard", &d)
	if len(d.Tiles) > 6 {
		c.t.Fatalf("%d tiles, at most 6", len(d.Tiles))
	}
	out := map[string]api.Tile{}
	for _, t := range d.Tiles {
		out[t.Key] = t
	}
	return out
}

func (c caller) titles(key string) []string {
	c.t.Helper()
	var l api.DashboardList
	c.get(200, "/v1/dashboard/"+key, &l)
	var out []string
	for _, r := range l.Rows {
		out = append(out, r.Title)
	}
	return out
}

// One organisation with two branches, two teachers, a branch coordinator and
// a view-only member:
//
//	main branch:   Grade 6 A (seeded: Ravi, with a contact; no class teacher)
//	               Grade 6 B (Tara is class teacher and teaches Mathematics;
//	                          Kiran with a contact, Leela without)
//	second branch: Grade 6 C (Omar teaches Mathematics; Nila without a contact;
//	                          no class teacher)
//	nowhere:       Sam, active, no section and no contact
//	Grade 6 has the seeded Second language group; only Ravi has chosen.
//	staff:         Asha (admin), Tara, Omar, and Ben who has never signed in
func TestDashboards(t *testing.T) {
	owner, appPool := dbtest.Open(t)
	a := dbtest.SeedOrg(t, owner, "Org A")
	b := dbtest.SeedOrg(t, owner, "Org B")
	app := server.New(config.Config{Version: "test"}, server.Deps{DB: appPool, Auth: headerAuth{}})
	ctx := context.Background()
	one := func(sql string, args ...any) string {
		t.Helper()
		var id string
		if err := owner.QueryRow(ctx, sql, args...).Scan(&id); err != nil {
			t.Fatalf("%v\n%s", err, sql)
		}
		return id
	}
	t.Cleanup(func() {
		for _, u := range []string{"tara", "omar", "coord", "viewer"} {
			_, _ = owner.Exec(ctx, `DELETE FROM memberships WHERE clerk_user_id = $1`, u+"-"+a.UserID)
		}
	})

	second := one(`INSERT INTO branches (org_id, name) VALUES ($1, 'Second') RETURNING id`, a.ID)
	sectionB := one(`INSERT INTO sections (org_id, branch_id, level_id, year_id, name) VALUES ($1, $2, $3, $4, 'B') RETURNING id`, a.ID, a.BranchID, a.LevelID, a.YearID)
	sectionC := one(`INSERT INTO sections (org_id, branch_id, level_id, year_id, name) VALUES ($1, $2, $3, $4, 'C') RETURNING id`, a.ID, second, a.LevelID, a.YearID)
	staff := func(name string) string {
		return one(`INSERT INTO staff (org_id, name) VALUES ($1, $2) RETURNING id`, a.ID, name)
	}
	tara, omar := staff("Tara"), staff("Omar")
	staff("Ben")
	member := func(user, role, branch, staffID string) {
		one(`INSERT INTO memberships (org_id, clerk_user_id, role, branch_id, staff_id) VALUES ($1, $2, $3, nullif($4, '')::uuid, nullif($5, '')::uuid) RETURNING id`,
			a.ID, user+"-"+a.UserID, role, branch, staffID)
	}
	member("tara", "teacher", "", tara)
	member("tara", "class_teacher", "", tara)
	member("omar", "teacher", "", omar)
	member("coord", "coordinator", second, "")
	member("viewer", "viewer", "", "")
	assign := func(staffID, section string, subject any) {
		one(`INSERT INTO teaching_assignments (org_id, staff_id, section_id, subject_id) VALUES ($1, $2, $3, $4) RETURNING id`, a.ID, staffID, section, subject)
	}
	assign(tara, sectionB, nil)
	assign(tara, sectionB, a.SubjectID)
	assign(omar, sectionC, a.SubjectID)
	student := func(no, name, section string, contact bool) {
		id := one(`INSERT INTO students (org_id, admission_no, name) VALUES ($1, $2, $3) RETURNING id`, a.ID, no, name)
		if section != "" {
			one(`INSERT INTO enrolments (org_id, student_id, section_id, year_id) VALUES ($1, $2, $3, $4) RETURNING id`, a.ID, id, section, a.YearID)
		}
		if contact {
			one(`INSERT INTO guardians (org_id, student_id, name) VALUES ($1, $2, 'Parent') RETURNING id`, a.ID, id)
		}
	}
	student("A-002", "Kiran", sectionB, true)
	student("A-003", "Leela", sectionB, false)
	student("A-004", "Nila", sectionC, false)
	student("A-005", "Sam", "", false)

	as := func(user string) caller { return caller{t, app, user, a.ID} }
	admin := as(a.UserID)
	taraC, omarC, coord, viewer := as("tara-"+a.UserID), as("omar-"+a.UserID), as("coord-"+a.UserID), as("viewer-"+a.UserID)

	// AT-DB-01: every number a person sees is the length of the list it opens.
	for _, c := range []caller{admin, taraC, omarC, coord} {
		for key, tile := range c.tiles() {
			if !tile.Listable {
				t.Errorf("%s cannot open %s", c.user, key)
			}
			if n := len(c.titles(key)); n != tile.Count {
				t.Errorf("%s: %s says %d, its list has %d", c.user, key, tile.Count, n)
			}
		}
	}

	t.Run("administrator sees exceptions first", func(t *testing.T) {
		var d api.Dashboard
		admin.get(200, "/v1/dashboard", &d)
		var keys []string
		for _, tile := range d.Tiles {
			keys = append(keys, tile.Key)
		}
		// Seven tiles apply; the limit of six leaves out what is in order.
		want := []string{"unplaced_students", "no_contact", "missing_choices", "no_class_teacher", "open_invitations", "staff_without_sign_in"}
		if !slices.Equal(keys, want) {
			t.Fatalf("tiles %v, want %v", keys, want)
		}
		if d.YearId != a.YearID {
			t.Fatalf("year %s, want %s", d.YearId, a.YearID)
		}
		for key, want := range map[string][]string{
			"unplaced_students":     {"Sam"},
			"no_contact":            {"Leela", "Nila", "Sam"},
			"no_class_teacher":      {"Grade 6 A", "Grade 6 C"},
			"staff_without_sign_in": {"Ben"},
			"missing_choices":       {"Kiran", "Leela", "Nila"},
			"missing_setup":         nil,
		} {
			if got := admin.titles(key); !slices.Equal(got, want) {
				t.Errorf("%s: %v, want %v", key, got, want)
			}
		}
	})

	// AT-DB-02: a teacher's tiles hold only the classes assigned to them.
	t.Run("teachers see their own classes only", func(t *testing.T) {
		tiles := taraC.tiles()
		if _, ok := tiles["unplaced_students"]; ok {
			t.Fatal("a teacher sees the whole school's exceptions")
		}
		if got := taraC.titles("my_classes"); !slices.Equal(got, []string{"Grade 6 B", "Grade 6 B"}) {
			t.Fatalf("Tara's classes %v", got)
		}
		if got := taraC.titles("my_students"); !slices.Equal(got, []string{"Kiran", "Leela"}) {
			t.Fatalf("Tara's students %v", got)
		}
		if got := taraC.titles("my_class_no_contact"); !slices.Equal(got, []string{"Leela"}) {
			t.Fatalf("Tara's class without a contact %v", got)
		}
		if got := taraC.titles("my_class_no_choice"); !slices.Equal(got, []string{"Kiran", "Leela"}) {
			t.Fatalf("Tara's class without a language %v", got)
		}
		if got := omarC.titles("my_students"); !slices.Equal(got, []string{"Nila"}) {
			t.Fatalf("Omar's students %v", got)
		}
		if _, ok := omarC.tiles()["my_class_no_contact"]; ok {
			t.Fatal("a subject teacher gets the class teacher's tile")
		}
		taraC.get(404, "/v1/dashboard/unplaced_students", nil)
		omarC.get(404, "/v1/dashboard/my_class_no_contact", nil)
		taraC.get(404, "/v1/dashboard/no_such_tile", nil)
	})

	t.Run("a branch coordinator counts in their branch", func(t *testing.T) {
		tiles := coord.tiles()
		for _, key := range []string{"unplaced_students", "missing_setup", "open_invitations"} {
			if _, ok := tiles[key]; ok {
				t.Errorf("a branch coordinator sees %s", key)
			}
		}
		if got := coord.titles("no_class_teacher"); !slices.Equal(got, []string{"Grade 6 C"}) {
			t.Errorf("sections without a class teacher %v", got)
		}
		if got := coord.titles("no_contact"); !slices.Equal(got, []string{"Nila"}) {
			t.Errorf("students without a contact %v", got)
		}
		if got := coord.titles("missing_choices"); !slices.Equal(got, []string{"Nila"}) {
			t.Errorf("students without a language %v", got)
		}
	})

	// AT-DB-03 and Part 77: view-only sees the numbers and never the names.
	t.Run("view-only sees counts only", func(t *testing.T) {
		tiles := viewer.tiles()
		if tiles["total_students"].Count != 5 || tiles["total_sections"].Count != 3 {
			t.Fatalf("viewer tiles %+v", tiles)
		}
		for key, tile := range tiles {
			if tile.Listable {
				t.Errorf("%s is listable for view-only", key)
			}
			viewer.get(403, "/v1/dashboard/"+key, nil)
		}
	})

	t.Run("another organisation's tiles count its own rows", func(t *testing.T) {
		other := caller{t, app, b.UserID, b.ID}
		if got := other.titles("no_contact"); len(got) != 0 {
			t.Fatalf("organisation B sees %v", got)
		}
		caller{t, app, b.UserID, a.ID}.get(404, "/v1/dashboard", nil)
	})
}
