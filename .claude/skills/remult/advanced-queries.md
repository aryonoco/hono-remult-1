# Remult Advanced Queries

Beyond `where`: reusable typed filters, DB-computed columns, relation-aware SQL, and the raw-SQL escape
hatch. The theme is "define once" — express the logic on the entity so it runs server-side and stays
queryable from the client.

---

## Filter.createCustom — reusable, type-safe, server-side WHERE

**Pattern:** any filter used in more than one place, or that must run on the server (it can read
`remult.user`, hit the DB, etc.), becomes a named custom filter. Only the **name + args** serialise to the
client — the body always runs on the server.

```typescript
import { Entity, Fields, Filter, repo } from 'remult';

@Entity('orders')
export class Order {
  @Fields.id() id = '';
  @Fields.string() status = '';
  @Fields.createdAt() createdAt = new Date();

  static activeIn = Filter.createCustom<Order, { year: number }>(({ year }) => ({
    status: { $in: ['created', 'pending', 'confirmed'] },
    // Use explicit UTC bounds to avoid timezone drift between client and server.
    createdAt: { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) },
  }));
}

// Call site 1 — a client query
await repo(Order).find({ where: Order.activeIn({ year: 2024 }) });
// Call site 2 — reuse inside an apiPrefilter (see authorization-patterns.md)
```

The `<Order, { year: number }>` generics type the arguments at the call site. Combine custom filters with
plain fields using `$and`:

```typescript
await repo(Order).find({ where: { $and: [Order.activeIn({ year: 2024 }), { status: 'confirmed' }] } });
```

**Avoid:** copy-pasting the same `where` object across components and the prefilter. It drifts, and a
client-built date range can be tampered with — the custom filter body is authoritative on the server.

---

## sqlExpression — DB-computed columns (sortable & filterable)

**Pattern:** a field whose value is a SQL expression instead of a physical column. The database evaluates
it, so the API can `orderBy`/`where` on it in a single round-trip — no row loading, no N+1, no denormalized
counter to keep in sync.

```typescript
@Entity('tasks')
export class Task {
  @Fields.id() id = '';
  @Fields.string() title = '';

  @Fields.integer({ sqlExpression: () => 'length(title)' })
  titleLength = 0;
}

await repo(Task).find({ where: { titleLength: { $gt: 10 } }, orderBy: { titleLength: 'desc' } });
```

The function form receives `(entity, command?)` so you can build dynamic SQL; pair it with `dbNamesOf` for
safe, dialect-correct identifiers (never string-concatenate table/column names).

### Derived value from a related table (no relation object, no N+1)

```typescript
import { dbNamesOf, Entity, Fields, repo } from 'remult';

@Entity('orders')
export class Order {
  @Fields.id() id = '';
  @Fields.string() customerId = '';

  @Fields.string<Order>({
    sqlExpression: async () => {
      const cust = await dbNamesOf(Customer);
      const ord = await dbNamesOf(Order);
      return `(select ${cust.city} from ${cust} where ${cust.id} = ${ord.customerId})`;
    },
  })
  customerCity = '';
}

await repo(Order).find({ where: { customerCity: 'London' } }); // filterable from the API client
```

This is the modern answer to "give me a `commentCount` / a joined column the client can sort and filter
by". Contrast with the **anti-patterns**: a stored counter maintained by lifecycle hooks (drifts, needs
reconciliation, concurrency-prone) or a per-row counting loop (N+1).

> `sqlExpression` fields are *computed*, not physical columns, so they need no migration — a stored
> counter would. Another reason to prefer them, especially where an external tool owns the schema.

---

## sqlRelations — declarative relation aggregates

`sqlRelations(Entity).<relation>` is used **directly as a field decorator** to compute counts and
aggregates over a relation in SQL — no hand-written join, no N+1, and the result is a normal queryable
column:

```typescript
import { Entity, Fields, repo, sqlRelations } from 'remult';

@Entity('customers')
export class Customer {
  @Fields.id() id = '';
  @Fields.string() name = '';

  @sqlRelations(Customer).orders.$count()
  orderCount = 0;                                            // count all related orders

  @sqlRelations(Customer).orders.amount.gt(50).$count()
  bigOrderCount = 0;                                         // conditional count

  @sqlRelations(Customer).orders.amount.$subQuery((o) => o.sum())
  totalOrderAmount = 0;                                      // custom aggregate
}

await repo(Customer).find({ where: { orderCount: { $gt: 10 } }, orderBy: { orderCount: 'desc' } });
```

This is the cleanest answer to "give me a count/sum of related rows the client can sort and filter by".
For filtering parents by a condition on related rows, `sqlRelationsFilter(Entity).<relation>.some(filter)`
compiles to SQL the same way. `sqlRelations`/`sqlRelationsFilter` are documented in the interactive docs
(learn.remult.dev → 4-concepts → SQL expressions) rather than the `/docs` pages bundled in `llms-full.txt`;
verify exact builder methods there. When in doubt, the always-available fallback is a plain `sqlExpression`
subquery (above).

---

## Raw SQL — the escape hatch (`SqlDatabase`)

When an expression cannot be modelled, drop to SQL through the provider. Always resolve identifiers with
`dbNamesOf` and bind values with `param()` — never interpolate user input.

```typescript
import { SqlDatabase, dbNamesOf } from 'remult';

const sql = SqlDatabase.getDb();           // the SqlDatabase for the current data provider
const tasks = await dbNamesOf(Task);
const cmd = sql.createCommand();
const rows = await cmd.execute(
  `select count(*) as n from ${tasks} where ${tasks.title} like ${cmd.param('%urgent%')}`,
);
```

`SqlDatabase.LogToConsole = true` echoes generated SQL — useful when verifying expressions/filters in
tests. Raw SQL bypasses entity rules entirely; keep it server-side and re-check authorization yourself.

---

## EntityFilter operators (quick reference)

```typescript
{ field: value }                  // equals
{ field: { '!=': value } }        // not equals  (also { $ne: value })
{ field: { $gt, $gte, $lt, $lte } }
{ field: { $in: [a, b] } }        // IN — also the way to batch a find-or-create lookup
{ field: { $nin: [a, b] } }       // NOT in
{ field: { $contains: 'text' } }  // substring   (also $startsWith / $endsWith)
{ $or: [filterA, filterB] }
{ $and: [filterA, filterB] }      // implicit when multiple keys are present
{ $not: filter }
```

Multiple keys in one object are AND-ed. Use `$or`/`$and` to combine, and custom filters anywhere a `where`
is accepted (`find`, `count`, `liveQuery`, `apiPrefilter`, `updateMany`/`deleteMany`).
