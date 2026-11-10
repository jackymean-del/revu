// Package syllabus keeps an institution's lessons, competencies and
// learning outcomes, imports them from the shapes other systems export, and
// suggests each outcome's Bloom level from its first verb (pilot P0.11 H1;
// blueprint v23 B2.3, D39, D40).
package syllabus

import (
	"strings"
	"unicode"
)

// Bloom levels, lowest first.
var Blooms = []string{"remember", "understand", "apply", "analyse", "evaluate", "create"}

// verbs maps the verb an outcome starts with to its Bloom level. Forms in
// -s, -ing and -ed are reduced to these before looking up.
var verbs = map[string]string{}

func init() {
	// In Bloom order, so a verb listed twice takes the lower level, the same every time.
	for _, row := range []struct {
		level string
		list  []string
	}{
		{"remember", []string{"identify", "list", "name", "define", "recall", "recognise", "recognize", "state", "label", "match", "recite", "spell",
			"select", "locate", "memorise", "repeat", "count", "know", "note", "record", "enlist", "tell"}},
		{"understand", []string{"explain", "describe", "discuss", "understand", "summarise", "summarize", "interpret", "illustrate", "outline", "relate",
			"express", "comprehend", "paraphrase", "report", "review", "translate", "infer", "conclude", "communicate", "listen", "read",
			"introduce", "learn", "study", "observe", "maintain", "participate", "show", "follow", "speak", "sympathise", "empathise", "appreciate"}},
		{"apply", []string{"apply", "use", "solve", "calculate", "demonstrate", "perform", "measure", "convert", "transform", "rewrite", "complete", "join",
			"form", "draw", "make", "conduct", "carry", "execute", "operate", "practise", "practice", "handle", "play", "sing", "dance",
			"position", "sequence", "substitute", "correct", "change", "prepare", "estimate", "represent", "spread", "engage",
			"sort", "trace", "coordinate", "keep", "derive"}},
		{"analyse", []string{"analyse", "analyze", "compare", "contrast", "differentiate", "distinguish", "classify", "categorise", "categorize",
			"examine", "deduce", "investigate", "organise", "organize", "correlate", "determine", "attribute", "test", "explore"}},
		{"evaluate", []string{"evaluate", "justify", "assess", "judge", "argue", "debate", "critique", "decide", "defend", "value", "prioritise",
			"recommend", "reflect", "predict", "suggest"}},
		{"create", []string{"create", "design", "compose", "construct", "plan", "invent", "produce", "develop", "devise", "formulate", "build",
			"write", "draft", "originate", "imagine", "prototype"}},
	} {
		for _, v := range row.list {
			if _, taken := verbs[v]; !taken {
				verbs[v] = row.level
			}
		}
	}
}

// openers are words before the verb that say nothing about the level.
var openers = map[string]bool{"the": true, "child": true, "children": true, "should": true, "be": true, "able": true, "to": true,
	"student": true, "students": true, "learner": true, "learners": true, "will": true, "can": true, "a": true, "an": true,
	"asking": true, "encouraging": true, "engaging": true, "brief": true, "learning": true, "about": true, "in": true, "detail": true, "ref": true}

// stems are the forms a verb may take, plainest first.
func stems(w string) []string {
	out := []string{w}
	for _, suf := range []string{"ing", "ies", "es", "ed", "s"} {
		if strings.HasSuffix(w, suf) && len(w) > len(suf)+2 {
			base := strings.TrimSuffix(w, suf)
			switch suf {
			case "ies":
				out = append(out, base+"y")
			case "ing", "ed":
				out = append(out, base, base+"e")
				if n := len(base); n > 2 && base[n-1] == base[n-2] {
					out = append(out, base[:n-1]) // planning -> plan
				}
			default:
				out = append(out, base)
			}
		}
	}
	return out
}

// SuggestBloom is the Bloom level an outcome's first verb suggests, or
// understand when no verb is recognised.
func SuggestBloom(text string) string {
	words := strings.FieldsFunc(strings.ToLower(text), func(r rune) bool { return !unicode.IsLetter(r) })
	looked := 0
	for _, w := range words {
		if openers[w] {
			continue
		}
		for _, s := range stems(w) {
			if level, ok := verbs[s]; ok {
				return level
			}
		}
		// The verb comes first or second ("Children observing..."); stop
		// before reading meaning into a word deep in the sentence.
		if looked++; looked >= 2 {
			break
		}
	}
	return "understand"
}
