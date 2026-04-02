# Remult BackendMethods

## Core Concept

BackendMethods are functions decorated with `@BackendMethod` that run on the server but are callable from the frontend as if they were local functions. Remult handles the HTTP transport transparently.

---

## Static BackendMethod (Collection Operations)

**Pattern:** Reports, bulk operations, actions not tied to a specific row.

```typescript
export class Task {
  @BackendMethod({ allowed: Roles.admin })
  static async archiveCompleted() {
    await remult.repo(Task).updateMany({
      where: { completed: true },
      set: { archived: true },
    });
  }

  @BackendMethod({ allowed: Allow.authenticated })
  static async getStats() {
    const repo = remult.repo(Task);
    return {
      total: await repo.count(),
      completed: await repo.count({ completed: true }),
      pending: await repo.count({ completed: false }),
    };
  }
}

// Frontend call — looks local, runs on server
await Task.archiveCompleted();
const stats = await Task.getStats();
```

---

## Instance BackendMethod (Row Operations)

**Pattern:** Actions on a specific entity instance.

```typescript
export class Task {
  @BackendMethod({ allowed: Allow.authenticated })
  async toggleCompleted() {
    this.completed = !this.completed;
    await this.save();
  }

  @BackendMethod({ allowed: Allow.authenticated })
  async reassign(newUserId: string) {
    this.assignedTo = newUserId;
    await this.save();
  }
}

// Frontend call
const task = await remult.repo(Task).findId('123');
await task.toggleCompleted();
```

### Accessing field metadata in instance methods
```typescript
@BackendMethod({ allowed: Allow.authenticated })
async logChanges() {
  const original = this.$.title.originalValue;
  console.log(`Title changed: "${original}" → "${this.title}"`);
  await this.save();
}
```

---

## Mutable Controller (Cross-Entity Operations)

**Pattern:** When an operation needs its own input fields and doesn't belong on any single entity. Used for auth flows, multi-step wizards, etc.

```typescript
@Controller('auth')
export class AuthController {
  @Fields.string()
  email = '';

  @Fields.string()
  password = '';

  @Fields.string()
  token = '';

  @BackendMethod({ allowed: true })
  async signIn() {
    const user = await authenticateUser(this.email, this.password);
    if (!user) throw new Error('Invalid credentials');
    this.token = generateJwt(user);
  }
}

// Frontend
const auth = new AuthController();
auth.email = 'user@example.com';
auth.password = 'secret';
await auth.signIn();
console.log(auth.token);
```

Register controllers in remultApi:
```typescript
const api = remultApi({
  entities: [Task],
  controllers: [AuthController],
});
```

---

## Permission Options

```typescript
@BackendMethod({ allowed: true })                              // Anyone
@BackendMethod({ allowed: Allow.authenticated })               // Logged-in users
@BackendMethod({ allowed: Roles.admin })                       // Specific role
@BackendMethod({ allowed: [Roles.admin, Roles.manager] })     // Multiple roles
@BackendMethod({ allowed: () => remult.isAllowed(Roles.admin) }) // Custom function
```

---

## Security Warning

**BackendMethods bypass entity API restrictions.** Even if `allowApiUpdate: false` on a field, a BackendMethod can modify it. Always implement authorisation checks manually:

```typescript
@BackendMethod({ allowed: Allow.authenticated })
async changeOwner(newOwnerId: string) {
  // MUST check manually — entity permissions don't apply here
  if (!remult.isAllowed(Roles.admin)) {
    throw new Error('Only admins can change ownership');
  }
  this.ownerId = newOwnerId;
  await this.save();
}
```

**Avoid:** `@BackendMethod({ allowed: true })` on methods that modify sensitive data without internal auth checks.

---

## Integration with neverthrow

**Pattern:** Wrap BackendMethod calls in `ResultAsync.fromPromise()` on the frontend.

```typescript
// Frontend component
const result = await ResultAsync.fromPromise(
  task.toggleCompleted(),
  (error) => ({ tag: 'INTERNAL' as const, message: String(error) }),
);

result.match(
  () => { /* success — UI already updated */ },
  (error) => errorSignal.set(error.message),
);
```

---

## When to Use What

| Scenario | Pattern |
|----------|---------|
| Toggle a boolean field | Instance BackendMethod on entity |
| Approve/archive a row | Instance BackendMethod on entity |
| Bulk status update | Static BackendMethod on entity |
| Generate a report | Static BackendMethod on entity |
| Auth sign-in flow | Mutable Controller |
| Cross-entity workflow | Controller or operations file |
