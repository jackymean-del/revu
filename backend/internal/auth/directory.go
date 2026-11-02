package auth

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/invitation"
	"github.com/clerk/clerk-sdk-go/v2/user"
)

// Directory is what revU asks the sign-in service about people: the
// addresses a person has verified (to claim invitations), and to email an
// invitation link. revU never sends passwords (blueprint Part 56.5).
type Directory interface {
	VerifiedEmails(ctx context.Context, userID string) ([]string, error)
	Invite(ctx context.Context, email, redirectURL string) error
}

// ClerkDirectory talks to the Clerk backend API with the secret key.
// Verified addresses are cached for a few minutes, so a page load does not
// ask Clerk every time.
type ClerkDirectory struct {
	users   *user.Client
	invites *invitation.Client

	mu    sync.Mutex
	cache map[string]cachedEmails
}

type cachedEmails struct {
	emails []string
	until  time.Time
}

const emailCacheFor = 5 * time.Minute

// NewClerkDirectory uses secretKey for the backend API.
func NewClerkDirectory(secretKey string) *ClerkDirectory {
	cfg := &clerk.ClientConfig{BackendConfig: clerk.BackendConfig{Key: &secretKey}}
	return &ClerkDirectory{users: user.NewClient(cfg), invites: invitation.NewClient(cfg), cache: map[string]cachedEmails{}}
}

// VerifiedEmails returns the person's verified addresses, lower case.
func (d *ClerkDirectory) VerifiedEmails(ctx context.Context, userID string) ([]string, error) {
	d.mu.Lock()
	c, ok := d.cache[userID]
	d.mu.Unlock()
	if ok && time.Now().Before(c.until) {
		return c.emails, nil
	}
	u, err := d.users.Get(ctx, userID)
	if err != nil {
		return nil, err
	}
	var emails []string
	for _, e := range u.EmailAddresses {
		if e != nil && e.Verification != nil && e.Verification.Status == "verified" {
			emails = append(emails, strings.ToLower(strings.TrimSpace(e.EmailAddress)))
		}
	}
	d.mu.Lock()
	d.cache[userID] = cachedEmails{emails: emails, until: time.Now().Add(emailCacheFor)}
	d.mu.Unlock()
	return emails, nil
}

// Invite asks Clerk to email a sign-up link. Someone who already has an
// account gets no email; they simply sign in and the invitation is claimed.
func (d *ClerkDirectory) Invite(ctx context.Context, email, redirectURL string) error {
	params := &invitation.CreateParams{
		EmailAddress:   email,
		Notify:         clerk.Bool(true),
		IgnoreExisting: clerk.Bool(true),
	}
	if redirectURL != "" {
		params.RedirectURL = clerk.String(redirectURL)
	}
	_, err := d.invites.Create(ctx, params)
	return err
}
