package auth

import (
	"context"
	"errors"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/jwks"
	"github.com/clerk/clerk-sdk-go/v2/jwt"
	"github.com/gofiber/fiber/v3"
)

// Clerk verifies the session token the app sends as "Authorization: Bearer"
// against the Clerk instance shared with schedU. Only the user id is taken
// from it: organisation and role come from revU's own memberships.
type Clerk struct {
	origins []string // the app's own origins; a token issued for any other is refused
	keyFor  func(ctx context.Context, kid string) (*clerk.JSONWebKey, error)
	now     func() time.Time

	mu   sync.Mutex
	keys map[string]*clerk.JSONWebKey
}

// NewClerk uses secretKey to fetch the instance's signing keys, once per key.
func NewClerk(secretKey string, appOrigins []string) *Clerk {
	client := jwks.NewClient(&clerk.ClientConfig{BackendConfig: clerk.BackendConfig{Key: &secretKey}})
	return &Clerk{
		origins: appOrigins,
		keyFor: func(ctx context.Context, kid string) (*clerk.JSONWebKey, error) {
			return jwt.GetJSONWebKey(ctx, &jwt.GetJSONWebKeyParams{KeyID: kid, JWKSClient: client})
		},
		now:  time.Now,
		keys: map[string]*clerk.JSONWebKey{},
	}
}

// UserID returns the verified Clerk user id, or 401 auth.required.
func (k *Clerk) UserID(c fiber.Ctx) (string, error) {
	token, ok := strings.CutPrefix(c.Get(fiber.HeaderAuthorization), "Bearer ")
	if !ok || token == "" {
		return "", ErrSignIn
	}
	claims, err := k.verify(c.Context(), token)
	if err != nil || claims.Subject == "" {
		return "", ErrSignIn
	}
	return claims.Subject, nil
}

func (k *Clerk) verify(ctx context.Context, token string) (*clerk.SessionClaims, error) {
	decoded, err := jwt.Decode(ctx, &jwt.DecodeParams{Token: token})
	if err != nil {
		return nil, err
	}
	key, err := k.key(ctx, decoded.KeyID)
	if err != nil {
		return nil, err
	}
	return jwt.Verify(ctx, &jwt.VerifyParams{
		Token:  token,
		JWK:    key,
		Leeway: 5 * time.Second,
		Clock:  clock{k.now},
		// Tokens name the page that asked for them; only revU's app may use them here.
		AuthorizedPartyHandler: func(azp string) bool { return azp == "" || slices.Contains(k.origins, azp) },
	})
}

// key returns the signing key for kid, asking Clerk only for one it has not
// seen, so verifying a request normally needs no network call.
func (k *Clerk) key(ctx context.Context, kid string) (*clerk.JSONWebKey, error) {
	if kid == "" {
		return nil, errors.New("clerk: token has no key id")
	}
	k.mu.Lock()
	cached := k.keys[kid]
	k.mu.Unlock()
	if cached != nil {
		return cached, nil
	}
	key, err := k.keyFor(ctx, kid)
	if err != nil {
		return nil, err
	}
	k.mu.Lock()
	k.keys[kid] = key
	k.mu.Unlock()
	return key, nil
}

type clock struct{ now func() time.Time }

func (c clock) Now() time.Time { return c.now() }
