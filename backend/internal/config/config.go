// Package config reads the server configuration from the environment and
// checks it once at start-up, so a bad deploy fails loudly instead of later.
package config

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port           int
	DatabaseURL    string // as revu_app; empty only in local runs without a database
	MigrateURL     string // as the owner role; when set, migrations run at start
	AppDBPassword  string // set as revu_app's password at start, with MigrateURL
	MigrationsDir  string
	AllowedOrigins []string
	Version        string
	Production     bool
	DevUserID      string // local only: signs every request in as this user
	ClerkSecretKey string // verifies sign-in tokens; required in production
	ClerkWebhook   string // signing secret of the Clerk webhook endpoint (whsec_...)
	AppURL         string // where invitation links land; defaults to the first allowed origin
}

// Load reads the environment through getenv (os.Getenv in production, a map in tests).
func Load(getenv func(string) string) (Config, error) {
	c := Config{
		DatabaseURL:    strings.TrimSpace(getenv("DATABASE_URL")),
		MigrateURL:     strings.TrimSpace(getenv("MIGRATE_DATABASE_URL")),
		AppDBPassword:  getenv("APP_DB_PASSWORD"),
		MigrationsDir:  strings.TrimSpace(getenv("MIGRATIONS_DIR")),
		Version:        strings.TrimSpace(getenv("APP_VERSION")),
		Production:     getenv("APP_ENV") == "production",
		DevUserID:      strings.TrimSpace(getenv("DEV_USER_ID")),
		ClerkSecretKey: strings.TrimSpace(getenv("CLERK_SECRET_KEY")),
		ClerkWebhook:   strings.TrimSpace(getenv("CLERK_WEBHOOK_SECRET")),
	}
	if c.MigrationsDir == "" {
		c.MigrationsDir = "../database/migrations" // go run from backend/
	}
	if c.Version == "" {
		c.Version = "dev"
	}

	port := strings.TrimSpace(getenv("PORT"))
	if port == "" {
		port = "8080"
	}
	p, err := strconv.Atoi(port)
	if err != nil || p < 1 || p > 65535 {
		return Config{}, fmt.Errorf("PORT %q is not a valid port", port)
	}
	c.Port = p

	for _, o := range strings.Split(getenv("ALLOWED_ORIGINS"), ",") {
		if o = strings.TrimSpace(o); o != "" {
			c.AllowedOrigins = append(c.AllowedOrigins, o)
		}
	}
	if len(c.AllowedOrigins) == 0 {
		c.AllowedOrigins = []string{"http://localhost:5173"}
	}

	c.AppURL = strings.TrimRight(strings.TrimSpace(getenv("APP_URL")), "/")
	if c.AppURL == "" {
		c.AppURL = c.AllowedOrigins[0]
	}

	// Without DATABASE_URL, the app account is the owner's address signed in
	// as revu_app with APP_DB_PASSWORD, so a host needs one address only.
	if c.DatabaseURL == "" && c.MigrateURL != "" && c.AppDBPassword != "" {
		u, err := url.Parse(c.MigrateURL)
		if err != nil || u.Host == "" {
			return Config{}, fmt.Errorf("MIGRATE_DATABASE_URL is not a database address")
		}
		u.User = url.UserPassword("revu_app", c.AppDBPassword)
		c.DatabaseURL = u.String()
	}

	if c.Production && c.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required when APP_ENV=production")
	}
	if c.Production && c.ClerkSecretKey == "" {
		return Config{}, fmt.Errorf("CLERK_SECRET_KEY is required when APP_ENV=production: nobody could sign in")
	}
	if c.Production && c.DevUserID != "" {
		return Config{}, fmt.Errorf("DEV_USER_ID signs everyone in as one person and is refused when APP_ENV=production")
	}
	if c.MigrateURL != "" && c.MigrateURL == c.DatabaseURL {
		return Config{}, fmt.Errorf("DATABASE_URL must connect as revu_app, not as the owner in MIGRATE_DATABASE_URL")
	}
	if c.MigrateURL != "" && len(c.AppDBPassword) < 12 {
		return Config{}, fmt.Errorf("APP_DB_PASSWORD must be at least 12 characters when MIGRATE_DATABASE_URL is set")
	}
	return c, nil
}

// FromOS is Load over the real environment.
func FromOS() (Config, error) { return Load(os.Getenv) }
