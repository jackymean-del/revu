# Deploying revU

revU runs like schedU (blueprint Part 65): the API and its own PostgreSQL 18
on Railway, the app on Cloudflare Pages, sign-in through the bhusku Clerk
instance. The app lives at app.revu.bhusku.com; revu.bhusku.com is kept for
the marketing site. Secrets are typed into Railway, Cloudflare and Clerk by a
person and never committed.

## Railway: the API and its database

1. A project named `revu` in the same workspace as schedU, with its own
   PostgreSQL (Add, Database, PostgreSQL). Check the image tag in the
   database's Settings, Source ends in `:18`: the migrations use `uuidv7()`.
2. A service from the GitHub repository `jackymean-del/revu` (give the
   Railway GitHub app access to it). Railway reads `railway.json` at the
   repository root: it builds `backend/Dockerfile` from the root, checks
   `/api/health`, and rebuilds only when backend, migrations, the contract or
   that file change. Root directory stays empty.
3. Settings: region Singapore; Networking, Generate Domain.
4. Variables (Raw Editor), with the database card named `Postgres`:

   ```
   APP_ENV=production
   MIGRATE_DATABASE_URL=${{Postgres.DATABASE_URL}}
   APP_DB_PASSWORD=<32 letters and digits, generated on your machine>
   DATABASE_URL=postgresql://revu_app:${{APP_DB_PASSWORD}}@${{Postgres.PGHOST}}:${{Postgres.PGPORT}}/${{Postgres.PGDATABASE}}
   CLERK_SECRET_KEY=<a key made for this service in Clerk>
   ALLOWED_ORIGINS=https://app.revu.bhusku.com
   APP_URL=https://app.revu.bhusku.com
   ```

   The server migrates as the owner account, sets the `revu_app` password,
   and serves through `revu_app`, which every table's row-level security
   applies to. In production it refuses to start without a database or a
   Clerk key, or with `DEV_USER_ID` set.
5. Deploy. `https://<domain>/api/health` answers
   `{"database":true,"status":"ok",...}`.

A password for `APP_DB_PASSWORD`, in PowerShell:

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | % {[char]$_})
```

## Clerk

- Give each service its own secret key (API keys, Secret keys, Add new key,
  for example `revu-railway`), so one can be replaced without touching
  schedU. A secret key is shown once; if it is lost, make another.
- Add app.revu.bhusku.com to the instance's allowed domains.
- Webhook: endpoint `https://<api domain>/v1/webhooks/clerk`, then set
  `CLERK_WEBHOOK_SECRET` on Railway to its signing secret.

## Cloudflare Pages: the app

- A project `revu-app` from the same repository: root directory `frontend`,
  build command `npm run build`, output `dist`.
- Variables: `VITE_API_URL=https://<api domain>` and
  `VITE_CLERK_PUBLISHABLE_KEY=<the instance's publishable key>`.
- Custom domain app.revu.bhusku.com (a CNAME at Hostinger).

## The first institution

Run once against the production database, as the owner account:

```
server create-org "<name>" <school|college|university> <administrator email>
```

It creates the institution, its main branch, and an invitation that Clerk
emails to the administrator.
