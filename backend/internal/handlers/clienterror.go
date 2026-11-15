package handlers

import (
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gofiber/fiber/v3"
)

// A screen that fails in someone's browser says so here, so a fault on the
// live site is seen in the server's log without anyone having to report it.
// Nothing goes to an outside service. It takes no sign-in, since a screen
// can fail before sign-in finishes, so it keeps only what places the fault:
// the message, the first lines of the stack, the path without its query,
// and the app version. Each address may send a few a minute.

type clientError struct {
	Message string `json:"message"`
	Stack   string `json:"stack"`
	Path    string `json:"path"`
	Version string `json:"version"`
}

// clip keeps the first n characters of s, cut at a whole character.
func clip(s string, n int) string {
	s = strings.TrimSpace(s)
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	return string([]rune(s)[:n])
}

// rate is a fixed window of reports per address.
type rate struct {
	sync.Mutex
	window time.Time
	seen   map[string]int
}

func (r *rate) allow(addr string, now time.Time, most int) bool {
	r.Lock()
	defer r.Unlock()
	if now.Sub(r.window) > time.Minute || r.seen == nil {
		r.window, r.seen = now, map[string]int{}
	}
	r.seen[addr]++
	return r.seen[addr] <= most
}

// ClientError logs a fault a screen reports, and always answers 204.
func ClientError() fiber.Handler {
	var limit rate
	return func(c fiber.Ctx) error {
		if !limit.allow(c.IP(), time.Now(), 10) {
			return c.SendStatus(http.StatusNoContent)
		}
		var in clientError
		if err := c.Bind().JSON(&in); err != nil || strings.TrimSpace(in.Message) == "" {
			return c.SendStatus(http.StatusNoContent)
		}
		path, _, _ := strings.Cut(in.Path, "?")
		stack := strings.Split(clip(in.Stack, 1200), "\n")
		if len(stack) > 8 {
			stack = stack[:8]
		}
		slog.Warn("screen error", "message", clip(in.Message, 300), "path", clip(path, 120), "version", clip(in.Version, 40), "stack", strings.Join(stack, " | "))
		return c.SendStatus(http.StatusNoContent)
	}
}
