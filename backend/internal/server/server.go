// Package server builds the HTTP router: middleware, error handling and every
// route. main serves it; tests (including the contract test) use the same
// router without a network listener.
package server

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/cors"
	"github.com/jackymean-del/revu/internal/config"
	"github.com/jackymean-del/revu/internal/handlers"
	"github.com/jackymean-del/revu/internal/problem"
	"github.com/jackymean-del/revu/internal/reqid"
)

// New returns the router with every route registered. db may be nil when no
// database is configured; health then reports it as not connected.
func New(cfg config.Config, db handlers.Pinger) chi.Router {
	r := chi.NewRouter()
	r.Use(reqid.Middleware, logRequests, recoverProblem)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins: cfg.AllowedOrigins,
		AllowedMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE"},
		AllowedHeaders: []string{"Authorization", "Content-Type", "If-Match", "Idempotency-Key", "X-Org-Id"},
		ExposedHeaders: []string{reqid.Header},
		MaxAge:         300,
	}))
	r.NotFound(func(w http.ResponseWriter, r *http.Request) { problem.Write(w, r, problem.NotFound) })
	r.MethodNotAllowed(func(w http.ResponseWriter, r *http.Request) { problem.Write(w, r, problem.MethodNotAllowed) })

	r.Get("/api/health", handlers.Health(db, cfg.Version))
	return r
}

// statusWriter remembers the status a handler wrote, for the log line.
type statusWriter struct {
	http.ResponseWriter
	status int
}

func (s *statusWriter) WriteHeader(code int) {
	if s.status == 0 {
		s.status = code
	}
	s.ResponseWriter.WriteHeader(code)
}

func (s *statusWriter) Unwrap() http.ResponseWriter { return s.ResponseWriter }

// logRequests writes one structured line per request.
func logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		sw := &statusWriter{ResponseWriter: w}
		next.ServeHTTP(sw, r)
		if sw.status == 0 {
			sw.status = http.StatusOK
		}
		slog.Info("request", "method", r.Method, "path", r.URL.Path, "status", sw.status,
			"ms", time.Since(start).Milliseconds(), "request_id", reqid.From(r.Context()))
	})
}

// recoverProblem turns a panic into a 500 problem body; the panic value is
// logged, never sent.
func recoverProblem(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				if v == http.ErrAbortHandler {
					panic(v)
				}
				problem.Write(w, r, fmt.Errorf("panic: %v", v))
			}
		}()
		next.ServeHTTP(w, r)
	})
}
