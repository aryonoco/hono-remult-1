import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { DynamicFormComponent } from './dynamic-form';
import type { BuiltForm } from './form-engine.types';

// The four mutually exclusive render states a metadata-driven form page can be in. `anonymous` and
// `notFound` are terminal copy; `loading` shows the progress bar; `ready` renders the built form.
export type FormPageState = 'anonymous' | 'loading' | 'notFound' | 'ready';

// Presentational chrome shared by every entity form screen: a heading, the four-state switch, the
// `<app-dynamic-form>` body, and a sticky Save/Cancel action bar. Holds no data-access or form-building
// logic — the feature components own the form lifecycle and feed this wrapper through signal inputs.
@Component({
  selector: 'app-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatProgressBarModule, MatProgressSpinnerModule, DynamicFormComponent],
  template: `
    <h1 class="title">{{ title() }}</h1>
    @switch (state()) {
      @case ('anonymous') {
        <p role="alert" class="notice">Select a dev user to begin.</p>
      }
      @case ('loading') {
        <mat-progress-bar mode="indeterminate" aria-label="Loading form" />
      }
      @case ('notFound') {
        <p role="alert" class="notice">{{ notFoundMessage() }}</p>
      }
      @default {
        @if (built(); as b) {
          <app-dynamic-form [form]="b.form" [groups]="b.groups" />
          <div class="actions">
            <span class="actions__status" aria-live="polite">
              @if (formDirty()) {
                <span class="actions__dirty">● Unsaved changes</span>
              }
            </span>
            <button
              mat-stroked-button
              type="button"
              data-testid="form-cancel"
              (click)="cancel.emit()"
            >
              Cancel
            </button>
            <button
              mat-flat-button
              type="button"
              data-testid="form-save"
              [disabled]="submitting()"
              (click)="save.emit()"
            >
              @if (submitting()) {
                <mat-spinner class="actions__spinner" diameter="18" aria-hidden="true" />
              }
              {{ submitLabel() }}
            </button>
          </div>
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }

    .title {
      margin: 0 0 1.25rem;
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .notice {
      margin: 0;
      padding: 1.25rem 1.5rem;
      border: var(--app-grid-border);
      border-radius: var(--app-radius-card);
      background: var(--mat-sys-surface-container-low);
      color: var(--mat-sys-on-surface);
    }

    /* Sticks to the bottom of the scrolling content column so the primary action is always reachable. */
    .actions {
      position: sticky;
      bottom: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 1.25rem;
      padding: 0.75rem 0;
      background: var(--mat-sys-surface);
      border-top: var(--app-grid-border);
    }

    .actions__status {
      flex: 1 1 auto;
      min-inline-size: 0;
      font-size: 0.8125rem;
    }

    .actions__dirty {
      color: var(--mat-sys-tertiary);
      font-weight: 600;
    }

    .actions__spinner {
      display: inline-block;
      margin-inline-end: 0.5rem;
      vertical-align: middle;
    }

    @media (max-width: 30rem) {
      .actions {
        flex-wrap: wrap;
      }
      .actions button {
        flex: 1 1 auto;
      }
    }
  `,
})
export class FormPageComponent {
  readonly title = input.required<string>();
  readonly state = input.required<FormPageState>();
  readonly built = input<BuiltForm | undefined>(undefined);
  readonly submitting = input(false);
  readonly submitLabel = input('Save');
  readonly notFoundMessage = input('Not found.');
  readonly save = output<void>();
  readonly cancel = output<void>();

  // Live "unsaved changes" flag. The form's dirty state isn't a signal, so mirror it by listening to
  // the control event stream (which emits pristine/value/status changes) into a signal.
  protected readonly formDirty = signal(false);

  constructor() {
    effect((onCleanup) => {
      const current = this.built();
      if (!current) {
        this.formDirty.set(false);
        return;
      }
      const { form } = current;
      this.formDirty.set(form.dirty);
      const sub = form.events.subscribe(() => this.formDirty.set(form.dirty));
      onCleanup(() => sub.unsubscribe());
    });
  }
}
