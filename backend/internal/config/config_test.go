package config

import "testing"

func TestLoad(t *testing.T) {
	cases := []struct {
		name    string
		env     map[string]string
		wantErr bool
		check   func(t *testing.T, c Config)
	}{
		{name: "defaults", env: map[string]string{}, check: func(t *testing.T, c Config) {
			if c.Port != 8080 || c.Version != "dev" || len(c.AllowedOrigins) != 1 {
				t.Fatalf("unexpected defaults: %+v", c)
			}
		}},
		{name: "origins are split and trimmed", env: map[string]string{"ALLOWED_ORIGINS": " https://a.test , https://b.test ,"}, check: func(t *testing.T, c Config) {
			if len(c.AllowedOrigins) != 2 || c.AllowedOrigins[1] != "https://b.test" {
				t.Fatalf("origins: %v", c.AllowedOrigins)
			}
		}},
		{name: "bad port", env: map[string]string{"PORT": "eighty"}, wantErr: true},
		{name: "port out of range", env: map[string]string{"PORT": "70000"}, wantErr: true},
		{name: "production needs a database", env: map[string]string{"APP_ENV": "production"}, wantErr: true},
		{name: "production with a database", env: map[string]string{"APP_ENV": "production", "DATABASE_URL": "postgres://x"}, check: func(t *testing.T, c Config) {
			if !c.Production {
				t.Fatal("expected production")
			}
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			c, err := Load(func(k string) string { return tc.env[k] })
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
			}
			if err == nil && tc.check != nil {
				tc.check(t, c)
			}
		})
	}
}
