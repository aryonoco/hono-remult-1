import type {
  CauseSource,
  ControlAgency,
  CostClass,
  FireDetectionMethod,
  FireStatus,
  FuelType,
  IncidentLevel,
  InvestigationType,
  LegalActionStatus,
  Potential,
  YesNo,
} from './enums';

export const FIRE_STATUS_LABELS: Readonly<Record<FireStatus, string>> = {
  going: 'Going',
  contained: 'Contained',
  underControlFirst: 'Under Control - 1',
  underControlSecond: 'Under Control - 2',
  safe: 'Safe',
  safeOverrun: 'Safe - Overrun',
  safeNotFound: 'Safe - Not Found',
  safeFalseAlarm: 'Safe - False Alarm',
  notFound: 'Not Found',
};

export const INCIDENT_LEVEL_LABELS: Readonly<Record<IncidentLevel, string>> = {
  levelOne: 'Level 1',
  levelTwo: 'Level 2',
  levelThree: 'Level 3',
};

export const CAUSE_SOURCE_LABELS: Readonly<Record<CauseSource, string>> = {
  burningBuilding: 'Burning Building',
  burningHouseStoveFlue: 'Burning House, Stove, Flue',
  burningOffDepartmentalPrescribed: 'Burning Off (Departmental Prescribed)',
  burningOffStubbleGrassScrub: 'Burning Off, Stubble, Grass, Scrub',
  burningOffWindrowHeap: 'Burning Off, Windrow, Heap',
  burningVehicleMachine: 'Burning Vehicle, Machine',
  burningVehicleMachineMalicious: 'Burning Vehicle, Machine - Malicious',
  campfireBarbeque: 'Campfire, Barbeque',
  deliberateLightingMalicious: 'Deliberate Lighting (Malicious)',
  exhaustChainsaw: 'Exhaust, Chainsaw',
  exhaustOther: 'Exhaust, Other',
  fireworks: 'Fireworks',
  lightning: 'Lightning',
  nonDeliberateLightingMischievous: 'Non-Deliberate Lighting (Mischievous)',
  other: 'Other',
  pipeCigaretteMatch: 'Pipe, Cigarette, Match',
  powerTransmission: 'Power Transmission',
  relightBurningOff: 'Relight - Burning Off',
  relightPrescribedFire: 'Relight - Prescribed Fire',
  relightWildfire: 'Relight - Wildfire',
  sniggingHauling: 'Snigging, Hauling',
  train: 'Train',
  unattendedCampfireContainedWithinBoundary: 'Unattended Campfire - Contained Within Boundary',
  unknown: 'Unknown',
  wasteDisposalDomestic: 'Waste Disposal, Domestic',
  wasteDisposalIndustrialSawmillTip: 'Waste Disposal, Industrial, Sawmill, Tip',
};

export const CONTROL_AGENCY_LABELS: Readonly<Record<ControlAgency, string>> = {
  deeca: 'DEECA',
  cfa: 'CFA',
  frv: 'FRV',
  interstate: 'Interstate',
};

export const FUEL_TYPE_LABELS: Readonly<Record<FuelType, string>> = {
  grassland: 'Grassland',
  woodland: 'Woodland',
  spinifex: 'Spinifex',
  malleeHeath: 'Mallee-heath',
  shrubland: 'Shrubland',
  buttongrass: 'Buttongrass',
  forest: 'Forest',
  pine: 'Pine',
};

export const POTENTIAL_LABELS: Readonly<Record<Potential, string>> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};

export const COST_CLASS_LABELS: Readonly<Record<CostClass, string>> = {
  lessThanThousand: 'Less Than $1,000',
  thousandToFourNineNineNine: '$1,000 - $4,999',
  fiveThousandToNineNineNineNine: '$5,000 - $9,999',
  tenThousandToNineteenNineNineNine: '$10,000 - $19,999',
  twentyThousandToFortyNineNineNineNine: '$20,000 - $49,999',
  fiftyThousandToNinetyNineNineNineNine: '$50,000 - $99,999',
  hundredThousandOrGreater: '$100,000 Or Greater',
};

export const FIRE_DETECTION_METHOD_LABELS: Readonly<Record<FireDetectionMethod, string>> = {
  fireTower: 'Fire Tower',
  ground: 'Ground',
  aircraftPatrol: 'Aircraft Patrol',
  aircraftNonPatrol: 'Aircraft (Non-Patrol)',
  forestIndustryEmployee: 'Forest Industry Employee',
  otherIndustryEmployee: 'Other Industry Employee',
  landownerResident: 'Landowner / Resident',
  traveller: 'Traveller',
  unknown: 'Unknown',
  other: 'Other',
  fireLookout: 'Fire Lookout',
  departmentPatrolAircraft: 'Department Patrol Aircraft',
  departmentGroundPersonnel: 'Department Ground Personnel',
};

export const YES_NO_LABELS: Readonly<Record<YesNo, string>> = {
  yes: 'Yes',
  no: 'No',
};

export const INVESTIGATION_TYPE_LABELS: Readonly<Record<InvestigationType, string>> = {
  accreditedInvestigatorReportAttended: 'Accredited Investigator Report (Attended)',
  accreditedInvestigatorReportNotAttended: 'Accredited Investigator Report (Not Attended)',
  firstAttackReport: 'First Attack Report',
  notInvestigated: 'Not Investigated',
};

export const LEGAL_ACTION_STATUS_LABELS: Readonly<Record<LegalActionStatus, string>> = {
  noAction: 'No Action',
  deptInvestigationContinuing: 'Dept Investigation Continuing',
  deptPoliceInvestigationContinuing: 'Dept/Police Investigation Continuing',
  deptOtherAgencyInvestigation: 'Dept/Other Agency Investigation',
  referredToPolice: 'Referred To Police',
  referredToDeptProsecutions: 'Referred To Dept Prosecutions',
  educationAwarenessWarningLetter: 'Education / Awareness / Warning Letter',
  civilActionBeingUndertaken: 'Civil Action Being Undertaken',
  infringementNoticeIssued: 'Infringement Notice Issued',
};
