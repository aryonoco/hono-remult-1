# Angular Signal Patterns

## State

### signal — mutable local state
**Pattern:**
```typescript
protected readonly count = signal(0);
// Read: count()
// Write: count.set(1) or count.update(v => v + 1)
```
**Avoid:** `BehaviorSubject` for component state.

### computed — derived read-only state
**Pattern:**
```typescript
protected readonly doubled = computed(() => this.count() * 2);
// Lazy, cached, auto-tracks dependencies
```
**Avoid:** Manual recalculation in effects or lifecycle hooks.

### effect — side effects on signal change
**Pattern:**
```typescript
constructor() {
  effect(() => {
    const id = this.userId();
    console.log('User changed:', id);
  });
  // Auto-tracks signals read inside, auto-cleans up on destroy
}
```
**Avoid:** Overusing effects — prefer `computed` for derived state, `resource` for async.

### linkedSignal — resettable derived state
**Pattern:** Editable copy that syncs to source when source changes.
```typescript
protected readonly user = signal({ name: 'Alice' });
protected readonly editableUser = linkedSignal(() => this.user());
// editableUser.set({ name: 'Bob' }) — local edit
// user.set({ name: 'Charlie' }) — resets editableUser to Charlie
```
**Avoid:** Manual effect + signal combo to replicate this behaviour.

### untracked — read without dependency tracking
**Pattern:**
```typescript
effect(() => {
  const filter = this.filter();             // TRACKED — effect re-runs when this changes
  const userId = untracked(() => this.userId()); // NOT tracked
  this.loadData(filter, userId);
});
```
**Avoid:** Reading signals inside effects that shouldn't trigger re-runs.

---

## Async Data

### resource — async loading with status
**Pattern:**
```typescript
protected readonly userResource = resource({
  request: () => ({ id: this.userId() }),  // Reactive params
  loader: async ({ request }) => {
    return await remult.repo(User).findFirst({ id: request.id });
  },
});
// userResource.status() — 'idle' | 'loading' | 'resolved' | 'error'
// userResource.value() — the loaded data
// userResource.error() — error if failed
// userResource.reload() — trigger re-fetch
```
**Avoid:** Manual loading state management with separate `loading`/`error`/`data` signals when `resource` fits.

---

## Inputs & Outputs

### input — signal-based component input
**Pattern:**
```typescript
name = input<string>();                // Optional
name = input('default');               // With default
name = input.required<string>();       // Required (TS error if parent omits)
count = input(0, { transform: numberAttribute }); // With transform
```
**Avoid:** `@Input()` decorator.

### model — two-way binding
**Pattern:**
```typescript
count = model(0);  // Input + output in one
// Parent: <counter [(count)]="myCount" />
// Component: this.count.set(5) — emits change to parent
```

### output — event emission
**Pattern:**
```typescript
saved = output<Task>();
// this.saved.emit(task);
// Parent: <form (saved)="onSaved($event)" />
```
**Avoid:** `@Output()` + `EventEmitter`.

---

## RxJS Interop

### toSignal — Observable to Signal
**Pattern:**
```typescript
protected readonly user = toSignal(this.user$, { initialValue: null });
// Auto-unsubscribes on destroy
```

### toObservable — Signal to Observable
**Pattern:**
```typescript
const count$ = toObservable(this.count);
```

### Bridge pattern — Signal → RxJS pipeline → Signal
**Pattern:**
```typescript
protected readonly results = toSignal(
  toObservable(this.searchTerm).pipe(
    debounceTime(300),
    switchMap(term => this.http.get(`/api/search?q=${term}`)),
  ),
  { initialValue: [] },
);
```

---

## What NOT to Use

| Deprecated | Modern Replacement |
|-----------|-------------------|
| `BehaviorSubject` | `signal()` |
| `@Input()` decorator | `input()` function |
| `@Output()` + `EventEmitter` | `output()` function |
| `*ngIf`, `*ngFor` | `@if`, `@for` |
| Constructor injection | `inject()` function |
| `ngOnDestroy` | `DestroyRef.onDestroy()` |
| `ngAfterViewInit` | `afterRender()` / `afterNextRender()` |
| Zone.js | `provideZonelessChangeDetection()` |
