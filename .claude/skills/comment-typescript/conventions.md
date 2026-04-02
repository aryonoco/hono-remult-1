# TypeScript Commenting Conventions

These conventions are tailored for a Remult + Angular + Hono stack. Remult entities
and Angular signal patterns are largely self-documenting — comments should explain
WHY, not WHAT.

## The @param / @returns Rule

**Do not use `@param` or `@returns` tags by default.** TypeScript's type system
already shows parameter and return types on hover.

Use `@param` ONLY when a parameter has constraints the type cannot express
(valid ranges, encoding, ownership, side effects on the argument).
Use `@returns` ONLY when the return value has non-obvious semantics.

## Entity File Comments

### Entity Class
A brief JSDoc on the entity class is useful when the entity's role in the domain
is not obvious from its name. Omit for entities whose name says it all (Task, User).

```typescript
/**
 * Tracks membership of users in projects with role-based access.
 * A user can be a member of multiple projects with different roles.
 */
@Entity('project-members', { ... })
export class ProjectMember { ... }
```

### Field Decorators
Field decorators are self-documenting. Do NOT comment:
```typescript
// BAD — restates the decorator
/** The task title */
@Fields.string()
title = '';
```

Comment only when the field has non-obvious semantics:
```typescript
/** ISO 4217 currency code, not a display name. */
@Fields.string()
currency = 'AUD';
```

### Permission Decisions
`allowApiUpdate`, `apiPrefilter`, and permission functions deserve WHY comments:
```typescript
@Entity('tasks', {
  // Non-admins see only their own tasks; admins see all.
  apiPrefilter: () => {
    if (remult.isAllowed(Roles.admin)) return {};
    return { createdBy: remult.user?.id ?? '' };
  },
})
```

### Lifecycle Hooks
Comment the business rule, not the hook mechanism:
```typescript
@Entity('tasks', {
  // Auto-assign creator on insert; immutable after creation.
  saving: (task, e) => {
    if (e.isNew) task.createdBy = remult.user?.id ?? '';
  },
})
```

### BackendMethods
JSDoc only when the business logic is non-obvious:
```typescript
/**
 * Archives all completed tasks older than 90 days.
 * Called by the nightly cleanup job — not intended for user-facing use.
 */
@BackendMethod({ allowed: Roles.admin })
static async archiveStale() { ... }
```

Trivial BackendMethods (toggleCompleted, simple setters) need no JSDoc.

## Angular Component Comments

### Signal State
Signals are self-documenting. Do NOT comment:
```typescript
// BAD
/** The list of tasks */
protected readonly tasks = signal<Task[]>([]);
```

Comment only when the signal's role is non-obvious:
```typescript
/** Draft state — resets when the source entity reloads. */
protected readonly editableUser = linkedSignal(() => this.userResource.value());
```

### inject() Calls
Do not comment service injections — the type name is the documentation.

### Control Flow
`@if`, `@for`, `@defer` are self-documenting. Comment only when the condition
encodes a business rule:
```html
<!-- Only show edit button for task owners; admins bypass via API permissions. -->
@if (task.createdBy === currentUserId()) {
  <button (click)="edit(task)">Edit</button>
}
```

## Hono Middleware Comments

Comment the WHY of middleware configuration, not the what:
```typescript
// Allow anonymous access to health check; all other routes require auth.
app.use('/api/*', jwt({ secret: env.JWT_SECRET, alg: 'HS256' }));
```

## Inline Comments

Inline comments (`//`) are rare and intentional. Use them only for:
- Permission rationale (why this role, why this prefilter)
- Non-obvious error handling or edge cases
- Business rules that drive the code
- External API quirks or undocumented behaviour

Never use inline comments to narrate what the code does.

## British English

All comments must use British English spelling:
- colour, behaviour, initialise, serialise, organisation, licence (noun), defence
- "ise" not "ize" (standardise, normalise, optimise)

Variable names and identifiers must NEVER be changed, even if they use American English.
