import { afterNextRender, type ElementRef, type Injector } from '@angular/core';

// Angular Reactive Forms set `ng-invalid` directly ON the control element — the `<input>`/`<textarea>`, the
// `<mat-select>` host, or the `<app-datetime-field>` host — never on a wrapper. So the selector targets those
// elements directly (and reaches into the datetime composite to focus its first inner input). querySelector
// returns the first match in document order, i.e. the first invalid field.
export const INVALID_CONTROL_SELECTOR =
  'input.ng-invalid, select.ng-invalid, textarea.ng-invalid, mat-select.ng-invalid, app-datetime-field.ng-invalid input';

// Best-effort UX after a blocked submit: move keyboard focus to the first invalid field. Runs in an injection
// context via the passed injector; deferred to the next render so the freshly-applied `ng-invalid` classes exist.
export function focusFirstInvalid(host: ElementRef<HTMLElement>, injector: Injector): void {
  afterNextRender(
    () => {
      host.nativeElement.querySelector<HTMLElement>(INVALID_CONTROL_SELECTOR)?.focus();
    },
    { injector },
  );
}
