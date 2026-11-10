package syllabus

import "testing"

// Outcomes worded as schools write them suggest the Bloom level of their
// first verb, whatever its form, and fall back to understand.
func TestSuggestBloom(t *testing.T) {
	for _, tc := range []struct{ text, want string }{
		{"Identify the root system.", "remember"},
		{"List the components of air", "remember"},
		{"Define and explain the law of conservation of mass", "remember"},
		{"Explain the functions of the root system.", "understand"},
		{"Describing household consumption of electricity", "understand"},
		{"Solve simple numerical problems based on formula for pressure", "apply"},
		{"Calculating work done in simple cases", "apply"},
		{"Convert sentences from active voice to passive voice", "apply"},
		{"Differentiate between hard and soft water", "analyse"},
		{"Compare and contrast boiling and evaporation", "analyse"},
		{"Classify substances into elements, compounds, and mixtures", "analyse"},
		{"Justify the reason for the use of a particular technique", "evaluate"},
		{"Evaluate the poem as an ode to Motherhood", "evaluate"},
		{"Debate on the nazi's policy of racism", "evaluate"},
		{"Design activities to show that melting occurs at a fixed temperature", "create"},
		{"Plan, draft, revise, and edit writing to improve clarity", "create"},
		{"Constructing models based on scientific processes", "create"},
		{"The child should be able to draw and colour a picture", "apply"},
		{"Children observing solids and liquid", "understand"},
		{"Engaging children in problem solving tasks on KE and PE", "apply"},
		{"Posture (Sitting Straight, Not Slouching)", "understand"},
		{"", "understand"},
	} {
		if got := SuggestBloom(tc.text); got != tc.want {
			t.Errorf("%q: %s, want %s", tc.text, got, tc.want)
		}
	}
}
