package people

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth/policy"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/records"
	"github.com/jackymean-del/revu/internal/tenant"
	"golang.org/x/crypto/bcrypt"
)

// A family signs in for its child with a user name and a password. An
// administrator issues the sign-in: the user name is the field the
// institution chose, the first password is random and temporary, and a
// message for each contact waits to be sent by SMS or email, or handed over
// on paper. The temporary password is kept only as a hash, and in the
// waiting message until that is sent or handed over; the family must choose
// its own at the first sign-in.

// Sender delivers a message by SMS or email. It is nil until the
// institution's sending service is connected; messages wait until then.
type Sender interface {
	Send(ctx context.Context, channel, address, body string) error
}

const (
	passwordAlphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789" // nothing easily misread
	tempPasswordLen  = 10
	maxFailed        = 5
	lockFor          = 15 * time.Minute
	sessionFor       = 30 * 24 * time.Hour
)

// decoyHash is checked when no account has the user name, so a guess takes
// as long whether or not the name exists.
var decoyHash, _ = bcrypt.GenerateFromPassword([]byte("no such family"), bcrypt.DefaultCost)

func tempPassword() (string, error) {
	b := make([]byte, tempPasswordLen)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	for i := range b {
		b[i] = passwordAlphabet[int(b[i])%len(passwordAlphabet)]
	}
	return string(b), nil
}

func tokenHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

type family struct {
	sender Sender
	appURL string
}

// FamilyAccount is a student's family sign-in, as an administrator sees it.
type FamilyAccount struct {
	StudentID   string `json:"studentId"`
	Name        string `json:"name"`
	AdmissionNo string `json:"admissionNo"`
	Username    string `json:"username"`   // empty while none is issued
	State       string `json:"state"`      // none, issued (temporary password not yet changed), active
	LastSignIn  string `json:"lastSignIn"` // RFC 3339, or empty
	Contacts    int    `json:"contacts"`   // contacts with a phone or an email
}

func adminOnly(c fiber.Ctx) (pgx.Tx, error) {
	tx, err := tenant.Tx(c)
	if err != nil {
		return nil, err
	}
	actor, err := tenant.Teaching(c)
	if err != nil {
		return nil, err
	}
	return tx, policy.Check(actor, policy.StructureWrite, policy.Target{})
}

func (f family) list(c fiber.Ctx) error {
	tx, err := adminOnly(c)
	if err != nil {
		return err
	}
	section := c.Query("sectionId")
	if section != "" && !records.UUIDShape.MatchString(section) {
		return problem.Invalid(api.FieldError{Field: "sectionId", Code: "unknown", Message: "Not an id."})
	}
	rows, err := tx.Query(c.Context(), `
		SELECT s.id::text, s.name, s.admission_no, coalesce(a.username, ''),
		       CASE WHEN a.id IS NULL THEN 'none' WHEN a.must_change THEN 'issued' ELSE 'active' END,
		       coalesce(to_char(a.last_sign_in AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
		       (SELECT count(*) FROM guardians g WHERE g.student_id = s.id AND g.deleted_at IS NULL AND (coalesce(g.phone, '') <> '' OR coalesce(g.email, '') <> ''))::int
		  FROM students s LEFT JOIN family_accounts a ON a.student_id = s.id
		 WHERE s.deleted_at IS NULL AND s.status = 'active'
		   AND ($1 = '' OR EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = s.id AND e.section_id = nullif($1, '')::uuid AND e.deleted_at IS NULL))
		 ORDER BY lower(s.name), s.id LIMIT 2000`, section)
	if err != nil {
		return err
	}
	out, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (FamilyAccount, error) {
		var a FamilyAccount
		return a, r.Scan(&a.StudentID, &a.Name, &a.AdmissionNo, &a.Username, &a.State, &a.LastSignIn, &a.Contacts)
	})
	if err != nil {
		return err
	}
	if out == nil {
		out = []FamilyAccount{}
	}
	return c.JSON(out)
}

