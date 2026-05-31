import {
  type AbstractControl,
  FormControl,
  FormGroup,
  type ValidationErrors,
  type ValidatorFn,
  Validators,
} from '@angular/forms';
import { LIMITS } from '@workspace/shared-domain';
import { type Err, err, type Result, ResultAsync } from 'neverthrow';
import type { ErrorInfo, FieldMetadata, Repository } from 'remult';
import { getRelationFieldInfo } from 'remult/internals';
import { wireSafeOverrunZeroing } from './cross-field-validators';
import type {
  BuiltField,
  BuiltForm,
  BuiltGroup,
  EntityFormConfig,
  FieldGroup,
  FieldHint,
  GridSpan,
  KnownValidationErrors,
  WidgetKind,
} from './form-engine.types';

const AUTO_EXCLUDED_KEYS = new Set<string>(['id', 'createdAt', 'updatedAt']);
const TEXTAREA_THRESHOLD: number = LIMITS.paragraph;

// Local replica of remult's (non-exported) idType<T>: the type of an entity's id field. Used to thread the id into
// repo.update with its true type instead of an `as unknown as` escape.
type EntityId<T> = T extends { id?: infer U }
  ? U extends string
    ? string
    : U extends number
      ? number
      : string | number
  : string | number;

const toError = (error: unknown): Error =>
  error instanceof Error ? error : new Error(String(error));

// Guards `maxNow` fields against a future combined date+time. Evaluated live (Date.now()) on every validation pass —
// the date picker's [max] only constrains the calendar day, so the time-of-day must be checked at the value level.
const maxNowValidator: ValidatorFn = (control: AbstractControl): ValidationErrors | null => {
  const value = control.value as Date | null;
  return value instanceof Date && value.getTime() > Date.now() ? { maxNow: true } : null;
};

function isExcluded<T>(field: FieldMetadata, hintByKey: Map<string, FieldHint<T>>): boolean {
  if (AUTO_EXCLUDED_KEYS.has(field.key)) {
    return true;
  }
  if (field.options.allowApiUpdate === false) {
    return true;
  }
  if (getRelationFieldInfo(field) !== undefined) {
    return true;
  }
  return hintByKey.get(field.key)?.exclude === true;
}

function resolveWidget<T>(field: FieldMetadata, hint: FieldHint<T> | undefined): WidgetKind {
  if (hint?.widget) {
    return hint.widget;
  }
  if (hint?.optionsSignal) {
    return 'select';
  }
  if (hint?.enumValues) {
    return 'select';
  }
  const valueType: unknown = field.valueType;
  if (valueType === Date) {
    return 'datetime';
  }
  if (valueType === Boolean) {
    return 'checkbox';
  }
  if (valueType === Number) {
    return 'number';
  }
  if (valueType === String) {
    return (hint?.maxLength ?? 0) >= TEXTAREA_THRESHOLD ? 'textarea' : 'text';
  }
  return 'text';
}

// Default grid width per widget when a hint doesn't set one. Short controls (numbers, enums) sit
// multiple-up; free text and date/time take half; long-form text fills the row.
const WIDGET_DEFAULT_SPAN: Readonly<Record<WidgetKind, GridSpan>> = {
  text: 'half',
  textarea: 'full',
  number: 'third',
  integer: 'third',
  checkbox: 'half',
  slideToggle: 'half',
  select: 'half',
  datetime: 'half',
};

function resolveSpan<T>(widget: WidgetKind, hint: FieldHint<T> | undefined): GridSpan {
  return hint?.span ?? WIDGET_DEFAULT_SPAN[widget];
}

function buildValidators<T>(hint: FieldHint<T> | undefined): ValidatorFn[] {
  const validators: ValidatorFn[] = [];
  if (hint?.required) {
    validators.push(Validators.required);
  }
  if (hint?.maxLength !== undefined) {
    validators.push(Validators.maxLength(hint.maxLength));
  }
  if (hint?.min !== undefined) {
    validators.push(Validators.min(hint.min));
  }
  if (hint?.max !== undefined) {
    validators.push(Validators.max(hint.max));
  }
  if (hint?.maxNow === true) {
    validators.push(maxNowValidator);
  }
  return validators;
}

function buildControl<T>(
  widget: WidgetKind,
  hint: FieldHint<T> | undefined,
  initial: unknown,
): FormControl {
  const validators = buildValidators(hint);
  const disabled = hint?.readonly === true;

  switch (widget) {
    case 'checkbox':
    case 'slideToggle': {
      const value = typeof initial === 'boolean' ? initial : false;
      return new FormControl<boolean>({ value, disabled }, { nonNullable: true, validators });
    }
    case 'datetime': {
      const value = initial instanceof Date ? initial : null;
      return new FormControl<Date | null>({ value, disabled }, { validators });
    }
    case 'number':
    case 'integer': {
      const value = typeof initial === 'number' ? initial : null;
      return new FormControl<number | null>({ value, disabled }, { validators });
    }
    case 'select': {
      const value = initial === undefined ? null : (initial as string | number | null);
      return new FormControl<string | number | null>({ value, disabled }, { validators });
    }
    default: {
      const value = typeof initial === 'string' ? initial : '';
      return new FormControl<string>({ value, disabled }, { nonNullable: true, validators });
    }
  }
}

