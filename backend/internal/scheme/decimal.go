package scheme

import (
	"encoding/json"
	"fmt"
	"math/big"
	"regexp"
	"strings"
)

// Marks and every number the engine makes are exact rationals (math/big),
// never floats, so three marks of 33.33 sum to 99.99 exactly (AT-v3-05).
// Rounding happens only where the scheme declares it, half up.

var decimalShape = regexp.MustCompile(`^\d{1,7}(\.\d{1,4})?$`)

// Dec is an exact decimal written as text, as the database returns
// numeric. In a scheme it may be written as a JSON number or a string.
type Dec string

// UnmarshalJSON keeps the digits exactly as written.
func (d *Dec) UnmarshalJSON(b []byte) error {
	s := strings.TrimSpace(string(b))
	if s == "null" {
		*d = ""
		return nil
	}
	if strings.HasPrefix(s, `"`) {
		var t string
		if err := json.Unmarshal(b, &t); err != nil {
			return err
		}
		*d = Dec(strings.TrimSpace(t))
		return nil
	}
	*d = Dec(s)
	return nil
}

// MarshalJSON writes the decimal as a string, so no reader turns it into
// a float.
func (d Dec) MarshalJSON() ([]byte, error) {
	if d == "" {
		return []byte("null"), nil
	}
	return json.Marshal(string(d))
}

// rat reads an exact decimal, or reports that it is not one.
func rat(s string) (*big.Rat, bool) {
	if !decimalShape.MatchString(s) {
		return nil, false
	}
	r, ok := new(big.Rat).SetString(s)
	return r, ok
}

// mustRat reads a decimal the caller has already checked.
func mustRat(s string) *big.Rat {
	r, ok := rat(s)
	if !ok {
		panic(fmt.Sprintf("scheme: %q is not a decimal", s))
	}
	return r
}

func zero() *big.Rat         { return new(big.Rat) }
func whole(n int64) *big.Rat { return new(big.Rat).SetInt64(n) }

func add(a, b *big.Rat) *big.Rat { return new(big.Rat).Add(a, b) }
func sub(a, b *big.Rat) *big.Rat { return new(big.Rat).Sub(a, b) }
func mul(a, b *big.Rat) *big.Rat { return new(big.Rat).Mul(a, b) }

// quo divides; the caller has checked b is not zero.
func quo(a, b *big.Rat) *big.Rat { return new(big.Rat).Quo(a, b) }

// round is r rounded half up (away from zero) to places.
func round(r *big.Rat, places int) *big.Rat {
	out, _ := new(big.Rat).SetString(r.FloatString(places))
	return out
}

// text writes r to places, rounding half up.
func text(r *big.Rat, places int) string { return r.FloatString(places) }

// percent is v of max as a percentage, exactly.
func percent(v, max *big.Rat) *big.Rat { return quo(mul(v, whole(100)), max) }