// Issued says what issuing did.
type Issued struct {
	Issued   int      `json:"issued"`   // sign-ins made or reset
	Messages int      `json:"messages"` // messages now waiting
	Skipped  []string `json:"skipped"`  // students left out, and why
}

// issue makes a sign-in for each student named (or every active student of
// a section) that has none, or resets it when asked: a fresh temporary
// password, and a message for each contact with a phone or an email. A
// student with no contact gets a paper slip instead.
func (f family) issue(c fiber.Ctx) error {
	tx, err := adminOnly(c)
	if err != nil {
		return err
	}
	ctx := c.Context()
	var in struct {
		SectionID  string   `json:"sectionId"`
		StudentIDs []string `json:"studentIds"`
		Reset      bool     `json:"reset"` // also those who already have one
	}
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if in.SectionID != "" && !records.UUIDShape.MatchString(in.SectionID) {
		return problem.Invalid(api.FieldError{Field: "sectionId", Code: "unknown", Message: "Not an id."})
	}
	for _, id := range in.StudentIDs {
		if !records.UUIDShape.MatchString(id) {
			return problem.Invalid(api.FieldError{Field: "studentIds", Code: "unknown", Message: "Not an id."})
		}
	}
	if in.SectionID == "" && len(in.StudentIDs) == 0 {
		return problem.Invalid(api.FieldError{Field: "sectionId", Code: "required", Message: "Choose a section, or students."})
	}
	settings, err := loadFields(ctx, tx)
	if err != nil {
		return err
	}
	m, _ := tenant.MemberFrom(c)
	var school string
	if err := tx.QueryRow(ctx, `SELECT coalesce((SELECT display_name FROM branding_versions ORDER BY version DESC LIMIT 1), (SELECT name FROM orgs WHERE id = app_org_id()))`).Scan(&school); err != nil {
		return err
	}
	type student struct {
		id, name, admissionNo, username string
		has                             bool
	}
	rows, err := tx.Query(ctx, `
		SELECT s.id::text, s.name, s.admission_no,
		       CASE WHEN $3 = 'admissionNo' THEN s.admission_no ELSE coalesce(s.details ->> $3, '') END,
		       EXISTS (SELECT 1 FROM family_accounts a WHERE a.student_id = s.id)
		  FROM students s
		 WHERE s.deleted_at IS NULL AND s.status = 'active'
		   AND (s.id = ANY($2::uuid[]) OR ($1 <> '' AND EXISTS (SELECT 1 FROM enrolments e WHERE e.student_id = s.id AND e.section_id = nullif($1, '')::uuid AND e.deleted_at IS NULL)))
		 ORDER BY lower(s.name)`, in.SectionID, in.StudentIDs, settings.UsernameField)
	if err != nil {
		return err
	}
	students, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (student, error) {
		var s student
		return s, r.Scan(&s.id, &s.name, &s.admissionNo, &s.username, &s.has)
	})
	if err != nil {
		return err
	}
	out := Issued{Skipped: []string{}}
	link := f.appURL + "/family?org=" + m.OrgID
	for _, s := range students {
		if s.has && !in.Reset {
			continue
		}
		if strings.TrimSpace(s.username) == "" {
			out.Skipped = append(out.Skipped, s.name+": the sign-in name field is empty")
			continue
		}
		pw, err := tempPassword()
		if err != nil {
			return err
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		var accountID string
		err = tx.QueryRow(ctx, `
			INSERT INTO family_accounts (org_id, student_id, username, password_hash, issued_by) VALUES ($1, $2::uuid, $3, $4, $5)
			ON CONFLICT (org_id, student_id) DO UPDATE SET username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, must_change = true,
			       failed = 0, locked_until = NULL, issued_at = now(), issued_by = EXCLUDED.issued_by, updated_at = now()
			RETURNING id::text`, m.OrgID, s.id, strings.TrimSpace(s.username), string(hash), m.UserID).Scan(&accountID)
		if err != nil {
			if strings.Contains(err.Error(), "family_accounts_username") {
				out.Skipped = append(out.Skipped, s.name+": another student already signs in as "+s.username)
				continue
			}
			return err
		}
		// A reset ends the sessions and the messages of the old password.
		if _, err := tx.Exec(ctx, `DELETE FROM family_sessions WHERE account_id = $1::uuid`, accountID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE family_messages SET status = 'replaced', body = '', done_at = now() WHERE student_id = $1::uuid AND status = 'ready'`, s.id); err != nil {
			return err
		}
		body := school + ": sign in for " + s.name + " at " + link + " . User name: " + strings.TrimSpace(s.username) + " . Temporary password: " + pw + " . You will be asked to choose your own password."
		tag, err := tx.Exec(ctx, `
			INSERT INTO family_messages (org_id, student_id, kind, channel, recipient, address, body, created_by)
			SELECT $1, $2::uuid, 'sign_in', x.channel, g.name, x.address, $3, $4
			  FROM guardians g
			 CROSS JOIN LATERAL (
			   SELECT 'sms' AS channel, g.phone AS address WHERE coalesce(g.phone, '') <> '' AND coalesce(g.channel, 'sms') <> 'email'
			   UNION ALL
			   SELECT 'email', g.email WHERE coalesce(g.email, '') <> '' AND (coalesce(g.channel, '') = 'email' OR coalesce(g.phone, '') = '')
			 ) x
			 WHERE g.student_id = $2::uuid AND g.deleted_at IS NULL`, m.OrgID, s.id, body, m.UserID)
		if err != nil {
			return err
		}
		n := int(tag.RowsAffected())
		if n == 0 {
			// Nobody to send it to: a slip to hand over.
			if _, err := tx.Exec(ctx, `INSERT INTO family_messages (org_id, student_id, kind, channel, recipient, body, created_by) VALUES ($1, $2::uuid, 'sign_in', 'paper', $3, $4, $5)`,
				m.OrgID, s.id, "Family of "+s.name, body, m.UserID); err != nil {
				return err
			}
			n = 1
		}
		out.Issued++
		out.Messages += n
	}
	if err := audit.Record(c, audit.Entry{Action: "issue", Entity: "family_accounts", After: map[string]any{"issued": out.Issued, "messages": out.Messages, "reset": in.Reset}}); err != nil {
		return err
	}
	return c.JSON(out)
}

// FamilyMessage is a message waiting to go to a family, or one that went.
type FamilyMessage struct {
	ID        string `json:"id"`
	Student   string `json:"student"`
	Channel   string `json:"channel"`
	Recipient string `json:"recipient"`
	Address   string `json:"address"`
	Body      string `json:"body"` // empty once sent or handed over
	Status    string `json:"status"`
	Error     string `json:"error"`
}

// Outbox is the messages waiting, and whether a sending service is connected.
type Outbox struct {
	CanSend  bool            `json:"canSend"`
	Messages []FamilyMessage `json:"messages"`
}

func (f family) outbox(c fiber.Ctx) error {
	tx, err := adminOnly(c)
	if err != nil {
		return err
	}
	rows, err := tx.Query(c.Context(), `
		SELECT m.id::text, s.name, m.channel, m.recipient, m.address, m.body, m.status, m.error
		  FROM family_messages m JOIN students s ON s.id = m.student_id
		 WHERE m.status IN ('ready', 'failed') ORDER BY lower(s.name), m.created_at LIMIT 2000`)
	if err != nil {
		return err
	}
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (FamilyMessage, error) {
		var m FamilyMessage
		return m, r.Scan(&m.ID, &m.Student, &m.Channel, &m.Recipient, &m.Address, &m.Body, &m.Status, &m.Error)
	})
	if err != nil {
		return err
	}
	if list == nil {
		list = []FamilyMessage{}
	}
	return c.JSON(Outbox{CanSend: f.sender != nil, Messages: list})
}

// send delivers every waiting SMS and email through the sending service,
// wiping each one's text as it goes. Paper slips are left to be handed over.
func (f family) send(c fiber.Ctx) error {
	tx, err := adminOnly(c)
	if err != nil {
		return err
	}
	if f.sender == nil {
		return problem.New(http.StatusConflict, "messages.no_sender", "No sending service is connected yet. Print the slips and hand them over, or connect an SMS and email service.")
	}
	ctx := c.Context()
	rows, err := tx.Query(ctx, `SELECT id::text, channel, address, body FROM family_messages WHERE status IN ('ready', 'failed') AND channel <> 'paper' AND body <> '' ORDER BY created_at LIMIT 500`)
	if err != nil {
		return err
	}
	type msg struct{ id, channel, address, body string }
	list, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (msg, error) {
		var m msg
		return m, r.Scan(&m.id, &m.channel, &m.address, &m.body)
	})
	if err != nil {
		return err
	}
	sent, failed := 0, 0
	for _, m := range list {
		if err := f.sender.Send(ctx, m.channel, m.address, m.body); err != nil {
			failed++
			if _, err := tx.Exec(ctx, `UPDATE family_messages SET status = 'failed', error = left($2, 300) WHERE id = $1::uuid`, m.id, err.Error()); err != nil {
				return err
			}
			continue
		}
		sent++
		if _, err := tx.Exec(ctx, `UPDATE family_messages SET status = 'sent', body = '', error = '', done_at = now() WHERE id = $1::uuid`, m.id); err != nil {
			return err
		}
	}
	if err := audit.Record(c, audit.Entry{Action: "send", Entity: "family_messages", After: map[string]int{"sent": sent, "failed": failed}}); err != nil {
		return err
	}
	return c.JSON(map[string]int{"sent": sent, "failed": failed})
}

// handed marks waiting messages as handed over on paper, and wipes their text.
func (f family) handed(c fiber.Ctx) error {
	tx, err := adminOnly(c)
	if err != nil {
		return err
	}
	var in struct {
		IDs []string `json:"ids"` // empty means every waiting message
	}
	_ = httpx.Decode(c, &in)
	if in.IDs == nil {
		in.IDs = []string{} // none named: every waiting message
	}
	for _, id := range in.IDs {
		if !records.UUIDShape.MatchString(id) {
			return problem.Invalid(api.FieldError{Field: "ids", Code: "unknown", Message: "Not an id."})
		}
	}
	tag, err := tx.Exec(c.Context(), `UPDATE family_messages SET status = 'handed', body = '', done_at = now() WHERE status IN ('ready', 'failed') AND (cardinality($1::uuid[]) = 0 OR id = ANY($1::uuid[]))`, in.IDs)
	if err != nil {
		return err
	}
	if err := audit.Record(c, audit.Entry{Action: "hand_over", Entity: "family_messages", After: map[string]int64{"messages": tag.RowsAffected()}}); err != nil {
		return err
	}
	return c.JSON(map[string]int64{"handed": tag.RowsAffected()})
}

// ---- What a family does itself, with no staff sign-in.

// FamilyPublic serves a family's own sign-in. Each request names its
// institution and runs inside it alone.
func FamilyPublic(g fiber.Router, pool *pgxpool.Pool) {
	p := familyPublic{pool: pool}
	g.Post("/family/sign-in", p.signIn)
	g.Post("/family/password", p.password)
	g.Get("/family/me", p.me)
	g.Post("/family/sign-out", p.signOut)
}

type familyPublic struct{ pool *pgxpool.Pool }

var errFamily = problem.New(http.StatusUnauthorized, "family.sign_in", "That user name and password do not match. Check them and try again.")

// in runs work inside one institution, committing when it succeeds.
func (p familyPublic) in(c fiber.Ctx, orgID string, work func(ctx context.Context, tx pgx.Tx) error) error {
	if p.pool == nil {
		return problem.New(http.StatusServiceUnavailable, "db.unavailable", "The database is not connected.")
	}
	if !records.UUIDShape.MatchString(orgID) {
		return errFamily
	}
	ctx := c.Context()
	return pgx.BeginFunc(ctx, p.pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT set_config('app.org_id', $1, true)`, orgID); err != nil {
			return err
		}
		return work(ctx, tx)
	})
}

