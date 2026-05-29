import { type AbstractControl, FormControl, FormGroup } from '@angular/forms';
import { FireStatus } from '@workspace/shared-domain';
import {
  adjacentTimestampsValidator,
  isMajorConditionalValidator,
  wireSafeOverrunZeroing,
} from './cross-field-validators';
import type { KnownValidationErrors } from './form-engine.types';

function errs(control: AbstractControl | null): KnownValidationErrors {
  return (control?.errors ?? {}) as KnownValidationErrors;
}

describe('isMajorConditionalValidator', () => {
  function group(): FormGroup {
    return new FormGroup(
      {
        isMajor: new FormControl(false),
        declaredBySource: new FormControl(''),
        declaredByTimestamp: new FormControl<Date | null>(null),
      },
      { validators: [isMajorConditionalValidator] },
    );
  }

  it('requires declaredBySource + declaredByTimestamp when isMajor is on', () => {
    const g = group();
    g.get('isMajor')!.setValue(true);
    expect(errs(g.get('declaredBySource')).isMajorRequired).toBe(true);
    expect(errs(g.get('declaredByTimestamp')).isMajorTimestamp).toBe(true);
  });

  it('clears the errors once the fields are valid', () => {
    const g = group();
    g.get('isMajor')!.setValue(true);
    g.get('declaredBySource')!.setValue('Chief Officer');
    g.get('declaredByTimestamp')!.setValue(new Date(Date.now() - 1000));
    expect(g.get('declaredBySource')!.errors).toBeNull();
    expect(g.get('declaredByTimestamp')!.errors).toBeNull();
  });

  it('flags a future declaredByTimestamp', () => {
    const g = group();
    g.get('isMajor')!.setValue(true);
    g.get('declaredBySource')!.setValue('Chief Officer');
    g.get('declaredByTimestamp')!.setValue(new Date(Date.now() + 60_000));
    expect(errs(g.get('declaredByTimestamp')).isMajorTimestamp).toBe(true);
  });
});

describe('adjacentTimestampsValidator', () => {
  function group(): FormGroup {
    return new FormGroup(
      {
        fireStartedAt: new FormControl<Date | null>(null),
        fireDetectedAt: new FormControl<Date | null>(null),
        reportedAt: new FormControl<Date | null>(null),
        firstCrewSentAt: new FormControl<Date | null>(null),
        firstCrewArrivedAt: new FormControl<Date | null>(null),
      },
      { validators: [adjacentTimestampsValidator] },
    );
  }

  it('flags the later control when an earlier timestamp is after it', () => {
    const g = group();
    g.get('fireStartedAt')!.setValue(new Date('2026-01-02T00:00:00'));
    g.get('fireDetectedAt')!.setValue(new Date('2026-01-01T00:00:00'));
    expect(errs(g.get('fireDetectedAt')).timestampOrder).toBe(true);
  });

  it('clears once ordered', () => {
    const g = group();
    g.get('fireStartedAt')!.setValue(new Date('2026-01-02T00:00:00'));
    g.get('fireDetectedAt')!.setValue(new Date('2026-01-01T00:00:00'));
    g.get('fireDetectedAt')!.setValue(new Date('2026-01-03T00:00:00'));
    expect(g.get('fireDetectedAt')!.errors).toBeNull();
  });
});

describe('wireSafeOverrunZeroing', () => {
  it('zeroes and disables fireAreaHectares on safeOverrun, re-enables otherwise', () => {
    const form = new FormGroup({
      status: new FormControl<string>(FireStatus.going),
      fireAreaHectares: new FormControl<number | null>(5),
    });
    wireSafeOverrunZeroing(form);
    form.get('status')!.setValue(FireStatus.safeOverrun);
    expect(form.get('fireAreaHectares')!.value).toBe(0);
    expect(form.get('fireAreaHectares')!.disabled).toBe(true);
    form.get('status')!.setValue(FireStatus.going);
    expect(form.get('fireAreaHectares')!.disabled).toBe(false);
  });
});
