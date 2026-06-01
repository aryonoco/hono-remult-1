---
name: remult
description: "Remult v3 fullstack CRUD framework — @Entity/@Fields decorators, the repo() repository API (find/insert/upsert/liveQuery/aggregate), BackendMethods, Relations, validation, authorization (allowApi*, apiPrefilter, includeInApi), lifecycle hooks, ValueListFieldType enums, Filter.createCustom, sqlExpression + dbNamesOf, metadata-driven UI, withRemult, InMemoryDataProvider/TestApiDataProvider, remult-hono. Use when writing or reviewing TypeScript that imports from 'remult', defining or changing an entity, wiring API permissions, building CRUD or query code, or testing entity rules. Covers the modern v3 idioms agents get wrong by default (repo() vs remult.repo(), Fields.id() vs the removed Fields.cuid(), upsert vs find-then-insert)."
user-invocable: false
---

# Remult API Reference

API-level knowledge for **Remult v3** (the fullstack TypeScript CRUD framework). It complements the
entity/API rules in `.claude/rules/` — those say WHICH patterns to follow; this skill shows HOW to drive
the Remult APIs correctly and which modern v3 idioms a capable agent gets wrong by default.

**Core mental model:** the **entity is the single source of truth**. One decorated class defines the
type, the database schema, the REST API, validation, permissions, and business logic — and the *same*
class runs on the client and the server. You read and write it through a **repository** (`repo(Entity)`),
which exposes an identical typed API in both places. Remult is context-aware: the same code resolves the
current request's user and permissions on the server, and proxies to the REST API on the client. "Define
once, enforce everywhere."

## Current version

!`grep -o '"remult": "[^"]*"' package.json 2>/dev/null || echo "remult not found — pin ^3"`

Docs bundled here are **v3.3.10**; pin `^3`. Decorators require `experimentalDecorators` in tsconfig.

## References

- [Entity patterns](entity-patterns.md) — `@Entity`, field decorators, `Fields.id` (NOT `Fields.cuid`),
  relations (`Relations.toOne`/`toMany`, FK field), abstract base classes, lifecycle hooks
- [Repository API](repository-api.md) — the inline `repo()` accessor, find/findId/findFirst, `upsert`,
  bulk ops, `aggregate`/`groupBy`, `liveQuery`, and why direct calls run with **backend authority**
- [Value lists & metadata](value-lists-and-metadata.md) — `@ValueListFieldType` enums, `getValueList`,
  `ValueListInfo`, and driving labels/options/permission-gated UI from `repo().metadata`
- [Advanced queries](advanced-queries.md) — `Filter.createCustom`, `sqlExpression` + `dbNamesOf`,
  `sqlRelations`, raw SQL via `SqlDatabase`, the `EntityFilter` operator set
- [BackendMethods](backend-methods.md) — instance vs static, mutable controllers, the transaction
  default, the RPC boundary, and the mandatory manual auth check
- [Authorization](authorization-patterns.md) — entity CRUD, row-level (`apiPrefilter`/`backendPrefilter`),
  field-level (`includeInApi`/`allowApiUpdate`), and front-end permission introspection
- [Server & testing](server-and-testing.md) — `remultApi` (Hono), `withRemult`/`withRemultAsync`,
  `InMemoryDataProvider` vs `TestApiDataProvider`, modules, Standard Schema
- [Common mistakes](common-mistakes.md) — 20 anti-patterns with corrections
- [Full docs](llms-full.txt) — official v3.3.10 docs assembled offline (guides + 36 API-reference pages),
  in the canonical order of remult.dev/llms.txt. Grep it or read by line range (index below).

When the quick-reference files are not enough, read targeted sections from `llms-full.txt`. Every page is
a `# Section — Title` heading and every API member is a `##`/`###` heading, so
`grep -n '^## upsert' llms-full.txt` jumps straight to it.

## Section index (llms-full.txt)

