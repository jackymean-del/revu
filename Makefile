# revU - common Docker tasks (macOS / Linux; on Windows run the docker compose lines directly)
.PHONY: up down build logs ps reset migrate test gen

up:        ## Build + start the stack (db, minio, gotenberg, api)
	docker compose up --build -d

down:      ## Stop the stack (keeps the database volume)
	docker compose down

build:     ## Rebuild images
	docker compose build

logs:      ## Tail logs for all services
	docker compose logs -f

ps:        ## Show running services
	docker compose ps

reset:     ## Stop AND wipe the database volume (migrations re-run on next up)
	docker compose down -v

migrate:   ## Apply all SQL migrations to a running db (for existing volumes)
	@for f in database/migrations/*.sql; do \
		echo "applying $$f"; \
		docker compose exec -T db psql -U revu -d revu < "$$f"; \
	done

test:      ## Everything CI checks: Go tests on the running database, every harness, lint, dead code, budget, browser journey
	cd backend && TEST_DATABASE_URL="postgresql://revu:secret@localhost:5432/revu?sslmode=disable" go test ./... -count=1 -p 1
	cd frontend && npx tsc -b && npx eslint src *.mts --max-warnings 0 && npx knip
	cd frontend && for f in *-verify.mts; do [ "$$f" = bundle-verify.mts ] || npx tsx "$$f" || exit 1; done
	cd frontend && npx vite build && npx tsx bundle-verify.mts
	cd e2e && npm test

gen:       ## Regenerate the API types (TypeScript, Go) and the server's copy of the word list
	cd frontend && npm run gen:api && npm run gen:terms
	cd backend && go generate ./internal/api/
