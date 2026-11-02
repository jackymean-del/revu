package clerksync

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
	"time"
)

// Clerk sends webhooks through Svix. A delivery is genuine when one of the
// v1 signatures in svix-signature is the HMAC-SHA256, under the endpoint's
// secret, of "id.timestamp.body", and the timestamp is recent.

const tolerance = 5 * time.Minute

var errSignature = errors.New("clerksync: signature does not match")

func secretBytes(secret string) ([]byte, error) {
	return base64.StdEncoding.DecodeString(strings.TrimPrefix(secret, "whsec_"))
}

// sign returns the v1 signature of a delivery.
func sign(secret []byte, id, timestamp string, body []byte) string {
	mac := hmac.New(sha256.New, secret)
	mac.Write([]byte(id + "." + timestamp + "."))
	mac.Write(body)
	return base64.StdEncoding.EncodeToString(mac.Sum(nil))
}

// verify checks the headers of a delivery against secret at time now.
func verify(secret []byte, id, timestamp, signatures string, body []byte, now time.Time) error {
	if id == "" || timestamp == "" || signatures == "" {
		return errSignature
	}
	sec, err := strconv.ParseInt(timestamp, 10, 64)
	if err != nil {
		return errSignature
	}
	if d := now.Sub(time.Unix(sec, 0)); d > tolerance || d < -tolerance {
		return errors.New("clerksync: delivery is too old or from the future")
	}
	want := sign(secret, id, timestamp, body)
	for _, s := range strings.Fields(signatures) {
		if v, sig, ok := strings.Cut(s, ","); ok && v == "v1" && hmac.Equal([]byte(sig), []byte(want)) {
			return nil
		}
	}
	return errSignature
}
