# revU engineering rules

- Product: revU by Bhusku. Assessment, results and holistic progress platform. Read docs/blueprint before any task.
- Stack: React 19 with Vite, TanStack Router and Query, TypeScript strict and Tailwind 4 in frontend. Go 1.26 with Fiber v3 and pgx in backend. PostgreSQL 18. Clerk auth. Cloudflare R2 storage. Cloudflare Pages for the sites, Railway for the server and database.
- Grid: screens import only the Bhusku DataGrid wrapper, never a grid library directly. The editable grid is chosen by the spike in Part 59.8 (react-data-grid is the leading candidate). AG Grid Enterprise is never used.
- Order: subject, column, row and section order is configuration held in layout profiles, never code. Order never changes a calculation (Part 73).
- Tenant: org_id is the institution tenant, one institution or branch location per org. A group is a virtual container with its own group_id and is never a tenant (Part 65, D2).
- Privacy: this is data about children. No student names, marks or remark text in logs, analytics or AI prompts beyond the minimum facts (Part 70).
- Names: v1 to v10 are product releases. Part 65 is the decisions register and wins where parts disagree. Build the pilot slice P0 first (Part 66).
- Spec-first API: edit contracts/openapi.yaml first, then regenerate the TypeScript client and Go types. Never hand-edit generated code.
- Database: every change is a numbered SQL file in database/migrations, applied by the server at start under an advisory lock, forward-only in production. Queries are plain SQL through pgx, kept in each module's repository file. Every table that holds tenant data, including join, history and computed tables, has org_id and row-level security.
- No hard-coded institution words in the UI, PDFs, emails or generated text. Use the terminology resolver t().
- Marks are exact decimals: numeric(8,2) in the database and a decimal type in Go. Never float.
- Missing is never zero. Evidence has a state: scored, absent, exempt, not_applicable, pending, not_assessed.
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

## Decisions in force (blueprint v22, Part 65)

- Fiber v3 and TanStack Router (D3), matching schedU. Chi and React Router
  were tried and removed. frontend/deps-verify.mts fails the build if Chi,
  React Router, goose, Vitest or AG Grid Enterprise appears in a dependency
  file, or a screen imports a grid library outside src/components/DataGrid
  (AT-D-01).
- D20, marks-entry grid (spike of Part 59.8, docs/decisions/D20-marks-grid.md):
  a thin custom grid on TanStack Table and Virtual behind
  frontend/src/components/DataGrid. react-data-grid and AG Grid Community
  were measured and not chosen. The cell rules and upload or paste planning
  in that folder are proven by datagrid-verify.mts.
- Libraries named in Part 38 (Zustand, Zod, OpenTelemetry, Sentry) are added
  with the first feature that uses them: knip and go mod tidy fail on unused
  dependencies.
- Confidential by default (D19, Part 77): the permission matrix in
  backend/internal/auth/policy is the most a role can receive; coordinators,
  principals and view-only roles get counts and status unless an
  administrator grants more.
- Guardians are rows (D14). Value states are six (D16); TC is a student
  status, not a cell value.
- style-verify also scans REVU.md and docs/blueprint where present (D11).
- Tenant scope comes from the signed-in identity and revU's membership rows,
  never from a client-sent id alone. RLS is the second line, set per
  transaction so pooled connections never leak a tenant.

## People and imports (v1.8)

- A student is one identity; each year's place is an enrolment, whose year
  comes from its section. Leaving or graduating is the student's status.
- Class lists import in two steps: POST /v1/students/import previews and
  stores an import job; POST /v1/import-jobs/{id}/apply writes exactly the
  accepted rows, matched by admission number, so a repeat never duplicates.
  Rejected rows download as CSV (cells that could run as a formula are
  neutralised). Up to 5000 rows per file until background jobs arrive.
- Records with the five usual operations share backend/internal/records.

## History (v1.9)

- Every change goes through audit.Record in the same transaction, with the
  record before and after. GET /v1/audit lists it newest first with filters;
  administrators and principals read it (audit.read).
- Confidential content (papers, answer keys, marks, remarks; Part 77.4) is
  logged by id only, never its content. Modules from v2 on pass ids, not
  documents, for those.

## Setup and invitations (v1.10)

- A new client: the platform owner runs `server create-org "<name>" <school|college|university> <admin email>`
  (with MIGRATE_DATABASE_URL); it creates the organisation, a main branch and an
  invitation for its administrator, emailed by Clerk when CLERK_SECRET_KEY is set.
- Invitations are claimed on sign-in: GET /v1/me asks Clerk for the person's
  verified addresses and turns matching open invitations into roles
  (revu_claim_invitations). No password is ever created or sent by revU.
- The setup steps use the ordinary endpoints; GET /v1/setup reports progress and
  POST /v1/setup/complete marks it done. Home and the menu follow the person's roles.

## Dashboards (P0.1)

