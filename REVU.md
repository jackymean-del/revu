# revU engineering rules

- Product: revU by Bhusku. Assessment, results and holistic progress platform. Read docs/blueprint before any task.
- Stack (blueprint v6, Part 38): React 19 with Vite 8, TypeScript strict, Tailwind 4, TanStack Query, React Router, Zustand and Zod in frontend. Go 1.26 with Chi on net/http and pgx in backend, a separate worker on a PostgreSQL-backed queue. PostgreSQL 18. Clerk for sign-in, revU's own tables for permissions. Cloudflare R2 storage. Chromium (Gotenberg) for PDFs. Cloudflare Pages for the sites, Railway for the server, worker and database. Go test, harnesses, Vitest and Playwright. OpenTelemetry and Sentry for monitoring.
- Spec-first API: edit contracts/openapi.yaml first, then regenerate the TypeScript client and Go types. Never hand-edit generated code.
- Database: every change is a numbered SQL file in database/migrations. Queries are plain SQL through pgx, kept in each module's repository file. Every tenant table has org_id and row-level security.
- No hard-coded institution words in the UI, PDFs, emails or generated text. Use the terminology resolver t().
- Marks are exact decimals: numeric(8,2) in the database and a decimal type in Go. Never float.
- Missing is never zero. Evidence has a state: scored, absent, exempt, pending, not_assessed.
- All operational state lives in PostgreSQL. Browser storage is only an offline cache that syncs.
- AI output is always a draft, carries its evidence, passes the verifier, and is approved by a person.
- Budget: initial JavaScript per route under 200 KB gzip. CI fails above it.
- No dead code, no unused dependencies, permissive licences only. CI checks all three.
- Every feature ships with proof: Go table tests, a *-verify.mts harness in frontend (run with npx tsx), and a Playwright step in e2e for key flows.
- Small commits, conventional commit messages, one pull request per task.
- Never write an em dash (U+2014) in copy, code comments, markdown or commit messages. Use a comma, a colon or a plain hyphen. The style-verify harness fails the build on one.
- Copy describes what teachers and leaders can do. It never leads with AI. Where revU drafts text, say that a teacher reviews and approves every draft.
- Measure correctness against what the institution decided, not against the engine's own inputs. When you add a guard, run it. Guard the pattern, not the instance.

# Working in this repo

## Writing

Never write an em dash (U+2014). Use a plain hyphen, a comma or a colon.
This covers user-visible copy, code comments, markdown and commit messages.

## Copy

Copy describes what teachers and leaders can do. It never leads with AI.
Where revU drafts text, say that a teacher reviews and approves every draft.
En dashes (U+2013) are allowed, for example in academic year ranges.
Enforced by frontend/style-verify.mts, which scans the whole repo and holds
the character by code point so the guard does not contain what it forbids.

## Verifying a change

No test framework. Harnesses run with npx tsx from frontend/, and every one
must pass before a change is done. Also: npx tsc -b, npx eslint src with
0 warnings, npx knip (dead code, unused dependencies), npx vite build, then
npx tsx bundle-verify.mts. In backend/: go mod tidy -diff, go vet, staticcheck,
go-licenses check, go test (see .github/workflows/ci.yml for exact commands).
The browser journey runs with: cd e2e && npm test.

## Measure against what the institution decided

Check results against the scheme the institution published, not against the
engine's own inputs.

## When you add a guard, run it

A rule nothing checks comes back.

## Guard the pattern, not the instance

- No file outside internal/scheme computes a result.
- No file outside the evidence write service writes evidence.
- No file shows an institution word without t().
- No marks are held as floats.
- No missing value is ever turned into zero.

## API errors and the contract

- Every non-2xx answer is RFC 7807 problem details with a stable code
  (backend/internal/problem). Handlers return problem.New(status, code,
  detail) or problem.Invalid(fields...); any other error becomes a 500 that
  never leaks internals. The app reads them as ApiError (src/api/problem.ts)
  and branches on code.
- After editing contracts/openapi.yaml run make gen (or npm run gen:api in
  frontend/ and go generate ./internal/api/ in backend/). CI fails when the
  generated files are stale.
- backend/internal/server/contract_test.go fails when a route is served but
  not in the spec, or in the spec but not served. Feature endpoints live
  under /v1; /api/health stays where it is.

## Stack decisions (blueprint v6)

- Chi on net/http, not Fiber: Part 38 picks Chi for greenfield work, and the
  backend had only its health check when v6 arrived. Part 12 still says
  Fiber; Part 38 is newer and wins.
- Libraries named in Part 38 (React Router, Zustand, Zod, Vitest,
  OpenTelemetry, Sentry) are added with the first feature that uses them,
  never ahead of it: knip and go mod tidy fail on unused dependencies.
- Vitest is for component and unit tests; the *-verify.mts harnesses stay
  for repo-wide guards (style, licences, bundle, API errors).
- Tenant scope always comes from the signed-in identity and revU's own
  membership rows, never from a client-sent id alone. RLS is the second
  line, set per transaction so pooled connections never leak a tenant.
- Long work (report batches, imports, exports, scans) is queued and returns
  a job id; the request never stays open for it.
- One template and one renderer for preview and final PDF.

## Layout

- frontend/ - the app (React 19 + Vite), deployed to app.revu.bhusku.com
- backend/ - the server (Go 1.26 + Chi + pgx): cmd/server, cmd/worker, internal/
- database/migrations/ - numbered SQL files, applied in order
- contracts/openapi.yaml - the API contract, source of truth
- marketing/ - the public site (Next.js static export), built in v6.10
- e2e/ - Playwright browser journey
- prototype/ - the earlier browser-only demo, kept as a working reference until v4
- docs/ - blueprint (kept out of the public repo), restore drill

## Local development

- `make up` (or `docker compose up --build -d`) starts PostgreSQL 18, MinIO, Gotenberg and the server on :8080. The server applies database/migrations at start.
- Two database roles: MIGRATE_DATABASE_URL connects as the owner and runs migrations; DATABASE_URL connects as revu_app (no owner, no BYPASSRLS), whose password the server sets from APP_DB_PASSWORD. In production the server refuses to start if DATABASE_URL could bypass row-level security.
- New tenant tables: give them org_id, reference parents by (org_id, parent_id), and register them with `SELECT revu_tenant_table('name');` in the migration. internal/db/rls_test.go fails on a table that is not fenced, and asks for seed rows in internal/db/dbtest so the table is proven.
- Backend tests that need the database: TEST_DATABASE_URL (owner) builds it from database/migrations and tests as revu_app.
- `cd frontend && npm install && npm run dev` starts the app on :5173, proxying /api to :8080.
- Windows without make: run the docker compose commands in the Makefile directly.
