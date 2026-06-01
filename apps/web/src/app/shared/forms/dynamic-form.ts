import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  input,
} from '@angular/core';
import { type AbstractControl, type FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { DatetimeFieldComponent } from '../components/datetime-field/datetime-field';
import type { BuiltField, BuiltGroup, GridSpan, KnownValidationErrors } from './form-engine.types';

const DEFAULT_TEXTAREA_ROWS = 3;

const SPAN_CLASS: Readonly<Record<GridSpan, string>> = {
  full: 'col-12',
  half: 'col-6',
  third: 'col-4',
  quarter: 'col-3',
};

@Component({
  selector: 'app-dynamic-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatSlideToggleModule,
    MatIconModule,
    MatButtonModule,
    DatetimeFieldComponent,
  ],
  template: `
    <form [formGroup]="form()" class="form">
      @for (group of groups(); track group.title) {
        <fieldset class="section">
          <legend class="section__legend">{{ group.title }}</legend>
          @if (group.description) {
            <p class="section__desc">{{ group.description }}</p>
          }
          <div class="grid">
            @for (field of group.fields; track field.key) {
              <div class="cell {{ cellClass(field) }}">
                @switch (field.widget) {
                  @case ('checkbox') {
                    <div class="control">
                      <div class="control__box">
                        <mat-checkbox [formControl]="field.control">{{ field.label }}</mat-checkbox>
                      </div>
                      @if (field.description) {
                        <span class="control__desc">{{ field.description }}</span>
                      }
                    </div>
                  }
                  @case ('slideToggle') {
                    <div class="control">
                      <div class="control__box">
                        <mat-slide-toggle [formControl]="field.control">{{ field.label }}</mat-slide-toggle>
                      </div>
                      @if (field.description) {
                        <span class="control__desc">{{ field.description }}</span>
                      }
                    </div>
                  }
                  @case ('datetime') {
                    <div class="datetime">
                      <app-datetime-field
                        [formControl]="field.control"
                        [label]="field.label"
                        [hint]="field.hint ?? ''"
                        [required]="field.required"
                        [max]="field.maxDate ?? null"
                        [errorId]="field.key + '-dt-error'"
                        [invalid]="firstError(field.control) !== null"
                      />
                      @if (firstError(field.control); as message) {
                        <span
                          [id]="field.key + '-dt-error'"
                          role="alert"
                          class="datetime__error"
                          >{{ message }}</span
                        >
                      }
                    </div>
                  }
                  @case ('select') {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>{{ field.label }}</mat-label>
                      <mat-select
                        [formControl]="field.control"
                        [required]="field.required"
                        [attr.aria-invalid]="ariaInvalid(field.control)"
                      >
                        @if (field.optionsSignal) {
                          @for (option of field.optionsSignal(); track option.value) {
                            <mat-option [value]="option.value">{{ option.label }}</mat-option>
                          }
                        } @else {
                          @for (value of field.enumValues ?? []; track value) {
                            <mat-option [value]="value">{{ field.enumLabels?.[value] ?? value }}</mat-option>
                          }
                        }
                      </mat-select>
                      @if (field.hint) {
                        <mat-hint>{{ field.hint }}</mat-hint>
                      }
                      @if (firstError(field.control); as message) {
                        <mat-error>{{ message }}</mat-error>
                      }
                    </mat-form-field>
                  }
                  @case ('textarea') {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>{{ field.label }}</mat-label>
                      <textarea
                        matInput
                        [formControl]="field.control"
                        [required]="field.required"
                        [attr.aria-invalid]="ariaInvalid(field.control)"
                        [rows]="field.rows ?? defaultRows"
                        [attr.maxlength]="field.maxLength ?? null"
                      ></textarea>
                      @if (field.hint) {
                        <mat-hint>{{ field.hint }}</mat-hint>
                      }
                      @if (firstError(field.control); as message) {
                        <mat-error>{{ message }}</mat-error>
                      }
                    </mat-form-field>
                  }
                  @case ('integer') {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>{{ field.label }}</mat-label>
                      <input
                        matInput
                        type="number"
                        step="1"
                        inputmode="numeric"
                        [formControl]="field.control"
                        [required]="field.required"
                        [attr.aria-invalid]="ariaInvalid(field.control)"
                        [attr.min]="field.min ?? null"
                        [attr.max]="field.max ?? null"
                      />
                      @if (field.hint) {
                        <mat-hint>{{ field.hint }}</mat-hint>
                      }
                      @if (firstError(field.control); as message) {
                        <mat-error>{{ message }}</mat-error>
                      }
                    </mat-form-field>
                  }
                  @case ('number') {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>{{ field.label }}</mat-label>
                      <input
                        matInput
                        type="number"
                        step="any"
                        inputmode="decimal"
                        [formControl]="field.control"
                        [required]="field.required"
                        [attr.aria-invalid]="ariaInvalid(field.control)"
                        [attr.min]="field.min ?? null"
                        [attr.max]="field.max ?? null"
                      />
                      @if (field.hint) {
                        <mat-hint>{{ field.hint }}</mat-hint>
                      }
                      @if (firstError(field.control); as message) {
                        <mat-error>{{ message }}</mat-error>
                      }
                    </mat-form-field>
                  }
                  @default {
                    <mat-form-field appearance="outline" subscriptSizing="dynamic">
                      <mat-label>{{ field.label }}</mat-label>
                      <input
                        matInput
                        type="text"
                        [formControl]="field.control"
                        [required]="field.required"
                        [attr.aria-invalid]="ariaInvalid(field.control)"
                        [attr.maxlength]="field.maxLength ?? null"
                      />
                      @if (field.hint) {
                        <mat-hint>{{ field.hint }}</mat-hint>
                      }
                      @if (firstError(field.control); as message) {
                        <mat-error>{{ message }}</mat-error>
                      }
                    </mat-form-field>
                  }
                }
              </div>
            }
          </div>
        </fieldset>
      }
    </form>
  `,
  styles: `
    :host {
      display: block;
    }

    .form {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    /* Each group is a surface-container card with a titled header, matching the detail panels.
       The <fieldset>/<legend> semantics are preserved; the legend is styled as a block header
       (display:block) so it reads as a card title rather than notched into the border. */
    .section {
      margin: 0;
      min-inline-size: 0;
      padding: 1.25rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--app-radius-card);
      background: var(--mat-sys-surface-container-low);
      /* Establishes the query container so field cells collapse on the section's width, not the
         viewport — robust inside the narrower sidenav content column. */
      container-type: inline-size;
    }

    .section__legend {
      display: block;
      inline-size: 100%;
      box-sizing: border-box;
      padding: 0;
      font-family: var(--font-display);
      font-weight: 600;
      font-size: 1rem;
      letter-spacing: 0.01em;
      color: var(--mat-sys-on-surface);
    }

    .section__desc {
      margin-block: 0.25rem 0;
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.8125rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      column-gap: 1rem;
      row-gap: 0.875rem;
      margin-block-start: 1rem;
      padding-block-start: 1rem;
      border-block-start: 1px solid var(--mat-sys-outline-variant);
      align-items: start;
    }

    /* Cells are full width by default; the container queries below widen them as space allows. */
    .cell {
      grid-column: span 12;
      min-inline-size: 0;
    }

    .cell mat-form-field,
    .cell .datetime,
    .cell app-datetime-field {
      display: block;
      inline-size: 100%;
    }

    @container (min-width: 30rem) {
      .cell.col-6,
      .cell.col-4,
      .cell.col-3 {
        grid-column: span 6;
      }
    }

    @container (min-width: 48rem) {
      .cell.col-4 {
        grid-column: span 4;
      }
      .cell.col-3 {
        grid-column: span 3;
      }
    }

    /* Boolean fields: the control sits in an outlined box the same height as the Material fields
       beside it (so a checkbox/toggle lines up with the selects/inputs in its row), matching the
       outline appearance. Its description sits BELOW the box like a field hint, so it never inflates
       the box and break the row's alignment. */
    .control {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
      min-inline-size: 0;
    }

    .control__box {
      display: flex;
      align-items: center;
      min-block-size: 3rem;
      padding-inline: 0.75rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--app-radius-card);
    }

    .control__desc {
      padding-inline-start: 0.25rem;
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.75rem;
    }

    .datetime {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .datetime__error {
      color: var(--mat-sys-error);
      font-size: 0.75rem;
    }

    /* Density is more than field height on a form — the breathing room between fields and sections
       carries most of the perceived difference. React to the global html[data-density] (set by
       DensityService) via :host-context so Comfortable is genuinely airy and Compact genuinely tight,
       on top of the scoped Material field-height density in styles.scss. */
    :host-context([data-density='comfortable']) {
      .form {
        gap: 2rem;
      }
      .section {
        padding-block: 1.5rem;
        padding-inline: 1.75rem;
      }
      .grid {
        column-gap: 1.5rem;
        row-gap: 1.5rem;
        margin-block-start: 1.25rem;
        padding-block-start: 1.25rem;
      }
      /* Match the taller Comfortable Material field box so booleans align with their row. */
      .control__box {
        min-block-size: 3.25rem;
      }
    }

    :host-context([data-density='compact']) {
      .form {
        gap: 0.75rem;
      }
      .section {
        padding-block: 0.875rem;
        padding-inline: 1rem;
      }
      .grid {
        column-gap: 0.875rem;
        row-gap: 0.5rem;
        margin-block-start: 0.75rem;
        padding-block-start: 0.75rem;
      }
      /* Match the tighter Compact Material field box so booleans align with their row. */
      .control__box {
        min-block-size: 2.5rem;
      }
    }
  `,
})
export class DynamicFormComponent {
  readonly form = input.required<FormGroup>();
  readonly groups = input.required<readonly BuiltGroup[]>();
  protected readonly defaultRows = DEFAULT_TEXTAREA_ROWS;
  private readonly cdr = inject(ChangeDetectorRef);

