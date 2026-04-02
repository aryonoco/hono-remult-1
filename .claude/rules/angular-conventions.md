---
paths: ["apps/web/**/*.ts"]
---

# Angular Conventions

## Component Pattern (v16–21 modern Angular)
- **Standalone components only** — no NgModules, declare imports on the component
- **Signals for all state** — `signal()`, `computed()`, never `BehaviorSubject`
- **Signal inputs/outputs** — `input()`, `output()`, `model()`, never `@Input()`/`@Output()` decorators
- **`inject()` function** — never constructor injection
- **Built-in control flow** — `@if`, `@for`, `@switch`, `@defer`, never `*ngIf`/`*ngFor`
- **Zoneless change detection** — signals drive re-renders, no Zone.js dependency

## State Management
- `signal(value)` for mutable local state
- `computed(() => ...)` for derived read-only state
- `linkedSignal(() => source())` for editable copies that reset when source changes (draft/edit patterns)
- `resource()` for async data loading with built-in status/error/reload
- `effect()` sparingly — for syncing to imperative APIs, auto-cleans up on destroy

## Data Access
- Use `remult.repo(Entity)` directly in components — no wrapper services for basic CRUD
- Wrap all Remult calls in `ResultAsync.fromPromise()` for explicit error handling
- LiveQuery: `repo.liveQuery().subscribe(info => tasks.set(info.items))`
- Clean up subscriptions via `inject(DestroyRef).onDestroy(() => unsubscribe())`

## Templates
- `@for`: always use stable `track` expression (`track item.id`), never object reference
- `@defer`: use for heavy components with `on viewport` + `prefetch on idle`
- `@switch`: prefer over chained `@if`/`@else if` for discriminated values

## Lifecycle
- `DestroyRef.onDestroy()` for cleanup — never `ngOnDestroy`
- `afterRender()` / `afterNextRender()` for DOM operations — never `ngAfterViewInit`

## Routing
- Lazy-loaded feature routes under `features/`
- Route-level providers for feature-specific services

## Accessibility
- `protected` for template-accessible members
- `readonly` for injected services

## Module Boundary
- `scope:web` cannot import from `hono` or `hono/*`
- Can import from `@angular/*`, `remult`, `neverthrow`, and `@workspace/shared-domain`
