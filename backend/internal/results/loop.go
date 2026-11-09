package results

import (
	"context"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Debounce is how long an intent waits, so a burst of grid edits causes one
// run per student (Part 6.2).
const Debounce = 2 * time.Second

// batch is how many results one transaction recomputes.
const batch = 2000

// Loop recomputes waiting results every interval until ctx ends. It runs
// inside the server for the pilot; the work is the same function a job
// queue would call, so it can move to the worker without change.
func Loop(ctx context.Context, pool *pgxpool.Pool, interval time.Duration) {
	t := time.NewTicker(interval)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-t.C:
			if n, err := RunOnce(ctx, pool, Debounce); err != nil {
				slog.Error("recompute", "err", err)
			} else if n > 0 {
				slog.Info("recompute", "results", n)
			}
		}
	}
}

// RunOnce recomputes every result whose intent has waited at least
// debounce, institution by institution, each under its own row-level
// security. It returns how many subject results it stored.
func RunOnce(ctx context.Context, pool *pgxpool.Pool, debounce time.Duration) (int, error) {
	rows, err := pool.Query(ctx, `SELECT o::text FROM revu_orgs_with_stale_results(make_interval(secs => $1)) AS o`, debounce.Seconds())
	if err != nil {
		return 0, err
	}
	orgs, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return 0, err
	}
	total := 0
	for _, org := range orgs {
		for {
			n, more, err := runOrg(ctx, pool, org, debounce)
			total += n
			if err != nil {
				return total, err
			}
			if !more {
				break
			}
		}
	}
	return total, nil
}

func runOrg(ctx context.Context, pool *pgxpool.Pool, org string, debounce time.Duration) (stored int, more bool, err error) {
	err = pgx.BeginFunc(ctx, pool, func(tx pgx.Tx) error {
		if _, err := tx.Exec(ctx, `SELECT set_config('app.org_id', $1, true)`, org); err != nil {
			return err
		}
		rows, err := tx.Query(ctx, `
			SELECT student_id::text, period_id::text, subject_id::text FROM result_stale_intents
			 WHERE marked_at <= now() - make_interval(secs => $1) ORDER BY marked_at LIMIT $2 FOR UPDATE SKIP LOCKED`, debounce.Seconds(), batch)
		if err != nil {
			return err
		}
		keys, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (Key, error) {
			var k Key
			return k, r.Scan(&k.StudentID, &k.PeriodID, &k.SubjectID)
		})
		if err != nil {
			return err
		}
		more = len(keys) == batch
		stored, err = Recompute(ctx, tx, keys)
		return err
	})
	return stored, more, err
}
