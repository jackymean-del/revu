// Package ai drafts text with Claude for people to check: questions for the
// bank and holistic report comments. It only ever drafts. Nothing it writes
// is used until a teacher approves it, and no student's name, admission
// number or other identity is ever sent: callers pass the curriculum and
// anonymous facts only.
package ai

import (
	"context"
	"encoding/json"
	"errors"
	"slices"
	"time"

	"github.com/anthropics/anthropic-sdk-go/v2"
	"github.com/anthropics/anthropic-sdk-go/v2/option"
)

// Model is the model drafts are written with.
const Model = "claude-opus-5-5"

// Request is one draft: instructions, the material, and the JSON shape the
// answer must take (objects with additionalProperties false).
type Request struct {
	System string
	Prompt string
	Schema map[string]any
}

// Drafter writes a draft into out, which the schema describes.
type Drafter interface {
	Draft(ctx context.Context, r Request, out any) error
}

var (
	// ErrOff is returned when no API key is set up.
	ErrOff = errors.New("ai: not set up")
	// ErrRefused is returned when the model declines the request.
	ErrRefused = errors.New("ai: declined")
)

// Claude drafts through the Anthropic API.
type Claude struct{ client anthropic.Client }

// NewClaude returns a drafter with the given API key, or nil without one.
func NewClaude(key string) Drafter {
	if key == "" {
		return nil
	}
	return &Claude{client: anthropic.NewClient(option.WithAPIKey(key), option.WithRequestTimeout(3*time.Minute))}
}

// Draft asks for one answer in the schema's shape. A refusal is re-run on
// the fallback model the API chooses for its category.
func (c *Claude) Draft(ctx context.Context, r Request, out any) error {
	resp, err := c.client.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
		Model:     Model,
		MaxTokens: 16000,
		System:    []anthropic.BetaTextBlockParam{{Text: r.System}},
		Messages:  []anthropic.BetaMessageParam{anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(r.Prompt))},
		OutputConfig: anthropic.BetaOutputConfigParam{
			Effort: anthropic.BetaOutputConfigEffortHigh,
			Format: anthropic.BetaJSONOutputFormatParam{Schema: r.Schema},
		},
		Fallbacks: anthropic.BetaFallbacksParamOfDefault(),
		Betas:     []anthropic.AnthropicBeta{anthropic.AnthropicBetaServerSideFallback2026_07_01},
	})
	if err != nil {
		return err
	}
	if resp.StopReason == anthropic.BetaStopReasonRefusal {
		return ErrRefused
	}
	for _, b := range resp.Content {
		if t, ok := b.AsAny().(anthropic.BetaTextBlock); ok {
			return json.Unmarshal([]byte(t.Text), out)
		}
	}
	return errors.New("ai: the answer had no text")
}

// Object is a JSON schema object with every property required and no others.
func Object(props map[string]any) map[string]any {
	req := make([]string, 0, len(props))
	for k := range props {
		req = append(req, k)
	}
	slices.Sort(req)
	return map[string]any{"type": "object", "properties": props, "required": req, "additionalProperties": false}
}

// String and Array are schema helpers.
func String() map[string]any { return map[string]any{"type": "string"} }

// Array of items.
func Array(items map[string]any) map[string]any {
	return map[string]any{"type": "array", "items": items}
}

// Enum of strings.
func Enum(vals ...string) map[string]any { return map[string]any{"type": "string", "enum": vals} }
