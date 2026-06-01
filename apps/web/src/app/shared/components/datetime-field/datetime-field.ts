import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  forwardRef,
  input,
  model,
  signal,
  untracked,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatTimepickerModule } from '@angular/material/timepicker';

let datetimeFieldCounter = 0;

function nextDatetimeFieldId(): number {
  datetimeFieldCounter += 1;
  return datetimeFieldCounter;
}

function datesEqual(a: Date | null, b: Date | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.getTime() === b.getTime();
}

// 24-hour, minute precision (matches the 15-minute picker interval). Null date -> null; time defaults to 00:00.
function combineDateTime(date: Date | null, time: Date | null): Date | null {
  if (!date) {
    return null;
  }
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    time ? time.getHours() : 0,
    time ? time.getMinutes() : 0,
    0,
    0,
  );
}

@Component({
  selector: 'app-datetime-field',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatFormFieldModule,
    MatInputModule,
    MatDatepickerModule,
    MatTimepickerModule,
    MatIconModule,
  ],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => DatetimeFieldComponent),
      multi: true,
    },
  ],
  template: `
    <div
      role="group"
      class="flex flex-col gap-1"
      [attr.aria-labelledby]="labelId"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-invalid]="invalid() ? 'true' : null"
    >
      @if (label()) {
        <span [id]="labelId" class="text-sm font-medium">
          {{ label() }}@if (required()) {<span aria-hidden="true"> *</span>}
        </span>
      }
      <div class="flex flex-wrap gap-2">
        <mat-form-field appearance="outline" class="flex-1">
          <mat-label>Date</mat-label>
          <input
            matInput
            [matDatepicker]="picker"
            [value]="datePart()"
            [min]="min()"
            [max]="max()"
            [required]="required()"
            [disabled]="isDisabled()"
            (dateChange)="onDateInput($event.value)"
            (blur)="markTouched()"
          />
          <mat-datepicker-toggle matSuffix [for]="picker"></mat-datepicker-toggle>
          <mat-datepicker #picker></mat-datepicker>
        </mat-form-field>
        <mat-form-field appearance="outline" class="flex-1">
          <mat-label>Time</mat-label>
          <input
            matInput
            [matTimepicker]="tp"
            [value]="timePart()"
            [disabled]="isDisabled()"
            (valueChange)="onTimeInput($event)"
            (blur)="markTouched()"
          />
          <mat-timepicker-toggle matSuffix [for]="tp"></mat-timepicker-toggle>
          <mat-timepicker #tp interval="15m"></mat-timepicker>
        </mat-form-field>
      </div>
      @if (hint()) {
        <span [id]="hintId" class="text-xs text-muted">{{ hint() }}</span>
      }
    </div>
  `,
})
export class DatetimeFieldComponent implements ControlValueAccessor {
  readonly value = model<Date | null>(null);
  readonly label = input<string>('');
  readonly hint = input<string>('');
  readonly min = input<Date | null>(null);
  readonly max = input<Date | null>(null);
  readonly required = input(false);
  readonly disabled = input(false);
  // Wired by the form renderer so the two inputs announce their parent control's error to assistive tech.
  readonly errorId = input<string | null>(null);
  readonly invalid = input(false);

  protected readonly datePart = signal<Date | null>(null);
  protected readonly timePart = signal<Date | null>(null);
  private readonly cvaDisabled = signal(false);
  protected readonly isDisabled = computed(() => this.disabled() || this.cvaDisabled());

  private readonly uid = nextDatetimeFieldId();
  protected readonly labelId = `app-datetime-label-${this.uid}`;
  protected readonly hintId = `app-datetime-hint-${this.uid}`;

  // Both sub-inputs point at the hint and (when invalid) the parent form's error message.
  protected readonly describedBy = computed(() => {
    const ids: string[] = [];
    if (this.hint()) {
      ids.push(this.hintId);
    }
    const errorId = this.errorId();
    if (this.invalid() && errorId) {
      ids.push(errorId);
    }
    return ids.length > 0 ? ids.join(' ') : null;
  });

  private onChange: (value: Date | null) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  constructor() {
    // Decompose external value() / writeValue() writes into the two parts without echoing onChange.
    effect((): void => {
      const incoming = this.value();
      untracked((): void => {
        if (!datesEqual(incoming, combineDateTime(this.datePart(), this.timePart()))) {
          this.datePart.set(incoming);
          this.timePart.set(incoming);
        }
      });
    });
  }

  writeValue(value: Date | null): void {
    this.datePart.set(value);
    this.timePart.set(value);
    this.value.set(value);
  }

  registerOnChange(fn: (value: Date | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.cvaDisabled.set(isDisabled);
  }

  protected onDateInput(date: Date | null): void {
    // Ignore echoes: a programmatic [value] write re-fires (dateChange) with the value we just set. Only a genuine
    // change from the current part should propagate onChange (preserves the CVA contract that writeValue is silent).
    if (datesEqual(date, this.datePart())) {
      return;
    }
    this.setFromUser(date, this.timePart());
  }

  protected onTimeInput(time: Date | null): void {
    if (datesEqual(time, this.timePart())) {
      return;
    }
    this.setFromUser(this.datePart(), time);
  }

  protected markTouched(): void {
    this.onTouched();
  }

  private setFromUser(date: Date | null, time: Date | null): void {
    this.datePart.set(date);
    this.timePart.set(time);
    const next = combineDateTime(date, time);
    this.value.set(next);
    this.onChange(next);
  }
}
