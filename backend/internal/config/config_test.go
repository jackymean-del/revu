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
		{name: "the app address is the owner's, signed in as revu_app", env: map[string]string{
			"MIGRATE_DATABASE_URL": "postgresql://postgres:owner@db.internal:5432/railway?sslmode=disable", "APP_DB_PASSWORD": "pass word/with:odd@chars"},
			check: func(t *testing.T, c Config) {
				if c.DatabaseURL != "postgresql://revu_app:pass%20word%2Fwith%3Aodd%40chars@db.internal:5432/railway?sslmode=disable" {
					t.Fatalf("DatabaseURL %q", c.DatabaseURL)
				}
			}},
		{name: "owner addresses are lower case and trimmed", env: map[string]string{"PLATFORM_OWNER_EMAILS": " Jackymean@Gmail.com , ,b@x.org"}, check: func(t *testing.T, c Config) {
			if len(c.PlatformOwners) != 2 || c.PlatformOwners[0] != "jackymean@gmail.com" {
				t.Fatalf("owners %v", c.PlatformOwners)
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
		{name: "production with a database", env: map[string]string{"APP_ENV": "production", "DATABASE_URL": "postgres://x", "CLERK_SECRET_KEY": "sk_live_x"}, check: func(t *testing.T, c Config) {
			if !c.Production {
				t.Fatal("expected production")
			}
		}},
		{name: "migrations dir defaults to the repo folder", env: map[string]string{}, check: func(t *testing.T, c Config) {
			if c.MigrationsDir != "../database/migrations" {
				t.Fatalf("dir %q", c.MigrationsDir)
			}
		}},
		{name: "app and owner must differ", env: map[string]string{"DATABASE_URL": "postgres://o", "MIGRATE_DATABASE_URL": "postgres://o", "APP_DB_PASSWORD": "long-enough-pw"}, wantErr: true},
		{name: "migrating needs an app password", env: map[string]string{"DATABASE_URL": "postgres://a", "MIGRATE_DATABASE_URL": "postgres://o"}, wantErr: true},
		{name: "a short app password is refused", env: map[string]string{"DATABASE_URL": "postgres://a", "MIGRATE_DATABASE_URL": "postgres://o", "APP_DB_PASSWORD": "short"}, wantErr: true},
		{name: "development sign-in is refused in production", env: map[string]string{"APP_ENV": "production", "DATABASE_URL": "postgres://a", "CLERK_SECRET_KEY": "sk_live_x", "DEV_USER_ID": "user_dev"}, wantErr: true},
		{name: "production needs sign-in", env: map[string]string{"APP_ENV": "production", "DATABASE_URL": "postgres://a"}, wantErr: true},
		{name: "owner and app roles", env: map[string]string{"DATABASE_URL": "postgres://a", "MIGRATE_DATABASE_URL": "postgres://o", "APP_DB_PASSWORD": "long-enough-pw"}, check: func(t *testing.T, c Config) {
			if c.MigrateURL != "postgres://o" || c.AppDBPassword != "long-enough-pw" {
				t.Fatalf("%+v", c)
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
