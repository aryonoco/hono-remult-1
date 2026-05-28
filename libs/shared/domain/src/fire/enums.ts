export const FireStatus = {
  going: 'going',
  contained: 'contained',
  underControlFirst: 'underControlFirst',
  underControlSecond: 'underControlSecond',
  safe: 'safe',
  safeOverrun: 'safeOverrun',
  safeNotFound: 'safeNotFound',
  safeFalseAlarm: 'safeFalseAlarm',
  notFound: 'notFound',
} as const;
export type FireStatus = (typeof FireStatus)[keyof typeof FireStatus];
export const FIRE_STATUS_VALUES: readonly FireStatus[] = Object.values(FireStatus);

export const IncidentLevel = {
  levelOne: 'levelOne',
  levelTwo: 'levelTwo',
  levelThree: 'levelThree',
} as const;
export type IncidentLevel = (typeof IncidentLevel)[keyof typeof IncidentLevel];
export const INCIDENT_LEVEL_VALUES: readonly IncidentLevel[] = Object.values(IncidentLevel);

export const CauseSource = {
  burningBuilding: 'burningBuilding',
  burningHouseStoveFlue: 'burningHouseStoveFlue',
  // biome-ignore lint/security/noSecrets: enum value, not a secret
  burningOffDepartmentalPrescribed: 'burningOffDepartmentalPrescribed',
  burningOffStubbleGrassScrub: 'burningOffStubbleGrassScrub',
  burningOffWindrowHeap: 'burningOffWindrowHeap',
  burningVehicleMachine: 'burningVehicleMachine',
  burningVehicleMachineMalicious: 'burningVehicleMachineMalicious',
  campfireBarbeque: 'campfireBarbeque',
  deliberateLightingMalicious: 'deliberateLightingMalicious',
  exhaustChainsaw: 'exhaustChainsaw',
  exhaustOther: 'exhaustOther',
  fireworks: 'fireworks',
  lightning: 'lightning',
  // biome-ignore lint/security/noSecrets: enum value, not a secret
  nonDeliberateLightingMischievous: 'nonDeliberateLightingMischievous',
  other: 'other',
  pipeCigaretteMatch: 'pipeCigaretteMatch',
  powerTransmission: 'powerTransmission',
  relightBurningOff: 'relightBurningOff',
  relightPrescribedFire: 'relightPrescribedFire',
  relightWildfire: 'relightWildfire',
  sniggingHauling: 'sniggingHauling',
  train: 'train',
  unattendedCampfireContainedWithinBoundary: 'unattendedCampfireContainedWithinBoundary',
  unknown: 'unknown',
  wasteDisposalDomestic: 'wasteDisposalDomestic',
  wasteDisposalIndustrialSawmillTip: 'wasteDisposalIndustrialSawmillTip',
} as const;
export type CauseSource = (typeof CauseSource)[keyof typeof CauseSource];
export const CAUSE_SOURCE_VALUES: readonly CauseSource[] = Object.values(CauseSource);

export const ControlAgency = {
  deeca: 'deeca',
  cfa: 'cfa',
  frv: 'frv',
  interstate: 'interstate',
} as const;
export type ControlAgency = (typeof ControlAgency)[keyof typeof ControlAgency];
export const CONTROL_AGENCY_VALUES: readonly ControlAgency[] = Object.values(ControlAgency);

export const FuelType = {
  grassland: 'grassland',
  woodland: 'woodland',
  spinifex: 'spinifex',
  malleeHeath: 'malleeHeath',
  shrubland: 'shrubland',
  buttongrass: 'buttongrass',
  forest: 'forest',
  pine: 'pine',
} as const;
export type FuelType = (typeof FuelType)[keyof typeof FuelType];
export const FUEL_TYPE_VALUES: readonly FuelType[] = Object.values(FuelType);

export const Potential = {
  low: 'low',
  moderate: 'moderate',
  high: 'high',
} as const;
export type Potential = (typeof Potential)[keyof typeof Potential];
export const POTENTIAL_VALUES: readonly Potential[] = Object.values(Potential);

export const CostClass = {
  lessThanThousand: 'lessThanThousand',
  thousandToFourNineNineNine: 'thousandToFourNineNineNine',
  fiveThousandToNineNineNineNine: 'fiveThousandToNineNineNineNine',
  tenThousandToNineteenNineNineNine: 'tenThousandToNineteenNineNineNine',
  twentyThousandToFortyNineNineNineNine: 'twentyThousandToFortyNineNineNineNine',
  fiftyThousandToNinetyNineNineNineNine: 'fiftyThousandToNinetyNineNineNineNine',
  hundredThousandOrGreater: 'hundredThousandOrGreater',
} as const;
export type CostClass = (typeof CostClass)[keyof typeof CostClass];
export const COST_CLASS_VALUES: readonly CostClass[] = Object.values(CostClass);

export const FireDetectionMethod = {
  fireTower: 'fireTower',
  ground: 'ground',
  aircraftPatrol: 'aircraftPatrol',
  aircraftNonPatrol: 'aircraftNonPatrol',
  forestIndustryEmployee: 'forestIndustryEmployee',
  otherIndustryEmployee: 'otherIndustryEmployee',
  landownerResident: 'landownerResident',
  traveller: 'traveller',
  unknown: 'unknown',
  other: 'other',
  fireLookout: 'fireLookout',
  departmentPatrolAircraft: 'departmentPatrolAircraft',
  departmentGroundPersonnel: 'departmentGroundPersonnel',
} as const;
export type FireDetectionMethod = (typeof FireDetectionMethod)[keyof typeof FireDetectionMethod];
export const FIRE_DETECTION_METHOD_VALUES: readonly FireDetectionMethod[] =
  Object.values(FireDetectionMethod);

export const YesNo = { yes: 'yes', no: 'no' } as const;
export type YesNo = (typeof YesNo)[keyof typeof YesNo];
export const YES_NO_VALUES: readonly YesNo[] = Object.values(YesNo);

export const InvestigationType = {
  accreditedInvestigatorReportAttended: 'accreditedInvestigatorReportAttended',
  accreditedInvestigatorReportNotAttended: 'accreditedInvestigatorReportNotAttended',
  firstAttackReport: 'firstAttackReport',
  notInvestigated: 'notInvestigated',
} as const;
export type InvestigationType = (typeof InvestigationType)[keyof typeof InvestigationType];
export const INVESTIGATION_TYPE_VALUES: readonly InvestigationType[] =
  Object.values(InvestigationType);

export const LegalActionStatus = {
  noAction: 'noAction',
  deptInvestigationContinuing: 'deptInvestigationContinuing',
  deptPoliceInvestigationContinuing: 'deptPoliceInvestigationContinuing',
  // biome-ignore lint/security/noSecrets: enum value, not a secret
  deptOtherAgencyInvestigation: 'deptOtherAgencyInvestigation',
  referredToPolice: 'referredToPolice',
  referredToDeptProsecutions: 'referredToDeptProsecutions',
  educationAwarenessWarningLetter: 'educationAwarenessWarningLetter',
  civilActionBeingUndertaken: 'civilActionBeingUndertaken',
  infringementNoticeIssued: 'infringementNoticeIssued',
} as const;
export type LegalActionStatus = (typeof LegalActionStatus)[keyof typeof LegalActionStatus];
export const LEGAL_ACTION_STATUS_VALUES: readonly LegalActionStatus[] =
  Object.values(LegalActionStatus);
