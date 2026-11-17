// Package writing checks what a teacher types (a question, an insight)
// for grammar, spelling, punctuation and meaning, with AI when it is set
// up. It returns the text as it would read corrected and what changed; the
// teacher takes it or keeps their own. Names the client marks are replaced
// before anything is sent, and put back after.
package writing

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gofiber/fiber/v3"
	"github.com/jackymean-del/revu/internal/ai"
	"github.com/jackymean-del/revu/internal/api"
	"github.com/jackymean-del/revu/internal/httpx"
	"github.com/jackymean-del/revu/internal/problem"
)

const system = `You check a teacher's short piece of writing for a school: a question for a paper, or a line about a learner's progress.
Correct spelling, grammar, punctuation and wording that would confuse a reader. Keep the teacher's meaning, voice and length; do not add facts, examples or new sentences, and keep blanks (______) and tokens like {name} exactly as they are.
Return the corrected text, and the changes as a few short notes such as "spelling: recieve to receive". If nothing needs changing, return the text unchanged and no changes.`

// Routes serves the check inside a tenant-scoped router.
func Routes(g fiber.Router, d ai.Drafter) {
	g.Post("/writing-check", check(d))
}

func check(d ai.Drafter) fiber.Handler {
	return func(c fiber.Ctx) error {
		var in struct {
			Text string   `json:"text"`
			Mask []string `json:"mask"` // names never to send
		}
		if err := httpx.Decode(c, &in); err != nil {
			return err
		}
		if strings.TrimSpace(in.Text) == "" || len([]rune(in.Text)) > 3000 || len(in.Mask) > 20 {
			return problem.Invalid(api.FieldError{Field: "text", Code: "length", Message: "Check up to 3000 characters at a time."})
		}
		if d == nil {
			return problem.New(http.StatusServiceUnavailable, "ai.off", "Grammar and meaning are checked when AI is switched on; spelling and punctuation are checked as you type.")
		}
		// Each name becomes a token the model keeps, and comes back after.
		text := in.Text
		var tokens [][2]string
		for i, n := range in.Mask {
			n = strings.TrimSpace(n)
			if len(n) < 2 || !strings.Contains(text, n) {
				continue
			}
			tok := "{name" + string(rune('A'+i)) + "}"
			text = strings.ReplaceAll(text, n, tok)
			tokens = append(tokens, [2]string{tok, n})
		}
		var out struct {
			Text    string   `json:"text"`
			Changes []string `json:"changes"`
		}
		if err := d.Draft(c.Context(), ai.Request{System: system, Prompt: text, Schema: ai.Object(map[string]any{"text": ai.String(), "changes": ai.Array(ai.String())})}, &out); err != nil {
			if errors.Is(err, ai.ErrRefused) {
				return problem.New(http.StatusUnprocessableEntity, "ai.declined", "The check declined this text; read it through yourself.")
			}
			slog.Error("ai writing check", "err", err)
			return problem.New(http.StatusBadGateway, "ai.failed", "The check could not run just now. Try again.")
		}
		for _, t := range tokens {
			out.Text = strings.ReplaceAll(out.Text, t[0], t[1])
			for i := range out.Changes {
				out.Changes[i] = strings.ReplaceAll(out.Changes[i], t[0], t[1])
			}
		}
		if strings.TrimSpace(out.Text) == "" {
			out.Text = in.Text
		}
		if out.Changes == nil {
			out.Changes = []string{}
		}
		return c.JSON(out)
	}
}
