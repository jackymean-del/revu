package auth

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/go-jose/go-jose/v3"
	josejwt "github.com/go-jose/go-jose/v3/jwt"
	"github.com/gofiber/fiber/v3"
)

const app = "https://app.revu.bhusku.com"

var now = time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)

type claims struct {
	Issuer    string `json:"iss,omitempty"`
	Subject   string `json:"sub,omitempty"`
	Party     string `json:"azp,omitempty"`
	Expiry    int64  `json:"exp,omitempty"`
	NotBefore int64  `json:"nbf,omitempty"`
	IssuedAt  int64  `json:"iat,omitempty"`
}

func token(t *testing.T, key *rsa.PrivateKey, kid string, c claims) string {
	t.Helper()
	signer, err := jose.NewSigner(jose.SigningKey{Algorithm: jose.RS256, Key: key}, (&jose.SignerOptions{}).WithHeader("kid", kid).WithType("JWT"))
	if err != nil {
		t.Fatal(err)
	}
	s, err := josejwt.Signed(signer).Claims(c).CompactSerialize()
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func TestClerkVerifiesSessionTokens(t *testing.T) {
	key, _ := rsa.GenerateKey(rand.Reader, 2048)
	forger, _ := rsa.GenerateKey(rand.Reader, 2048)
	fetches := 0
	k := &Clerk{
		origins: []string{app},
		keyFor: func(_ context.Context, kid string) (*clerk.JSONWebKey, error) {
			fetches++
			return &clerk.JSONWebKey{Key: &key.PublicKey, KeyID: kid, Algorithm: "RS256"}, nil
		},
		now:  func() time.Time { return now },
		keys: map[string]*clerk.JSONWebKey{},
	}
	good := claims{Issuer: "https://measured-catfish-61.clerk.accounts.dev", Subject: "user_123", Party: app,
		IssuedAt: now.Add(-time.Minute).Unix(), NotBefore: now.Add(-time.Minute).Unix(), Expiry: now.Add(time.Minute).Unix()}
	with := func(f func(*claims)) claims { c := good; f(&c); return c }

	cases := []struct {
		name   string
		header string
		want   string
	}{
		{"a valid session signs the person in", "Bearer " + token(t, key, "ins_1", good), "user_123"},
		{"an expired session is refused", "Bearer " + token(t, key, "ins_1", with(func(c *claims) { c.Expiry = now.Add(-time.Minute).Unix() })), ""},
		{"a token issued for another site is refused", "Bearer " + token(t, key, "ins_1", with(func(c *claims) { c.Party = "https://evil.example" })), ""},
		{"a token from another issuer is refused", "Bearer " + token(t, key, "ins_1", with(func(c *claims) { c.Issuer = "https://example.com" })), ""},
		{"a forged signature is refused", "Bearer " + token(t, forger, "ins_1", good), ""},
		{"a token with no user is refused", "Bearer " + token(t, key, "ins_1", with(func(c *claims) { c.Subject = "" })), ""},
		{"no token is refused", "", ""},
		{"a token that is not a JWT is refused", "Bearer not-a-token", ""},
	}
	f := fiber.New()
	f.Get("/", func(c fiber.Ctx) error {
		user, err := k.UserID(c)
		if err != nil {
			return c.SendString("refused")
		}
		return c.SendString(user)
	})
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest("GET", "/", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			res, err := f.Test(req)
			if err != nil {
				t.Fatal(err)
			}
			body := make([]byte, 64)
			n, _ := res.Body.Read(body)
			got := string(body[:n])
			want := tc.want
			if want == "" {
				want = "refused"
			}
			if got != want {
				t.Fatalf("got %q, want %q", got, want)
			}
		})
	}
	if fetches != 1 {
		t.Fatalf("signing key fetched %d times for one key id, want once", fetches)
	}
}
