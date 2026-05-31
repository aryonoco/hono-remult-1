import type { Signal } from '@angular/core';
import {
  CAUSE_SOURCE_LABELS,
  CAUSE_SOURCE_VALUES,
  CONTROL_AGENCY_LABELS,
  CONTROL_AGENCY_VALUES,
  FIRE_DETECTION_METHOD_LABELS,
  FIRE_DETECTION_METHOD_VALUES,
  FIRE_STATUS_LABELS,
  FIRE_STATUS_VALUES,
  type FireIncident,
  FUEL_TYPE_LABELS,
  FUEL_TYPE_VALUES,
  LIMITS,
  YES_NO_LABELS,
  YES_NO_VALUES,
} from '@workspace/shared-domain';
import {
  adjacentTimestampsValidator,
  isMajorConditionalValidator,
} from '../../../shared/forms/cross-field-validators';
import type {
  EntityFormConfig,
  FieldGroup,
  SelectOption,
} from '../../../shared/forms/form-engine.types';

// Field grouping/ordering is static, so it lives at module scope; only the district `optionsSignal`
// hint depends on the caller, so the per-field hints are assembled in the factory below.
const FIRE_INCIDENT_GROUPS: readonly FieldGroup<FireIncident>[] = [
  {
    title: 'Identity & Location',
    description: 'Core identification and where the fire is burning.',
    fields: ['name', 'districtId', 'latitude', 'longitude', 'locationDescription'],
  },
  {
    title: 'Status & Classification',
    fields: ['status', 'isMajor', 'declaredBySource', 'declaredByTimestamp'],
  },
  {
    title: 'Timeline',
    description: 'Key times in 24-hour local time; each must be on or after the previous.',
    fields: [
      'reportedAt',
      'fireStartedAt',
      'fireDetectedAt',
      // biome-ignore lint/security/noSecrets: entity field name, not a secret
      'firstCrewSentAt',
      'firstCrewArrivedAt',
      'detectionMethod',
    ],
  },
  { title: 'Cause', fields: ['causeSource', 'isCauseConfirmed', 'causeSourceOther'] },
  {
    title: 'Initial Response',
    fields: [
      'isLandManagerNotified',
      'isControlAgencyNotified',
      'isFireMapAttached',
      'controlAgency',
      'fuelType',
    ],
  },
  { title: 'Area', fields: ['fireAreaHectares', 'burntAreaHectares'] },
];

export function buildFireIncidentFormConfig(
  districtOptions: Signal<readonly SelectOption[]>,
): EntityFormConfig<FireIncident> {
  return {
    groups: FIRE_INCIDENT_GROUPS,
    hints: [
      { field: 'name', required: true, maxLength: LIMITS.name, span: 'full' },
      {
        field: 'districtId',
        label: 'District',
        required: true,
        optionsSignal: districtOptions,
        span: 'third',
      },
      { field: 'locationDescription', widget: 'textarea', maxLength: LIMITS.description },
      { field: 'latitude', min: LIMITS.latitudeMin, max: LIMITS.latitudeMax },
      { field: 'longitude', min: LIMITS.longitudeMin, max: LIMITS.longitudeMax },
      {
        field: 'status',
        required: true,
        enumValues: FIRE_STATUS_VALUES,
        enumLabels: FIRE_STATUS_LABELS,
      },
      { field: 'incidentLevel', exclude: true },
      {
        field: 'isMajor',
        widget: 'slideToggle',
        description: 'Marks a major fire and unlocks the declaration source and timestamp.',
      },
      { field: 'declaredBySource', maxLength: LIMITS.mediumText },
      { field: 'declaredByTimestamp', maxNow: true },
      { field: 'reportedAt', required: true, maxNow: true },
      {
        field: 'detectionMethod',
        enumValues: FIRE_DETECTION_METHOD_VALUES,
        enumLabels: FIRE_DETECTION_METHOD_LABELS,
      },
      { field: 'causeSource', enumValues: CAUSE_SOURCE_VALUES, enumLabels: CAUSE_SOURCE_LABELS },
      { field: 'isCauseConfirmed', description: 'Tick once the cause has been verified.' },
      { field: 'causeSourceOther', widget: 'textarea', maxLength: LIMITS.description },
      { field: 'isLandManagerNotified', enumValues: YES_NO_VALUES, enumLabels: YES_NO_LABELS },
      { field: 'isControlAgencyNotified', enumValues: YES_NO_VALUES, enumLabels: YES_NO_LABELS },
      {
        field: 'isFireMapAttached',
        span: 'full',
        description: 'A fire map has been attached to this incident.',
      },
      {
        field: 'controlAgency',
        enumValues: CONTROL_AGENCY_VALUES,
        enumLabels: CONTROL_AGENCY_LABELS,
      },
      { field: 'fuelType', enumValues: FUEL_TYPE_VALUES, enumLabels: FUEL_TYPE_LABELS },
      { field: 'fireAreaHectares', min: 0, span: 'half' },
      { field: 'burntAreaHectares', min: 0, span: 'half' },
    ],
    groupValidators: [isMajorConditionalValidator, adjacentTimestampsValidator],
  };
}
