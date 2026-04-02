# neverthrow API Reference (v8.x)

## Constructors

### Result (Synchronous)
```typescript
ok<T>(value: T): Result<T, never>          // Success
err<E>(error: E): Result<never, E>         // Failure
ok(): Result<void, never>                   // Success with void (v8.2.0)
err(): Result<never, void>                  // Failure with void (v8.2.0)
```

### ResultAsync (Asynchronous)
```typescript
okAsync<T>(value: T): ResultAsync<T, never>
errAsync<E>(error: E): ResultAsync<never, E>

ResultAsync.fromPromise<T, E>(
  promise: Promise<T>,
  errorHandler: (error: unknown) => E
): ResultAsync<T, E>

ResultAsync.fromSafePromise<T>(
  promise: Promise<T>
): ResultAsync<T, never>                    // Promise guaranteed not to reject

Result.fromThrowable<T, E>(
  fn: () => T,
  errorHandler?: (error: unknown) => E
): () => Result<T, E>                       // Wraps sync throwing function

ResultAsync.fromThrowable<T, E>(
  fn: (...args) => Promise<T>,
  errorHandler?: (error: unknown) => E
): (...args) => ResultAsync<T, E>           // Wraps async function (sync throw + async reject)
```

---

## Combinators — Transformation

```typescript
// Transform success value
.map<U>(fn: (t: T) => U): Result<U, E>

// Transform error value
.mapErr<U>(fn: (e: E) => U): Result<T, U>

// Chain fallible operation (sync)
.andThen<U, F>(fn: (t: T) => Result<U, F>): Result<U, E | F>

// Chain fallible operation (async)
.asyncAndThen<U, F>(fn: (t: T) => ResultAsync<U, F>): ResultAsync<U, E | F>

// Async map (transform success to Promise)
.asyncMap<U>(fn: (t: T) => Promise<U>): ResultAsync<U, E>

// Error recovery (v8.0 breaking: type params changed to <OkType, ErrType>)
.orElse<U, F>(fn: (e: E) => Result<U, F>): Result<T | U, F>
```

---

## Combinators — Side Effects

```typescript
// Side effect on success, preserve value (v7.1.0)
.andTee(fn: (t: T) => unknown): Result<T, E>

// Side effect on error, preserve error (v8.2.0)
.orTee(fn: (e: E) => unknown): Result<T, E>

// Fallible side effect on success, preserve value on success
.andThrough<U, F>(fn: (t: T) => Result<U, F>): Result<T, E | F>

// Async fallible side effect
.asyncAndThrough<U, F>(fn: (t: T) => ResultAsync<U, F>): ResultAsync<T, E | F>
```

---

## Consumption

```typescript
// Exhaustive pattern match (preferred)
.match<A, B>(onOk: (t: T) => A, onErr: (e: E) => B): A | B

// Extract value with default
.unwrapOr<U>(defaultValue: U): T | U

// Type guards
.isOk(): this is Ok<T, E>
.isErr(): this is Err<T, E>

// Unsafe extraction (avoid — bypasses ESLint rule)
._unsafeUnwrap(): T    // throws if Err
._unsafeUnwrapErr(): E // throws if Ok
```

---

## Aggregation

```typescript
// Combine array of Results — short-circuits on first error
Result.combine<T, E>(results: Result<T, E>[]): Result<T[], E>

// Combine array of Results — collects ALL errors
Result.combineWithAllErrors<T, E>(results: Result<T, E>[]): Result<T[], E[]>

// Async variants
ResultAsync.combine(results): ResultAsync<T[], E>
ResultAsync.combineWithAllErrors(results): ResultAsync<T[], E[]>
```

---

## safeTry Generator (v8.1+)

Ergonomic multi-step error handling using `yield*` for early return on error:

```typescript
import { safeTry } from 'neverthrow';

// Sync
const result = safeTry(function* () {
  const user = yield* fetchUser(id);           // Early return if err
  const tasks = yield* fetchTasks(user.id);    // Early return if err
  const validated = yield* validateTasks(tasks);
  return ok({ user, tasks: validated });
});

// Async
const result = safeTry(async function* () {
  const response = yield* ResultAsync.fromPromise(fetch('/api'), toError);
  const data = yield* ResultAsync.fromPromise(response.json(), toError);
  return ok(data);
});
```

**When to use safeTry vs andThen:**
- `safeTry`: Multi-step sequences (3+ steps), reads like imperative code
- `andThen` chain: Simple 1–2 step transformations, more functional style

---

## v8.0 Breaking Change: orElse

Type parameters changed from `<ErrType>` to `<OkType, ErrType>`:

```typescript
// v7 (old)
result.orElse<CustomError>(() => err(new CustomError()))

// v8 (new)
result.orElse<number, CustomError>(() => err(new CustomError()))
```

Type inference handles this automatically in most cases. Only explicit type arguments need updating.
