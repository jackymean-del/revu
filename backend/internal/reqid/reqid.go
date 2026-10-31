// Package reqid gives every request an id. It is sent back in X-Request-Id,
// written on the request's log line and put in every problem body, so a
// person quoting it leads straight to what the server did.
package reqid

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
)

// Header carries the id in the response.
const Header = "X-Request-Id"

type key struct{}

// Middleware assigns a fresh id. An id sent by the client is ignored, so log
// lines cannot be made to collide on purpose.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b := make([]byte, 12)
		_, _ = rand.Read(b)
		id := hex.EncodeToString(b)
		w.Header().Set(Header, id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), key{}, id)))
	})
}

// From returns the request id, or "" outside Middleware.
func From(ctx context.Context) string {
	id, _ := ctx.Value(key{}).(string)
	return id
}
