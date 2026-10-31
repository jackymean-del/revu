// revU worker: background jobs (PDF builds, recompute, scans) run here on a
// PostgreSQL-backed River queue from v3. Until then it starts, reports that it
// is ready and waits, so the Railway service and its deploy pipeline exist early.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	slog.Info("revu worker ready", "jobs", 0)
	<-ctx.Done()
	slog.Info("revu worker stopped")
}
