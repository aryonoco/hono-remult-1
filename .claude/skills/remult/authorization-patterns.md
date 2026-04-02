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

**Critical:** `apiPrefilter` only applies to API requests. BackendMethods and direct backend queries bypass it. Use `backendPrefilter` for universal filtering.

### backendPrefilter — applies to ALL queries
```typescript
@Entity('tasks', {
  backendPrefilter: () => ({ archived: false }),  // Never show archived, anywhere
})
```

### apiPreprocessFilter — modify incoming filter criteria
```typescript
@Entity('tasks', {
  apiPreprocessFilter: (filter, context) => {
    // Force non-admins to only see their own data
    if (!context.user || !context.isAllowed(Roles.admin)) {
      filter.createdBy = context.user?.id;
    }
  },
})
```

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
const repo = remult.repo(Task);

// Entity-level
repo.metadata.apiReadAllowed();        // Can current user read?
repo.metadata.apiInsertAllowed(task);  // Can current user insert?
repo.metadata.apiUpdateAllowed(task);  // Can current user update this task?
repo.metadata.apiDeleteAllowed(task);  // Can current user delete this task?

// Field-level
repo.fields.title.includedInApi(task);     // Is this field visible?
repo.fields.title.apiUpdateAllowed(task);  // Can user update this field?
```

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
