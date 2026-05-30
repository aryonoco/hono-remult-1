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
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { DatetimeFieldComponent } from '../components/datetime-field/datetime-field';
import type { BuiltGroup, KnownValidationErrors } from './form-engine.types';

const DEFAULT_TEXTAREA_ROWS = 3;

@Component({
  selector: 'app-dynamic-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    MatCardModule,
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
    <form [formGroup]="form()" class="flex flex-col gap-4">
      @for (group of groups(); track group.title) {
        <mat-card>
          <mat-card-header><mat-card-title>{{ group.title }}</mat-card-title></mat-card-header>
          <mat-card-content class="flex flex-col gap-3 pt-2">
            @for (field of group.fields; track field.key) {
              @switch (field.widget) {
                @case ('checkbox') {
                  <mat-checkbox [formControl]="field.control">{{ field.label }}</mat-checkbox>
                }
                @case ('slideToggle') {
                  <mat-slide-toggle [formControl]="field.control">{{ field.label }}</mat-slide-toggle>
                }
                @case ('datetime') {
                  <div class="flex flex-col gap-1">
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
                        class="text-xs text-[color:var(--mat-sys-error)]"
                        >{{ message }}</span
                      >
                    }
                  </div>
                }
                @case ('select') {
                  <mat-form-field>
                    <mat-label>{{ field.label }}</mat-label>
                    <mat-select [formControl]="field.control" [required]="field.required">
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
                  <mat-form-field>
                    <mat-label>{{ field.label }}</mat-label>
                    <textarea
                      matInput
                      [formControl]="field.control"
                      [required]="field.required"
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
                  <mat-form-field>
                    <mat-label>{{ field.label }}</mat-label>
                    <input
                      matInput
                      type="number"
                      step="1"
                      [formControl]="field.control"
                      [required]="field.required"
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
                  <mat-form-field>
                    <mat-label>{{ field.label }}</mat-label>
                    <input
                      matInput
                      type="number"
                      step="any"
                      [formControl]="field.control"
                      [required]="field.required"
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
                  <mat-form-field>
                    <mat-label>{{ field.label }}</mat-label>
                    <input
                      matInput
                      type="text"
                      [formControl]="field.control"
                      [required]="field.required"
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
            }
          </mat-card-content>
        </mat-card>
      }
    </form>
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
