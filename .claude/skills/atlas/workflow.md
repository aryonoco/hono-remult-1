# Atlas workflow — Remult-driven schema, Atlas-driven DDL

## The pattern

Generic Atlas tutorials assume an HCL schema file or an ORM provider (TypeORM/Drizzle/GORM/etc). This project does
neither. Remult entities are the source of truth, and Atlas reads schema from a live Postgres DB that we populate via
Remult's `ensureSchema`.

```text
┌──────────────────────────┐         ┌─────────────────────────────────────┐
│  libs/shared/domain/     │         │  apps/api/src/db/sync-to-desired.ts │
│  src/...entity.ts        │ ──────▶ │  (Bun script — boots Remult,        │
│  (Remult @Entity classes)│         │   wipes & rebuilds atlas_desired)   │
└──────────────────────────┘         └────────────────┬────────────────────┘
                                                      │
                                                      ▼
┌──────────────────────────┐         ┌─────────────────────────────────────┐
│  apps/api/src/migrations │ ◀────── │  atlas_desired DB (the "src")       │
│  *.sql + atlas.sum       │  diff   │  Atlas inspects this DB             │
└────────────┬─────────────┘         └─────────────────────────────────────┘
             │
             │ apply
             ▼
┌──────────────────────────┐         ┌─────────────────────────────────────┐
│  hono_remult_dev (target)│         │  atlas_dev (Atlas's replay scratch) │
│  hrm_runtime DML / API   │         │  Atlas wipes & rebuilds each diff   │
└──────────────────────────┘         └─────────────────────────────────────┘
```

`bun run migrate:generate <name>` orchestrates the top half. `bun run migrate:apply` runs the bottom.

## Files involved

| File                                  | Role                                                              |
| ------------------------------------- | ----------------------------------------------------------------- |
| `atlas.hcl`                           | Atlas env config — URLs (via `getenv`), migration dir, lint rules |
| `apps/api/src/config.ts`              | `entities` array and `SCHEMA` constant — single source of truth   |
| `apps/api/src/env.ts`                 | Typed env reader (`Bun.env.X`) — checks all required URLs exist   |
| `apps/api/src/db/sync-to-desired.ts`  | Wipes `app` schema in `atlas_desired`, runs Remult `ensureSchema` |
| `apps/api/src/db/migrate-generate.ts` | Orchestrator — runs sync-to-desired, then `atlas migrate diff`    |
| `apps/api/src/migrations/*.sql`       | Committed migration history — reviewable in PRs                   |
| `apps/api/src/migrations/atlas.sum`   | Atlas's hash file — protects against silent edits                 |

## Daily flow — worked example

Add a `priority` field to `Task`:

```typescript
// libs/shared/domain/src/tasks/task.ts
@Entity('tasks', { /* ... unchanged ... */ })
export class Task {
  // ... existing fields ...

  @Fields.literal(() => ['low', 'medium', 'high'] as const)
  priority: 'low' | 'medium' | 'high' = 'medium';
}
```

Then:

```bash
# 1. Generate the migration
just migrate-generate add_task_priority
#  ↳ sync-to-desired.ts drops + rebuilds atlas_desired with Remult ensureSchema
#  ↳ atlas migrate diff inspects atlas_desired, compares to migrations/, emits SQL

# 2. Review the new file
cat apps/api/src/migrations/*_add_task_priority.sql
# Expected:
#   ALTER TABLE "tasks" ADD COLUMN "priority" character varying NOT NULL DEFAULT 'medium';

# 3. Lint — destructive change check
just migrate-lint
# Expected: "no diagnostics found"

# 4. Preview what apply will run
just migrate-plan

# 5. Apply
just migrate-apply

# 6. Sanity-check the live schema
just schema-inspect | grep priority

# 7. Commit BOTH the entity edit and the migration files
git add libs/shared/domain/src/tasks/task.ts apps/api/src/migrations/
git commit -m "schema: add Task.priority"
```

## Why the sync-to-desired dance

Remult's `ensureSchema` is **additive only**: it adds missing tables and columns but never drops or alters. If we just
kept running `ensureSchema` against `atlas_desired` across many entity edits, dropped fields would linger and Atlas's
diff would be wrong.

`sync-to-desired.ts` solves this by:

1. Connecting to `atlas_desired` via `pg.Client`
2. `DROP SCHEMA app CASCADE` followed by `CREATE SCHEMA app` — full reset
3. Booting Remult against the fresh schema with `createPostgresDataProvider({ schema: 'app' })`
4. Calling `dataProvider.ensureSchema(entities.map(e => repo(e).metadata))`

After this, `atlas_desired` holds *exactly* what the current entity definitions imply — no historical residue. Atlas can
then diff cleanly.

## Adding a new entity

Same flow plus one extra step — register the entity in `config.ts`:

```typescript
// apps/api/src/config.ts
import { Task, FireIncident } from '@workspace/shared-domain';
export const entities: ClassType<unknown>[] = [Task, FireIncident];
```

Then `just migrate-generate add_fire_incident`. The Atlas diff will include `CREATE TABLE "fire_incidents" (...)`.

## When Remult's ensureSchema isn't enough

`ensureSchema` doesn't handle:

- Renames (it sees rename as drop+add)
- Column type changes
- Constraints beyond PK (no UNIQUE, no CHECK, no FK enforcement in some cases)
- Non-trivial indexes

For these, generate a migration via the normal flow, then **edit the resulting SQL by hand** before applying:

```bash
just migrate-generate rename_title_to_label
# Open the generated .sql and replace the auto-generated
# "DROP COLUMN title + ADD COLUMN label" with:
#   ALTER TABLE tasks RENAME COLUMN title TO label;
just migrate-hash      # re-hash atlas.sum after the manual edit
just migrate-lint      # confirm no new issues
just migrate-apply
```

`atlas.sum` MUST be regenerated via `migrate:hash` after any manual edit — otherwise `migrate:apply` (and CI) will
reject the migration as tampered.

## What changes for Azure later

When `env "azure"` is added to `atlas.hcl`:

- `bun run migrate:generate <name>` continues to work locally — it always uses `--env local`
- Apply becomes `atlas migrate apply --env azure` in a GitHub Actions job
- The committed `apps/api/src/migrations/*.sql` files are what the Azure pipeline applies — same files, different
  runtime
