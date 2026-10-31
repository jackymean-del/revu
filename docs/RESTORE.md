# Restoring the revU database

The nightly backup (.github/workflows/db-backup.yml) dumps the production
PostgreSQL 18 database, encrypts it, proves the dump restores into a clean
PostgreSQL 18, and keeps 30 days of copies as workflow artifacts.

It runs only once these repository secrets exist:

- `REVU_DATABASE_URL` - the production connection string (Railway, read access is enough)
- `BACKUP_PASSPHRASE` - the passphrase used to encrypt each dump

## Restore drill

1. Download the newest `revu-db-backup-*` artifact from the Actions tab.
2. Decrypt: `openssl enc -d -aes-256-cbc -pbkdf2 -in revu.dump.enc -out revu.dump -pass env:BACKUP_PASSPHRASE`
3. Start an empty PostgreSQL 18 and restore: `pg_restore --no-owner -d "$TARGET_URL" revu.dump`
4. Point a staging server at it and check `/api/health` answers `"database": true`.

Run the drill once a term and note the date here.
