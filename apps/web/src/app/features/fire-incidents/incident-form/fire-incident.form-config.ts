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
import type { EntityFormConfig, SelectOption } from '../../../shared/forms/form-engine.types';

export function buildFireIncidentFormConfig(
  districtOptions: Signal<readonly SelectOption[]>,
): EntityFormConfig<FireIncident> {
  return {
    groups: [
      {
        title: 'Identity & Location',
        fields: ['name', 'districtId', 'locationDescription', 'latitude', 'longitude'],
      },
      {
        title: 'Status & Classification',
        fields: ['status', 'isMajor', 'declaredBySource', 'declaredByTimestamp'],
      },
      {
        title: 'Timeline',
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
      { title: 'Cause', fields: ['causeSource', 'causeSourceOther', 'isCauseConfirmed'] },
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
    ],
    hints: [
      { field: 'name', required: true, maxLength: LIMITS.name },
      { field: 'districtId', label: 'District', required: true, optionsSignal: districtOptions },
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
      { field: 'isMajor', widget: 'slideToggle' },
      { field: 'declaredBySource', maxLength: LIMITS.mediumText },
      { field: 'declaredByTimestamp', maxNow: true },
      { field: 'reportedAt', required: true, maxNow: true },
      {
        field: 'detectionMethod',
        enumValues: FIRE_DETECTION_METHOD_VALUES,
        enumLabels: FIRE_DETECTION_METHOD_LABELS,
      },
      { field: 'causeSource', enumValues: CAUSE_SOURCE_VALUES, enumLabels: CAUSE_SOURCE_LABELS },
      { field: 'causeSourceOther', widget: 'textarea', maxLength: LIMITS.description },
      { field: 'isLandManagerNotified', enumValues: YES_NO_VALUES, enumLabels: YES_NO_LABELS },
      { field: 'isControlAgencyNotified', enumValues: YES_NO_VALUES, enumLabels: YES_NO_LABELS },
      {
        field: 'controlAgency',
        enumValues: CONTROL_AGENCY_VALUES,
        enumLabels: CONTROL_AGENCY_LABELS,
      },
      { field: 'fuelType', enumValues: FUEL_TYPE_VALUES, enumLabels: FUEL_TYPE_LABELS },
      { field: 'fireAreaHectares', min: 0 },
      { field: 'burntAreaHectares', min: 0 },
    ],
    groupValidators: [isMajorConditionalValidator, adjacentTimestampsValidator],
  };
}
