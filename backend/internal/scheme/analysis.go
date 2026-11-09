package scheme

import "sort"

// The arithmetic behind analysis screens: an assessment's own percentage,
// how many students fall below a mastery threshold in a paper section, and
// which range a percentage falls in. Kept here so no other package does
// arithmetic on marks. Absent, exempt and pending never count as zero.

// Cell is one student's mark in one column.
type Cell struct {
	State string // a value state; empty is pending
	Value string
	Max   string
}

// Score is one student's result in one assessment, from its columns.
type Score struct {
	State string `json:"state"` // complete, pending, absent, left_out
	Value string `json:"value,omitempty"`
	Max   string `json:"max,omitempty"`
	Pct   string `json:"pct,omitempty"`
}

// AssessmentScore adds a student's columns of one assessment: scored
// columns count; exempt and not applicable leave the sum; any pending
// column leaves the score pending; an absence with nothing scored is
// absent. A score with some columns absent counts only what was scored and
// is marked partial by the caller if it needs to say so.
func AssessmentScore(cells []Cell) Score {
	got, of := zero(), zero()
	scored, absent := 0, 0
	for _, c := range cells {
		switch c.State {
		case "scored":
			v, okV := rat(c.Value)
			m, okM := rat(c.Max)
			if !okV || !okM {
				return Score{State: "pending"}
			}
			got, of = add(got, v), add(of, m)
			scored++
		case "absent":
			absent++
		case "exempt", "not_applicable":
		default:
			return Score{State: "pending"}
		}
	}
	switch {
	case scored == 0 && absent > 0:
		return Score{State: "absent"}
	case scored == 0:
		return Score{State: "left_out"}
	case of.Sign() == 0:
		return Score{State: "pending"}
	}
	return Score{State: "complete", Value: trim(text(got, 2)), Max: trim(text(of, 2)), Pct: text(round(percent(got, of), 2), 2)}
}

// Mastery is how a paper section went for a group of students.
type Mastery struct {
	Scored   int    `json:"scored"`   // students with a mark
	Below    int    `json:"below"`    // of those, below the threshold
	SharePct string `json:"sharePct"` // below as a share of scored, whole percent; empty with no marks
	Flagged  bool   `json:"flagged"`  // the share reaches the limit and there is enough evidence
	Enough   bool   `json:"enough"`   // at least the minimum number of marks
	BelowIDs []int  `json:"-"`        // indexes of the students below, in the order given
}

// SectionMastery counts, for one column, the students whose mark is below
// masteryPct of the maximum; only scored marks count. The section is
// flagged when at least minEvidence students were scored and the share
// below reaches limitPct.
func SectionMastery(cells []Cell, masteryPct, limitPct string, minEvidence int) Mastery {
	threshold, ok := rat(masteryPct)
	limit, okL := rat(limitPct)
	if !ok || !okL {
		return Mastery{}
	}
	var m Mastery
	for i, c := range cells {
		if c.State != "scored" {
			continue
		}
		v, okV := rat(c.Value)
		mx, okM := rat(c.Max)
		if !okV || !okM || mx.Sign() == 0 {
			continue
		}
		m.Scored++
		if percent(v, mx).Cmp(threshold) < 0 {
			m.Below++
			m.BelowIDs = append(m.BelowIDs, i)
		}
	}
	if m.Scored == 0 {
		return m
	}
	share := percent(whole(int64(m.Below)), whole(int64(m.Scored)))
	m.SharePct = text(round(share, 0), 0)
	m.Enough = m.Scored >= minEvidence
	m.Flagged = m.Enough && share.Cmp(limit) >= 0
	return m
}

// Trend compares the share below in a later assessment with an earlier one.
func Trend(before, after string) string {
	b, okB := rat(before)
	a, okA := rat(after)
	switch {
	case !okA || !okB:
		return ""
	case a.Cmp(b) < 0:
		return "improved"
	case a.Cmp(b) > 0:
		return "worse"
	}
	return "unchanged"
}

// InRange says whether pct is at least lo and below hi; the top range
// includes 100.
func InRange(pct, lo, hi string) bool {
	p, ok := rat(pct)
	l, okL := rat(lo)
	h, okH := rat(hi)
	if !ok || !okL || !okH {
		return false
	}
	if p.Cmp(l) < 0 {
		return false
	}
	if h.Cmp(whole(100)) >= 0 {
		return p.Cmp(h) <= 0
	}
	return p.Cmp(h) < 0
}

// Median is the middle of the decimal values given (the mean of the two
// middle ones for an even count), leaving out anything not a decimal.
func Median(values []string, places int) string {
	var xs []string
	for _, v := range values {
		if _, ok := rat(v); ok {
			xs = append(xs, v)
		}
	}
	if len(xs) == 0 {
		return ""
	}
	sort.Slice(xs, func(i, j int) bool { return mustRat(xs[i]).Cmp(mustRat(xs[j])) < 0 })
	n := len(xs)
	if n%2 == 1 {
		return text(round(mustRat(xs[n/2]), places), places)
	}
	return text(round(quo(add(mustRat(xs[n/2-1]), mustRat(xs[n/2])), whole(2)), places), places)
}

// Below says whether pct is a decimal below limit.
func Below(pct, limit string) bool {
	p, ok := rat(pct)
	l, okL := rat(limit)
	return ok && okL && p.Cmp(l) < 0
}

// BandOf is the label of the band pct falls in, or empty: a band runs from
// its minimum (inclusive) up to the next band's.
func BandOf(pct string, bands []Band) string {
	p, ok := rat(pct)
	if !ok {
		return ""
	}
	b, ok := band(bands, p)
	if !ok {
		return ""
	}
	return b.Label
}

// Pct is value as a percentage of max, rounded half up to places; empty
// when either is not a decimal or max is zero.
func Pct(value, max string, places int) string {
	v, ok := rat(value)
	m, okM := rat(max)
	if !ok || !okM || m.Sign() == 0 {
		return ""
	}
	return text(round(percent(v, m), places), places)
}
