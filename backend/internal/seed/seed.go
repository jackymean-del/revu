// Package seed creates demo organisations for local work, demos and tests,
// and the platform owner's first step for a new client. It runs as the
// owner role (creating an organisation is a sign-up step).
//
// The demo is repeatable: every record is found by its natural key (an
// external id, a name, an admission number) before it is created, so a
// second run changes nothing and records someone added by hand are reused.
package seed

import (
	"context"
	"errors"
	"fmt"
	"slices"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type span struct{ Name, Start, End string }

// Demo is one demo organisation and everything in it.
type Demo struct {
	ExternalID, Name, Type, Branch string
	Year                           span
	Terms                          []span
	Levels                         []string // in order
	FirstSeq                       int      // order of the first level
	Sections                       []string // in every level
	Subjects                       []string // taught in every level
	// Choice, when set, is a subject group of every level: each student
	// takes one option, except every eleventh, left for the missing list.
	Choice     *choice
	Staff      []string
	Domain     string // for staff email addresses
	PerSection int    // students in each section
	Admission  string // admission number prefix
	BirthYear  int    // of the first level's students
}

type choice struct {
	Group   string
	Options []string
}

// Demos are two organisations with different presets, so every screen can be
// checked in two vocabularies.
var Demos = []Demo{
	{
		ExternalID: "demo-school", Name: "Riverside Public School", Type: "school", Branch: "Riverside main",
		Year:   span{"2026-27", "2026-04-01", "2027-03-31"},
		Terms:  []span{{"Term 1", "2026-04-01", "2026-09-30"}, {"Term 2", "2026-10-01", "2027-03-31"}},
		Levels: []string{"Grade 6", "Grade 7", "Grade 8"}, FirstSeq: 6,
		Sections: []string{"A", "B"},
		Subjects: []string{"English", "Mathematics", "Science", "Social Science"},
		Choice:   &choice{"Second language", []string{"Hindi", "Odia", "Sanskrit"}},
		Staff:    []string{"Asha Rao", "Vikram Nair", "Farah Siddiqui", "Joseph Mathew", "Priya Menon", "Arjun Bose", "Lakshmi Pillai", "Kiran Joshi"},
		Domain:   "riverside.example", PerSection: 12, Admission: "RPS-", BirthYear: 2015,
	},
	{
		ExternalID: "demo-university", Name: "Lakeview University", Type: "university", Branch: "Lakeview campus",
		Year:   span{"2026-27", "2026-07-01", "2027-06-30"},
		Terms:  []span{{"Semester 1", "2026-07-01", "2026-12-31"}, {"Semester 2", "2027-01-01", "2027-06-30"}},
		Levels: []string{"Programme year 1", "Programme year 2"}, FirstSeq: 1,
		Sections: []string{"A", "B"},
		Subjects: []string{"Communication Skills", "Mathematics", "Physics", "Computer Science"},
		Staff:    []string{"Dr. Meena Iyer", "Dr. Rahul Verma", "Dr. Sana Qureshi", "Dr. Thomas George", "Dr. Kavita Rao"},
		Domain:   "lakeview.example", PerSection: 10, Admission: "LVU-", BirthYear: 2007,
	},
}

var firstNames = []string{"Aarav", "Diya", "Ishaan", "Meera", "Kabir", "Ananya", "Vihaan", "Saanvi", "Arjun", "Kavya", "Rohan", "Zara",
	"Aditya", "Nisha", "Reyansh", "Tara", "Imran", "Leela", "Dev", "Sara", "Neil", "Riya", "Omar", "Pooja"}
var lastNames = []string{"Rao", "Sharma", "Iyer", "Khan", "Das", "Patel", "Menon", "Gupta", "Nair", "Singh", "Reddy", "Joseph", "Bose", "Kulkarni", "Ali", "Pillai"}

// Result says what one demo organisation holds after seeding.
type Result struct {
	OrgID                       string
	Sections, Staff, Students   int
	TeachingAssignments, Guards int
	Choices, Assessments        int
}

// Run creates the demo organisations and makes userID an administrator of
// each. It returns their ids, in the order of Demos.
func Run(ctx context.Context, owner *pgxpool.Pool, userID string) ([]string, error) {
	results, err := RunWith(ctx, owner, userID, "")
	ids := make([]string, len(results))
	for i, r := range results {
		ids[i] = r.OrgID
	}
	return ids, err
}

// RunWith seeds with suffix added to each organisation's name and external
// id, so tests get their own copies and never touch the demo itself.
func RunWith(ctx context.Context, owner *pgxpool.Pool, userID, suffix string) ([]Result, error) {
	var out []Result
	for _, d := range Demos {
		var r Result
		err := pgx.BeginFunc(ctx, owner, func(tx pgx.Tx) error {
			var err error
			r, err = seedOne(ctx, tx, d, userID, suffix)
			return err
		})
		if err != nil {
			return out, fmt.Errorf("seed %s: %w", d.Name, err)
		}
		out = append(out, r)
	}
	return out, nil
}

// ensure returns the id find selects, or else the id insert returns. find
// takes the first findArgs of args; insert takes them all.
func ensure(ctx context.Context, tx pgx.Tx, find, insert string, findArgs int, args ...any) (string, error) {
	var id string
	err := tx.QueryRow(ctx, find, args[:findArgs]...).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		err = tx.QueryRow(ctx, insert, args...).Scan(&id)
	}
	return id, err
}

