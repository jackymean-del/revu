// revU API server.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/auth"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db"
	"github.com/jackymean-del/revu/internal/seed"
	"github.com/jackymean-del/revu/internal/server"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})))

	cfg, err := config.FromOS()
	if err != nil {
		slog.Error("invalid configuration", "err", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// "server migrate" applies migrations and exits (make migrate, deploy
	// hooks); "server seed" also creates the demo organisations for
	// DEV_USER_ID; plain "server" migrates too when MIGRATE_DATABASE_URL is set.
	command := ""
	if len(os.Args) > 1 {
		command = os.Args[1]
	}
	migrateOnly := command == "migrate" || command == "seed" || command == "create-org"
	if cfg.MigrateURL != "" {
		if err := migrate(ctx, cfg); err != nil {
			slog.Error("migrations failed", "err", err)
			os.Exit(1)
		}
	} else if migrateOnly {
		slog.Error("MIGRATE_DATABASE_URL is not set")
		os.Exit(1)
	}
	if command == "create-org" {
		if err := createOrg(ctx, cfg, os.Args[2:]); err != nil {
			slog.Error("create-org failed", "err", err)
			os.Exit(1)
		}
	}
	if command == "seed" {
		if err := seedDemo(ctx, cfg); err != nil {
			slog.Error("seed failed", "err", err)
			os.Exit(1)
		}
	}
	if migrateOnly {
		return
	}

	deps := server.Deps{}
	switch {
	case cfg.ClerkSecretKey != "":
		deps.Auth = auth.NewClerk(cfg.ClerkSecretKey, cfg.AllowedOrigins)
		deps.Directory = auth.NewClerkDirectory(cfg.ClerkSecretKey)
		if cfg.DevUserID != "" {
			slog.Warn("DEV_USER_ID is ignored: Clerk sign-in is on")
		}
	case cfg.DevUserID != "":
		slog.Warn("development sign-in: every request is signed in as DEV_USER_ID", "user", cfg.DevUserID)
		deps.Auth = auth.Dev(cfg.DevUserID)
	default:
		slog.Warn("no CLERK_SECRET_KEY: nobody can sign in")
	}
	if cfg.DatabaseURL == "" {
		slog.Warn("DATABASE_URL not set; running without a database")
	} else {
		pool, err := db.Connect(ctx, cfg.DatabaseURL)
		if err != nil {
			slog.Error("database pool", "err", err)
			os.Exit(1)
		}
		defer pool.Close()
		deps.DB = pool
		// Row-level security only protects tenants if the server's role is
		// fenced in. In production that is a hard stop.
		if err := db.CheckAppRole(ctx, pool); err != nil {
			if cfg.Production {
				slog.Error("unsafe database role", "err", err)
				os.Exit(1)
			}
			slog.Warn("unsafe database role (allowed outside production)", "err", err)
		}
	}

	// The platform owner's pages read across institutions, by counts only,
	// through the owner account; nothing else uses this pool.
	if cfg.MigrateURL != "" {
		owner, err := db.Connect(ctx, cfg.MigrateURL)
		if err != nil {
			slog.Error("owner pool", "err", err)
			os.Exit(1)
		}
		defer owner.Close()
		deps.Owner = owner
	}

	app := server.New(cfg, deps)
	go func() {
		<-ctx.Done()
		_ = app.ShutdownWithTimeout(10 * time.Second)
	}()
	addr := fmt.Sprintf(":%d", cfg.Port)
	slog.Info("revu api listening", "addr", addr, "version", cfg.Version)
	if err := app.Listen(addr, fiber.ListenConfig{DisableStartupMessage: true}); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

// migrate applies pending migrations as the owner and sets the application
// role's password, so the app pool can log in.
func migrate(ctx context.Context, cfg config.Config) error {
	owner, err := db.Connect(ctx, cfg.MigrateURL)
	if err != nil {
		return err
	}
	defer owner.Close()
	applied, err := db.Migrate(ctx, owner, cfg.MigrationsDir)
	if err != nil {
		return err
	}
	slog.Info("migrations", "applied", applied)
	return db.SetAppPassword(ctx, owner, cfg.AppDBPassword)
}

// seedDemo creates the demo organisations with DEV_USER_ID as administrator.
func seedDemo(ctx context.Context, cfg config.Config) error {
	if cfg.DevUserID == "" {
		return errors.New("set DEV_USER_ID to the user who should administer the demo organisations")
	}
	owner, err := db.Connect(ctx, cfg.MigrateURL)
	if err != nil {
		return err
	}
	defer owner.Close()
	ids, err := seed.Run(ctx, owner, cfg.DevUserID)
	slog.Info("demo organisations", "ids", ids)
	return err
}

// createOrg is the platform owner's command for a new client:
//
//	server create-org "<name>" <school|college|university> <admin email>
func createOrg(ctx context.Context, cfg config.Config, args []string) error {
	if len(args) != 3 {
		return errors.New(`use: server create-org "<name>" <school|college|university> <admin email>`)
	}
	name, kind, email := strings.TrimSpace(args[0]), args[1], strings.TrimSpace(args[2])
	if kind != "school" && kind != "college" && kind != "university" {
		return errors.New("the type is school, college or university")
	}
	owner, err := db.Connect(ctx, cfg.MigrateURL)
	if err != nil {
		return err
	}
	defer owner.Close()
	orgID, invID, err := seed.CreateOrg(ctx, owner, name, kind, email)
	if err != nil {
		return err
	}
	sent := false
	if cfg.ClerkSecretKey != "" {
		if err := auth.NewClerkDirectory(cfg.ClerkSecretKey).Invite(ctx, strings.ToLower(email), cfg.AppURL); err != nil {
			slog.Warn("invitation email not sent; the administrator can still sign in with this address", "err", err)
		} else if err := seed.MarkSent(ctx, owner, invID); err != nil {
			return err
		} else {
			sent = true
		}
	}
	slog.Info("organisation created", "org", orgID, "invitation", invID, "emailed", sent)
	return nil
}
