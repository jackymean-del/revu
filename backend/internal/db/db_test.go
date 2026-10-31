package db

import (
	"context"
	"os"
	"testing"
	"time"
)

// Runs against a real PostgreSQL built from database/migrations (make up, or
// the nightly job). Skipped when TEST_DATABASE_URL is not set.
func TestConnectAndMigrations(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := Connect(ctx, url)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	if err := pool.Ping(ctx); err != nil {
		t.Fatalf("ping: %v", err)
	}

	var major int
	if err := pool.QueryRow(ctx, `SELECT current_setting('server_version_num')::int / 10000`).Scan(&major); err != nil {
		t.Fatalf("version: %v", err)
	}
	if major < 18 {
		t.Fatalf("PostgreSQL %d, want 18 or later (production runs 18)", major)
	}

	// 001_baseline.sql was applied
	var ok bool
	if err := pool.QueryRow(ctx, `SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto')`).Scan(&ok); err != nil || !ok {
		t.Fatalf("baseline migration not applied (pgcrypto missing): %v", err)
	}
}

func TestConnectRejectsBadURL(t *testing.T) {
	if _, err := Connect(context.Background(), "not a url ::"); err == nil {
		t.Fatal("expected an error for a malformed DATABASE_URL")
	}
}
