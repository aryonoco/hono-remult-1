import {
  type AbstractControl,
  FormGroup,
  type ValidationErrors,
  type ValidatorFn,
} from '@angular/forms';
import { FireStatus, TIMESTAMP_PAIRS } from '@workspace/shared-domain';

// Sets the error only on transition (prevents the group validator -> child setErrors -> re-run loop).
function setOrClear(control: AbstractControl, key: string, hasError: boolean): void {
  const existing = control.errors;
  if (hasError) {
    if (existing?.[key]) {
      return;
    }
    control.setErrors({ ...(existing ?? {}), [key]: true });
    return;
  }
  if (!existing?.[key]) {
    return;
  }
  const cleaned: ValidationErrors = {};
  for (const errorKey of Object.keys(existing)) {
    if (errorKey !== key) {
      cleaned[errorKey] = existing[errorKey];
    }
  }
  control.setErrors(Object.keys(cleaned).length > 0 ? cleaned : null);
}

// Mirrors FireIncident.validateIsMajorFields: when isMajor, declaredBySource must be non-empty and
// declaredByTimestamp must be a past Date.
const isMajorConditionalValidator: ValidatorFn = (group: AbstractControl): null => {
  if (!(group instanceof FormGroup)) {
    return null;
  }
  const isMajor = group.get('isMajor')?.value === true;
  const sourceControl = group.get('declaredBySource');
  const timestampControl = group.get('declaredByTimestamp');
  if (sourceControl) {
    const value: unknown = sourceControl.value;
    const missing = isMajor && (typeof value !== 'string' || value.trim().length === 0);
    setOrClear(sourceControl, 'isMajorRequired', missing);
  }
  if (timestampControl) {
    const value = timestampControl.value as Date | null;
    const invalid = isMajor && (!(value instanceof Date) || value.getTime() > Date.now());
    setOrClear(timestampControl, 'isMajorTimestamp', invalid);
  }
  return null;
};

// Mirrors helpers.validateAdjacentTimestamps: each pair [earlier, later], when both set, requires earlier <= later;
// the error lands on the later control.
const adjacentTimestampsValidator: ValidatorFn = (group: AbstractControl): null => {
  if (!(group instanceof FormGroup)) {
    return null;
  }
  for (const [earlier, later] of TIMESTAMP_PAIRS) {
    const laterControl = group.get(later);
    if (!laterControl) {
      continue;
    }
    const earlierValue = group.get(earlier)?.value as Date | null | undefined;
    const laterValue = laterControl.value as Date | null | undefined;
    const violated =
      earlierValue instanceof Date &&
      laterValue instanceof Date &&
      earlierValue.getTime() > laterValue.getTime();
    setOrClear(laterControl, 'timestampOrder', violated);
  }
  return null;
};

// Mirrors the server safeOverrun rule: on safeOverrun, fireAreaHectares is zeroed + disabled. Reactive (not a
// ValidatorFn). The subscription closes only over the form, so it is GC'd with the form (no DestroyRef needed).
function wireSafeOverrunZeroing(form: FormGroup): void {
  const statusControl = form.get('status');
  const areaControl = form.get('fireAreaHectares');
  if (!(statusControl && areaControl)) {
    return;
  }
  const apply = (status: unknown): void => {
    if (status === FireStatus.safeOverrun) {
      areaControl.setValue(0);
      areaControl.disable({ emitEvent: false });
    } else if (areaControl.disabled) {
      areaControl.enable({ emitEvent: false });
    }
  };
  apply(statusControl.value);
  statusControl.valueChanges.subscribe((status) => {
    apply(status);
  });
}

export { adjacentTimestampsValidator, isMajorConditionalValidator, wireSafeOverrunZeroing };
