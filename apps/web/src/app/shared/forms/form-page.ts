import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressBarModule } from '@angular/material/progress-bar';

import { DynamicFormComponent } from './dynamic-form';
import type { BuiltForm } from './form-engine.types';

// The four mutually exclusive render states a metadata-driven form page can be in. `anonymous` and
// `notFound` are terminal copy; `loading` shows the progress bar; `ready` renders the built form.
export type FormPageState = 'anonymous' | 'loading' | 'notFound' | 'ready';

// Presentational chrome shared by every entity form screen: a heading, the four-state switch, the
// `<app-dynamic-form>` body, and a Save/Cancel action bar. Holds no data-access or form-building logic —
// the feature components own the form lifecycle and feed this wrapper through signal inputs.
@Component({
  selector: 'app-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatButtonModule, MatProgressBarModule, DynamicFormComponent],
  template: `
    <h1 class="mb-4 text-xl font-medium">{{ title() }}</h1>
    @switch (state()) {
      @case ('anonymous') {
        <mat-card class="p-6"><p role="alert" class="m-0">Select a dev user to begin.</p></mat-card>
      }
      @case ('loading') {
        <mat-progress-bar mode="indeterminate" aria-label="Loading form" />
      }
      @case ('notFound') {
        <mat-card class="p-6"><p role="alert" class="m-0">{{ notFoundMessage() }}</p></mat-card>
      }
      @default {
        @if (built(); as b) {
          <app-dynamic-form [form]="b.form" [groups]="b.groups" />
          <div class="mt-4 flex gap-2">
            <button
              mat-flat-button
              type="button"
              data-testid="form-save"
              [disabled]="submitting()"
              (click)="save.emit()"
            >
              {{ submitLabel() }}
            </button>
            <button
              mat-stroked-button
              type="button"
              data-testid="form-cancel"
              (click)="cancel.emit()"
            >
              Cancel
            </button>
          </div>
        }
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
}
