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
} from '@workspace/shared-domain';

// Plain row shapes mirroring the persisted columns of each entity table, one
// property per column. The generator builds these directly (no Remult hooks
// run during seeding) and the inserter writes them as-is, so the property names
// and nullability here must track the entity definitions exactly — the
// `seed-invariants` test guards that against drift.

export interface FireIncidentRow {
  id: string;
  financialYear: number;
  fireNumber: number;
  globalIncidentId: number;
  name: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  districtId: number;
  locationDescription: string;
  latitude: number | null;
  longitude: number | null;
  status: FireStatus;
  statusAsAt: Date;
  incidentLevel: IncidentLevel;
  isMajor: boolean;
  declaredBySource: string;
  declaredByTimestamp: Date | null;
  reportedAt: Date;
  fireStartedAt: Date | null;
  fireDetectedAt: Date | null;
  firstCrewSentAt: Date | null;
  firstCrewArrivedAt: Date | null;
  detectionMethod: FireDetectionMethod | null;
  causeSource: CauseSource | null;
  causeSourceOther: string;
  isCauseConfirmed: boolean;
  isLandManagerNotified: YesNo | null;
  isControlAgencyNotified: YesNo | null;
  isFireMapAttached: boolean;
  controlAgency: ControlAgency | null;
  fuelType: FuelType | null;
  fireAreaHectares: number | null;
  burntAreaHectares: number | null;
  totalPersonnel: number;
  totalVehicles: number;
  totalAircraft: number;
  nextReportDue: Date | null;
  isDeleted: boolean;
  deletionReason: string;
}

export interface SituationReportRow {
  id: string;
  fireIncidentId: string;
  reportNumber: number;
  districtId: number;
  isParentDeleted: boolean;
  fireName: string;
  status: FireStatus;
  fireAreaHectares: number | null;
  weatherConditions: string;
  currentStrategy: string;
  significantEvents: string;
  predictedBehaviour: string;
  controlProgress: string;
  communityImpact: string;
  potentialLoss: Potential | null;
  potentialSpread: Potential | null;
  personnel: number;
  vehicles: number;
  aircraft: number;
  submittedBy: string;
  submittedAt: Date;
  createdAt: Date;
}

export interface FinalReportRow {
  id: string;
  fireIncidentId: string;
  districtId: number;
  isParentDeleted: boolean;
  stockLost: number | null;
  homesLost: number | null;
  shedsLost: number | null;
  fencingLostKm: number | null;
  cropLossHectares: number | null;
  infrastructureLosses: string;
  otherLosses: string;
  investigationType: InvestigationType | null;
  investigationBy: string;
  isOffenceSuspected: boolean;
  legalActionStatus: LegalActionStatus | null;
  costClass: CostClass | null;
  burntStateForest: number | null;
  burntNationalPark: number | null;
  burntPrivateProperty: number | null;
  burntPlantation: number | null;
  burntOther: number | null;
  isSignedOff: boolean;
  signedOffAt: Date | null;
  signedOffBy: string;
  signOffRemovedAt: Date | null;
  signOffRemovedBy: string;
  signOffRemovedReason: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FixtureDataset {
  fires: FireIncidentRow[];
  sitreps: SituationReportRow[];
  finalReports: FinalReportRow[];
}
