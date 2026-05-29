import {
  CAUSE_SOURCE_LABELS,
  CONTROL_AGENCY_LABELS,
  COST_CLASS_LABELS,
  FIRE_DETECTION_METHOD_LABELS,
  FIRE_STATUS_LABELS,
  FUEL_TYPE_LABELS,
  INCIDENT_LEVEL_LABELS,
  INVESTIGATION_TYPE_LABELS,
  LEGAL_ACTION_STATUS_LABELS,
  POTENTIAL_LABELS,
  YES_NO_LABELS,
} from './enum-display';
import {
  CAUSE_SOURCE_VALUES,
  CONTROL_AGENCY_VALUES,
  COST_CLASS_VALUES,
  FIRE_DETECTION_METHOD_VALUES,
  FIRE_STATUS_VALUES,
  FUEL_TYPE_VALUES,
  INCIDENT_LEVEL_VALUES,
  INVESTIGATION_TYPE_VALUES,
  LEGAL_ACTION_STATUS_VALUES,
  POTENTIAL_VALUES,
  YES_NO_VALUES,
} from './enums';

describe('enum-display labels', () => {
  it('FireStatus', () => {
    for (const v of FIRE_STATUS_VALUES) expect(FIRE_STATUS_LABELS[v]).toBeTruthy();
  });
  it('IncidentLevel', () => {
    for (const v of INCIDENT_LEVEL_VALUES) expect(INCIDENT_LEVEL_LABELS[v]).toBeTruthy();
  });
  it('CauseSource', () => {
    for (const v of CAUSE_SOURCE_VALUES) expect(CAUSE_SOURCE_LABELS[v]).toBeTruthy();
  });
  it('ControlAgency', () => {
    for (const v of CONTROL_AGENCY_VALUES) expect(CONTROL_AGENCY_LABELS[v]).toBeTruthy();
  });
  it('FuelType', () => {
    for (const v of FUEL_TYPE_VALUES) expect(FUEL_TYPE_LABELS[v]).toBeTruthy();
  });
  it('Potential', () => {
    for (const v of POTENTIAL_VALUES) expect(POTENTIAL_LABELS[v]).toBeTruthy();
  });
  it('CostClass', () => {
    for (const v of COST_CLASS_VALUES) expect(COST_CLASS_LABELS[v]).toBeTruthy();
  });
  it('FireDetectionMethod', () => {
    for (const v of FIRE_DETECTION_METHOD_VALUES)
      expect(FIRE_DETECTION_METHOD_LABELS[v]).toBeTruthy();
  });
  it('YesNo', () => {
    for (const v of YES_NO_VALUES) expect(YES_NO_LABELS[v]).toBeTruthy();
  });
  it('InvestigationType', () => {
    for (const v of INVESTIGATION_TYPE_VALUES) expect(INVESTIGATION_TYPE_LABELS[v]).toBeTruthy();
  });
  it('LegalActionStatus', () => {
    for (const v of LEGAL_ACTION_STATUS_VALUES) expect(LEGAL_ACTION_STATUS_LABELS[v]).toBeTruthy();
  });
});
