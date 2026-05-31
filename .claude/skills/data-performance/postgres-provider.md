# Postgres Provider, Roles & Pooling

How the API connects to Postgres, why DDL is kept out of the runtime path, and how indexes are
declared. The schema itself is owned by Atlas — see the [Atlas skill](../atlas/SKILL.md).

## 1. `createPostgresDataProvider`

**Pattern:** Build the provider once per process with `createPostgresDataProvider({
connectionString, schema })`. It returns a `Promise<SqlDatabase>` that `remultApi` awaits.

```typescript
import { createPostgresDataProvider } from 'remult/postgres';

const dataProvider: Promise<SqlDatabase> = createPostgresDataProvider({
  connectionString: DATABASE_URL,
  schema: SCHEMA,
});
```

(`apps/api/src/main.ts`)

`schema` is the Postgres schema Remult qualifies its tables with — here `app`, matching the
`search_path` the roles are configured with.

## 2. `ensureSchema: false` goes on `remultApi`, not the provider

**Pattern:** Set `ensureSchema: false` on the `remultApi(...)` call. This is the flag that stops
Remult emitting any `CREATE TABLE` / `ALTER` at boot. It is **not** an option on
`createPostgresDataProvider`.

```typescript
const api: RemultHonoServer = remultApi({
  admin: (): boolean => remult.isAllowed(Roles.admin),
  dataProvider,
  ensureSchema: false,
  entities,
  getUser: (c: Context): Promise<UserInfo | undefined> => { /* ... */ },
});
```

(`apps/api/src/main.ts`)

**Avoid:** Flipping `ensureSchema: true` (or omitting it — it defaults to on). That lets the runtime
mutate the schema, which would race Atlas and could run DDL on a leaked connection.

```typescript
// WRONG — runtime now owns DDL, fighting Atlas for the schema.
const api = remultApi({ dataProvider, entities, ensureSchema: true });
```

**Avoid:** Running any DDL from the API for any reason — no `CREATE`, `ALTER`, or `DROP`. All schema
change flows through Atlas migrations in `apps/api/src/migrations/`.

## 3. The `hrm_runtime` role and `search_path`

The API connects as `hrm_runtime`, a **DML-only** role. It can `SELECT/INSERT/UPDATE/DELETE` but
cannot create or alter objects. DDL runs separately through Atlas under a different connection
string (`DATABASE_URL_MIGRATIONS`).

```sql
-- No-DDL runtime role.
CREATE ROLE hrm_runtime LOGIN PASSWORD 'hrm_runtime_password';

GRANT CONNECT ON DATABASE hono_remult_dev TO hrm_runtime;
GRANT USAGE ON SCHEMA app TO hrm_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hrm_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO hrm_runtime;

ALTER ROLE hrm_runtime SET search_path = app, public;
```

(`.devcontainer/postgres-init/00-init.sql`)

The role's `search_path = app, public` is what lets the provider's `schema: SCHEMA` (`app`) resolve.
`hrm_runtime` is granted no `CREATE`, so even a misconfigured `ensureSchema: true` could not actually
create tables — defence in depth alongside the flag.

## 4. Indexes and uniques live in Atlas, not Remult

**Pattern:** Remult has no `dbIndex` / `indexes` option and will not create indexes. Declare every
index and unique constraint as raw SQL in the entity's `*SchemaExtras` array; Atlas reads these when
diffing the schema.

```typescript
export const finalReportSchemaExtras: readonly string[] = [
  'ALTER TABLE "finalReports" ADD CONSTRAINT "finalReports_fireIncidentId_key" UNIQUE ("fireIncidentId")',
] as const;
```

(`libs/shared/domain/src/fire/final-report.ts`)

This is also where the index backing any deep/sorted OFFSET pagination belongs — add a
`CREATE INDEX ...` string to the relevant `*SchemaExtras` array, then run
`just migrate-generate <name>`.

**Avoid:** Expecting Remult to manage indexes, or reaching for a non-existent decorator option.

```typescript
// WRONG — no such option; Remult ignores indexing entirely.
@Fields.string({ dbIndex: true })
fireIncidentId = '';
```

## 5. Pooling

`createPostgresDataProvider` manages a single `pg.Pool` internally. Build the provider **once per
process** (a module-level constant, as in `main.ts`) and let `remultApi` await it — never construct
a provider or a pool per request. Re-creating it per request exhausts connections.

**Avoid:** Per-request provider/pool construction.

```typescript
// WRONG — a fresh pool per request leaks connections until the server falls over.
app.get('/things', async (c) => {
  const provider = await createPostgresDataProvider({ connectionString, schema });
  // ...
});
```
