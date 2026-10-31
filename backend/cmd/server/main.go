// revU API server.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db"
	"github.com/jackymean-del/revu/internal/handlers"
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
	// hooks); plain "server" applies them too when MIGRATE_DATABASE_URL is set.
	migrateOnly := len(os.Args) > 1 && os.Args[1] == "migrate"
	if cfg.MigrateURL != "" {
		if err := migrate(ctx, cfg); err != nil {
			slog.Error("migrations failed", "err", err)
			os.Exit(1)
		}
	} else if migrateOnly {
		slog.Error("MIGRATE_DATABASE_URL is not set")
		os.Exit(1)
	}
	if migrateOnly {
		return
	}

	var pinger handlers.Pinger
	if cfg.DatabaseURL == "" {
		slog.Warn("DATABASE_URL not set; running without a database")
	} else {
		pool, err := db.Connect(ctx, cfg.DatabaseURL)
		if err != nil {
			slog.Error("database pool", "err", err)
			os.Exit(1)
		}
		defer pool.Close()
		pinger = pool
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

	srv := &http.Server{
		Addr:              fmt.Sprintf(":%d", cfg.Port),
		Handler:           server.New(cfg, pinger),
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       60 * time.Second,
		WriteTimeout:      120 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	go func() {
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()
	slog.Info("revu api listening", "addr", srv.Addr, "version", cfg.Version)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
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
