// Package server builds the Fiber app: middleware, error handling and every
// route. main starts it; tests (including the contract test) build the same
// app without a network listener.
package server

import (
	"log/slog"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/handlers"
	"github.com/jackymean-del/revu/internal/problem"
)

// New returns the app with every route registered. db may be nil when no
// database is configured; health then reports it as not connected.
func New(cfg config.Config, db handlers.Pinger) *fiber.App {
	app := fiber.New(fiber.Config{AppName: "revu " + cfg.Version, ErrorHandler: problem.Handler})
	app.Use(requestid.New())
	app.Use(logRequests)
	app.Use(recover.New())
	app.Use(cors.New(cors.Config{AllowOrigins: cfg.AllowedOrigins}))

	app.Get("/api/health", handlers.Health(db, cfg.Version))
	return app
}

// logRequests writes one structured line per request. An error is turned
// into its response after this returns, so the status comes from the error.
func logRequests(c fiber.Ctx) error {
	start := time.Now()
	err := c.Next()
	status := c.Response().StatusCode()
	if err != nil {
		status = problem.StatusOf(err)
	}
	slog.Info("request", "method", c.Method(), "path", c.Path(), "status", status,
		"ms", time.Since(start).Milliseconds(), "request_id", requestid.FromContext(c))
	return err
}
