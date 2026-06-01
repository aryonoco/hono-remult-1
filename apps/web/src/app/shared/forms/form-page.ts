import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { type Density, DensityService } from '../../core/density.service';
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
  imports: [
    MatButtonModule,
    MatButtonToggleModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    DynamicFormComponent,
  ],
  template: `
    <header class="page-head">
      <h1 class="title">{{ title() }}</h1>
      @if (state() === 'ready') {
        <mat-button-toggle-group
          class="density-toggle"
          aria-label="Form density"
          [value]="density()"
          (change)="onDensityChange($event.value)"
          hideSingleSelectionIndicator
        >
          <mat-button-toggle value="comfortable" aria-label="Comfortable density"
            >Comfortable</mat-button-toggle
          >
          <mat-button-toggle value="compact" aria-label="Compact density">Compact</mat-button-toggle>
        </mat-button-toggle-group>
      }
    </header>
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
              matButton="outlined"
              type="button"
              data-testid="form-cancel"
              (click)="cancel.emit()"
            >
              Cancel
            </button>
            <button
              matButton="filled"
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

    /* Heading row: title on the start edge, density toggle on the end edge; wraps on narrow widths. */
    .page-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem 1rem;
      margin-block-end: 1.25rem;
    }

    .title {
      margin: 0;
      font-family: var(--font-display);
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: var(--mat-sys-on-surface);
    }

    .density-toggle {
      flex-shrink: 0;
    }

    .notice {
      margin: 0;
      padding: 1.25rem 1.5rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--app-radius-card);
      background: var(--mat-sys-surface-container-low);
      color: var(--mat-sys-on-surface);
    }

    /* Sticks to the bottom of the scrolling column so the primary action is always reachable; the
       level-2 elevation lifts it off the panels above and scroll-margin keeps focused controls clear
       of the band when scrolled into view. */
    .actions {
      position: sticky;
      bottom: 0;
      z-index: 5;
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-top: 1.25rem;
      padding: 0.75rem 0;
      scroll-margin-bottom: 5rem;
      background: var(--mat-sys-surface-container-low);
      border-top: 1px solid var(--mat-sys-outline-variant);
      box-shadow: var(--mat-sys-level2);
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

  // App-wide density preference (default compact), shared with the incident list. The header toggle
  // reads and writes the same service, so a density choice made on any surface follows the operator.
  private readonly densityService = inject(DensityService);
  protected readonly density = this.densityService.density;

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

  protected onDensityChange(value: Density): void {
    this.densityService.setDensity(value);
  }
}
