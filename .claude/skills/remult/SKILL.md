---
name: remult
description: "Remult v3 fullstack CRUD framework — entity decorators, field types, repository API, BackendMethods, relations, validation, authorization, lifecycle hooks, LiveQuery, remult-hono integration. Use when writing or reviewing TypeScript that imports from 'remult'."
user-invocable: false
---

# Remult API Reference

This skill provides API-level knowledge for Remult. It complements the
project conventions in `.claude/rules/entity-conventions.md` — that rule says
WHICH patterns to follow; this skill shows HOW to use the APIs correctly.

**Project philosophy:** "Define once, enforce everywhere." The Remult entity is the
single source of truth — type, schema, API, validation, auth, and business logic
in one class. No separate controllers. See `docs/00-foundation1.md`.

## Current Remult Version

!`grep -o '"remult": "[^"]*"' package.json 2>/dev/null || echo "remult version not found"`

## References

- [Entity patterns](entity-patterns.md) — field types, relations, hooks, permissions, BackendMethods
- [Repository API](repository-api.md) — find, save, liveQuery, aggregate, filters
- [BackendMethods](backend-methods.md) — instance vs static, controllers, RPC, security
- [Authorization](authorization-patterns.md) — CRUD, row-level, field-level, prefilters
- [Common mistakes](common-mistakes.md) — 14 anti-patterns with corrections
- [Full Remult docs](llms-full.txt) — 24K-line official documentation (section index below)

When the quick reference files are insufficient, read targeted sections from
`llms-full.txt` using the line ranges below.

## Section Index (llms-full.txt)

| Section | Lines |
|---------|-------|
| Introduction & Quickstart | 1–953 |
| Example Apps | 954–1048 |
| Entities overview | 1049–1068 |
| Field Types | 1069–1525 |
| Relations (toOne, toMany, M:N) | 1526–2366 |
| Filtering and Relations | 2367–2571 |
| Lifecycle Hooks | 2572–2721 |
| Migrations | 2722–2971 |
| Generate from Existing DB | 2972–2984 |
| Offline Support | 2985–3095 |
| Active Record & EntityBase | 3096–3211 |
| Entity Instance BackendMethods | 3212–3269 |
| Mutable Controllers | 3270–3319 |
| Framework Integrations (React, Angular, Vue, Svelte, Next, Solid, Nuxt) | 3320–4314 |
| Server Integrations (Express, Fastify, Hono, Elysia, Hapi) | 4315–end |

## Decision Trees

### Which field decorator?

| Use case | Decorator |
|----------|-----------|
| Text | `Fields.string()` |
| Decimal number | `Fields.number()` |
| Whole number | `Fields.integer()` |
| True/false | `Fields.boolean()` |
| Date with time | `Fields.date()` |
| Date only | `Fields.dateOnly()` |
| JSON/array | `Fields.json()` |
| Primary key (UUID) | `Fields.id()` |
| Auto-increment PK | `Fields.autoIncrement()` |
| Auto-set on insert | `Fields.createdAt()` |
| Auto-set on update | `Fields.updatedAt()` |
| TypeScript enum | `Fields.enum(() => MyEnum)` |
| String literal union | `Fields.literal()` |
| Custom ID factory | `Fields.id({ idFactory: () => nanoid() })` |

Note: `Fields.cuid()` was removed in v3.3.0. Use `Fields.id()` with custom `idFactory`.

### Which permission model?

| Scenario | Pattern |
|----------|---------|
| Same permission for all CRUD | `allowApiCrud: Allow.authenticated` |
| Different per operation | `allowApiRead` / `allowApiInsert` / `allowApiUpdate` / `allowApiDelete` |
| Owner-only update/delete | `allowApiUpdate: (item, c) => item.createdBy === c?.user?.id` |
| Hide rows from non-owners | `apiPrefilter: () => ({ createdBy: remult.user?.id })` |
| Universal row filter | `backendPrefilter` (applies to BackendMethods too) |
| Hide field from API | `includeInApi: false` on field |
| Read-only field in API | `allowApiUpdate: false` on field |

### Instance vs static BackendMethod?

| Use case | Type |
|----------|------|
| Toggle, approve, archive a row | Instance method |
| Bulk update, reports, aggregations | Static method |
| Auth flow, multi-step wizard | Mutable Controller |
| Cross-entity logic | Controller or operations file |

### Which relation?

| Relationship | Pattern |
|-------------|---------|
| Many-to-one (FK) | `Relations.toOne(() => Target, 'fkField')` |
| One-to-many (reverse) | `Relations.toMany(() => Target)` |
| Many-to-many | Intermediate entity with composite PK |

### Which lifecycle hook?

| Hook | Runs on | Purpose |
|------|---------|---------|
| `validation` | Client + server | Cross-field business rules |
| `saving` | Server only | Computed fields, audit, defaults |
| `saved` | Server only | Side effects after save |
| `deleting` | Server only | Pre-delete checks |
| `deleted` | Server only | Post-delete cleanup |

### Which data provider?

| Environment | Provider |
|------------|---------|
| Development | `JsonDataProvider` (default, file-based) |
| Production | `createPostgresDataProvider` / MySQL / SQLite / MongoDB / MSSQL |
| Testing | `InMemoryDataProvider` |
| Browser/offline | `JsonEntityIndexedDbStorage` |
