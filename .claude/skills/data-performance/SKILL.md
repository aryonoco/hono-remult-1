---
name: data-performance
description: "Remult data-layer performance — relation loading to avoid N+1, pagination, and the Postgres provider/role setup. Use when loading relations, paginating lists, or configuring the data provider."
user-invocable: false
---

# Remult Data-Layer Performance

Covers the data-access decisions that determine whether a Remult feature scales: loading relations
eagerly to avoid N+1 round trips, paging large lists with `query().paginator()`, the LiveQuery
lifecycle, and the Postgres provider/role wiring that keeps DDL out of the runtime path. This skill
complements `.claude/rules/entity-conventions.md`, which owns the FK-column + `@Relations.toOne`
pattern — reference that rule, do not restate it here.

## References

- [Relation loading](relations-loading.md) — `include` vs N+1, `defaultIncluded` trade-offs,
  pagination, LiveQuery lifecycle
- [Postgres provider](postgres-provider.md) — `createPostgresDataProvider`, `ensureSchema: false`
  placement, the `hrm_runtime` role, pooling

Cross-skill: [Remult API reference](../remult/SKILL.md) for the repository surface, and
[Atlas migrations](../atlas/SKILL.md) for declaring the indexes and uniques that deep pagination
relies on.

## Decision Trees

### Loading related rows

| Situation                           | Pattern                                                                  |
| ----------------------------------- | ------------------------------------------------------------------------ |
| List/detail needs a relation        | `include:` in the `find`/`query`/`liveQuery` options                     |
| Relation needed on every read       | `defaultIncluded: true` on the `@Relations.toOne` (always pays the join) |
| Relation needed only sometimes      | Leave it lazy, pass `include:` at the call site                          |
| Reading the FK only (no joined row) | Read the FK `@Fields.*` column — no `include`                            |

### Listing rows

| List size             | Pattern                                                   |
| --------------------- | --------------------------------------------------------- |
| Small, bounded        | `repo(X).find({ limit, page })`                           |
| Large / server-paged  | `repo(X).query({ pageSize }).paginator()`                 |
| Need a total count    | `await paginator.count()` (or `query.count()`)            |
| Deep or sorted paging | OFFSET paging backed by an Atlas index on the sort column |

### Liveness

| Need                                | Pattern                                                               |
| ----------------------------------- | --------------------------------------------------------------------- |
| One-shot read                       | `repo(X).find(...)` / `repo(X).findId(...)`                           |
| Real-time list                      | `repo(X).liveQuery(...).subscribe(...)`, unsubscribe via `DestroyRef` |
| Changes inside an included relation | Not tracked by LiveQuery — re-query or live-query the child           |

## Key Principles

1. **One round trip** — use `include:` to load relations; never fetch per row inside a loop
2. **`defaultIncluded` is a tax** — opt in only when the relation is genuinely always needed
3. **Page large lists** — `query().paginator()`, read totals from `paginator.count()`
4. **OFFSET paging needs an index** — deep/sorted pages require an Atlas index on the sort column
5. **Always unsubscribe** — wire LiveQuery cleanup to `DestroyRef.onDestroy`
6. **Runtime never runs DDL** — `ensureSchema: false`, connect as the DML-only `hrm_runtime` role
7. **Indexes/uniques live in Atlas** — declare them in the entity's `*SchemaExtras`, not in Remult
