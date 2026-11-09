package scheme

import (
	"fmt"
	"testing"
)

func sc(v, max string) Cell { return Cell{State: "scored", Value: v, Max: max} }

func TestAssessmentScore(t *testing.T) {
	for _, tc := range []struct {
		name  string
		cells []Cell
		want  Score
	}{
		// 18 + 12.5 = 30.5 of 40 = 76.25%.
		{"two sections scored", []Cell{sc("18", "20"), sc("12.5", "20")}, Score{"complete", "30.50", "40", "76.25"}},
		{"a pending section leaves it pending", []Cell{sc("18", "20"), {State: ""}}, Score{State: "pending"}},
		{"absent throughout is absent, not zero", []Cell{{State: "absent"}, {State: "absent"}}, Score{State: "absent"}},
		// Absent for one section: 18 of the 20 scored = 90%.
		{"absent for one section counts what was scored", []Cell{sc("18", "20"), {State: "absent"}}, Score{"complete", "18", "20", "90.00"}},
		{"exempt leaves the sum", []Cell{sc("9", "10"), {State: "exempt"}}, Score{"complete", "9", "10", "90.00"}},
		{"not applicable throughout is left out", []Cell{{State: "not_applicable"}}, Score{State: "left_out"}},
		{"a real zero is zero", []Cell{sc("0", "20")}, Score{"complete", "0", "20", "0.00"}},
	} {
		if got := AssessmentScore(tc.cells); got != tc.want {
			t.Errorf("%s: %+v, want %+v", tc.name, got, tc.want)
		}
	}
}

// AT-P-06: the reteach list for a golden section matches a hand count.
// Section B (out of 20) of ten students: below 40% means below 8 marks.
// Marks 7, 3, 7.99 are below; 8 (exactly 40%) is not; one absent and one
// pending are not counted. 3 of 8 scored = 37.5%, which rounds to 38% and
// reaches a 30% limit.
func TestSectionMasteryGolden(t *testing.T) {
	cells := []Cell{
		sc("7", "20"), sc("15", "20"), sc("3", "20"), sc("8", "20"), sc("20", "20"),
		{State: "absent"}, sc("7.99", "20"), sc("11", "20"), {State: ""}, sc("16", "20"),
	}
	m := SectionMastery(cells, "40", "30", 5)
	if m.Scored != 8 || m.Below != 3 || m.SharePct != "38" || !m.Flagged || !m.Enough || fmt.Sprint(m.BelowIDs) != "[0 2 6]" {
		t.Fatalf("%+v", m)
	}
	// The same section under a 40% limit is not flagged: 37.5 < 40.
	if SectionMastery(cells, "40", "40", 5).Flagged {
		t.Fatal("flagged under a limit it does not reach")
	}
	// Too few marks: never flagged, whatever the share.
	few := SectionMastery([]Cell{sc("1", "20"), sc("2", "20")}, "40", "30", 5)
	if few.Flagged || few.Enough || few.SharePct != "100" {
		t.Fatalf("%+v", few)
	}
	if empty := SectionMastery([]Cell{{State: "absent"}}, "40", "30", 1); empty.SharePct != "" || empty.Flagged {
		t.Fatalf("%+v", empty)
	}
}

func TestTrendRangeMedian(t *testing.T) {
	if Trend("38", "20") != "improved" || Trend("20", "38") != "worse" || Trend("25", "25") != "unchanged" || Trend("", "25") != "" {
		t.Fatal("trend")
	}
	for _, tc := range []struct {
		pct, lo, hi string
		in          bool
	}{
		{"39.99", "0", "40", true}, {"40", "0", "40", false}, {"40", "40", "50", true}, {"100", "90", "100", true}, {"99.5", "90", "100", true}, {"x", "0", "40", false},
	} {
		if InRange(tc.pct, tc.lo, tc.hi) != tc.in {
			t.Errorf("%s in [%s, %s): %v", tc.pct, tc.lo, tc.hi, !tc.in)
		}
	}
	if Median([]string{"80", "AB", "60", "90"}, 2) != "80.00" || Median([]string{"80", "60", "90", "70"}, 2) != "75.00" || Median(nil, 2) != "" {
		t.Fatal("median")
	}
}

func TestBelowBandPct(t *testing.T) {
	bands := []Band{{Label: "A1", MinPct: "90"}, {Label: "A2", MinPct: "80"}, {Label: "C", MinPct: "0"}}
	if BandOf("90", bands) != "A1" || BandOf("89.99", bands) != "A2" || BandOf("12", bands) != "C" || BandOf("x", bands) != "" {
		t.Fatal("band")
	}
	if !Below("59.99", "60") || Below("60", "60") || Below("", "60") {
		t.Fatal("below")
	}
	// A written paper of 59 out of 80 is 73.75%.
	if Pct("59", "80", 2) != "73.75" || Pct("1", "0", 2) != "" {
		t.Fatal("pct")
	}
}
