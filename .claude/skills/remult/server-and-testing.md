# Remult Server Integration & Testing

How Remult mounts on the server, how to use `repo()` outside the CRUD/BackendMethod flow, and how to test
entity rules **without a database** — including the difference between testing a rule's *value* and testing
its *enforcement*.

---

## Mounting Remult — `remultApi`

The adapter entry point is `remultApi`, imported from the framework-specific package — e.g. on **Hono**,
`remultApi` from `remult/remult-hono`. `getUser` turns the request into a `UserInfo`; `dataProvider` is
the DB; entities are registered here or none of their endpoints exist.

```typescript
import { remult, type UserInfo } from 'remult';
import { createPostgresDataProvider } from 'remult/postgres';
import { type RemultHonoServer, remultApi } from 'remult/remult-hono';
import { type Context, Hono } from 'hono';

const api: RemultHonoServer = remultApi({
  entities: [Task /* , … every entity */],
  dataProvider: createPostgresDataProvider({ connectionString: DATABASE_URL, schema: 'app' }),
  ensureSchema: false, // set when an external migration tool owns DDL (omit to let Remult sync)
  admin: () => remult.isAllowed('admin'), // gate the /api/admin UI by role, never `true`
  getUser: (c: Context): Promise<UserInfo | undefined> => extractUserFromJwt(c),
});

const app = new Hono();
app.route('/', api); // mount LAST, after logger/cors/auth middleware (onion model)
```

Pinned facts (baseline agents are unsure of these): the export is **`remultApi`** (not `remultHono` /
`createRemultHono`); the Postgres option key is **`connectionString`**; register every entity; set
`ensureSchema: false` when DDL is externally managed. See `.claude/rules/api-conventions.md` and the
`hono` skill.

---

## Using `repo()` in non-Remult routes — `withRemult`

A bare `repo()`/`remult` access in a custom route throws *"remult object was requested outside of a valid
context"*. Wrap the handler so the request context (and `remult.user`) is established.

```typescript
// Hono — the adapter exposes withRemult on the returned server
app.post('/hooks/ingest', async (c) => {
  return api.withRemult(c, async () => {
    if (!remult.isAllowed('admin')) return c.json({ error: 'forbidden' }, 403);
    await repo(Task).insert({ title: 'from webhook' });
    return c.json({ ok: true });
  });
});
```

The callback runs inside the context; compute the result inside it and return the framework `Response`.
The Express form is identical in spirit — `api.withRemult` as middleware, or `api.withRemultAsync(req,
async () => { … })` to wrap a promise. A webhook often needs a **service/admin** context rather than the
caller's permissions — set `remult.user` deliberately or do the writes via a BackendMethod-style guard.

---

## Testing — two harnesses, two purposes

Remult tests run **as backend code**. That has a crucial consequence:

> Direct `repo()` calls run with **backend authority** and **bypass `allowApi*`**. So a plain
> `InMemoryDataProvider` test verifies *validation and logic*, but it will happily delete a row a real API
> caller could never delete — it does not prove authorization is enforced.

### 1. `InMemoryDataProvider` — fast validation / logic tests

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { remult, repo, InMemoryDataProvider } from 'remult';
import { Task } from '../shared/Task';

describe('Task validation', () => {
  beforeEach(() => {
    remult.dataProvider = new InMemoryDataProvider();
  });

  it('requires a title', async () => {
    await expect(repo(Task).insert({ title: '' })).rejects.toThrow();
  });

  it('rejects a title over 50 chars', async () => {
    await expect(repo(Task).insert({ title: 'x'.repeat(51) })).rejects.toThrow();
  });
});
```

(This is the standard pattern for entity validation/logic unit tests.)

### 2. `TestApiDataProvider` — prove `allowApi*` is enforced

`TestApiDataProvider` (from `remult/server`) routes each operation through the **API pipeline**, so
permission rules actually fire. Toggle `remult.user` across cases; forbidden operations throw.

```typescript
import { describe, test, expect, beforeEach } from 'vitest';
import { remult, repo } from 'remult';
import { TestApiDataProvider } from 'remult/server';
import { InMemoryDataProvider } from 'remult';
import { Task } from '../shared/Task'; // @Entity({ allowApiDelete: 'admin' })

describe('delete authorization', () => {
  beforeEach(async () => {
    remult.dataProvider = TestApiDataProvider({ dataProvider: new InMemoryDataProvider() });
    remult.user = { id: 'seed', roles: ['admin'] };
    await repo(Task).insert({ title: 'seed' });
  });

  test('a normal user cannot delete', async () => {
    remult.user = { id: '1' }; // no admin role
    const task = await repo(Task).findFirst();
    await expect(repo(Task).delete(task!)).rejects.toThrow(/Forbidden/);
  });

  test('an admin can delete', async () => {
    remult.user = { id: '1', roles: ['admin'] };
    const task = await repo(Task).findFirst();
    await repo(Task).delete(task!);
    expect(await repo(Task).count()).toBe(0);
  });
});
```

For SQL-expression/SQL-filter logic, back the test with in-memory SQLite (`createSqlite3DataProvider`) and
`ensureSchema: true` so the tables exist. See the `testing` skill for repo-wide conventions.

---

## Modules — bundle entities + init (3.0.6+)

A module groups related entities, controllers, and server init so an app registers them in one line. Pass
modules to `remultApi({ modules: [...] })`. Useful for feature packaging and reuse; see `llms-full.txt`
"Guides — Modules" (line ~5998).

## Standard Schema — interop with zod/valibot/ArkType

`standardSchema(repo(Entity))` exposes an entity as a [Standard Schema](https://standardschema.dev)
validator, so the entity's validation can be consumed by any library that speaks the spec. See
`llms-full.txt` "Integrations — Standard Schema" (line ~7393).
