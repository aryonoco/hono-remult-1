# neverthrow + Remult Integration

## Core Pattern: Wrapping Remult Calls

Remult's Repository API returns Promises that may reject. Wrap them in `ResultAsync.fromPromise()`:

```typescript
import { ResultAsync } from 'neverthrow';

type AppError = { tag: string; message: string };

const toError = (error: unknown): AppError => ({
  tag: 'INTERNAL',
  message: error instanceof Error ? error.message : String(error),
});

// Find
const result = await ResultAsync.fromPromise(
  repo.find({ where: { completed: false } }),
  toError,
);

// Insert
const result = await ResultAsync.fromPromise(
  repo.insert({ title: 'New Task' }),
  toError,
);

// Save
const result = await ResultAsync.fromPromise(
  repo.save(task),
  toError,
);

// Delete
const result = await ResultAsync.fromPromise(
  repo.delete(taskId),
  toError,
);
```

---

## Error Type Pattern

Define a consistent discriminated union for the project:

```typescript
type AppError =
  | { tag: 'NOT_FOUND'; message: string }
  | { tag: 'VALIDATION'; message: string }
  | { tag: 'PERMISSION'; message: string }
  | { tag: 'INTERNAL'; message: string };

// Error mapper factory
const toAppError =
  (tag: AppError['tag']) =>
  (error: unknown): AppError => ({
    tag,
    message: error instanceof Error ? error.message : String(error),
  });

// Usage
ResultAsync.fromPromise(repo.findId(id), toAppError('NOT_FOUND'));
ResultAsync.fromPromise(repo.insert(data), toAppError('VALIDATION'));
```

---

## Angular Signal Integration

```typescript
export class TaskListComponent {
  protected readonly tasks = signal<Task[]>([]);
  protected readonly error = signal<string | null>(null);

  private readonly taskRepo = remult.repo(Task);

  async loadTasks(): Promise<void> {
    const result = await ResultAsync.fromPromise(
      this.taskRepo.find({ where: { completed: false } }),
      toError,
    );

    result.match(
      (tasks) => {
        this.tasks.set(tasks);
        this.error.set(null);
      },
      (err) => this.error.set(err.message),
    );
  }

  async addTask(title: string): Promise<void> {
    const result = await ResultAsync.fromPromise(
      this.taskRepo.insert({ title }),
      toError,
    );

    result.match(
      (task) => this.tasks.update((prev) => [...prev, task]),
      (err) => this.error.set(err.message),
    );
  }
}
```

---

## Wrapping BackendMethod Calls

```typescript
// BackendMethods are also Promises
const result = await ResultAsync.fromPromise(
  task.toggleCompleted(),
  toAppError('INTERNAL'),
);

result.match(
  () => { /* success — task already mutated */ },
  (err) => errorSignal.set(err.message),
);
```

---

## Side Effects in Chains

Use `andTee` for logging/metrics without affecting the value:

```typescript
ResultAsync.fromPromise(repo.insert(data), toError)
  .andTee((task) => console.log('Created task:', task.id))
  .match(
    (task) => tasks.update((prev) => [...prev, task]),
    (err) => error.set(err.message),
  );
```

Use `orTee` for error logging without affecting the error:

```typescript
ResultAsync.fromPromise(repo.find(), toError)
  .orTee((err) => analytics.trackError('task_load_failed', err))
  .match(
    (tasks) => tasksSignal.set(tasks),
    (err) => errorSignal.set(err.message),
  );
```

---

## When to Use neverthrow vs Remult's Built-in Error Handling

| Scenario | Use |
|----------|-----|
| Field validation (required, minLength) | Remult validators on entity |
| Cross-field validation | Remult `validation` lifecycle hook |
| Component-level error display | neverthrow `ResultAsync` + signal |
| Chaining multiple Remult operations | neverthrow `safeTry` or `.andThen()` |
| BackendMethod error handling | neverthrow on the frontend call |
| LiveQuery errors | Remult's built-in subscription error handling |

**Rule of thumb:** Remult handles validation and auth errors at the entity level. neverthrow handles error propagation and display at the component level.
