package papers

import (
	"math/rand/v2"
	"regexp"
	"strconv"
	"strings"
)

// When no AI is connected, questions are still drafted, from the
// institution's own material and nothing else: a question of the bank with
// its numbers changed, so the working stays the same and the answer does
// not; and question stems for the level asked, filled with the lesson and
// its learning outcome. They are plain starting points for a teacher to
// finish, saved as drafts like any other.

// suggestion is one drafted question, before it is checked and saved.
type suggestion struct {
	Text, Answer string
	Options      []string
	Bloom        string
}

// stems are opening lines for each Bloom level. {o} is the outcome as an
// action ("compare fractions"), {t} the topic (the lesson).
var stems = map[string][]string{
	"remember": {
		"State what is meant by {t}.",
		"List the main points you learnt about {t}.",
		"Name and define two key terms from {t}.",
		"Write down the rule or fact you use to {o}.",
	},
	"understand": {
		"Explain in your own words how to {o}.",
		"Describe, with an example, what it means to {o}.",
		"Explain why we need to {o}.",
		"Summarise the steps to {o}.",
	},
	"apply": {
		"Show how to {o}, using an example of your own.",
		"Use what you learnt about {t} to solve: ______",
		"Work out the following, showing each step: ______",
		"A friend asks you to {o}. Show them how, step by step.",
	},
	"analyse": {
		"Compare two ways to {o}. How are they alike, and how are they different?",
		"Find and correct the mistake in this working: ______",
		"Examine why the steps to {o} are done in that order.",
		"Sort these examples into groups and explain your grouping: ______",
	},
	"evaluate": {
		"A learner says this is the best way to {o}: ______. Do you agree? Give reasons.",
		"Judge which of these two answers is correct, and explain why: ______",
		"Which method to {o} would you choose, and why?",
	},
	"create": {
		"Make up your own question that tests how to {o}, and solve it.",
		"Design a short activity that helps a classmate learn to {o}.",
		"Write a real-life problem that needs you to {o}, then solve it.",
	},
}

// The level when none is given, by question type.
func defaultLevel(qtype string) string {
	t := strings.ToLower(qtype)
	switch {
	case strings.Contains(t, "choice"), strings.Contains(t, "true"), strings.Contains(t, "blank"), strings.Contains(t, "match"), strings.Contains(t, "very short"):
		return "remember"
	case strings.Contains(t, "long"), strings.Contains(t, "essay"), strings.Contains(t, "case"):
		return "analyse"
	case strings.Contains(t, "numerical"):
		return "apply"
	}
	return "understand"
}

// asAction turns an outcome ("Compares fractions." or "To compare
// fractions") into an action to fill a stem with ("compare fractions").
func asAction(outcome string) string {
	o := strings.TrimSpace(strings.TrimRight(strings.TrimSpace(outcome), ".!"))
	low := strings.ToLower(o)
	for _, p := range []string{"learners will be able to ", "students will be able to ", "the learner will ", "be able to ", "able to ", "to "} {
		if strings.HasPrefix(low, p) {
			o = o[len(p):]
			break
		}
	}
	if o == "" {
		return ""
	}
	// "Compares" reads as "compare" after "how to".
	words := strings.SplitN(o, " ", 2)
	w := words[0]
	if lw := strings.ToLower(w); strings.HasSuffix(lw, "s") && !strings.HasSuffix(lw, "ss") && len(lw) > 3 {
		w = w[:len(w)-1]
		if strings.HasSuffix(strings.ToLower(w), "ie") {
			w = w[:len(w)-2] + "y"
		}
	}
	words[0] = strings.ToLower(w[:1]) + w[1:]
	return strings.Join(words, " ")
}

// fillStem puts the topic and outcome into a stem, or skips a stem that needs
// an outcome there is none of.
func fillStem(stem, topic, action string) (string, bool) {
	if topic == "" && action == "" {
		return "", false // nothing of the syllabus to go on: nothing is made up
	}
	if strings.Contains(stem, "{o}") && action == "" {
		return "", false
	}
	if strings.Contains(stem, "{t}") && topic == "" {
		if action == "" {
			return "", false
		}
		topic = action
	}
	return strings.NewReplacer("{o}", action, "{t}", topic).Replace(stem), true
}

var numberShape = regexp.MustCompile(`\d+(\.\d+)?`)

// variant is the question with each number changed to a near one of the
// same size, keeping 0 and 1 and the count of decimal places. It is empty
// when the question has no number to change.
func variant(text string, r *rand.Rand) string {
	changed := false
	out := numberShape.ReplaceAllStringFunc(text, func(n string) string {
		whole, frac, _ := strings.Cut(n, ".")
		v, err := strconv.Atoi(whole)
		if err != nil || v <= 1 || len(whole) > 7 {
			return n
		}
		// Within about a third either way, never the same, never below 2.
		span := max(1, v/3)
		next := v
		for next == v {
			next = max(2, v-span+r.IntN(2*span+1))
		}
		changed = true
		if frac != "" {
			f := make([]byte, len(frac))
			for i := range f {
				f[i] = byte('0' + r.IntN(10))
			}
			return strconv.Itoa(next) + "." + string(f)
		}
		return strconv.Itoa(next)
	})
	if !changed {
		return ""
	}
	return out
}

// suggest drafts up to count questions for a need: first number variants of
// the bank's own questions of the same kind, then stems for the level. Each
// is different from what the bank holds already.
func suggest(count int, qtype, level, topic, outcome string, bank []string, seed uint64) []suggestion {
	r := rand.New(rand.NewPCG(seed, seed^0x9e3779b97f4a7c15))
	if level == "" || stems[level] == nil {
		level = defaultLevel(qtype)
	}
	seen := map[string]bool{}
	for _, b := range bank {
		seen[strings.ToLower(strings.TrimSpace(b))] = true
	}
	var out []suggestion
	add := func(s suggestion) {
		k := strings.ToLower(strings.TrimSpace(s.Text))
		if len(out) < count && k != "" && !seen[k] {
			seen[k] = true
			out = append(out, s)
		}
	}
	for _, i := range r.Perm(len(bank)) {
		if v := variant(bank[i], r); v != "" {
			add(suggestion{Text: v, Bloom: level})
		}
	}
	action := asAction(outcome)
	t := strings.ToLower(qtype)
	for _, i := range r.Perm(len(stems[level])) {
		text, ok := fillStem(stems[level][i], topic, action)
		if !ok {
			continue
		}
		s := suggestion{Text: text, Bloom: level}
		switch {
		case strings.Contains(t, "true or false") && action != "":
			s.Text, s.Options = "True or false: ______ (write a statement about how to "+action+")", []string{"True", "False"}
		case strings.Contains(t, "blank") && action != "":
			s.Text = "Fill in the blank: To " + action + ", you ______."
		case strings.Contains(t, "choice"):
			s.Text = strings.TrimSuffix(s.Text, ".") + "? Choose the correct answer."
			s.Text = strings.Replace(s.Text, "?? ", "? ", 1)
		}
		add(s)
	}
	return out
}
