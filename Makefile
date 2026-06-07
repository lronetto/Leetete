.PHONY: install dev-web dev-api migrate build docker-up docker-down docker-logs lint typecheck

install:
	pnpm install
	cd apps/api && uv sync

dev-web:
	pnpm -F @leetete/web dev

dev-api:
	cd apps/api && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 3000

migrate:
	cd apps/api && uv run python -m app.db.migrate

build:
	pnpm -F @leetete/web build

typecheck:
	pnpm -F @leetete/web typecheck

lint:
	cd apps/api && uv run ruff check app

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f app