func seedOne(ctx context.Context, tx pgx.Tx, d Demo, userID, suffix string) (Result, error) {
	var r Result
	var err error
	name := d.Name + suffix
	if r.OrgID, err = ensure(ctx, tx,
		`SELECT id::text FROM orgs WHERE external_id = $1`,
		`INSERT INTO orgs (external_id, name, institution_type, preset) VALUES ($1, $2, $3, $4) RETURNING id::text`, 1,
		d.ExternalID+suffix, name, d.Type, d.Type); err != nil {
		return r, err
	}
	org := r.OrgID
	branch, err := ensure(ctx, tx,
		`SELECT id::text FROM branches WHERE org_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL`,
		`INSERT INTO branches (org_id, name) VALUES ($1, $2) RETURNING id::text`, 2, org, d.Branch)
	if err != nil {
		return r, err
	}
	if _, err := tx.Exec(ctx, `INSERT INTO memberships (org_id, clerk_user_id, role) VALUES ($1, $2, 'admin') ON CONFLICT DO NOTHING`, org, userID); err != nil {
		return r, err
	}

	year, err := ensure(ctx, tx,
		`SELECT id::text FROM academic_years WHERE org_id = $1 AND label = $2 AND deleted_at IS NULL`,
		`INSERT INTO academic_years (org_id, label, starts_on, ends_on) VALUES ($1, $2, $3::date, $4::date) RETURNING id::text`, 2,
		org, d.Year.Name, d.Year.Start, d.Year.End)
	if err != nil {
		return r, err
	}
	var firstTerm string
	for i, t := range d.Terms {
		id, err := ensure(ctx, tx,
			`SELECT id::text FROM periods WHERE org_id = $1 AND year_id = $2::uuid AND (lower(name) = lower($3) OR seq = $4) AND deleted_at IS NULL`,
			`INSERT INTO periods (org_id, year_id, name, seq, starts_on, ends_on) VALUES ($1, $2::uuid, $3, $4, $5::date, $6::date) RETURNING id::text`, 4,
			org, year, t.Name, i+1, t.Start, t.End)
		if err != nil {
			return r, err
		}
		if i == 0 {
			firstTerm = id
		}
	}

	var subjects []string
	for _, s := range d.Subjects {
		id, err := ensure(ctx, tx,
			`SELECT id::text FROM subjects WHERE org_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL`,
			`INSERT INTO subjects (org_id, name) VALUES ($1, $2) RETURNING id::text`, 2, org, s)
		if err != nil {
			return r, err
		}
		subjects = append(subjects, id)
	}
	var options []string
	if d.Choice != nil {
		for _, s := range d.Choice.Options {
			id, err := ensure(ctx, tx,
				`SELECT id::text FROM subjects WHERE org_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL`,
				`INSERT INTO subjects (org_id, name) VALUES ($1, $2) RETURNING id::text`, 2, org, s)
			if err != nil {
				return r, err
			}
			options = append(options, id)
		}
	}

	var staff []string
	for i, s := range d.Staff {
		email := fmt.Sprintf("staff%d@%s", i+1, d.Domain)
		id, err := ensure(ctx, tx,
			`SELECT id::text FROM staff WHERE org_id = $1 AND (lower(email) = $3 OR lower(name) = lower($2)) AND deleted_at IS NULL`,
			`INSERT INTO staff (org_id, name, email, designation) VALUES ($1, $2, $3, 'Teacher') RETURNING id::text`, 3, org, s, email)
		if err != nil {
			return r, err
		}
		staff = append(staff, id)
	}
	// The administrator's role is linked to the first staff record, so the
	// demo shows a named person in the history.
	if _, err := tx.Exec(ctx, `UPDATE memberships SET staff_id = $3::uuid WHERE org_id = $1 AND clerk_user_id = $2 AND staff_id IS NULL`, org, userID, staff[0]); err != nil {
		return r, err
	}

	student := 0
	for li, lname := range d.Levels {
		level, err := ensure(ctx, tx,
			`SELECT id::text FROM levels WHERE org_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL`,
			`INSERT INTO levels (org_id, name, seq) VALUES ($1, $2, $3) RETURNING id::text`, 2, org, lname, d.FirstSeq+li)
		if err != nil {
			return r, err
		}
		for _, subject := range append(slices.Clone(subjects), options...) {
			if _, err := tx.Exec(ctx, `
				INSERT INTO level_subjects (org_id, level_id, subject_id) SELECT $1, $2::uuid, $3::uuid
				 WHERE NOT EXISTS (SELECT 1 FROM level_subjects WHERE level_id = $2::uuid AND subject_id = $3::uuid AND deleted_at IS NULL)`,
				org, level, subject); err != nil {
				return r, err
			}
		}
		group := ""
		if d.Choice != nil {
			if group, err = ensure(ctx, tx,
				`SELECT id::text FROM subject_groups WHERE org_id = $1 AND level_id = $2::uuid AND lower(name) = lower($3) AND deleted_at IS NULL`,
				`INSERT INTO subject_groups (org_id, level_id, name, rule, min_choices, max_choices) VALUES ($1, $2::uuid, $3, 'exactly_one', 1, 1) RETURNING id::text`, 3,
				org, level, d.Choice.Group); err != nil {
				return r, err
			}
			for _, o := range options {
				if _, err := tx.Exec(ctx, `
					INSERT INTO subject_group_options (org_id, group_id, subject_id) SELECT $1, $2::uuid, $3::uuid
					 WHERE NOT EXISTS (SELECT 1 FROM subject_group_options WHERE group_id = $2::uuid AND subject_id = $3::uuid AND deleted_at IS NULL)`,
					org, group, o); err != nil {
					return r, err
				}
			}
		}
		if err := unitTest(ctx, tx, org, year, firstTerm, level, subjects[slices.Index(d.Subjects, "Mathematics")]); err != nil {
			return r, err
		}
		for si, sname := range d.Sections {
			section, err := ensure(ctx, tx,
				`SELECT id::text FROM sections WHERE org_id = $1 AND year_id = $2::uuid AND level_id = $3::uuid AND branch_id = $4::uuid AND lower(name) = lower($5) AND deleted_at IS NULL`,
				`INSERT INTO sections (org_id, year_id, level_id, branch_id, name) VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5) RETURNING id::text`, 5,
				org, year, level, branch, sname)
			if err != nil {
				return r, err
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO assessment_scopes (org_id, assessment_id, section_id)
				SELECT $1, a.id, $2::uuid FROM assessments a WHERE a.org_id = $1 AND a.level_id = $3::uuid AND a.title = 'Unit test 1' AND a.deleted_at IS NULL
				ON CONFLICT DO NOTHING`, org, section, level); err != nil {
				return r, err
			}
			n := li*len(d.Sections) + si
			// A class teacher for the section, and a teacher for each subject.
			assign := []struct{ staff, subject string }{{staff[n%len(staff)], ""}}
			for j, subject := range subjects {
				assign = append(assign, struct{ staff, subject string }{staff[(n+j+1)%len(staff)], subject})
			}
			for _, a := range assign {
				if _, err := tx.Exec(ctx, `
					INSERT INTO teaching_assignments (org_id, staff_id, section_id, subject_id)
					SELECT $1, $2::uuid, $3::uuid, nullif($4, '')::uuid
					 WHERE NOT EXISTS (SELECT 1 FROM teaching_assignments WHERE staff_id = $2::uuid AND section_id = $3::uuid
					                    AND subject_id IS NOT DISTINCT FROM nullif($4, '')::uuid AND deleted_at IS NULL)`,
					org, a.staff, section, a.subject); err != nil {
					return r, err
				}
			}
			for k := 1; k <= d.PerSection; k++ {
				student++
				first := firstNames[(student*7+si)%len(firstNames)]
				last := lastNames[(student*3+li*5)%len(lastNames)]
				dob := fmt.Sprintf("%d-%02d-%02d", d.BirthYear-li, 1+student%12, 1+student%28)
				id, err := ensure(ctx, tx,
					`SELECT id::text FROM students WHERE org_id = $1 AND admission_no = $2 AND deleted_at IS NULL`,
					`INSERT INTO students (org_id, admission_no, name, dob) VALUES ($1, $2, $3, $4::date) RETURNING id::text`, 2,
					org, fmt.Sprintf("%s%04d", d.Admission, student), first+" "+last, dob)
				if err != nil {
					return r, err
				}
				if _, err := tx.Exec(ctx, `
					INSERT INTO enrolments (org_id, student_id, section_id, year_id, roll_no) VALUES ($1, $2::uuid, $3::uuid, $4::uuid, $5)
					ON CONFLICT (student_id, year_id) WHERE deleted_at IS NULL DO NOTHING`,
					org, id, section, year, fmt.Sprint(k)); err != nil {
					return r, err
				}
				if group != "" && student%11 != 0 {
					if _, err := tx.Exec(ctx, `
						INSERT INTO student_subject_choices (org_id, student_id, year_id, group_id, subject_id, effective_from, source)
						SELECT $1, $2::uuid, $3::uuid, $4::uuid, $5::uuid, $6::date, 'manual'
						 WHERE NOT EXISTS (SELECT 1 FROM student_subject_choices WHERE student_id = $2::uuid AND group_id = $4::uuid)`,
						org, id, year, group, options[student%len(options)], d.Year.Start); err != nil {
						return r, err
					}
				}
				parent := []string{"Mother", "Father"}[student%2]
				if _, err := tx.Exec(ctx, `
					INSERT INTO guardians (org_id, student_id, name, relation, phone, is_primary)
					SELECT $1, $2::uuid, $3, $4, $5, NOT EXISTS (SELECT 1 FROM guardians WHERE student_id = $2::uuid AND is_primary AND deleted_at IS NULL)
					 WHERE NOT EXISTS (SELECT 1 FROM guardians WHERE student_id = $2::uuid AND lower(name) = lower($3) AND deleted_at IS NULL)`,
					org, id, firstNames[(student*5+3)%len(firstNames)]+" "+last, parent, fmt.Sprintf("+91 90000 %05d", student)); err != nil {
					return r, err
				}
			}
		}
	}

	err = tx.QueryRow(ctx, `
		SELECT (SELECT count(*) FROM sections WHERE org_id = $1 AND deleted_at IS NULL),
		       (SELECT count(*) FROM staff WHERE org_id = $1 AND deleted_at IS NULL),
		       (SELECT count(*) FROM students WHERE org_id = $1 AND deleted_at IS NULL),
		       (SELECT count(*) FROM teaching_assignments WHERE org_id = $1 AND deleted_at IS NULL),
		       (SELECT count(*) FROM guardians WHERE org_id = $1 AND deleted_at IS NULL),
		       (SELECT count(*) FROM student_subject_choices WHERE org_id = $1 AND effective_to IS NULL),
		       (SELECT count(*) FROM assessments WHERE org_id = $1 AND deleted_at IS NULL)`, org).
		Scan(&r.Sections, &r.Staff, &r.Students, &r.TeachingAssignments, &r.Guards, &r.Choices, &r.Assessments)
	return r, err
}

// unitTest is an open Mathematics test out of 40 for a level, so the marks
// grid has something to enter into; each section of the level joins it as
// the section is made.
func unitTest(ctx context.Context, tx pgx.Tx, org, year, term, level, subject string) error {
	id, err := ensure(ctx, tx,
		`SELECT id::text FROM assessments WHERE org_id = $1 AND period_id = $2::uuid AND level_id = $3::uuid AND subject_id = $4::uuid AND title = 'Unit test 1' AND deleted_at IS NULL`,
		`INSERT INTO assessments (org_id, period_id, level_id, subject_id, title, entry_mode, year_id) VALUES ($1, $2::uuid, $3::uuid, $4::uuid, 'Unit test 1', 'total', $5::uuid) RETURNING id::text`, 4,
		org, term, level, subject, year)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO assessment_parts (org_id, assessment_id, seq, name, max_marks) SELECT $1, $2::uuid, 1, 'Total', 40
		 WHERE NOT EXISTS (SELECT 1 FROM assessment_parts WHERE assessment_id = $2::uuid AND deleted_at IS NULL)`, org, id); err != nil {
		return err
	}
	return nil
}

// CreateOrg is the platform owner's step for a new client (blueprint Part
// 56.5): the organisation with its preset and a main branch, and an
// invitation for its first administrator, who signs in with that address.
// It returns the organisation and invitation ids.
func CreateOrg(ctx context.Context, owner *pgxpool.Pool, name, kind, adminEmail string) (string, string, error) {
	var orgID, invID string
	err := pgx.BeginFunc(ctx, owner, func(tx pgx.Tx) error {
		if err := tx.QueryRow(ctx, `INSERT INTO orgs (name, institution_type, preset) VALUES ($1, $2, $3) RETURNING id::text`, name, kind, kind).Scan(&orgID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO branches (org_id, name) VALUES ($1, $2)`, orgID, name); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `INSERT INTO invitations (org_id, email, role, invited_by) VALUES ($1, lower(btrim($2)), 'admin', 'platform') RETURNING id::text`, orgID, adminEmail).Scan(&invID); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO audit_log (org_id, action, entity, entity_id, after) VALUES ($1, 'create', 'orgs', $1, jsonb_build_object('name', $2::text, 'type', $3::text))`, orgID, name, kind)
		return err
	})
	return orgID, invID, err
}

// MarkSent records that the sign-in service emailed the invitation link.
func MarkSent(ctx context.Context, owner *pgxpool.Pool, invitationID string) error {
	_, err := owner.Exec(ctx, `UPDATE invitations SET sent = true WHERE id = $1::uuid`, invitationID)
	return err
}