| Section                                                       | Lines       |
| ------------------------------------------------------------ | ----------- |
| Getting Started (intro, create, quickstart, examples)        | 7–909       |
| Entities (fields 1010, ValueList 1209, relations 1514, …)    | 998–3274    |
| Stacks — Frameworks (React/Angular/Vue/Svelte/Next/Solid/…)  | 3275–4068   |
| Stacks — Servers (Express/Fastify/**Hono 4258**/Elysia/…)    | 4069–4699   |
| Stacks — Databases (Postgres 4706, SQLite, Mongo, …)         | 4700–5407   |
| Server-side Code (BackendMethods 5408, server-only deps)     | 5408–5667   |
| Guides (Access Control 5668, Admin UI 5928, Modules 5998)    | 5668–6117   |
| Escape Hatches (custom filters 6118, raw SQL 6466, **withRemult 6651**, no-decorators, custom-options) | 6118–7124 |
| Integrations (Swagger, GraphQL, Standard Schema 7393)        | 7125–7532   |
| API Reference (Entity 7533, Field 7772, Repository 8619, …)  | 7533–10787  |
| Appendix — additional pages                                  | 10788–11213 |

Key anchors: `@Fields.id` 1098 · `ValueListFieldType` 1209 · `Filter.createCustom` 2426 ·
`sqlExpression` field 2490 · `Remult` ref 8346 · `Repository` ref 8619 · `upsert` 9146 ·
`liveQuery` 8699 · `EntityFilter` 9355 · `Validators` 8173 · `SqlDatabase` 10257.

## Non-negotiables (the modern v3 idioms agents miss by default)

Confirmed by baseline testing — these are what a capable agent gets *wrong* without this skill. Read
[common-mistakes.md](common-mistakes.md) for the full why/fix.

1. **Use the inline `repo()` accessor.** `import { repo } from 'remult'` and call `repo(Entity)` **at the
   use site** — prefer it over the equivalent `remult.repo(Entity)`, and don't stash it in a variable or
   class field. It is cheap, request-context-aware, and per-request scoped; a repo cached on a long-lived
   field can outlive its request context on the server.
2. **`@Fields.id()` is the id.** `Fields.cuid()` **does not exist** in v3 (a common hallucination); prefer
   `Fields.id()` (UUID) over the legacy `Fields.uuid()`. Use `Fields.autoIncrement()` only when a DB
   sequence is genuinely required. `findId` resolves to a falsy value (`undefined | null`) when nothing
   matches — guard with `if (!row)`.
3. **`upsert({ where, set })` over hand-rolled find-then-insert** — atomic by intent and race-free. Batch
   reads with `{ field: { $in: [...] } }` + a single bulk `insert([...])`, never a per-item loop.
4. **Reused WHERE logic → `Filter.createCustom`.** Any filter used in more than one place, or that must run
   server-side, is a typed custom filter (serialises name+args to the client) — not a duplicated `where`.
5. **Derived columns → `sqlExpression` + `dbNamesOf`** (or `sqlRelations`), so the DB can sort/filter them
   in one round-trip. Never a denormalized counter maintained by hooks, and never an N+1 counting loop.
6. **Direct `repo` calls run with BACKEND AUTHORITY and bypass `allowApi*`.** Inside a BackendMethod (or
   any server code) re-assert authorization manually with `remult.isAllowed(role)` before mutating. To
   *test* that API rules are actually enforced, use `TestApiDataProvider` — a plain `InMemoryDataProvider`
   call (or a `metadata.apiUpdateAllowed()` read) verifies the rule's value but not its enforcement.
7. **Drive the UI from the entity, not hardcoded literals.** Options from `getValueList`, labels from
   `repo(X).metadata.fields[...].caption`, and visibility from `apiUpdateAllowed`/`apiInsertAllowed`
   (per-row: `repo(X).getEntityRef(row).apiUpdateAllowed`). Live data via `repo(X).liveQuery().subscribe`.

## Decision trees

### Which field decorator?

| Use case                      | Decorator                                                          |
| ----------------------------- | ----------------------------------------------------------------- |
| Text                          | `Fields.string()`                                                 |
| Decimal / whole number        | `Fields.number()` / `Fields.integer()`                            |
| True/false                    | `Fields.boolean()`                                                |
| Date with time / date only    | `Fields.date()` / `Fields.dateOnly()`                             |
| JSON / array                  | `Fields.json()` (Postgres: `valueConverter:{fieldTypeInDb:'jsonb'}`) |
| Primary key (UUID)            | `Fields.id()` — **not** `Fields.cuid()` (removed) / `Fields.uuid()` (legacy) |
| Auto-increment PK             | `Fields.autoIncrement()` (only when a DB sequence is needed)      |
| Audit timestamps              | `Fields.createdAt()` / `Fields.updatedAt()` (auto read-only)      |
| Enum **with display data**    | `@ValueListFieldType` class (**preferred** — id+caption+extras)   |
| Plain string-literal union    | `Fields.literal(() => VALUES)` — when no per-value metadata is needed |
| Computed / derived column     | any `Fields.*({ sqlExpression })` — not a stored counter          |

