package db

import (
	"context"
	"testing"
)

func TestConnectRejectsBadURL(t *testing.T) {
	if _, err := Connect(context.Background(), "not a url ::"); err == nil {
		t.Fatal("expected an error for a malformed DATABASE_URL")
	}
}
