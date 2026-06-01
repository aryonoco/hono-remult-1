# Remult Repository API

## Getting a Repository — the inline `repo()` accessor

```typescript
import { repo } from 'remult';

await repo(Task).find(/* … */); // call repo(Entity) INLINE, at every use site
```

`repo(Entity)` is the canonical v3 accessor. It is cheap, request-context-aware, and isomorphic (same code
on client and server). `remult.repo(Entity)` is equivalent — prefer `repo()`. **Don't** stash a repo in a
variable or class field: one cached on a long-lived field can outlive its request context on the server.

> The examples below abbreviate `repo(Task).find(...)` as `repo.find(...)` for brevity. In real code,
> always call `repo(Task)` inline rather than assigning it.

## Backend authority (read this first)

Repository calls in server code — BackendMethods, lifecycle hooks, custom routes, tests — run with **full
backend authority and bypass `allowApi*` and `apiPrefilter`**. Those rules apply only to calls that arrive
through the REST API. So inside server code you must re-assert authorization yourself
(`remult.isAllowed(role)`), and to *test* that API rules are enforced you must use `TestApiDataProvider`,
not a direct `repo()` call. See [backend-methods.md](backend-methods.md) and
[server-and-testing.md](server-and-testing.md).

---

## Querying

### find — filtered, sorted, paginated

```typescript
await repo.find({
  where: { completed: false, priority: { $gte: 2 } },
  orderBy: { createdAt: 'desc' },
  limit: 10,
  page: 2,
  include: { customer: true },
  select: { id: true, title: true },
});
```

### findFirst / findId / findOne

```typescript
await repo.findFirst({ title: 'My Task' });
await repo.findFirst({ email }, { createIfNotFound: true });
await repo.findId('uuid-here');
await repo.findOne({ where: { id: 'uuid' } });
```

These resolve to a **falsy value when nothing matches** — `findFirst`/`findOne` to `undefined`, and
`findId` to `undefined | null` (its type is `Promise<T | undefined | null>`). Always guard with
`if (!row)`. `findFirst(where, { createIfNotFound: true })` is a built-in find-or-create for single rows
(it returns an unsaved instance if absent); for create-and-persist semantics prefer `upsert`.

### count

```typescript
await repo.count({ completed: false });
```

### query — large dataset iteration

```typescript
for await (const tasks of repo.query({ pageSize: 100 })) {
  // Process batch
}
```

---

## EntityFilter Operators

```typescript
{ field: value }                 // equals
{ field: { $ne: value } }       // not equals
{ field: { $gt: value } }       // greater than
{ field: { $gte: value } }      // greater than or equal
{ field: { $lt: value } }       // less than
{ field: { $lte: value } }      // less than or equal
{ field: { $in: [a, b] } }     // in array
{ field: { $contains: 'text' }} // string contains
{ $or: [filter1, filter2] }     // OR
{ $and: [filter1, filter2] }    // AND (implicit when multiple fields)
{ $not: filter }                 // NOT
```

---

## Mutations

### insert

```typescript
await repo.insert({ title: 'New Task' });
await repo.insert([{ title: 'A' }, { title: 'B' }]);  // Batch
```

### update

```typescript
await repo.update(taskId, { completed: true });
```

### upsert — find-or-create (insert or update)

`upsert` matches by `where`, updates with `set` if found, inserts if not. **Use it instead of hand-rolled
`findFirst`-then-`insert`** — that pattern is racy, verbose, and a frequent default mistake.

```typescript
// single
await repo(Tag).upsert({ where: { name: 'urgent' }, set: { name: 'urgent' } });

// batch (array form)
await repo(Tag).upsert([
  { where: { name: 'a' }, set: { name: 'a' } },
  { where: { name: 'b' }, set: { name: 'b' } },
]);
```

For "resolve many names to rows", do **one** `$in` lookup + **one** bulk insert of the missing ones, never
a per-item loop (N+1):

```typescript
const names = ['a', 'b', 'c'];
const existing = await repo(Tag).find({ where: { name: { $in: names } } });
const have = new Set(existing.map((t) => t.name));
const created = await repo(Tag).insert(names.filter((n) => !have.has(n)).map((name) => ({ name })));
```

### save — insert if new, update if existing

```typescript
const task = repo.create();
task.title = 'Draft';
await repo.save(task);
```

### delete

```typescript
await repo.delete(taskId);
await repo.delete(task);
```

### updateMany / deleteMany — bulk operations

```typescript
await repo.updateMany({
  where: { completed: true },
  set: { archived: true },
});

await repo.deleteMany({ where: { archived: true } });
await repo.deleteMany({ where: 'all' });  // Delete all (caution!)
```

### Performance: suppress result return

```typescript
await repo.save(task, { select: 'none' }); // skip re-fetching the saved row (save/insert/update only)
// updateMany already returns just a count (Promise<number>) — it has no `select` option
await repo.updateMany({ where: { completed: true }, set: { archived: true } });
```

---

## Aggregation

### aggregate — sum, avg, min, max

Fields are passed as **arrays**; results nest under each field name.

```typescript
const totals = await repo.aggregate({
  sum: ['amount'],
  avg: ['rating'],
  min: ['price'],
  max: ['price'],
});
// totals.amount.sum, totals.rating.avg, totals.price.min, totals.price.max
```

### groupBy — grouped aggregation

`group` and aggregate fields are **arrays**; each result row has a top-level `$count` plus the grouped
fields, with aggregates nested under the field name.

```typescript
const byStatus = await repo.groupBy({
  group: ['status'],
  sum: ['amount'],
  where: { amount: { $gt: 100 } },
});
// [{ status: 'pending', $count: 3, amount: { sum: 500 } }, ...]
```

---

## LiveQuery — Real-Time Updates (SSE)

```typescript
const unsubscribe = repo.liveQuery({
  where: { assignedTo: remult.user?.id },
}).subscribe(info => {
  // info.items — current items
  // info.applyChanges(existingArray) — apply delta to local array
  tasks.set(info.items);
});

// Cleanup
unsubscribe();
```

---

## Validation

```typescript
const errors = await repo.validate(task);
// Returns Record<fieldName, string> — empty if valid
```

---

## Metadata & Introspection

```typescript
// Entity metadata
repo.metadata.key;                    // 'tasks'
repo.metadata.caption;                // 'Tasks'
repo.metadata.apiReadAllowed;         // boolean PROPERTY — can current user read?
repo.metadata.apiInsertAllowed(item); // METHOD — can current user insert this item?

// Field metadata
repo.fields.title.caption;           // 'Title'
repo.fields.title.inputType;         // HTML input type hint
repo.fields.title.includedInApi(item);
repo.fields.title.apiUpdateAllowed(item);
```

---

## Relations API

```typescript
// Load unfetched relations
const orders = await repo.relations(customer).orders.find({
  where: { completed: true },
});

// Insert via relation
await repo.relations(customer).orders.insert([
  { amount: 100 },
]);
```

---

## Serialisation

```typescript
const json = repo.toJson(task);     // Respects includeInApi
const task = repo.fromJson(json);
```

---

## Entity Reference

```typescript
const ref = repo.getEntityRef(task);
ref.isNew();
ref.fields.title.originalValue;     // Value before changes
```

---

## create — form defaults

```typescript
const task = repo.create();         // New instance, not saved
task.title = 'Draft';
// repo.save(task) to persist
```
