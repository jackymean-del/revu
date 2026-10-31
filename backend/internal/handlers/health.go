// Package handlers holds the HTTP handlers. Feature modules (org, people,
// assessment, ...) bring their own handler files from v1 onward.
package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/jackymean-del/revu/internal/api"
)

// Pinger is the part of the database pool the health check needs.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Health answers whether the server is up and whether the database answers.
// The server being up is enough for a 200; the database state is reported in
// the body so the uptime check and the app can tell the two apart.
func Health(db Pinger, version string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ok := false
		if db != nil {
			ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
			defer cancel()
			ok = db.Ping(ctx) == nil
		}
		writeJSON(w, http.StatusOK, api.Health{Status: api.HealthOk, Database: ok, Version: version})
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
