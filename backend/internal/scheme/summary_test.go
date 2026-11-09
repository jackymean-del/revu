package scheme

import "testing"

// Overall results are worked out by hand from the subject results.
func TestSummarise(t *testing.T) {
	for _, tc := range []struct {
		name  string
		lines []SubjectLine
		want  Overall
	}{
		{"every subject final", []SubjectLine{{"complete", "78.50", "100"}, {"complete", "91.00", "100"}, {"complete", "40.25", "50"}},
			Overall{State: "complete", Value: "209.75", Max: "250", Pct: "83.90"}},
		{"a withheld subject withholds the total", []SubjectLine{{"complete", "78.50", "100"}, {"blocked", "", ""}},
			Overall{State: "blocked", Reason: "subject_withheld"}},
		{"a provisional subject counts so far", []SubjectLine{{"complete", "80.00", "100"}, {"provisional", "16.50", "20"}},
			Overall{State: "provisional", Value: "96.50", Max: "120", Pct: "80.42"}},
		{"a subject not yet assessed leaves it provisional", []SubjectLine{{"complete", "80.00", "100"}, {"not_assessed", "", ""}},
			Overall{State: "provisional", Value: "80.00", Max: "100", Pct: "80.00"}},
		{"nothing at all", nil, Overall{State: "not_assessed", Reason: "no_subjects"}},
		// 33.33 three times is exactly 99.99 of 150 = 66.66%.
		{"exact, never floats", []SubjectLine{{"complete", "33.33", "50"}, {"complete", "33.33", "50"}, {"complete", "33.33", "50"}},
			Overall{State: "complete", Value: "99.99", Max: "150", Pct: "66.66"}},
	} {
		if got := Summarise(tc.lines, 2); got != tc.want {
			t.Errorf("%s: %+v, want %+v", tc.name, got, tc.want)
		}
	}
}

func TestDescribe(t *testing.T) {
	// Absent and withheld are left out, never zero: (78.5 + 91 + 40.25) / 3 = 69.9166.. = 69.92.
	got := Describe([]string{"78.50", "AB", "", "91.00", "40.25"}, 2)
	if got != (Stats{Count: 3, Average: "69.92", Highest: "91.00", Lowest: "40.25"}) {
		t.Fatalf("%+v", got)
	}
	if (Describe(nil, 2) != Stats{}) {
		t.Fatal("empty column has statistics")
	}
}
