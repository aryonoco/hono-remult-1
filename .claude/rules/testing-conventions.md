---
paths: ["**/*.spec.ts"]
---

# Testing Conventions

Vitest under the Angular `@angular/build:unit-test` builder (web) and a plain Vitest config (shared domain). See
`.claude/skills/testing/` for the worked harnesses.

## Choosing a Harness

- Web/component specs: Angular `TestBed` with standalone `imports`.
- Domain specs: set `remult.dataProvider = new InMemoryDataProvider()` and `remult.user`. Never import `@angular/*`
  or `TestBed` into a domain spec — the `scope:shared` boundary forbids it.

## Change Detection

- Never call `fixture.detectChanges()` — the suite is zoneless. Drive change detection two ways:
  - `await fixture.whenStable()` after a signal input (`componentRef.setInput`) or signal `.set()`; it awaits the
    scheduled pass. Use it for initial render and genuinely-resolving async work.
  - `TestBed.tick()` for a synchronous pass that does not await pending tasks. Required when a component has a
    pending `resource()`/transport that never resolves in the test (so `whenStable()` would hang), and after an
    imperative reactive-form mutation (`control.setValue()`/`setErrors()`) whose template bindings re-evaluate
    only on a forced pass.
- Use `TestBed.inject` (never `TestBed.get`) and `TestBed.tick()` (never the deprecated `flushEffects()`).

## Querying the DOM

- Use CDK component harnesses for Material widgets (`MatSelectHarness`, `MatButtonHarness`, … via
  `TestbedHarnessEnvironment.loader(fixture)`, always `await`ed).
- Use raw DOM queries only for app-owned markup (testids, `app-*` elements).

## Spies and Timers

- Spy with `vi.fn` / `vi.spyOn` — never Jasmine.
- Never use `fakeAsync` / `tick` / `flush` / `flushMicrotasks` / `waitForAsync` — there is no Zone.js patch under
  the Vitest builder, so they throw. Control time with `vi.useFakeTimers()` + `await vi.advanceTimersByTimeAsync()`,
  then `await fixture.whenStable()`.

## Accessibility

- Assert structural a11y with `findAxeViolations(fixture.nativeElement)` and expect `toEqual([])`.
- Never re-enable the `color-contrast` or `region` rules under jsdom (it cannot compute layout or contrast) —
  contrast, focus, and landmark checks run in a real browser via the Playwright MCP.

## Running

- Run via `bunx nx run-many -t test` (or `bunx nx test web`).
- Spec-only Biome relaxations (`noExplicitAny`, `noNonNullAssertion`, `noMagicNumbers`, `useExplicitType`,
  `noExcessiveLinesPerFunction`) apply to `*.spec.ts` only — never rely on them in non-spec code.
