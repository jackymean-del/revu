// revU API server.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v3"
	"github.com/gofiber/fiber/v3/middleware/cors"
	"github.com/gofiber/fiber/v3/middleware/recover"
	"github.com/gofiber/fiber/v3/middleware/requestid"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/db"
	"github.com/jackymean-del/revu/internal/handlers"
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

	app := fiber.New(fiber.Config{AppName: "revu " + cfg.Version})
	app.Use(recover.New())
	app.Use(requestid.New())
	app.Use(cors.New(cors.Config{AllowOrigins: cfg.AllowedOrigins}))
	app.Use(func(c fiber.Ctx) error {
		start := time.Now()
		err := c.Next()
		// An error is turned into its response after this middleware returns,
		// so take the status from the error rather than the response.
		status := c.Response().StatusCode()
		var fe *fiber.Error
		if errors.As(err, &fe) {
			status = fe.Code
		} else if err != nil {
			status = fiber.StatusInternalServerError
		}
		slog.Info("request", "method", c.Method(), "path", c.Path(), "status", status,
			"ms", time.Since(start).Milliseconds(), "request_id", requestid.FromContext(c))
		return err
	})

	app.Get("/api/health", handlers.Health(pinger, cfg.Version))

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