### Which permission control?

| Goal                            | Control                                                                  |
| ------------------------------- | ------------------------------------------------------------------------ |
| Same gate for all CRUD          | `allowApiCrud`                                                            |
| Different per operation         | `allowApiRead` / `allowApiInsert` / `allowApiUpdate` / `allowApiDelete`   |
| Owner-only update/delete        | `allowApiUpdate: (item, c) => item.ownerId === c?.user?.id`               |
| Hide rows from API consumers    | `apiPrefilter` (AND-ed into every API query)                             |
| Hide rows everywhere incl. BMs  | `backendPrefilter`                                                        |
| Hide a field from the API       | `includeInApi: false` on the field                                       |
| Read-only field via API         | `allowApiUpdate: false` on the field                                     |
| Inside a BackendMethod          | **manual** `remult.isAllowed(role)` — `allowApi*` does not apply         |

### Instance vs static BackendMethod vs hook?

| Use case                                  | Put it…                                            |
| ----------------------------------------- | -------------------------------------------------- |
| Default a field on insert, per-row rule   | **Entity lifecycle hook** (`saving`/`validation`)  |
| Toggle/approve/archive a single row       | Instance `@BackendMethod`                          |
| Bulk update, report, cross-entity write   | Static `@BackendMethod` (transactional by default) |
| Stateful flow with its own input fields   | Mutable `@Controller`                              |
| Reusable WHERE clause                     | `Filter.createCustom` (not a method)               |

### Which relation?

| Relationship          | Pattern                                                                 |
| --------------------- | ---------------------------------------------------------------------- |
| Many-to-one (FK)      | explicit FK field + `Relations.toOne(() => Target, 'fkField')`          |
| One-to-many (reverse) | `Relations.toMany(() => Target, 'fkFieldOnTarget')`                     |
| Many-to-many          | intermediate entity with composite PK (`id: { aId: true, bId: true }`) |
| Derived single value  | `sqlExpression` subquery (no relation object) — see [advanced-queries] |

### Which test harness?

| Goal                                              | Harness                                                        |
| ------------------------------------------------- | ------------------------------------------------------------- |
| Fast validation / business-logic test (no DB)     | `InMemoryDataProvider` (from `remult`)                        |
| Prove `allowApi*` authorization is **enforced**   | `TestApiDataProvider` (from `remult/server`) — throws Forbidden |
| Exercise real SQL expressions/filters             | in-memory SQLite + `ensureSchema`                             |

## Conventions & tradeoffs

- **`repo()` vs `remult.repo()`:** both are equivalent; `repo(Entity)` is the modern canonical accessor —
  prefer it everywhere (and call it inline, never stored).
- **Enums:** `@ValueListFieldType` is the framework-preferred form — use it when per-value metadata
  (caption, colour, order) belongs on the domain object. A plain `Fields.literal(() => VALUES)`
  string-literal union is the lighter choice when you want exact union types and keep display/i18n labels
  in a separate layer. See [value-lists-and-metadata.md](value-lists-and-metadata.md).
- **Schema ownership:** with `createPostgresDataProvider` (or any SQL provider) Remult syncs the schema
  unless told otherwise. When an external migration tool owns DDL, set `ensureSchema: false` so Remult
  never runs migrations — see [server-and-testing.md](server-and-testing.md).
- **Errors:** model expected errors with `neverthrow` `Result` and throw only at the BackendMethod RPC
  boundary (a `Result` cannot cross RPC) — see `.claude/skills/neverthrow/remult-integration.md`.
- **Isomorphism:** lifecycle hooks and validation run on both client and server, so keep shared entity
  code free of server-only or framework imports; do server-only work in BackendMethods.

## Regenerating llms-full.txt

`llms-full.txt` is assembled from the official docs by `scripts/build-llms-full.mjs`. To refresh it for a
new release: `node scripts/build-llms-full.mjs <tag>` (e.g. `v3.4.0`). It downloads the `docs/docs`
markdown from `remult/remult` at that tag, orders pages per remult.dev/llms.txt, strips VitePress chrome,
and prints an updated section index. No npm deps required (the source is already markdown).
