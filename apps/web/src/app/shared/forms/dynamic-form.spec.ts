import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { DynamicFormComponent } from './dynamic-form';
import type { BuiltField, BuiltGroup } from './form-engine.types';

function field(
  partial: Pick<BuiltField, 'key' | 'widget' | 'control'> & Partial<BuiltField>,
): BuiltField {
  return {
    label: partial.key,
    required: false,
    readonly: false,
    hint: undefined,
    description: undefined,
    span: 'full',
    enumValues: undefined,
    enumLabels: undefined,
    optionsSignal: undefined,
    min: undefined,
    max: undefined,
    step: undefined,
    maxLength: undefined,
    rows: undefined,
    maxDate: undefined,
    ...partial,
  };
}

describe('DynamicFormComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
        provideNativeDateAdapter(),
        { provide: MAT_DATE_LOCALE, useValue: 'en-AU' },
      ],
    });
  });

  function render(): {
    el: HTMLElement;
    controls: Record<'txt' | 'sel' | 'chk' | 'tog' | 'dt', FormControl>;
  } {
    const controls = {
      txt: new FormControl(''),
      sel: new FormControl<string | null>(null),
      chk: new FormControl(false),
      tog: new FormControl(false),
      dt: new FormControl<Date | null>(null),
    };
    const form = new FormGroup(controls);
    const groups: BuiltGroup[] = [
      {
        title: 'G',
        description: undefined,
        fields: [
          field({ key: 'txt', widget: 'text', control: controls.txt }),
          field({
            key: 'sel',
            widget: 'select',
            control: controls.sel,
            enumValues: ['a', 'b'],
            enumLabels: { a: 'A', b: 'B' },
          }),
          field({ key: 'chk', widget: 'checkbox', control: controls.chk }),
          field({ key: 'tog', widget: 'slideToggle', control: controls.tog }),
          field({ key: 'dt', widget: 'datetime', control: controls.dt }),
        ],
      },
    ];
    const fixture = TestBed.createComponent(DynamicFormComponent);
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('groups', groups);
    fixture.detectChanges();
    return { el: fixture.nativeElement as HTMLElement, controls };
  }

  it('renders the matching Material control for each widget', () => {
    const { el } = render();
    expect(el.querySelector('mat-select')).toBeTruthy();
    expect(el.querySelector('mat-checkbox')).toBeTruthy();
    expect(el.querySelector('mat-slide-toggle')).toBeTruthy();
    expect(el.querySelector('app-datetime-field')).toBeTruthy();
    expect(el.querySelector('input')).toBeTruthy();
  });

  it('shows an error for a touched invalid control', () => {
    const { el, controls } = render();
    controls.txt.addValidators(Validators.required);
    controls.txt.setValue('');
    controls.txt.markAsTouched();
    controls.txt.updateValueAndValidity();
    TestBed.tick();
    expect(el.querySelector('mat-error')?.textContent).toContain('required');
  });

  // OnPush regression: server errors arrive from the parent's async submit, not a template event in this
  // view. Only the `form().events → markForCheck()` wiring makes the message render on the next tick.
  it('renders a server error pushed from outside the view under OnPush', () => {
    const { el, controls } = render();
    controls.txt.setErrors({ server: 'Already exists' });
    controls.txt.markAsTouched();
    TestBed.tick();
    expect(el.querySelector('mat-error')?.textContent).toContain('Already exists');
  });
});