// FamilySession is what a signed-in family knows of itself.
type FamilySession struct {
	Token      string `json:"token,omitempty"`
	MustChange bool   `json:"mustChange"`
	Student    string `json:"student"`
	Placement  string `json:"placement"`
	School     string `json:"school"`
}

const sessionOf = `
	SELECT a.id::text, a.must_change, s.name,
	       coalesce((SELECT l.name || ' ' || x.name FROM enrolments e JOIN sections x ON x.id = e.section_id JOIN levels l ON l.id = x.level_id JOIN academic_years y ON y.id = e.year_id
	                  WHERE e.student_id = s.id AND e.deleted_at IS NULL ORDER BY y.starts_on DESC LIMIT 1), ''),
	       coalesce((SELECT display_name FROM branding_versions ORDER BY version DESC LIMIT 1), (SELECT name FROM orgs WHERE id = app_org_id()))
	  FROM family_accounts a JOIN students s ON s.id = a.student_id`

func (p familyPublic) signIn(c fiber.Ctx) error {
	var in struct {
		OrgID    string `json:"orgId"`
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	var out FamilySession
	// A wrong password is counted even though the request fails, so the
	// count is written in its own transaction first.
	var fail error
	err := p.in(c, in.OrgID, func(ctx context.Context, tx pgx.Tx) error {
		var id, hash string
		var locked *time.Time
		err := tx.QueryRow(ctx, `SELECT id::text, password_hash, locked_until FROM family_accounts WHERE lower(username) = lower(btrim($1))`, in.Username).Scan(&id, &hash, &locked)
		if errors.Is(err, pgx.ErrNoRows) {
			// Spend the same time as a real check, so a guess learns nothing.
			_ = bcrypt.CompareHashAndPassword(decoyHash, []byte(in.Password))
			fail = errFamily
			return nil
		}
		if err != nil {
			return err
		}
		if locked != nil && locked.After(time.Now()) {
			fail = problem.New(http.StatusTooManyRequests, "family.locked", "Too many wrong passwords. Try again in 15 minutes, or ask the office for a new password.")
			return nil
		}
		if bcrypt.CompareHashAndPassword([]byte(hash), []byte(in.Password)) != nil {
			_, err := tx.Exec(ctx, `UPDATE family_accounts SET failed = failed + 1, locked_until = CASE WHEN failed + 1 >= $2 THEN now() + make_interval(secs => $3) ELSE NULL END,
				updated_at = now() WHERE id = $1::uuid`, id, maxFailed, lockFor.Seconds())
			fail = errFamily
			return err
		}
		raw := make([]byte, 32)
		if _, err := rand.Read(raw); err != nil {
			return err
		}
		out.Token = hex.EncodeToString(raw)
		if _, err := tx.Exec(ctx, `INSERT INTO family_sessions (org_id, account_id, token_hash, expires_at) VALUES ($1::uuid, $2::uuid, $3, now() + make_interval(secs => $4))`,
			in.OrgID, id, tokenHash(out.Token), sessionFor.Seconds()); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE family_accounts SET failed = 0, locked_until = NULL, last_sign_in = now() WHERE id = $1::uuid`, id); err != nil {
			return err
		}
		var account string
		return tx.QueryRow(ctx, sessionOf+` WHERE a.id = $1::uuid`, id).Scan(&account, &out.MustChange, &out.Student, &out.Placement, &out.School)
	})
	if err != nil {
		return err
	}
	if fail != nil {
		return fail
	}
	return c.JSON(out)
}

// session finds the family behind the request's token, inside its institution.
func (p familyPublic) session(c fiber.Ctx, work func(ctx context.Context, tx pgx.Tx, accountID string, s FamilySession) error) error {
	token := strings.TrimPrefix(c.Get(fiber.HeaderAuthorization), "Bearer ")
	orgID := c.Get("X-Org-Id")
	denied := problem.New(http.StatusUnauthorized, "family.session", "Sign in again.")
	if len(token) != 64 || !records.UUIDShape.MatchString(orgID) {
		return denied
	}
	var fail error
	err := p.in(c, orgID, func(ctx context.Context, tx pgx.Tx) error {
		var s FamilySession
		var id string
		err := tx.QueryRow(ctx, sessionOf+` JOIN family_sessions x ON x.account_id = a.id WHERE x.token_hash = $1 AND x.expires_at > now()`, tokenHash(token)).
			Scan(&id, &s.MustChange, &s.Student, &s.Placement, &s.School)
		if errors.Is(err, pgx.ErrNoRows) {
			fail = denied
			return nil
		}
		if err != nil {
			return err
		}
		return work(ctx, tx, id, s)
	})
	if err != nil {
		return err
	}
	return fail
}

func (p familyPublic) me(c fiber.Ctx) error {
	var out FamilySession
	if err := p.session(c, func(_ context.Context, _ pgx.Tx, _ string, s FamilySession) error {
		out = s
		return nil
	}); err != nil {
		return err
	}
	return c.JSON(out)
}

// password sets the family's own password, which ends the temporary one.
func (p familyPublic) password(c fiber.Ctx) error {
	var in struct {
		Password string `json:"password"`
	}
	if err := httpx.Decode(c, &in); err != nil {
		return err
	}
	if len(in.Password) < 8 || len(in.Password) > 72 {
		return problem.Invalid(api.FieldError{Field: "password", Code: "length", Message: "Choose a password of 8 to 72 characters."})
	}
	var out FamilySession
	token := strings.TrimPrefix(c.Get(fiber.HeaderAuthorization), "Bearer ")
	if err := p.session(c, func(ctx context.Context, tx pgx.Tx, id string, s FamilySession) error {
		hash, err := bcrypt.GenerateFromPassword([]byte(in.Password), bcrypt.DefaultCost)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `UPDATE family_accounts SET password_hash = $2, must_change = false, updated_at = now() WHERE id = $1::uuid`, id, string(hash)); err != nil {
			return err
		}
		// Every other session ends; this one stays.
		if _, err := tx.Exec(ctx, `DELETE FROM family_sessions WHERE account_id = $1::uuid AND token_hash <> $2`, id, tokenHash(token)); err != nil {
			return err
		}
		// The temporary password no longer works, so its messages need not wait.
		if _, err := tx.Exec(ctx, `UPDATE family_messages SET status = 'replaced', body = '', done_at = now()
			WHERE status IN ('ready', 'failed') AND student_id = (SELECT student_id FROM family_accounts WHERE id = $1::uuid)`, id); err != nil {
			return err
		}
		out = s
		out.MustChange = false
		return nil
	}); err != nil {
		return err
	}
	return c.JSON(out)
}

func (p familyPublic) signOut(c fiber.Ctx) error {
	token := strings.TrimPrefix(c.Get(fiber.HeaderAuthorization), "Bearer ")
	if err := p.session(c, func(ctx context.Context, tx pgx.Tx, _ string, _ FamilySession) error {
		_, err := tx.Exec(ctx, `DELETE FROM family_sessions WHERE token_hash = $1`, tokenHash(token))
		return err
	}); err != nil {
		return err
	}
	return c.SendStatus(http.StatusNoContent)
}
