# Deploying revU

revU runs like schedU (blueprint Part 65): the API and its own PostgreSQL 18
on Railway, the app and the marketing site on Cloudflare Pages, sign-in
through the bhusku Clerk instance. The marketing site lives at
revu.bhusku.com and the app at app.revu.bhusku.com. Secrets are typed into
Railway, Cloudflare and Clerk by a person and never committed.

## Railway: the API and its database

1. A project named `revu` in the same workspace as schedU, with its own
   PostgreSQL (Add, Database, PostgreSQL). Check the image tag in the
   database's Settings, Source ends in `:18`: the migrations use `uuidv7()`.
2. A service from the GitHub repository `jackymean-del/revu` (give the
   Railway GitHub app access to it). Root directory stays empty. Railway's
   config files stop working on 1 December 2026, so set these on the
   service itself (`railway.json` repeats them until then):
   - Build: builder Dockerfile, Dockerfile path `backend/Dockerfile` (or
     the variable `RAILWAY_DOCKERFILE_PATH=backend/Dockerfile`).
   - Watch paths: `/backend/**`, `/database/migrations/**`, `/contracts/**`.
   - Deploy: healthcheck path `/api/health`, restart on failure, region
     Singapore (the database too).
   - Networking: Generate Domain, port 8080.
3. Variables (Raw Editor), with the database card named `Postgres`:

   ```
   APP_ENV=production
   MIGRATE_DATABASE_URL=${{Postgres.DATABASE_URL}}
   APP_DB_PASSWORD=<32 letters and digits, generated on your machine>
   CLERK_SECRET_KEY=<a key made for this service in Clerk>
   PLATFORM_OWNER_EMAILS=<the owner's verified email addresses, comma separated>
   ALLOWED_ORIGINS=https://app.revu.bhusku.com,https://revu-cmf.pages.dev
   APP_URL=https://app.revu.bhusku.com
   ```

   The server migrates as the owner account, sets the `revu_app` password,
   and serves through `revu_app`, which every table's row-level security
   applies to. Without `DATABASE_URL` it signs in as `revu_app` at the
   owner's address with `APP_DB_PASSWORD`; set `DATABASE_URL` only when the
   app account lives elsewhere. In production it refuses to start without a
   database or a Clerk key, or with `DEV_USER_ID` set.
4. Deploy. `https://<domain>/api/health` answers
   `{"database":true,"status":"ok",...}`.

A password for `APP_DB_PASSWORD`, in PowerShell:

```powershell
-join ((48..57)+(65..90)+(97..122) | Get-Random -Count 32 | % {[char]$_})
```

## Clerk

- Give each service its own secret key (API keys, Secret keys, Add new key,
  for example `revu-railway`), so one can be replaced without touching
  schedU. A secret key is shown once; if it is lost, make another.
- The live instance's primary domain is bhusku.com and allowed subdomains
  are off, so app.revu.bhusku.com signs in with no change. Leave both as they
  are: schedU depends on them. A live key does not sign in on .pages.dev.
- The server also accepts a session only from an address in
  ALLOWED_ORIGINS.
- Webhook: endpoint `https://<api domain>/v1/webhooks/clerk`, then set
  `CLERK_WEBHOOK_SECRET` on Railway to its signing secret.

## Cloudflare Pages: the app

- The project `revu` (revu-cmf.pages.dev) from the same repository: root
  directory `frontend`, framework preset None, build command
  `npm run build`, output `dist`.
- Variables: `VITE_API_URL=https://revu-production.up.railway.app`,
  `VITE_CLERK_PUBLISHABLE_KEY=<the same instance's publishable key>` and
  `NODE_VERSION=24`.
- Custom domain app.revu.bhusku.com (a CNAME `app.revu` to
  `revu-cmf.pages.dev` at Hostinger).

## Cloudflare Pages: the marketing site

- A project `revu-marketing` from the same repository: root directory
  `marketing`, framework preset None, build command `npm run build`, output
  `out`, variable `NODE_VERSION=24`.
- Custom domain revu.bhusku.com. CI builds the site and runs its content
  rules on every push (`marketing/content-verify.mts`).

## Moving the app to app.revu.bhusku.com

Do it in this order, so the app is never unreachable:

1. Railway, revu service: set `ALLOWED_ORIGINS` to
   `https://revu.bhusku.com,https://app.revu.bhusku.com,https://revu-cmf.pages.dev`
   for the move, and `APP_URL=https://app.revu.bhusku.com`. Deploy.
2. Cloudflare, project `revu`: add the custom domain app.revu.bhusku.com and
   the CNAME at Hostinger. Wait until it is Active, then sign in there once.
3. Cloudflare: create `revu-marketing` as above and let it build.
4. Cloudflare, project `revu`: remove the domain revu.bhusku.com; then add it
   to `revu-marketing`.
5. Railway: drop `https://revu.bhusku.com` from `ALLOWED_ORIGINS`. Deploy.

## The first institution

On Windows, from the repository root, run `powershell -File
scripts/create-org.ps1`. It asks for the database's public address, the
revu service's APP_DB_PASSWORD and Clerk key without showing them, and runs
the command below in Docker. Use the same APP_DB_PASSWORD as the live
server: the command sets the revu_app password.

Elsewhere, run once against the production database, as the owner account:

```
server create-org "<name>" <school|college|university> <administrator email>
```

It creates the institution, its main branch, and an invitation that Clerk
emails to the administrator.
