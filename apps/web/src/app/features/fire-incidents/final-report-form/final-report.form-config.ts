import {
  COST_CLASS_LABELS,
  COST_CLASS_VALUES,
  type FinalReport,
  INVESTIGATION_TYPE_LABELS,
  INVESTIGATION_TYPE_VALUES,
  LEGAL_ACTION_STATUS_LABELS,
  LEGAL_ACTION_STATUS_VALUES,
  LIMITS,
} from '@workspace/shared-domain';
import type {
  EntityFormConfig,
  FieldGroup,
  FieldHint,
} from '../../../shared/forms/form-engine.types';

export function buildFinalReportFormConfig(mode: 'create' | 'edit'): EntityFormConfig<FinalReport> {
  const groups: FieldGroup<FinalReport>[] = [
    { title: 'Incident', fields: ['fireIncidentId'] },
    {
      title: 'Losses',
      fields: [
        'stockLost',
        'homesLost',
        'shedsLost',
        'fencingLostKm',
        'cropLossHectares',
        'infrastructureLosses',
        'otherLosses',
      ],
    },
    {
      title: 'Investigation',
      fields: ['investigationType', 'investigationBy', 'isOffenceSuspected', 'legalActionStatus'],
    },
    { title: 'Cost', fields: ['costClass'] },
    {
      title: 'Burnt Land',
      fields: [
        'burntStateForest',
        'burntNationalPark',
        'burntPrivateProperty',
        'burntPlantation',
        'burntOther',
      ],
    },
  ];
  const hints: FieldHint<FinalReport>[] = [
    { field: 'fireIncidentId', label: 'Incident', readonly: true },
    { field: 'stockLost', widget: 'integer', min: 0 },
    { field: 'homesLost', widget: 'integer', min: 0 },
    { field: 'shedsLost', widget: 'integer', min: 0 },
    { field: 'fencingLostKm', min: 0 },
    { field: 'cropLossHectares', min: 0 },
    { field: 'infrastructureLosses', widget: 'textarea', maxLength: LIMITS.description },
    { field: 'otherLosses', widget: 'textarea', maxLength: LIMITS.description },
    {
      field: 'investigationType',
      enumValues: INVESTIGATION_TYPE_VALUES,
      enumLabels: INVESTIGATION_TYPE_LABELS,
    },
    { field: 'investigationBy', maxLength: LIMITS.mediumText },
    {
      field: 'legalActionStatus',
      enumValues: LEGAL_ACTION_STATUS_VALUES,
      enumLabels: LEGAL_ACTION_STATUS_LABELS,
    },
    { field: 'costClass', enumValues: COST_CLASS_VALUES, enumLabels: COST_CLASS_LABELS },
    { field: 'burntStateForest', min: 0 },
    { field: 'burntNationalPark', min: 0 },
    { field: 'burntPrivateProperty', min: 0 },
    { field: 'burntPlantation', min: 0 },
    { field: 'burntOther', min: 0 },
  ];

  if (mode === 'create') {
    groups.push({ title: 'Sign-off', fields: ['isSignedOff'] });
    hints.push({ field: 'isSignedOff', widget: 'slideToggle' });
  } else {
    hints.push({ field: 'isSignedOff', exclude: true });
  }

  return { groups, hints };
}
