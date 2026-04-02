# Remult Repository API

## Getting a Repository

```typescript
const repo = remult.repo(Task);
```

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

### upsert — insert or update
```typescript
await repo.upsert({ where: { externalId: 'ext-123' }, set: { title: 'Updated' } });
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
await repo.save(task, { select: 'none' });
await repo.updateMany({ where: {...}, set: {...}, select: 'none' });
```

---

## Aggregation

### aggregate — sum, avg, min, max
```typescript
const totals = await repo.aggregate({
  sum: { amount: true },
  avg: { rating: true },
  min: { price: true },
  max: { price: true },
});
// { amount: { sum: 1000 }, rating: { avg: 4.5 }, ... }
```

### groupBy — grouped aggregation
```typescript
const byStatus = await repo.groupBy({
  by: { status: true },
  sum: { amount: true },
  where: { amount: { $gt: 100 } },
});
// [{ status: 'pending', amount: { sum: 500 } }, ...]
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
repo.metadata.apiReadAllowed();       // Can current user read?
repo.metadata.apiInsertAllowed(item); // Can current user insert?

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
