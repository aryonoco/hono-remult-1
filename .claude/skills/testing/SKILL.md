---
name: testing
description: "Vitest + Angular testing conventions: TestBed vs domain harness, whenStable, CDK harnesses, layered a11y, and
the two-lane config. Use when writing or fixing *.spec.ts."
user-invocable: false
---

# Testing Conventions

Covers how this monorepo tests its two layers under Angular 21 zoneless change detection and the Vitest builder
(`@angular/build:unit-test`): web component specs with TestBed plus CDK harnesses, isomorphic domain specs with an
`InMemoryDataProvider`, layered accessibility, and the two-lane Vitest configuration.

## References

- [Component specs](component-specs.md) — TestBed setup, stub providers, `setInput`, `whenStable`, CDK harnesses, axe
- [Domain specs](domain-specs.md) — `InMemoryDataProvider`, `remult.user`, no Angular imports
- [Config](config.md) — `@angular/build:unit-test` options, domain `vitest.config.ts`, `tsconfig.spec.json`, Biome
  relaxations
- [Full Vitest docs](llms-full.txt) — bundled Vitest reference covering matchers, mocking, fake timers, coverage

When the reference files are insufficient, read targeted sections from `llms-full.txt`.

## Decision Trees

### Which harness style

| Code under test                                       | Style                                                       |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| Angular component, service, pipe                      | TestBed with standalone `imports`                           |
| Remult entity validation / logic, isomorphic helper   | `InMemoryDataProvider` + `remult.user`, no TestBed          |
| Proving `allowApi*` / `apiPrefilter` is enforced      | `TestApiDataProvider` (from `remult/server`), toggle `remult.user` |

### Flushing change detection (zoneless)

| Situation                                        | Call                                                                                                |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| After `signal.set()` / `componentRef.setInput()` | `await fixture.whenStable()`                                                                        |
| Inside a service spec after a signal write       | `TestBed.tick()`                                                                                    |
| A timer / `setTimeout` / debounce must fire      | `vi.useFakeTimers()` then `await vi.advanceTimersByTimeAsync(ms)` then `await fixture.whenStable()` |

### Reading the DOM

| Target                                                | Tool                                                        |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| Material widget (select, checkbox, button, dialog)    | CDK harness via `TestbedHarnessEnvironment.loader(fixture)` |
| App-owned markup (`app-*`, `data-testid`, plain text) | `nativeElement.querySelector`                               |

### Accessibility

| Check                                           | Where                                                           |
| ----------------------------------------------- | --------------------------------------------------------------- |
| Roles, names, ARIA relationships, heading order | jsdom via `findAxeViolations(fixture.nativeElement)`            |
| Colour-contrast, focus order, landmark/`region` | real browser via Playwright MCP against `http://localhost:4200` |

### Spies and time

| Need                      | API                                                                                           |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| Standalone spy            | `vi.fn()`                                                                                     |
| Spy on an existing method | `vi.spyOn(obj, 'method')`                                                                     |
| Control time              | `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync()` / `await vi.runAllTimersAsync()` |

## Key Principles

1. **Two lanes** — web specs run under `@angular/build:unit-test`; domain specs run under the lib's own
   `vitest.config.ts`. A domain spec never imports `@angular/*` or `TestBed`.
2. **`whenStable` flushes, not `detectChanges`** — zoneless CD settles asynchronously; await `fixture.whenStable()`
   after every signal or input change.
3. **CDK harnesses for Material** — never `By.css('mat-select')`; obtain harnesses from
   `TestbedHarnessEnvironment.loader(fixture)` and always `await` them.
4. **`vi`, never Jasmine** — spies are `vi.fn` / `vi.spyOn`; matchers are Vitest's.
5. **No Zone.js patch** — `fakeAsync`, `tick`, `flush`, `flushMicrotasks`, and `waitForAsync` throw under the Vitest
   builder; control time with Vitest fake timers instead.
6. **Layered a11y** — structural audit in jsdom (contrast + `region` disabled), contrast and focus in a real browser.
