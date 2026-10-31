// Package config reads the server configuration from the environment and
// checks it once at start-up, so a bad deploy fails loudly instead of later.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Port           int
	DatabaseURL    string // empty only in local runs without a database
	AllowedOrigins []string
	Version        string
	Production     bool
}

// Load reads the environment through getenv (os.Getenv in production, a map in tests).
func Load(getenv func(string) string) (Config, error) {
	c := Config{
		DatabaseURL: strings.TrimSpace(getenv("DATABASE_URL")),
		Version:     strings.TrimSpace(getenv("APP_VERSION")),
		Production:  getenv("APP_ENV") == "production",
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

	if c.Production && c.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required when APP_ENV=production")
	}
	return c, nil
}

// FromOS is Load over the real environment.
func FromOS() (Config, error) { return Load(os.Getenv) }
