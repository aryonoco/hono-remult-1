# Remult Entity Patterns

## Basic Entity

**Pattern:**
```typescript
@Entity('tasks', {
  allowApiRead: Allow.authenticated,
  allowApiInsert: Allow.authenticated,
  allowApiUpdate: (task, c) => task.createdBy === c?.user?.id,
  allowApiDelete: Roles.admin,
})
export class Task {
  @Fields.id()
  id = '';

  @Fields.string({ validate: Validators.required })
  title = '';

  @Fields.boolean()
  completed = false;

  @Fields.createdAt()
  createdAt?: Date;

  @Fields.updatedAt()
  updatedAt?: Date;

  @Fields.string({ allowApiUpdate: false })
  createdBy = '';
}
```

**Avoid:** `allowApiCrud: true` without role scoping in production — opens full CRUD to everyone.

---

## Abstract Base Entity

**Pattern:** Share common fields across entities.
```typescript
abstract class BaseEntity {
  @Fields.id()
  id = '';

  @Fields.createdAt()
  createdAt?: Date;

  @Fields.updatedAt()
  updatedAt?: Date;
}

@Entity('tasks', { /* permissions */ })
export class Task extends BaseEntity {
  @Fields.string()
  title = '';
}
```

---

## Relations: toOne

**Pattern:** Always define the FK field alongside the relation.
```typescript
@Fields.string()
customerId = '';

@Relations.toOne<Order, Customer>(() => Customer, 'customerId')
customer?: Customer;
```

**Avoid:** Defining a relation without the explicit FK field — makes queries and filtering harder.

---

## Relations: toMany

**Pattern:**
```typescript
@Relations.toMany(() => Order)
orders?: Order[];

// Query with inclusion
const customers = await repo.find({
  include: {
    orders: { limit: 10, where: { completed: true } }
  }
});
```

**Avoid:** Loading relations in a loop (N+1) — use `include:` instead.

---

## Many-to-Many via Intermediate Entity

**Pattern:** Composite primary key on the junction table.
```typescript
@Entity<TagToCustomer>('tagsToCustomers', {
  id: { customerId: true, tagId: true },
})
export class TagToCustomer {
  @Fields.string()
  customerId = '';
  @Relations.toOne(() => Customer, 'customerId')
  customer?: Customer;

  @Fields.string()
  tagId = '';
  @Relations.toOne(() => Tag, 'tagId')
  tag?: Tag;
}
```

---

## Lifecycle Hooks

**Pattern: `saving` for computed fields and audit trails.**
```typescript
@Entity('tasks', {
  saving: (task, e) => {
    if (e.isNew) {
      task.createdBy = remult.user?.id ?? '';
    }
    task.updatedAt = new Date();
  },
})
```

**Pattern: `validation` for cross-field business rules (runs on both client and server).**
```typescript
@Entity('tasks', {
  validation: (task) => {
    if (task.completed && !task.assignedTo) {
      throw new Error('Completed tasks must have an assignee');
    }
  },
})
```

**Avoid:** Throwing raw errors in `saving` for validation — use the `validation` hook instead so it runs on both client and server.

---

## BackendMethods on Entity

**Pattern: Instance method for row operations.**
```typescript
export class Task {
  // ... fields ...

  @BackendMethod({ allowed: Allow.authenticated })
  async toggleCompleted() {
    this.completed = !this.completed;
    await this.save();
  }
}
// Frontend: await task.toggleCompleted();
```

**Pattern: Static method for collection operations.**
```typescript
export class Task {
  @BackendMethod({ allowed: Roles.admin })
  static async archiveCompleted() {
    await remult.repo(Task).updateMany({
      where: { completed: true },
      set: { archived: true },
    });
  }
}
// Frontend: await Task.archiveCompleted();
```

**Critical warning:** BackendMethods bypass entity API restrictions. Always check authorisation manually:
```typescript
@BackendMethod({ allowed: Allow.authenticated })
async reassign(newUserId: string) {
  if (this.createdBy !== remult.user?.id && !remult.isAllowed(Roles.admin)) {
    throw new Error('Unauthorised');
  }
  this.assignedTo = newUserId;
  await this.save();
}
```

---

## apiPrefilter vs backendPrefilter

**Pattern: `apiPrefilter` — restricts what API consumers see.**
```typescript
@Entity('tasks', {
  apiPrefilter: () => {
    if (remult.isAllowed(Roles.admin)) return {};
    return { createdBy: remult.user?.id ?? '' };
  },
})
```

**Pattern: `backendPrefilter` — restricts ALL queries including BackendMethods.**
```typescript
@Entity('tasks', {
  backendPrefilter: () => ({ archived: false }),
})
```

**Avoid:** Using `apiPrefilter` and expecting it to apply in BackendMethods — it doesn't. Use `backendPrefilter` for universal filtering.

---

## Custom Validators

**Pattern:**
```typescript
@Fields.string({
  validate: [
    Validators.required,
    Validators.minLength(3),
    Validators.unique(),  // Server-side only
  ],
})
name = '';

// Custom validator
@Fields.string({
  validate: (value) => {
    if (value && !value.includes('@')) return 'Must be a valid email';
  },
})
email = '';
```

---

## Custom Field Factories

**Pattern:** Reusable field decorators.
```typescript
function NanoIdField() {
  return Fields.id({ idFactory: () => nanoid() });
}

export class Task {
  @NanoIdField()
  id = '';
}
```

---

## Partial Field Loading

**Pattern:** `select` for performance.
```typescript
// Only fetch needed fields
const tasks = await repo.find({
  select: { id: true, title: true },
});

// Suppress result return entirely (bulk operations)
await repo.updateMany({
  where: { completed: true },
  set: { archived: true },
  select: 'none',
});
```

---

## Sensitive Fields

**Pattern:**
```typescript
@Fields.string({ includeInApi: false })
passwordHash = '';

@Fields.string({ includeInApi: Roles.admin })
internalNotes = '';

@Fields.string({
  includeInApi: (user) => user.id === remult.user?.id,
})
email = '';
```

**Avoid:** Exposing sensitive fields without `includeInApi: false`.
