---
name: atlas
description: "Atlas Community Edition for Postgres schema migrations in this NX/Bun/Remult project. Versioned workflow only — Remult entities are the source of truth; Atlas reads a Remult-populated scratch DB to derive SQL diffs. Use when editing entities that change schema, generating/applying/linting/planning migrations, touching apps/api/src/migrations/, atlas.hcl, apps/api/src/db/sync-to-desired.ts, or running bun run migrate:* / just migrate-* / atlas commands."
user-invocable: false
---

# Atlas Schema Migrations

Atlas owns all DDL execution in this project. The Hono API runs with `ensureSchema: false` and connects as `hrm_runtime` (DML only). Atlas connects as `hrm_app` (DDL allowed) via `DATABASE_URL_MIGRATIONS`. See `docs/00-plan.md` for the architectural rationale and `atlas.hcl` for the env-block configuration.

**Use this project's wrapper commands** (`bun run migrate:*` / `just migrate-*`) — they handle env loading via mise, the sync-to-desired step, and the correct `--env` flag. Raw `atlas` invocations skip these and tend to fail with confusing errors.

## Current version

!`grep -E '^atlas(-community)?\s*=' .mise.toml 2>/dev/null || echo "atlas not pinned"`

The pinned binary is the **Apache 2.0 Community Edition** (`atlas-community` via Aqua/mise). `atlas migrate lint` is free here; the default EULA-licensed build paywalls it as of v0.38.

## References

- [Workflow](workflow.md) — daily edit-entity → migrate cycle, sync-to-desired mechanics, worked example
- [Troubleshooting](troubleshooting.md) — diagnostics for the failure modes encountered during initial setup

## Project commands

| Action | Wrapper | Underlying |
|--------|---------|------------|
| Generate a migration after editing entities | `bun run migrate:generate <name>` | sync-to-desired.ts → `atlas migrate diff` |
| Preview pending migrations (dry-run) | `bun run migrate:plan` | `atlas migrate apply --dry-run` |
| Apply pending migrations | `bun run migrate:apply` | `atlas migrate apply` |
| Lint latest migration for destructive ops | `bun run migrate:lint` | `atlas migrate lint --latest 1` |
| Show applied/pending counts | `bun run migrate:status` | `atlas migrate status` |
| Verify migrations dir integrity | `bun run migrate:validate` | `atlas migrate validate` |
| Re-hash atlas.sum after manual edit | `bun run migrate:hash` | `atlas migrate hash` |
| Inspect live schema (target DB) | `bun run schema:inspect` | `atlas schema inspect --format sql` |

All wrappers also have `just migrate-*` / `just schema-inspect` equivalents.

## Decision tree

```
Schema change needed
├─ Edit Remult entity (libs/shared/domain/src/...)
├─ bun run migrate:generate <descriptive_name>
│   └─ writes apps/api/src/migrations/<timestamp>_<name>.sql
├─ Review the SQL in the new file (commit-worthy artefact)
├─ bun run migrate:lint  ──► destructive change? STOP, see workflow.md
├─ bun run migrate:plan  ──► confirm what apply will execute
├─ bun run migrate:apply ──► applies to hono_remult_dev
└─ git add apps/api/src/migrations/ && commit
```

| Symptom | Tool |
|---------|------|
| "What's currently in the DB?" | `bun run schema:inspect` |
| "Did I forget to apply a migration?" | `bun run migrate:status` |
| "Will this break anything destructive?" | `bun run migrate:lint` |
| "Manually edited a .sql file" | `bun run migrate:hash` then commit the updated `atlas.sum` |
| "atlas.sum doesn't match" | `bun run migrate:validate` (read-only check) |

## Database roles (two-role least-privilege)

| Role | URL env var | Purpose |
|------|-------------|---------|
| `hrm_runtime` | `DATABASE_URL` | API runtime — DML only. Cannot CREATE/ALTER/DROP. |
| `hrm_app` | `DATABASE_URL_MIGRATIONS` | Atlas's target — full DDL. Only the migration pipeline uses this. |
| `hrm_app` | `ATLAS_DESIRED_URL` | Atlas `src` — scratch DB populated by sync-to-desired.ts. |
| `hrm_app` | `ATLAS_DEV_URL` | Atlas `dev` — replay scratch. Atlas owns this DB end-to-end. |

All four URLs live in `.env` (and `.env.example`). `mise` loads `.env` into the shell via `_.file = ".env"` in `.mise.toml` so Atlas (a Go subprocess) sees them — `bun run` alone does NOT propagate `.env` to subprocesses.

## What Atlas does NOT do here

- **No declarative workflow** — `atlas schema apply` is not used. This project is versioned-only.
- **No ORM provider** (`atlas-provider-typeorm` / `drizzle` / `gorm` etc.) — Atlas reads schema from a live Postgres DB that Remult's `ensureSchema` populates. See [Workflow](workflow.md).
- **No Atlas Cloud / `atlas login`** — Community Edition runs entirely locally.
- **No HCL schema file** — `schema.hcl` does not exist; Remult entities are the source of truth.

## Key rules

1. **Migrations are committed code.** Review `apps/api/src/migrations/*.sql` in PRs alongside the entity changes that produced them.
2. **Never edit an applied migration.** Generate a corrective one instead. Editing breaks `atlas.sum`; `bun run migrate:hash` fixes the hash but doesn't fix what other developers/environments already ran.
3. **Lint must pass before merge.** Destructive operations (drop column / drop table / non-concurrent index on large table) need explicit team review.
4. **Plan before apply.** `bun run migrate:plan` shows the exact SQL Atlas will execute before it runs.
5. **`ensureSchema` stays `false`.** DDL belongs to Atlas, not the API process. The `hrm_runtime` role cannot run DDL anyway — flipping `ensureSchema: true` will only cause boot to fail with "permission denied for schema app".
6. **Community Edition only.** The pinned binary is Apache 2.0. Switching to the EULA-licensed build (curl install) is a deliberate decision, not a default upgrade.
7. **Schema scoping uses URL `search_path=app`**, NOT `schemas = ["app"]` in atlas.hcl. The latter has asymmetric src-vs-dev scoping in v1.2.0 and generates spurious `DROP SCHEMA public CASCADE`. See [Troubleshooting](troubleshooting.md).
8. **All credentials via `getenv`** in atlas.hcl. No connection strings in committed config files.

## Future Azure path (no rework)

When GitHub Actions + Terraform + Azure Postgres Flexible Server land:

- Add an `env "azure"` block to `atlas.hcl`, pointing at Azure URLs (still via `getenv`)
- The migration pipeline runs `atlas migrate apply --env azure` from a GHA job with OIDC-federated Azure auth
- App runtime uses a user-assigned managed identity mapped to the Azure equivalent of `hrm_runtime`

Local files, developer commands, and migration history stay identical. See `docs/00-plan.md` for the full design.
