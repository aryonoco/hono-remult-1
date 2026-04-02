---
name: angular-modern
description: "Modern Angular patterns (v16–21) — signals, standalone, zoneless, inject(), control flow, resource, linkedSignal. Use when writing or reviewing Angular components."
user-invocable: false
---

# Modern Angular Patterns

Covers the modern Angular patterns introduced across v16–21:
standalone components, signals, zoneless change detection, `inject()`, built-in control flow.

## References

- [Signal patterns](signal-patterns.md) — signal, computed, effect, linkedSignal, resource, inputs, outputs, RxJS interop
- [Component patterns](component-patterns.md) — Remult + neverthrow integration, inject, DestroyRef, testing
- [Full Angular docs](llms-full.txt) — official docs covering signals, components, DI, templates, routing, forms, HTTP, CD, testing

When the quick reference files are insufficient, read targeted sections from `llms-full.txt`.

## Decision Trees

### State management

| Need | Pattern |
|------|---------|
| Mutable state | `signal()` |
| Derived (read-only) | `computed()` |
| Derived (resettable) | `linkedSignal()` |
| Side effect | `effect()` — sparingly |
| Async data loading | `resource()` |

### Component communication

| Direction | Pattern |
|-----------|---------|
| Parent → child | `input()` / `input.required()` |
| Child → parent | `output()` |
| Two-way | `model()` |

### Templates

| Need | Syntax |
|------|--------|
| Conditional | `@if` / `@else` |
| List | `@for (item of items(); track item.id)` |
| Switch | `@switch` / `@case` |
| Lazy load | `@defer (on viewport)` |

### RxJS interop

| Direction | Function |
|-----------|----------|
| Observable → Signal | `toSignal(obs$, { initialValue })` |
| Signal → Observable | `toObservable(signal)` |

### Lifecycle

| Need | Pattern |
|------|---------|
| Cleanup | `DestroyRef.onDestroy()` |
| DOM operations | `afterRender()` / `afterNextRender()` |
| Service injection | `inject()` in field initialiser or constructor |

## Key Principles

1. **Signals drive everything** — state, inputs, outputs, change detection
2. **Standalone only** — no NgModules
3. **Zoneless** — signals trigger CD, no Zone.js
4. **`inject()` not constructors** — cleaner DI
5. **Built-in control flow** — `@if`/`@for`/`@switch`/`@defer`, never structural directives
6. **`DestroyRef` not `ngOnDestroy`** — keeps setup and cleanup together
