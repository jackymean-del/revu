# revU engineering rules

- Product: revU by Bhusku. Assessment, results and holistic progress platform. Read docs/blueprint before any task.
- Stack: React 19 with Vite, TypeScript strict and Tailwind 4 in frontend. Go 1.26 with Fiber v3 and pgx in backend. PostgreSQL 18. Clerk auth. Cloudflare R2 storage. Cloudflare Pages for the sites, Railway for the server and database.
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

## Layout

- frontend/ - the app (React 19 + Vite), deployed to app.revu.bhusku.com
- backend/ - the server (Go 1.26 + Fiber v3 + pgx): cmd/server, cmd/worker, internal/
- database/migrations/ - numbered SQL files, applied in order
- contracts/openapi.yaml - the API contract, source of truth
- marketing/ - the public site (Next.js static export), built in v6.10
- e2e/ - Playwright browser journey
- prototype/ - the earlier browser-only demo, kept as a working reference until v4
- docs/ - blueprint (kept out of the public repo), restore drill

## Local development

- `make up` (or `docker compose up --build -d`) starts PostgreSQL 18, MinIO, Gotenberg and the server on :8080.
- `cd frontend && npm install && npm run dev` starts the app on :5173, proxying /api to :8080.
- Windows without make: run the docker compose commands in the Makefile directly.
