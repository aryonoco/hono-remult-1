import { ANIMATION_MODULE_TYPE, Component } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { DatetimeFieldComponent } from './datetime-field';

@Component({
  imports: [ReactiveFormsModule, DatetimeFieldComponent],
  template: `<app-datetime-field [formControl]="control" />`,
})
class HostComponent {
  readonly control = new FormControl<Date | null>(null);
}

function setup(): {
  fixture: ComponentFixture<HostComponent>;
  cmp: any;
  control: FormControl<Date | null>;
} {
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  const cmp = fixture.debugElement.children[0]!.componentInstance;
  return { fixture, cmp, control: fixture.componentInstance.control };
}

describe('DatetimeFieldComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [
        { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
        provideNativeDateAdapter(),
        { provide: MAT_DATE_LOCALE, useValue: 'en-AU' },
      ],
    });
  });

  it('combines date and time into one Date', () => {
    const { cmp, control } = setup();
    cmp.onDateInput(new Date(2026, 4, 29));
    cmp.onTimeInput(new Date(2000, 0, 1, 14, 30));
    const value = control.value!;
    expect(value.getFullYear()).toBe(2026);
    expect(value.getMonth()).toBe(4);
    expect(value.getDate()).toBe(29);
    expect(value.getHours()).toBe(14);
    expect(value.getMinutes()).toBe(30);
  });

  it('emits null when only a time is chosen', () => {
    const { cmp, control } = setup();
    cmp.onTimeInput(new Date(2000, 0, 1, 9, 0));
    expect(control.value).toBeNull();
  });

  it('defaults time to 00:00 when only the date is chosen', () => {
    const { cmp, control } = setup();
    cmp.onDateInput(new Date(2026, 4, 29));
    expect(control.value!.getHours()).toBe(0);
    expect(control.value!.getMinutes()).toBe(0);
  });

  it('writeValue decomposes without firing the registered onChange', () => {
    const { cmp, fixture } = setup();
    let calls = 0;
    cmp.registerOnChange(() => {
      calls += 1;
    });
    cmp.writeValue(new Date(2026, 4, 29, 8, 15));
    // Flush the constructor effect: writeValue ends with value.set(), which schedules it. Without this the
    // assertion would pass vacuously (the effect never runs), hiding an onChange echoed from the effect.
    fixture.detectChanges();
    expect(calls).toBe(0);
    expect(cmp.datePart()).toBeInstanceOf(Date);
    expect(cmp.timePart()).toBeInstanceOf(Date);
  });

  it('disables both inner inputs when the form control is disabled', () => {
    const { cmp, control, fixture } = setup();
    control.disable();
    fixture.detectChanges();
    expect(cmp.isDisabled()).toBe(true);
    const inputs = (fixture.nativeElement as HTMLElement).querySelectorAll('input');
    expect(inputs.length).toBe(2);
    expect((inputs[0] as HTMLInputElement).disabled).toBe(true);
    expect((inputs[1] as HTMLInputElement).disabled).toBe(true);
  });
});
