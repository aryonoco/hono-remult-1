set shell := ["bash", "-euo", "pipefail", "-c"]

default:
    @just --list

versions:
    @echo "bun:        $(bun --version)"
    @echo "node:       $(node --version)"
    @echo "just:       $(just --version)"
    @echo "pre-commit: $(pre-commit --version)"
    @echo "cspell:     $(cspell --version 2>/dev/null || echo not-found)"
    @echo "mdlint:     $(markdownlint-cli2 --version 2>/dev/null || echo not-found)"

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
fmt-html-check:
    bun run format:html:check
lint:
    bun run lint
typecheck:
    bun run typecheck
spell:
    cspell --no-progress "**/*.{ts,html,md,json}"
markdownlint:
    markdownlint-cli2 "**/*.md" "#node_modules" "#.nx" "#.angular" "#dist" "#coverage" "#tmp"
# Align all Markdown tables to MD060 "aligned" (markdownlint has no fixer; run after editing tables)
align-tables:
    python3 scripts/align-markdown-tables.py
align-tables-check:
    python3 scripts/align-markdown-tables.py --check

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

# CI gate — pre-commit hooks plus every correctness check. No DB needed (tests use InMemory).
# `pre-commit-run` can auto-fix (biome/whitespace/EOF) and then fail; re-run after it tidies the tree.
# `check` = biome ci (lint + format + import organisation) + eslint + tsc -b --noEmit.
ci: pre-commit-run check fmt-html-check spell markdownlint test build

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

# Schema migrations (Atlas owns DDL; main.ts has ensureSchema:false)
migrate-generate name:
    bun run migrate:generate {{name}}
migrate-plan:
    bun run migrate:plan
migrate-apply:
    bun run migrate:apply
migrate-lint:
    bun run migrate:lint
migrate-status:
    bun run migrate:status
migrate-validate:
    bun run migrate:validate
migrate-hash:
    bun run migrate:hash
schema-inspect:
    bun run schema:inspect

# Nx affected
affected:
    bunx nx affected -t lint test build
