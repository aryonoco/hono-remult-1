# Remult Authorization Patterns

## Entity-Level CRUD Permissions

```typescript
@Entity('tasks', {
  allowApiRead: true,                                          // Everyone
  allowApiInsert: Allow.authenticated,                         // Logged-in users
  allowApiUpdate: Roles.manager,                               // Specific role
  allowApiDelete: [Roles.admin, Roles.owner],                  // Multiple roles
})
```

Or with a blanket setting:

```typescript
allowApiCrud: Allow.authenticated  // Same permission for all CRUD ops
```

---

## Row-Level Security

### allowApiUpdate / allowApiDelete with instance check

```typescript
@Entity('tasks', {
  allowApiUpdate: (task, c) => {
    if (!(task && c)) return false;
    return task.createdBy === c.user?.id || c.isAllowed(Roles.admin);
  },
  allowApiDelete: Roles.admin,
})
```

### apiPrefilter — restrict which rows API consumers can see

```typescript
@Entity('tasks', {
  apiPrefilter: () => {
    if (remult.isAllowed(Roles.admin)) return {};  // Admins see all
    return { createdBy: remult.user?.id ?? '' };    // Others see own
  },
})
```

**Critical:** `apiPrefilter` only applies to API requests. BackendMethods and direct backend queries bypass it. Use
`backendPrefilter` for universal filtering.

### backendPrefilter — applies to ALL queries

```typescript
@Entity('tasks', {
  backendPrefilter: () => ({ archived: false }),  // Never show archived, anywhere
})
```

### apiPreprocessFilter — adjust the incoming filter before it runs

```typescript
@Entity<Task>('tasks', {
  // The 2nd arg is { metadata, getFilterPreciseValues } — NOT the user. Read the
  // user from the ambient `remult`, and RETURN the (possibly augmented) filter.
  apiPreprocessFilter: (filter) =>
    remult.isAllowed(Roles.admin)
      ? filter
      : { $and: [filter, { createdBy: remult.user?.id ?? '__none__' }] },
})
```

For plain ownership scoping prefer `apiPrefilter`; reach for `apiPreprocessFilter` only when you must
inspect or transform the caller's incoming filter.

---

## Reusable access rules — `Filter.createCustom`

When the same ownership/scope predicate is needed in more than one place (e.g. an `apiPrefilter` on a
parent **and** a child entity, plus client queries), define it once as a custom filter instead of
duplicating the `where`. The body runs server-side and can read `remult.user`.

```typescript
export class Task {
  static mine = Filter.createCustom<Task>(() =>
    remult.isAllowed(Roles.admin) ? {} : { ownerId: remult.user?.id ?? '__none__' },
  );
}

@Entity<Task>('tasks', {
  apiPrefilter: () => Task.mine(),       // server-enforced row scope
})
// Reuse the exact same rule in a client query or another entity's prefilter:
await repo(Task).find({ where: Task.mine() });
```

This keeps one authoritative definition of "rows this user may see". See
[advanced-queries.md](advanced-queries.md) for the full `Filter.createCustom` reference.

---

## Field-Level Security

### includeInApi — control field visibility

```typescript
@Fields.string({ includeInApi: false })          // Never in API response
passwordHash = '';

@Fields.string({ includeInApi: Roles.admin })    // Only visible to admins
internalNotes = '';

@Fields.string({
  includeInApi: (item) => item.id === remult.user?.id,  // Only visible to owner
})
email = '';
```

### allowApiUpdate — control field mutability

```typescript
@Fields.string({ allowApiUpdate: false })         // Read-only via API
createdBy = '';

@Fields.string({ allowApiUpdate: Roles.admin })   // Only admins can change
role = '';
```

---

## Frontend Permission Introspection

Use entity metadata to conditionally render UI:

```typescript
// Entity-level — on metadata: apiReadAllowed is a PROPERTY; the others are METHODS taking an item
repo(Task).metadata.apiReadAllowed;                  // boolean property — can the user read at all?
repo(Task).metadata.apiInsertAllowed(repo(Task).create()); // method — pass a candidate row

// Row-level — entity-ref GETTERS (the row is already bound, no argument)
repo(Task).getEntityRef(task).apiUpdateAllowed;  // can the user update THIS row?
repo(Task).getEntityRef(task).apiDeleteAllowed;  // can the user delete THIS row?

// Field-level — methods that take the row
repo(Task).fields.title.includedInApi(task);     // is this field visible?
repo(Task).fields.title.apiUpdateAllowed(task);  // can the user update this field?
```

These re-evaluate against the current `remult.user` and mirror the server check exactly — never duplicate
the permission logic in a component. See [value-lists-and-metadata.md](value-lists-and-metadata.md).

---

## User Context

```typescript
remult.user              // Current UserInfo { id, name, roles }
remult.user?.id          // User ID
remult.user?.roles       // Role array
remult.isAllowed(role)   // Check if user has role
remult.authenticated()   // Is user logged in?
```

**Avoid:** Accessing `remult.user` at module scope — it's only available within a request context.

---

## Built-in Allow Helpers

```typescript
Allow.authenticated      // Any logged-in user
Allow.everyone           // Alias for true
```

---

## Permission Type Summary

All permission fields accept these types:

- `boolean` — `true` (everyone) / `false` (no one)
- `string` — role name
- `string[]` — array of role names (OR logic)
- `(entity?, context?) => boolean` — function for dynamic checks
