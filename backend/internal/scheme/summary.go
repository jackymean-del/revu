package scheme

import "math/big"

// SubjectLine is one subject's stored result, as a report or marksheet
// reads it.
type SubjectLine struct {
	State      string // complete, provisional, blocked, not_assessed
	Value, Max string // empty when the result has no number
}

// Overall is a student's result across subjects for a report or marksheet.
type Overall struct {
	State  string `json:"state"`
	Reason string `json:"reason,omitempty"` // withheld or not_assessed subjects, by count
	Value  string `json:"value,omitempty"`
	Max    string `json:"max,omitempty"`
	Pct    string `json:"pct,omitempty"`
}

// Summarise adds up a student's subject results. A withheld subject
// withholds the overall result (no number is made up for it); a provisional
// subject makes it provisional, counted so far; a subject with no
// assessment leaves the overall provisional too, since it is still to come.
// Values add exactly and the percentage rounds half up to places.
func Summarise(lines []SubjectLine, places int) Overall {
	if len(lines) == 0 {
		return Overall{State: "not_assessed", Reason: "no_subjects"}
	}
	got, of := zero(), zero()
	state, counted := "complete", 0
	for _, l := range lines {
		switch l.State {
		case "blocked":
			return Overall{State: "blocked", Reason: "subject_withheld"}
		case "not_assessed":
			state = "provisional"
			continue
		case "provisional":
			state = "provisional"
		}
		v, okV := rat(l.Value)
		m, okM := rat(l.Max)
		if !okV || !okM || m.Sign() == 0 {
			state = "provisional"
			continue
		}
		got, of = add(got, v), add(of, m)
		counted++
	}
	if counted == 0 {
		return Overall{State: "not_assessed", Reason: "nothing_counted"}
	}
	return Overall{State: state, Value: text(round(got, places), places), Max: trim(text(of, places)), Pct: text(round(percent(got, of), places), places)}
}

// Stats are a column's average, highest and lowest over the values given.
type Stats struct {
	Count                    int
	Average, Highest, Lowest string
}

// Describe works out a column's statistics exactly; values that are not
// decimals (withheld, absent) are left out, never counted as zero.
func Describe(values []string, places int) Stats {
	var sum *big.Rat
	var hi, lo *big.Rat
	n := 0
	for _, s := range values {
		v, ok := rat(s)
		if !ok {
			continue
		}
		n++
		if sum == nil {
			sum, hi, lo = v, v, v
			continue
		}
		sum = add(sum, v)
		if v.Cmp(hi) > 0 {
			hi = v
		}
		if v.Cmp(lo) < 0 {
			lo = v
		}
	}
	if n == 0 {
		return Stats{}
	}
	return Stats{Count: n, Average: text(round(quo(sum, whole(int64(n))), places), places), Highest: text(hi, places), Lowest: text(lo, places)}
}