function buildField<T>(
  field: FieldMetadata,
  hint: FieldHint<T> | undefined,
  seedInstance: T,
): BuiltField {
  const widget = resolveWidget(field, hint);
  const initial = (seedInstance as Record<string, unknown>)[field.key];
  return {
    key: field.key,
    widget,
    control: buildControl(widget, hint, initial),
    label: hint?.label ?? field.caption,
    required: hint?.required ?? false,
    readonly: hint?.readonly ?? false,
    hint: hint?.hint,
    description: hint?.description,
    span: resolveSpan(widget, hint),
    enumValues: hint?.enumValues,
    enumLabels: hint?.enumLabels,
    optionsSignal: hint?.optionsSignal,
    min: hint?.min,
    max: hint?.max,
    step: hint?.step,
    maxLength: hint?.maxLength,
    rows: hint?.rows,
    maxDate: hint?.maxNow === true ? new Date() : undefined,
  };
}

// Dev-time config-drift guard (throws — a config bug, not an expected error). Every included field must be in exactly
// one group; no group may list an excluded/unknown field.
function assertGroupsCoverIncluded<T>(
  groups: readonly FieldGroup<T>[],
  includedKeys: readonly string[],
): void {
  const placed = groups.flatMap((group) => group.fields as readonly string[]);
  const seen = new Set<string>();
  for (const key of placed) {
    if (seen.has(key)) {
      throw new Error(`Field "${key}" appears in more than one form group`);
    }
    seen.add(key);
  }
  const includedSet = new Set(includedKeys);
  for (const key of includedKeys) {
    if (!seen.has(key)) {
      throw new Error(`Included field "${key}" is not placed in any form group`);
    }
  }
  for (const key of placed) {
    if (!includedSet.has(key)) {
      throw new Error(`Form group field "${key}" is excluded or unknown`);
    }
  }
}

function clearServerErrors(form: FormGroup): void {
  for (const key of Object.keys(form.controls)) {
    const control = form.get(key);
    const current = control?.errors;
    if (!current) {
      continue;
    }
    if (!(current as KnownValidationErrors).server) {
      continue;
    }
    const cleaned: ValidationErrors = {};
    for (const errorKey of Object.keys(current)) {
      if (errorKey !== 'server') {
        cleaned[errorKey] = current[errorKey];
      }
    }
    control?.setErrors(Object.keys(cleaned).length > 0 ? cleaned : null);
  }
}

function applyServerErrors<T>(form: FormGroup, errors: ErrorInfo<T>): void {
  const modelState = errors.modelState as Readonly<Record<string, string | undefined>> | undefined;
  if (!modelState) {
    return;
  }
  for (const key of Object.keys(modelState)) {
    const control = form.get(key);
    const message = modelState[key];
    if (control && message) {
      control.setErrors({ ...(control.errors ?? {}), server: message });
      control.markAsTouched();
    }
  }
}

export function buildForm<T>(
  repo: Repository<T>,
  config: EntityFormConfig<T>,
  mode: 'create' | 'edit',
  seed?: Partial<T>,
): BuiltForm {
  const hintByKey = new Map<string, FieldHint<T>>();
  for (const hint of config.hints ?? []) {
    hintByKey.set(hint.field, hint);
  }

  // Create mode seeds entity defaults (so the form shows sensible initial values); edit mode reflects the stored
  // record verbatim without re-applying creation defaults.
  const seedInstance: T = mode === 'edit' ? ({ ...(seed ?? {}) } as T) : repo.create(seed ?? {});

  const includedKeys: string[] = [];
  for (const field of repo.metadata.fields.toArray() as FieldMetadata[]) {
    if (!isExcluded(field, hintByKey)) {
      includedKeys.push(field.key);
    }
  }
  assertGroupsCoverIncluded(config.groups, includedKeys);

  const controls: Record<string, FormControl> = {};
  const groups: BuiltGroup[] = config.groups.map((group) => ({
    title: group.title,
    description: group.description,
    fields: group.fields.map((key) => {
      const field = repo.metadata.fields.find(key) as FieldMetadata;
      const built = buildField(field, hintByKey.get(key), seedInstance);
      controls[key] = built.control;
      return built;
    }),
  }));

  const form = new FormGroup(controls, { validators: [...(config.groupValidators ?? [])] });
  wireSafeOverrunZeroing(form);
  return { form, groups };
}

export async function submitEntityForm<T>(
  repo: Repository<T>,
  form: FormGroup,
  mode: 'create' | 'edit',
  seed?: Partial<T>,
): Promise<Result<T, Error>> {
  clearServerErrors(form);
  const raw = form.getRawValue() as Partial<T>;
  const instance = repo.create({ ...(seed ?? {}), ...raw });

  const errors = await repo.validate(instance as Partial<T>);
  if (errors) {
    applyServerErrors(form, errors);
    const failure: Err<T, Error> = err(new Error(errors.message ?? 'Validation failed'));
    return failure;
  }

  // For an update, send a plain partial of the form values (not the freshly created instance): remult's update()
  // inspects the item's entity-ref first, and a repo.create()d instance is flagged isNew, which would route the call
  // to an insert. `raw` is a plain object from getRawValue(), so update() resolves the existing row by id.
  const id = (seed as { id?: EntityId<T> } | undefined)?.id;
  const operation: Promise<T> =
    mode === 'edit' && id !== undefined
      ? repo.update(id, raw)
      : repo.insert(instance as Partial<T>);
  const result: Result<T, Error> = await ResultAsync.fromPromise(operation, toError);
  return result;
}
