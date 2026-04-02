# neverthrow Common Mistakes

## 1. Using try/catch Around ResultAsync

**Wrong:**
```typescript
try {
  const result = await fetchUser(id);
  // ...
} catch (e) {
  console.error(e);
}
```

**Why:** Defeats the purpose of typed error handling. ResultAsync never rejects — errors are in the Err track.

**Correct:**
```typescript
const result = await fetchUser(id);
result.match(
  (user) => { /* success */ },
  (error) => { /* typed error */ },
);
```

---

## 2. Forgetting to Handle the Result

**Wrong:**
```typescript
fetchUser(id).map((u) => u.name);
// Result silently discarded
```

**Why:** The ESLint `must-use-result` rule catches this. Every Result must be consumed via `.match()`, `.unwrapOr()`, or assigned.

**Correct:**
```typescript
const name = fetchUser(id)
  .map((u) => u.name)
  .unwrapOr('Unknown');
```

---

## 3. Using `Result.fromThrowable` for Async Functions

**Wrong:**
```typescript
const safeFetch = Result.fromThrowable(async () => {
  const res = await fetch('/api');
  return res.json();
});
// Returns Result<Promise<T>, E> — the Promise is in the Ok track!
```

**Why:** `Result.fromThrowable` is for synchronous functions only. Async rejections are not caught.

**Correct:**
```typescript
const safeFetch = ResultAsync.fromThrowable(
  async () => {
    const res = await fetch('/api');
    return res.json();
  },
  (error) => ({ tag: 'FETCH_ERROR' as const, message: String(error) }),
);
```

---

## 4. Wrapping `Promise.resolve()` in `fromPromise`

**Wrong:**
```typescript
const result = ResultAsync.fromPromise(
  Promise.resolve(42),
  (e) => new Error(String(e)),
);
```

**Why:** Redundant — the promise can't reject.

**Correct:**
```typescript
const result = okAsync(42);
// Or: ResultAsync.fromSafePromise(Promise.resolve(42));
```

---

## 5. Not Mapping Error Types Consistently

**Wrong:**
```typescript
fetchUser(id)                              // ResultAsync<User, FetchError>
  .asyncAndThen(() => fetchTasks(userId))  // ResultAsync<Task[], TaskError>
  .asyncAndThen(() => validateTasks(tasks)) // ResultAsync<Task[], ValidationError>
// Error type is FetchError | TaskError | ValidationError — unmanageable
```

**Why:** Error types accumulate into wide unions. Consumers can't handle them consistently.

**Correct:** Map errors to a consistent discriminated union.
```typescript
type AppError =
  | { tag: 'NOT_FOUND'; message: string }
  | { tag: 'VALIDATION'; message: string }
  | { tag: 'INTERNAL'; message: string };

fetchUser(id)
  .mapErr(toAppError('NOT_FOUND'))
  .asyncAndThen(() => fetchTasks(userId).mapErr(toAppError('INTERNAL')))
```

---

## 6. Using `.isOk()` / `.isErr()` Instead of `.match()`

**Wrong:**
```typescript
if (result.isOk()) {
  // TypeScript narrows, but not exhaustive
  console.log(result.value);
} else {
  console.error(result.error);
}
```

**Why:** Not exhaustive — easy to forget the else branch. Also uses the internal `.value`/`.error` properties.

**Correct:**
```typescript
result.match(
  (value) => console.log(value),
  (error) => console.error(error),
);
```

---

## 7. Deeply Nesting `.andThen()` Callbacks

**Wrong:**
```typescript
fetchUser(id)
  .andThen((user) =>
    fetchTasks(user.id)
      .andThen((tasks) =>
        validateTasks(tasks)
          .andThen((validated) =>
            saveTasks(validated)
          )
      )
  )
```

**Why:** Callback hell — hard to read, harder to debug.

**Correct:** Use `safeTry` for multi-step sequences.
```typescript
safeTry(function* () {
  const user = yield* fetchUser(id);
  const tasks = yield* fetchTasks(user.id);
  const validated = yield* validateTasks(tasks);
  return yield* saveTasks(validated);
})
```

---

## 8. Throwing Inside `.match()` Callbacks

**Wrong:**
```typescript
result.match(
  (user) => {
    if (!user.active) throw new Error('Inactive user');
    return user;
  },
  (err) => { throw err; },
);
```

**Why:** Breaks the Result pattern. Exceptions bypass the type system.

**Correct:** Return a new Result or handle the error explicitly.
```typescript
result.andThen((user) => {
  if (!user.active) return err({ tag: 'INACTIVE' as const, message: 'User inactive' });
  return ok(user);
});
```
