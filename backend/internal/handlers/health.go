// Package handlers holds the HTTP handlers. Feature modules (org, people,
// assessment, ...) bring their own handler files from v1 onward.
package handlers

import (
	"context"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/api"
)

// Pinger is the part of the database pool the health check needs.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Health answers whether the server is up and whether the database answers.
// The server being up is enough for a 200; the database state is reported in
// the body so the uptime check and the app can tell the two apart.
func Health(db Pinger, version string) fiber.Handler {
	return func(c fiber.Ctx) error {
		ok := false
		if db != nil {
			ctx, cancel := context.WithTimeout(c.Context(), 2*time.Second)
			defer cancel()
			ok = db.Ping(ctx) == nil
		}
		return c.JSON(api.Health{Status: api.HealthOk, Database: ok, Version: version})
	}
}
