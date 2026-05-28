set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

versions:
    @echo "bun:        $(bun --version)"
    @echo "node:       $(node --version)"
    @echo "just:       $(just --version)"
    @echo "pre-commit: $(pre-commit --version)"
    @echo "cspell:     $(cspell --version 2>/dev/null || echo not-found)"

setup:
    bun install --frozen-lockfile
    pre-commit install --install-hooks

# Dev servers
dev:
    bunx nx run-many -t serve --projects=api,web --parallel=2
dev-api:
    bunx nx serve api
dev-web:
    bunx nx serve web

# Quality
check:
    bun run check:ci
fmt:
    bun run format
fmt-check:
    bun run format:check
lint:
    bun run lint
typecheck:
    bunx tsc --noEmit
spell:
    bunx cspell --no-progress "**/*.{ts,html,md,json}"

# Tests
test:
    bunx nx run-many -t test
test-watch:
    bunx nx test web --watch

# Build
build:
    bunx nx run-many -t build
clean:
    rm -rf dist tmp .nx/cache .angular/cache coverage

# CI gate
ci: fmt-check lint typecheck spell test build

# Pre-commit
pre-commit-run:
    pre-commit run --all-files

# Postgres helpers
db:
    PGPASSWORD=hrm_dev_password psql -h postgres -U hrm_app -d hono_remult_dev
db-status:
    pg_isready -h postgres -U hrm_app -d hono_remult_dev
db-logs:
    docker compose -p hono-remult-1 logs -f postgres
db-reset:
    @echo "This will drop and recreate hono_remult_dev. Ctrl-C to abort."
    @sleep 3
    PGPASSWORD=hrm_dev_password psql -h postgres -U hrm_app -d postgres \
      -c "DROP DATABASE IF EXISTS hono_remult_dev WITH (FORCE);" \
      -c "CREATE DATABASE hono_remult_dev OWNER hrm_app;"

# Nx affected
affected:
    bunx nx affected -t lint test build
