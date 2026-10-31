// revU API server.
package main

import (
	"context"
	"fmt"
	"log/slog"
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
	}

	app := server.New(cfg, pinger)

	go func() {
		<-ctx.Done()
		_ = app.ShutdownWithTimeout(10 * time.Second)
	}()
	addr := fmt.Sprintf(":%d", cfg.Port)
	slog.Info("revu api listening", "addr", addr, "version", cfg.Version)
	if err := app.Listen(addr); err != nil {
		slog.Error("server stopped", "err", err)
		os.Exit(1)
	}
}
