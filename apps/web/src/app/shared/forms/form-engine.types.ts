import type { Signal } from '@angular/core';
import type { FormControl, FormGroup, ValidatorFn } from '@angular/forms';

export type WidgetKind =
  | 'text'
  | 'textarea'
  | 'number'
  | 'integer'
  | 'checkbox'
  | 'slideToggle'
  | 'select'
  | 'datetime';

export interface SelectOption {
  value: string | number;
  label: string;
}

export interface FieldHint<T> {
  field: keyof T & string;
  widget?: WidgetKind;
  enumValues?: readonly string[];
  enumLabels?: Readonly<Record<string, string>>;
  optionsSignal?: Signal<readonly SelectOption[]>;
  label?: string;
  hint?: string;
  rows?: number;
  readonly?: boolean;
  required?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  maxNow?: boolean;
  exclude?: true;
}

export interface FieldGroup<T> {
  title: string;
  fields: readonly (keyof T & string)[];
}

export interface EntityFormConfig<T> {
  groups: readonly FieldGroup<T>[];
  hints?: readonly FieldHint<T>[];
  groupValidators?: readonly ValidatorFn[];
}

// Produced by buildForm, consumed by <app-dynamic-form>. Optional descriptor fields are declared as
// `X | undefined` (required props that accept undefined) rather than `?:` so buildForm can set them all
// unconditionally under exactOptionalPropertyTypes.
export interface BuiltField {
  key: string;
  widget: WidgetKind;
  control: FormControl;
  label: string;
  required: boolean;
  readonly: boolean;
  hint: string | undefined;
  enumValues: readonly string[] | undefined;
  enumLabels: Readonly<Record<string, string>> | undefined;
  optionsSignal: Signal<readonly SelectOption[]> | undefined;
  min: number | undefined;
  max: number | undefined;
  step: number | undefined;
  maxLength: number | undefined;
  rows: number | undefined;
  maxDate: Date | undefined;
}

export interface BuiltGroup {
  title: string;
  fields: readonly BuiltField[];
}

export interface BuiltForm {
  form: FormGroup;
  groups: readonly BuiltGroup[];
}

// Named view over Angular's `ValidationErrors` (a `{ [key: string]: any }` index signature). Reading the keys we
// care about through this interface keeps access as declared-property dot access — satisfying both Biome's
// `useLiteralKeys` and TypeScript's `noPropertyAccessFromIndexSignature` at once.
export interface KnownValidationErrors {
  server?: string;
  required?: boolean;
  isMajorRequired?: boolean;
  isMajorTimestamp?: boolean;
  timestampOrder?: boolean;
  maxNow?: boolean;
  maxlength?: { requiredLength?: number };
  min?: { min?: number };
  max?: { max?: number };
}