  constructor() {
    // Under OnPush, server errors and `markAllAsTouched()` arrive from the parent's async submit handler —
    // no event fires in this view, so subscribe to the form's event stream and request a check ourselves.
    effect((onCleanup) => {
      const sub = this.form().events.subscribe(() => this.cdr.markForCheck());
      onCleanup(() => sub.unsubscribe());
    });
  }

  protected spanClass(span: GridSpan): string {
    return SPAN_CLASS[span];
  }

  // A datetime group renders its label ABOVE a Date/Time pair, whereas every Material field floats
  // its label INSIDE the box — so a datetime placed beside a Material field lands its inputs ~1 line
  // lower and the row reads as misaligned. Give datetime groups a full row of their own; the Date and
  // Time sub-fields still sit side by side within it, and every grid row's controls now line up.
  protected cellClass(field: BuiltField): string {
    return field.widget === 'datetime' ? SPAN_CLASS.full : SPAN_CLASS[field.span];
  }

  // Mark a control invalid for assistive tech exactly when its inline error is shown (touched +
  // erroring). Returned as the string 'true' or null so the attribute is present only when invalid
  // (an explicit aria-invalid="false" is noise). matInput does not set this itself in M3, so the
  // template binds it on every control to close FORM-1.
  protected ariaInvalid(control: AbstractControl): 'true' | null {
    return this.firstError(control) !== null ? 'true' : null;
  }

  protected firstError(control: AbstractControl): string | null {
    if (!control.touched) {
      return null;
    }
    const errors = control.errors as KnownValidationErrors | null;
    if (!errors) {
      return null;
    }
    if (errors.server) {
      return errors.server;
    }
    if (errors.required) {
      return 'This field is required';
    }
    if (errors.isMajorRequired) {
      return 'Required when "major incident" is enabled';
    }
    if (errors.isMajorTimestamp) {
      return 'Required and must be in the past when "major incident" is enabled';
    }
    if (errors.timestampOrder) {
      return 'Must be on or after the previous timestamp';
    }
    if (errors.maxNow) {
      return 'Must not be in the future';
    }
    if (errors.maxlength) {
      return `Maximum ${errors.maxlength.requiredLength ?? 0} characters`;
    }
    if (errors.min) {
      return `Must be at least ${errors.min.min ?? 0}`;
    }
    if (errors.max) {
      return `Must be at most ${errors.max.max ?? 0}`;
    }
    return 'Invalid value';
  }
}
