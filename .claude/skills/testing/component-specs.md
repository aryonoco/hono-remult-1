# Component Specs

Web specs live beside the component (`*.spec.ts`) and run under `@angular/build:unit-test` in jsdom. Drive the
component through `TestBed`, stub the providers it injects, flush change detection with `await fixture.whenStable()`,
and read Material widgets through CDK harnesses.

## 1. TestBed With Standalone Imports

**Pattern:** import the standalone component directly; there are no NgModules.

```ts
import { TestBed } from '@angular/core/testing';
import { StatusBadgeComponent } from './status-badge';

describe('StatusBadgeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [StatusBadgeComponent] });
  });
});
```

**Avoid:** declaring the component, importing an NgModule, or calling `TestBed.get` (removed — use `TestBed.inject`).

## 2. Stub Providers

**Pattern:** supply the providers the component injects. Disable animations, give a no-op router and the date adapter,
and stub `BreakpointObserver` (from `apps/web/src/app/app.spec.ts` and `dynamic-form.spec.ts`).

```ts
import { BreakpointObserver } from '@angular/cdk/layout';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

const breakpointStub = { observe: () => of({ matches: false, breakpoints: {} }) };

TestBed.configureTestingModule({
  imports: [App],
  providers: [
    provideRouter([]),
    { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: 'en-AU' },
    { provide: BreakpointObserver, useValue: breakpointStub },
  ],
});
```

**Pattern:** stub a service with a plain object of `vi.fn` spies, then resolve it with `TestBed.inject`
(from `incident-form.spec.ts`).

```ts
const notification = { success: vi.fn(), error: vi.fn() };
const dialogStub = { open: vi.fn(() => ({ afterClosed: () => of(true) })) };

TestBed.configureTestingModule({
  imports: [IncidentFormComponent],
  providers: [
    { provide: NotificationService, useValue: notification },
    { provide: MatDialog, useValue: dialogStub },
  ],
});

const router = TestBed.inject(Router);
```

**Avoid:** `TestBed.get(Router)`, Jasmine's `jasmine.createSpy`, or real animations.

## 3. Set Inputs With componentRef.setInput

**Pattern:** signal inputs are set through `componentRef.setInput`, never by writing to the instance field.

```ts
const fixture = TestBed.createComponent(StatusBadgeComponent);
fixture.componentRef.setInput('status', FireStatus.going);
await fixture.whenStable();
```

**Avoid:** `fixture.componentInstance.status = …` — it bypasses input binding and will not re-run change detection.

## 4. Flush With whenStable or TestBed.tick, Never detectChanges

**Pattern:** zoneless change detection settles asynchronously. After a signal write or `setInput`, await
`fixture.whenStable()` before asserting on the DOM. Use it for initial render and resolving async work.

```ts
component.title.set('Renamed');
await fixture.whenStable();
expect(el.querySelector('h1')?.textContent).toContain('Renamed');
```

**Pattern:** use `TestBed.tick()` for a *synchronous* pass that does not await pending tasks. It is required when the
component holds a pending `resource()`/transport that never resolves in the test (so `whenStable()` would hang), and
after an imperative reactive-form mutation (`control.setValue()`/`setErrors()`) whose template bindings re-evaluate
only on a forced pass (from `incident-detail.spec.ts` and `confirm-reason-dialog.spec.ts`).

```ts
instance(fixture).fireResource.set(fire); // resource transport is stubbed to hang
TestBed.tick();
expect(text(fixture)).toContain('Test Fire');
```

**Pattern:** in a pure service spec (no fixture) flush an effect with `TestBed.tick()`
(from `theme.service.spec.ts`).

```ts
const service = TestBed.inject(ThemeService);
service.setTheme('dark');
TestBed.tick();
expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
```

**Avoid:** calling `fixture.detectChanges()` to *flush* — under zoneless it does not await the pending CD pass that a
signal change schedules. Reach for `whenStable` (resolving async) or `TestBed.tick()` (synchronous passes, including
pending-forever transports and reactive-form mutations).

## 5. Material Widgets — CDK Harnesses

**Pattern:** build a loader once from the fixture, then `await` each harness. Use the harness API (no DOM poking) to
read and drive Material widgets.

```ts
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { MatSelectHarness } from '@angular/material/select/testing';
import { MatCheckboxHarness } from '@angular/material/checkbox/testing';
import { MatButtonHarness } from '@angular/material/button/testing';

const loader = TestbedHarnessEnvironment.loader(fixture);

const select = await loader.getHarness(MatSelectHarness);
await select.open();
await select.clickOptions({ text: 'Going' });
expect(await select.getValueText()).toBe('Going');

const checkbox = await loader.getHarness(MatCheckboxHarness);
await checkbox.check();
expect(await checkbox.isChecked()).toBe(true);

await (await loader.getHarness(MatButtonHarness.with({ text: 'Save' }))).click();
```

**Pattern:** widgets rendered into an overlay (dialogs, the open select panel) live outside the fixture root — load
them through `documentRootLoader`.

```ts
const rootLoader = TestbedHarnessEnvironment.documentRootLoader(fixture);
const dialog = await rootLoader.getHarness(MatDialogHarness);
```

Other harnesses follow the same shape: `MatRadioGroupHarness`, `MatSlideToggleHarness`, `MatInputHarness`,
`MatMenuHarness`, `MatTableHarness`.

**Avoid:** `fixture.debugElement.query(By.css('mat-select'))` or `nativeElement.querySelector('mat-checkbox')` for
Material widgets — the harness normalises async behaviour and runs change detection for you.

## 6. Raw DOM Queries — App-Owned Markup Only

**Pattern:** use `querySelector` for elements your own templates own: `data-testid`, `app-*` selectors, plain text.

```ts
const el = fixture.nativeElement as HTMLElement;
expect(el.querySelector('app-datetime-field')).toBeTruthy();
expect(el.querySelector('[data-testid="form-save"]')?.textContent).toContain('Save incident');
```

## 7. Controlling Time

**Pattern:** there is no Zone.js patch under the Vitest builder. Drive timers with Vitest fake timers, then settle CD.

```ts
vi.useFakeTimers();
const fixture = TestBed.createComponent(DebouncedSearch);
fixture.componentRef.setInput('query', 'fire');
await vi.advanceTimersByTimeAsync(300);
await fixture.whenStable();
expect(/* … */).toBe(/* … */);
vi.useRealTimers();
```

**Avoid:** `fakeAsync`, `tick`, `flush`, `flushMicrotasks`, `waitForAsync`. They are unsupported under the Vitest
runner and throw — no zone.js patch is applied.

## 8. Accessibility — Structural Audit in jsdom

**Pattern:** assert zero structural violations with the shared helper. Keep the assertion inside the test body
(from `apps/web/src/app/app.spec.ts`).

```ts
import { findAxeViolations } from '../testing/axe-helper';

it('has no structural accessibility violations', async () => {
  const fixture = TestBed.createComponent(App);
  await fixture.whenStable();
  expect(await findAxeViolations(fixture.nativeElement)).toEqual([]);
});
```

The helper (`apps/web/src/testing/axe-helper.ts`) runs `axe-core` with `color-contrast` and `region` disabled — jsdom
cannot compute layout or contrast. Colour-contrast, focus order, and landmark checks run in a real browser via the
Playwright MCP against `http://localhost:4200`.

**Avoid:** asserting on contrast or landmark structure in jsdom; those audits belong to the browser pass.
