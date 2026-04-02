# Angular Component Patterns (Remult + neverthrow)

## Canonical Standalone Component

```typescript
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ResultAsync } from 'neverthrow';
import { remult } from 'remult';
import { Task } from '@workspace/shared-domain';

@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [],
  template: `
    @if (error(); as err) {
      <p class="error">{{ err }}</p>
    }

    @for (task of tasks(); track task.id) {
      <div>
        <input type="checkbox" [checked]="task.completed"
               (change)="toggleCompleted(task)" />
        {{ task.title }}
      </div>
    } @empty {
      <p>No tasks</p>
    }
  `,
})
export class TaskListComponent {
  protected readonly tasks = signal<Task[]>([]);
  protected readonly error = signal<string | null>(null);
  protected readonly count = computed(() => this.tasks().length);

  private readonly taskRepo = remult.repo(Task);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.loadTasks();
  }

  private async loadTasks(): Promise<void> {
    const result = await ResultAsync.fromPromise(
      this.taskRepo.find({ orderBy: { createdAt: 'desc' } }),
      (e) => (e instanceof Error ? e.message : String(e)),
    );
    result.match(
      (tasks) => { this.tasks.set(tasks); this.error.set(null); },
      (err) => this.error.set(err),
    );
  }

  protected async toggleCompleted(task: Task): Promise<void> {
    const result = await ResultAsync.fromPromise(
      this.taskRepo.update(task.id, { completed: !task.completed }),
      (e) => (e instanceof Error ? e.message : String(e)),
    );
    result.match(
      () => this.loadTasks(),
      (err) => this.error.set(err),
    );
  }
}
```

---

## inject() Context Rules

`inject()` can only be called in:
- **Field initialisers** (most common)
- **Constructor body**
- **Provider factory functions** (`useFactory`)

Calling `inject()` elsewhere (methods, callbacks, setTimeout) throws NG0203.

```typescript
export class MyComponent {
  private readonly userService = inject(UserService);  // OK: field initialiser
  private readonly destroyRef = inject(DestroyRef);    // OK: field initialiser

  constructor() {
    const config = inject(ConfigService);              // OK: constructor
  }

  ngOnInit() {
    const service = inject(Service);                   // ERROR: NG0203
  }
}
```

---

## DestroyRef Cleanup

```typescript
export class MyComponent {
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const unsubscribe = remult.repo(Task).liveQuery().subscribe(info => {
      this.tasks.set(info.items);
    });

    this.destroyRef.onDestroy(() => unsubscribe());
  }
}
```

---

## resource() + Remult

```typescript
export class UserDetailComponent {
  userId = input.required<string>();

  protected readonly userResource = resource({
    request: () => ({ id: this.userId() }),
    loader: async ({ request }) =>
      remult.repo(User).findFirst({ id: request.id }),
  });

  // Template:
  // @switch (userResource.status()) {
  //   @case ('loading') { <spinner /> }
  //   @case ('resolved') { {{ userResource.value()?.name }} }
  //   @case ('error') { Error: {{ userResource.error() }} }
  // }
}
```

---

## linkedSignal() + Remult (Draft/Edit Pattern)

```typescript
export class UserEditComponent {
  userId = input.required<string>();

  protected readonly userResource = resource({
    request: () => ({ id: this.userId() }),
    loader: async ({ request }) =>
      remult.repo(User).findFirst({ id: request.id }),
  });

  // Editable copy — resets when userResource changes
  protected readonly draft = linkedSignal(() => this.userResource.value());

  protected async save(): Promise<void> {
    const current = this.draft();
    if (!current) return;
    await ResultAsync.fromPromise(
      remult.repo(User).save(current),
      (e) => String(e),
    ).match(
      () => this.userResource.reload(),
      (err) => console.error(err),
    );
  }
}
```

---

## LiveQuery + Signal

```typescript
export class TaskListComponent {
  protected readonly tasks = signal<Task[]>([]);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    const unsubscribe = remult.repo(Task)
      .liveQuery({ where: { completed: false } })
      .subscribe(info => {
        this.tasks.set(info.items);
      });

    this.destroyRef.onDestroy(() => unsubscribe());
  }
}
```

---

## Zoneless Gotchas

Signals drive change detection in zoneless mode. External callbacks that don't write to signals won't trigger re-renders:

```typescript
// WRONG: No signal write, CD won't run
window.addEventListener('message', (e) => {
  this.data = e.data;  // Not a signal
});

// CORRECT: Signal write triggers CD
window.addEventListener('message', (e) => {
  this.data.set(e.data);  // Signal write → CD
});
```

---

## Testing Signal Components

```typescript
describe('TaskListComponent', () => {
  let fixture: ComponentFixture<TaskListComponent>;
  let component: TaskListComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TaskListComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TaskListComponent);
    component = fixture.componentInstance;
  });

  it('should display tasks', () => {
    // Set signal inputs via ComponentRef
    fixture.componentRef.setInput('userId', '123');
    fixture.detectChanges();

    // Flush effects if needed
    TestBed.flushEffects();

    expect(fixture.nativeElement.textContent).toContain('...');
  });
});
```
