# Remult Common Mistakes

## 1. Separate Controller Files Instead of Entity BackendMethods

**Wrong:**
```typescript
// controllers/task.controller.ts — separate file
export class TaskController {
  @BackendMethod({ allowed: true })
  static async toggleCompleted(taskId: string) { ... }
}
```

**Why:** Violates the "entity is the single source of truth" principle. Business logic scatters across files.

**Correct:** Put BackendMethods on the entity.
```typescript
export class Task {
  @BackendMethod({ allowed: Allow.authenticated })
  async toggleCompleted() {
    this.completed = !this.completed;
    await this.save();
  }
}
```

---

## 2. Duplicating Validation

**Wrong:**
```typescript
// Angular component
if (!form.value.title) { error.set('Title required'); return; }
// Entity also validates...
```

**Why:** Validation drifts between client and server.

**Correct:** Define once on the entity; call `repo.validate()` on the frontend.
```typescript
@Fields.string({ validate: Validators.required })
title = '';
```

---

## 3. Bare `allowApiCrud: true` in Production

**Wrong:**
```typescript
@Entity('tasks', { allowApiCrud: true })
```

**Why:** Opens full CRUD to anonymous users.

**Correct:** Use explicit, granular permissions.
```typescript
@Entity('tasks', {
  allowApiRead: Allow.authenticated,
  allowApiInsert: Allow.authenticated,
  allowApiUpdate: (task, c) => task.createdBy === c?.user?.id,
  allowApiDelete: Roles.admin,
})
```

---

## 4. Missing `apiPrefilter` for Ownership Semantics

**Wrong:** Entity has a `createdBy` field but no prefilter — users can see everyone's data.

**Correct:**
```typescript
apiPrefilter: () => {
  if (remult.isAllowed(Roles.admin)) return {};
  return { createdBy: remult.user?.id ?? '' };
},
```

---

## 5. Expecting `apiPrefilter` to Apply in BackendMethods

**Wrong:**
```typescript
apiPrefilter: () => ({ archived: false })
// Later in a BackendMethod:
const tasks = await remult.repo(Task).find(); // Gets archived too!
```

**Why:** `apiPrefilter` only applies to API requests, not backend queries.

**Correct:** Use `backendPrefilter` for universal filtering.
```typescript
backendPrefilter: () => ({ archived: false })
```

---

## 6. Mutating Entity Without `repo.save()`

**Wrong:**
```typescript
const task = await repo.findId('123');
task.completed = true;
// Forgot to save — change is lost
```

**Correct:**
```typescript
const task = await repo.findId('123');
task.completed = true;
await repo.save(task);
// Or: await repo.update('123', { completed: true });
```

---

## 7. Angular Services That Duplicate Repository

**Wrong:**
```typescript
@Injectable()
export class TaskService {
  async getTasks() { return remult.repo(Task).find(); }
  async addTask(t: Partial<Task>) { return remult.repo(Task).insert(t); }
}
```

**Why:** The Repository IS the service. Wrapping it adds boilerplate with no value.

**Correct:** Use `remult.repo(Task)` directly in components.

---

## 8. Not Registering Entities

**Wrong:** Entity defined but not listed in `remultApi({ entities: [...] })` — API endpoints don't exist.

**Correct:** Register every entity.
```typescript
const api = remultApi({
  entities: [Task, User, Project],
});
```

---

## 9. Using `repo.save()` When `repo.insert()` Is Semantically Correct

**Wrong:**
```typescript
const task = repo.create();
task.title = 'New';
await repo.save(task); // Ambiguous — is this a create or update?
```

**Why:** `save()` inserts if no ID, updates if ID exists. For explicit intent, use `insert()`.

**Correct:**
```typescript
await repo.insert({ title: 'New' });
```

---

## 10. Throwing Raw Errors in Lifecycle Hooks

**Wrong:**
```typescript
saving: (task) => {
  throw new Error('Something went wrong'); // Unhelpful
}
```

**Correct:** Use `validation` for business rules (runs on both sides) with descriptive messages.
```typescript
validation: (task) => {
  if (task.completed && !task.assignedTo) {
    throw new Error('Completed tasks must have an assignee');
  }
}
```

---

## 11. Accessing `remult.user` Outside a Request Context

**Wrong:**
```typescript
// At module scope — no request context exists
const currentUserId = remult.user?.id;
```

**Why:** `remult.user` is only available within a request (API handler, BackendMethod, lifecycle hook).

**Correct:** Access `remult.user` inside entity decorators, BackendMethods, or lifecycle hooks.

---

## 12. N+1 Queries from Lazy Relations

**Wrong:**
```typescript
const customers = await repo(Customer).find();
for (const c of customers) {
  const orders = await repo(Order).find({ where: { customerId: c.id } });
}
```

**Correct:** Use `include:` for eager loading.
```typescript
const customers = await repo(Customer).find({
  include: { orders: true },
});
```

---

## 13. BackendMethod Without Auth Check

**Wrong:**
```typescript
@BackendMethod({ allowed: Allow.authenticated })
async deleteAllData() {
  await remult.repo(Task).deleteMany({ where: 'all' });
  // Any authenticated user can nuke the database!
}
```

**Why:** BackendMethods bypass entity API restrictions.

**Correct:**
```typescript
@BackendMethod({ allowed: Allow.authenticated })
async deleteAllData() {
  if (!remult.isAllowed(Roles.admin)) {
    throw new Error('Admin only');
  }
  await remult.repo(Task).deleteMany({ where: 'all' });
}
```

---

## 14. Exposing Sensitive Fields via API

**Wrong:**
```typescript
@Fields.string()
passwordHash = '';  // Sent to every API consumer!
```

**Correct:**
```typescript
@Fields.string({ includeInApi: false })
passwordHash = '';
```
