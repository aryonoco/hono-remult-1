# Relation Loading, Pagination & LiveQuery

The FK-column + `@Relations.toOne` declaration is owned by `.claude/rules/entity-conventions.md`.
This file covers how to *load* those relations efficiently and how to page and live-query the
results.

## 1. Eager `include` vs N+1

**Pattern:** Load related rows in one round trip with `include:` in the find options.

```typescript
const fire = await remult.repo(FireIncident).findId(params.id, {
  include: {
    district: true,
    situationReports: true,
    finalReport: params.includeFinal,
  },
});
```

(`apps/web/src/app/features/fire-incidents/incident-detail/incident-detail.ts`)

`include:` works on `find`, `findId`, `query`, and `liveQuery`. A relation flag can be a boolean
expression, so a relation is loaded conditionally without branching the query — see
`finalReport: params.includeFinal` above.

**Avoid:** Fetching a relation per row inside a loop — the N+1 problem.

```typescript
// One query for the list, then one query PER ROW for the relation.
const fires = await remult.repo(FireIncident).find();
for (const fire of fires) {
  fire.district = await remult.repo(District).findId(fire.districtId); // N+1
}
```

In an Angular template the same anti-pattern hides inside `@for` — never call `remult.repo(...)`
from a cell binding. Load the relation once with `include:` and render the joined object.

## 2. `defaultIncluded` trade-offs

**Pattern:** Leave a relation lazy and pass `include:` only where it is needed. Set
`defaultIncluded: true` only when the relation is required on *every* read.

```typescript
// Always needed → opt in once on the relation.
@Relations.toOne(() => District, { field: 'districtId', defaultIncluded: true })
district?: District;
```

**Avoid:** `defaultIncluded: true` for a relation most reads do not use — every query then pays the
join, including list endpoints that only render scalar columns.

```typescript
// Most list reads never touch `situationReports`; defaultIncluded taxes them all.
@Relations.toMany(() => SituationReport, { field: 'fireIncidentId', defaultIncluded: true })
situationReports?: SituationReport[];
```

**Avoid:** Putting `dbName` on the relation. The database column name belongs on the FK
`@Fields.*` field; the `@Relations.toOne` only names the FK *property*.

```typescript
// WRONG — dbName does not belong on the relation.
@Relations.toOne(() => FireIncident, { field: 'fireIncidentId', dbName: 'fire_incident_id' })
fireIncident?: FireIncident;
```

The worked entity keeps the relation FK-only and lets the FK field own persistence:

```typescript
@Fields.string({ validate: Validators.required })
fireIncidentId = '';

@Relations.toOne(() => FireIncident, 'fireIncidentId')
fireIncident?: FireIncident;
```

(`libs/shared/domain/src/fire/final-report.ts`)

## 3. Pagination

**Pattern:** Page large lists with `query({ pageSize }).paginator()`. Read the total with
`paginator.count()` (or `query.count()`); step pages with `paginator.nextPage()`.

```typescript
const query = remult.repo(FireIncident).query({
  pageSize: 100,
  orderBy: { createdAt: 'desc' },
  include: { district: true },
});

let paginator = await query.paginator();
const total = await paginator.count(); // total rows across all pages
// paginator.items — the current page
while (paginator.hasNextPage) {
  paginator = await paginator.nextPage();
}
```

The total comes from the async `count()` method on the paginator (or the same `count()` on the
`query` result). There is no `paginator.aggregate` property: `$count` is only reachable through
`paginator.aggregates.$count`, and only when the query was built with an `aggregate:` option. For a
plain total, prefer `count()`.

Remult paging is **OFFSET-based** (`page` + `limit`, or `query`'s `pageSize`) — there is no cursor
API. Deep or sorted pages issue `OFFSET n LIMIT m` with an `ORDER BY`, so any non-trivial
pagination must be backed by an index on the sort column. Remult does not create indexes — declare
them in Atlas via the entity's `*SchemaExtras` array (see `postgres-provider.md` and the
[Atlas skill](../atlas/SKILL.md)).

For a small bounded list, plain `find` with `limit`/`page` is fine:

```typescript
const recent = await remult.repo(SituationReport).find({
  where: { fireIncidentId },
  orderBy: { reportNumber: 'desc' },
  limit: 2,
});
```

(`libs/shared/domain/src/fire/final-report.ts`)

## 4. LiveQuery lifecycle

**Pattern:** Subscribe to a `liveQuery`, capture the returned unsubscribe function, and wire it to
`DestroyRef.onDestroy` so the SSE stream is always torn down.

```typescript
private readonly destroyRef = inject(DestroyRef);
private unsubscribe: (() => void) | null = null;

// In setup:
this.destroyRef.onDestroy(() => this.unsubscribe?.());

this.unsubscribe = remult
  .repo(FireIncident)
  .liveQuery({ include: { district: true }, orderBy: this.mapSort(sort) })
  .subscribe({
    next: (info: LiveQueryChangeInfo<FireIncident>) => {
      this.rawIncidents.set(info.items);
    },
    error: (cause: unknown) => {
      this.error.set(toErrorMessage(cause));
    },
  });
```

(`apps/web/src/app/features/fire-incidents/incident-list/incident-list.ts`)

**Avoid:** Subscribing without unsubscribing — the SSE connection leaks past component destruction.

```typescript
// No handle kept, no DestroyRef wiring → stream lives forever.
remult.repo(FireIncident).liveQuery().subscribe((info) => this.items.set(info.items));
```

**Caveats:**

- LiveQuery does **not** track changes inside included relations. A new `SituationReport` will not
  push through a `liveQuery({ include: { situationReports: true } })` on `FireIncident`. Live-query
  the child entity directly, or re-query when the parent changes.
- Prefer a one-shot `find`/`findId` (or Angular `resource()`) when liveness is not required — it
  costs one request instead of a held-open SSE connection. The incident *detail* screen uses
  `resource()` + `findId` precisely because it does not need a live feed.
