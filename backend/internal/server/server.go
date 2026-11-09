// Package server builds the Fiber app: middleware, error handling and every
// route. main starts it; tests (including the contract test) build the same
// app without a network listener.
package server

import (
	"log/slog"
	"net/http"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackymean-del/revu/internal/analysis"
	"github.com/jackymean-del/revu/internal/assessment"
	"github.com/jackymean-del/revu/internal/audit"
	"github.com/jackymean-del/revu/internal/auth"
	"github.com/jackymean-del/revu/internal/choices"
	"github.com/jackymean-del/revu/internal/clerksync"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/dashboard"
	"github.com/jackymean-del/revu/internal/evidence"
	"github.com/jackymean-del/revu/internal/handlers"
	"github.com/jackymean-del/revu/internal/layout"
	"github.com/jackymean-del/revu/internal/org"
	"github.com/jackymean-del/revu/internal/people"
	"github.com/jackymean-del/revu/internal/platform"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/reports"
	"github.com/jackymean-del/revu/internal/results"
	"github.com/jackymean-del/revu/internal/schemes"
	"github.com/jackymean-del/revu/internal/setup"
	"github.com/jackymean-del/revu/internal/structure"
	"github.com/jackymean-del/revu/internal/tables"
	"github.com/jackymean-del/revu/internal/tenant"
	"github.com/jackymean-del/revu/internal/terminology"
)

// Deps are what the routes need from outside.
type Deps struct {
	DB   *pgxpool.Pool      // nil when no database is configured
	Auth auth.Authenticator // who is signed in; nil means nobody
	Now  func() time.Time   // nil means time.Now; tests set a fixed clock
	// Directory asks the sign-in service for verified emails and sends
	// invitation links; nil when sign-in is not configured.
	Directory auth.Directory
	// Owner is the database owner account, for the platform owner's console
	// and group pages only, which read across institutions by counts. nil
	// when no MIGRATE_DATABASE_URL is set; those pages then answer 503.
	Owner *pgxpool.Pool
}

// New returns the app with every route registered. Without a database,
// health reports it as not connected and /v1 answers 503.
func New(cfg config.Config, d Deps) *fiber.App {
	if d.Auth == nil {
		d.Auth = auth.SignedOut()
	}
	if d.Now == nil {
		d.Now = time.Now
	}
	var pinger handlers.Pinger
	if d.DB != nil {
		pinger = d.DB
	}

	app := fiber.New(fiber.Config{AppName: "revu " + cfg.Version, ErrorHandler: problem.Handler, BodyLimit: 6 << 20})
	app.Use(requestid.New())
	app.Use(logRequests)
	app.Use(recover.New())
	app.Use(cors.New(cors.Config{
		AllowOrigins:  cfg.AllowedOrigins,
		AllowMethods:  []string{"GET", "POST", "PUT", "PATCH", "DELETE"},
		AllowHeaders:  []string{"Authorization", "Content-Type", "If-Match", "Idempotency-Key", auth.OrgHeader, tenant.ViewAsHeader},
		ExposeHeaders: []string{fiber.HeaderXRequestID},
		MaxAge:        300,
	}))

	app.Get("/api/health", handlers.Health(pinger, cfg.Version))

	v1 := app.Group("/v1")
	if d.DB == nil {
		v1.Use(func(fiber.Ctx) error {
			return problem.New(http.StatusServiceUnavailable, "db.unavailable", "The database is not connected.")
		})
	}
	// Routes outside any one organisation come first: the tenant middleware
	// below applies to every /v1 route registered after it.
	owner := platform.Options{Owner: d.Owner, Auth: d.Auth, Directory: d.Directory, Owners: cfg.PlatformOwners, AppURL: cfg.AppURL}
	v1.Get("/me", org.Me(d.DB, owner))
	platform.Routes(v1, owner)
	v1.Post("/webhooks/clerk", clerksync.Handler(d.DB, cfg.ClerkWebhook, d.Now))
	// Everything below acts inside one organisation.
	inOrg := v1.Group("", tenant.Middleware(d.DB, auth.Identify(d.Auth)))
	terminology.Routes(inOrg)
	structure.Routes(inOrg)
	people.Routes(inOrg, people.Options{Directory: d.Directory, AppURL: cfg.AppURL})
	setup.Routes(inOrg)
	dashboard.Routes(inOrg)
	choices.Routes(inOrg)
	assessment.Routes(inOrg)
	evidence.Routes(inOrg)
	layout.Routes(inOrg)
	schemes.Routes(inOrg)
	results.Routes(inOrg)
	analysis.Routes(inOrg, d.Now)
	reports.Routes(inOrg, reports.Options{Renderer: reports.Renderer{URL: cfg.GotenbergURL}, AppURL: cfg.AppURL, Now: d.Now})
	tables.Routes(inOrg)
	audit.Routes(inOrg)
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
