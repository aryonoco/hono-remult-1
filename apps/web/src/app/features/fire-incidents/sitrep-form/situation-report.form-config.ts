import {
  FIRE_STATUS_LABELS,
  FIRE_STATUS_VALUES,
  LIMITS,
  POTENTIAL_LABELS,
  POTENTIAL_VALUES,
  type SituationReport,
} from '@workspace/shared-domain';
import type { EntityFormConfig } from '../../../shared/forms/form-engine.types';

export const situationReportFormConfig: EntityFormConfig<SituationReport> = {
  groups: [
    { title: 'Identity', fields: ['fireIncidentId', 'fireName'] },
    { title: 'Status & Area', fields: ['status', 'fireAreaHectares'] },
    {
      title: 'Narrative',
      fields: [
        'weatherConditions',
        'currentStrategy',
        'predictedBehaviour',
        'controlProgress',
        'communityImpact',
        'significantEvents',
      ],
    },
    { title: 'Potential', fields: ['potentialLoss', 'potentialSpread'] },
    { title: 'Resources', fields: ['personnel', 'vehicles', 'aircraft'] },
  ],
  hints: [
    { field: 'fireIncidentId', label: 'Incident', readonly: true },
    { field: 'fireName', maxLength: LIMITS.name },
    {
      field: 'status',
      required: true,
      enumValues: FIRE_STATUS_VALUES,
      enumLabels: FIRE_STATUS_LABELS,
    },
    { field: 'fireAreaHectares', min: 0 },
    { field: 'weatherConditions', widget: 'textarea', maxLength: LIMITS.paragraph },
    { field: 'currentStrategy', widget: 'textarea', maxLength: LIMITS.paragraph },
    { field: 'predictedBehaviour', widget: 'textarea', maxLength: LIMITS.paragraph },
    { field: 'controlProgress', widget: 'textarea', maxLength: LIMITS.paragraph },
    { field: 'communityImpact', widget: 'textarea', maxLength: LIMITS.paragraph },
    { field: 'significantEvents', widget: 'textarea', maxLength: LIMITS.longText },
    { field: 'potentialLoss', enumValues: POTENTIAL_VALUES, enumLabels: POTENTIAL_LABELS },
    { field: 'potentialSpread', enumValues: POTENTIAL_VALUES, enumLabels: POTENTIAL_LABELS },
    { field: 'personnel', widget: 'integer', min: 0 },
    { field: 'vehicles', widget: 'integer', min: 0 },
    { field: 'aircraft', widget: 'integer', min: 0 },
  ],
};