- GET /v1/dashboard gives the person's tiles for their roles: at most six,
  needing attention first, then plain totals, then what is in order. GET
  /v1/dashboard/{key} gives the list behind one tile.
- A tile is one SQL query in backend/internal/dashboard; its number is the
  length of that query's list, so the two cannot disagree (AT-DB-01). A new
  tile is one entry in that table, a label in src/lib/dashboard.ts and a row in
  dashboard_test.go.
- Teachers count only what is assigned to them (AT-DB-02); a role over some
  branches counts only those branches, and tiles about things in no branch
  (unplaced students, setup, staff sign-in) go to roles over the whole
  organisation. View-only gets numbers and no lists (Part 77): the list answers
  403 auth.forbidden. A tile someone does not get answers 404 dashboard.unknown.
- Leaders can print Home; the print view drops the header, buttons and lists.

## Subject groups and choices (P0.2)

- A subject group (backend/internal/choices) belongs to a level and offers
  options under a rule: exactly one, at most one, or a range. A subject in no
  group is taken by everyone; a level subject reports applicability selected
  when it is optional or a group offers it. Adding an option adds the subject
  to the level. One subject is offered by one group of a level at most.
- A choice holds for a year between effective_from and effective_to (the
  last day; null runs to the end). Nothing is deleted: a change ends the old
  row the day before the new one begins, a correction on its first day ends
  it before it began, and every change is audited with the rows' ids.
- A first choice applies from the start of the year; a change applies from
  the date given, or today kept inside the year.
- Missing means below the group's minimum on the day. It is listed by GET
  /v1/sections/{id}/choice-completeness and the missing_choices and
  my_class_no_choice tiles; results will block that group with the reason
  choice missing. revU never picks an option for anyone.
- Who: administrators and coordinators change choices, a class teacher in
  their own section (policy SubjectChoices); a section's teachers and
  leaders may read them. Groups themselves are structure (administrators).
- Import reads an admission number column and either one column per group,
  headed with its name, or a Subject column. It reports first and applies
  only with apply=true; the same file twice changes nothing.

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

- `make up` (or `docker compose up --build -d`) starts PostgreSQL 18, MinIO, Gotenberg and the server on :8080. The server applies database/migrations at start.
- Two database roles: MIGRATE_DATABASE_URL connects as the owner and runs migrations; DATABASE_URL connects as revu_app (no owner, no BYPASSRLS), whose password the server sets from APP_DB_PASSWORD. In production the server refuses to start if DATABASE_URL could bypass row-level security.
- New tenant tables: give them org_id, reference parents by (org_id, parent_id), and register them with `SELECT revu_tenant_table('name');` in the migration. internal/db/rls_test.go fails on a table that is not fenced, and asks for seed rows in internal/db/dbtest so the table is proven.
- Clerk keys for local work: the development instance shared with schedU (pk_test_ and sk_test_ keys). The secret goes in .env at the repo root (docker compose) and in the CLERK_SECRET_KEY entry of your local launch configuration; the publishable key goes in frontend/.env.local. See .env.example and frontend/.env.example. Live keys are set only in Railway and Cloudflare.
- Sign-in (v1.4): the server checks the Clerk session token on every call
  (backend/internal/auth/clerk.go) and takes only the user id from it;
  organisation and role come from revU's memberships. The token must have
  been issued for one of ALLOWED_ORIGINS. The Clerk webhook
  (POST /v1/webhooks/clerk, Svix-signed, CLERK_WEBHOOK_SECRET) keeps
  memberships of organisations linked by orgs.clerk_org_id in step: org:admin
  becomes admin, org:<revU role> that role, anything else view-only. Rows
  marked source 'revu' are never changed by it.
- Without CLERK_SECRET_KEY, local work can still sign in as DEV_USER_ID
  (refused in production; ignored when the Clerk key is set).
- Demo data: `go run ./cmd/server seed` from backend/ (with MIGRATE_DATABASE_URL and DEV_USER_ID set to your sign-in id) fills
  Riverside Public School (school words: 3 grades, 6 sections, 8 staff, 72 students with parents) and Lakeview University
  (university words: 2 programme years, 4 batches, 5 faculty, 40 learners), with you as administrator. Safe to run again.
- Signing in locally before Clerk (until v1.4): set DEV_USER_ID (refused when APP_ENV=production) and run `go run ./cmd/server seed` from backend/ with MIGRATE_DATABASE_URL set; it creates two demo organisations (school and university presets) with that user as administrator.
- Institution words: the key list and presets live in frontend/src/lib/terminology/presets.json. After editing it run make gen (npm run gen:terms) so the server's embedded copy matches; a Go test fails when it does not. The lint rule frontend/eslint-rules/institution-words.js fails on any preset word written literally in a component.
- Backend tests that need the database: TEST_DATABASE_URL (owner) builds it from database/migrations and tests as revu_app.
- `cd frontend && npm install && npm run dev` starts the app on :5173, proxying /api to :8080.
- Windows without make: run the docker compose commands in the Makefile directly.
