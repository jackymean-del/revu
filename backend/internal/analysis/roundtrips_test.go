package analysis_test

import (
	"context"
	"strings"
	"sync"

	"github.com/jackc/pgx/v5"
)

// counter counts the round trips a request makes to the database: each
// query is one, and a batch of queries is one (decision D30).
type counter struct {
	mu   sync.Mutex
	n    int
	sqls []string
}

func (c *counter) add(sql string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.n++
	c.sqls = append(c.sqls, strings.Join(strings.Fields(sql), " "))
}

func (c *counter) reset() (int, []string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	n, s := c.n, c.sqls
	c.n, c.sqls = 0, nil
	return n, s
}

func (c *counter) TraceQueryStart(ctx context.Context, _ *pgx.Conn, d pgx.TraceQueryStartData) context.Context {
	c.add(d.SQL)
	return ctx
}
func (c *counter) TraceQueryEnd(context.Context, *pgx.Conn, pgx.TraceQueryEndData) {}
func (c *counter) TraceBatchStart(ctx context.Context, _ *pgx.Conn, d pgx.TraceBatchStartData) context.Context {
	c.add("batch")
	return ctx
}
func (c *counter) TraceBatchQuery(context.Context, *pgx.Conn, pgx.TraceBatchQueryData) {}
func (c *counter) TraceBatchEnd(context.Context, *pgx.Conn, pgx.TraceBatchEndData)     {}
