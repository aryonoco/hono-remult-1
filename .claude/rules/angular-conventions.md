---
paths: ["apps/web/**/*.ts"]
---

# Angular Conventions

## Component Pattern (modern Angular v21)

- **Standalone components only** — no NgModules, declare imports on the component. `standalone` is the default
  since v20; never set `standalone: true` explicitly
- **`ChangeDetectionStrategy.OnPush`** on every component
- **Signals for all state** — `signal()`, `computed()`, never `BehaviorSubject`
- **Signal inputs/outputs** — `input()`, `output()`, `model()`, never `@Input()`/`@Output()` decorators
- **`inject()` in field initialisers** — keep `constructor()` parameterless for setup; never inject via constructor
  parameters
- **Built-in control flow** — `@if`, `@for`, `@switch`, `@defer`, never `*ngIf`/`*ngFor`
- **Host bindings via the `host` object** on the `@Component` decorator — never `@HostBinding`/`@HostListener`
- **`NgOptimizedImage`** for static images
- **Zoneless change detection** — the v21 default; the app calls `provideZonelessChangeDetection()` (explicit,
  harmless). Keep it; never add Zone.js or `provideZoneChangeDetection`

## State Management

- `signal(value)` for mutable local state
- `computed(() => ...)` for derived read-only state
- `linkedSignal(() => source())` for editable copies that reset when source changes (draft/edit patterns)
- `resource()` for async data loading with built-in status/error/reload
- `effect()` sparingly — for syncing to imperative APIs, auto-cleans up on destroy

## Forms

- Use reactive forms (`@angular/forms`). Signal Forms (`@angular/forms/signals`) are experimental in v21 — do not
  use them in app code. The metadata-driven `<app-dynamic-form>` is reactive-forms based.

## Data Access

- Use `remult.repo(Entity)` directly in components — no wrapper services for basic CRUD
- Wrap all Remult calls in `ResultAsync.fromPromise()` for explicit error handling
- LiveQuery: `repo.liveQuery().subscribe(info => tasks.set(info.items))`
- Clean up subscriptions via `inject(DestroyRef).onDestroy(() => unsubscribe())`

## Templates

- `@for`: always use stable `track` expression (`track item.id`), never object reference
- `@defer`: use for heavy components with `on viewport` + `prefetch on idle`. Never use `hydrate on …` triggers —
  they require SSR + `withIncrementalHydration()`, and this app is client-rendered (no server entrypoint)
- `@switch`: prefer over chained `@if`/`@else if` for discriminated values
- Class/style: use `[class.x]` / `[style.x]` bindings, never `ngClass` / `ngStyle`

## Lifecycle

- `DestroyRef.onDestroy()` for cleanup — never `ngOnDestroy`
- `afterRender()` / `afterNextRender()` for DOM operations — never `ngAfterViewInit`

## Routing

- Lazy-loaded feature routes under `features/`
- Route-level providers for feature-specific services

## Accessibility

- `protected` for template-accessible members
- `readonly` for injected services

## Styling

- Component styling conventions (Tailwind v4 + Material M3) live in `.claude/rules/styling-conventions.md`

## Module Boundary

- `scope:web` cannot import from `hono` or `hono/*`
- Can import from `@angular/*`, `remult`, `neverthrow`, and `@workspace/shared-domain`
