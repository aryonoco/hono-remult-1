import { Entity, Fields, type LifecycleEvent, Relations, remult, Validators } from 'remult';

import type { CurrentUser } from '../auth/current-user';
import { Roles } from '../auth/roles';
import {
  COST_CLASS_VALUES,
  type CostClass,
  INVESTIGATION_TYPE_VALUES,
  type InvestigationType,
  LEGAL_ACTION_STATUS_VALUES,
  type LegalActionStatus,
} from './enums';
import { FireIncident } from './fire-incident';
import { isServerInternal, LIMITS, TERMINAL_STATUSES, withServerInternal } from './helpers';

async function finalReportSaving(fr: FinalReport, e: LifecycleEvent<FinalReport>): Promise<void> {
  if (e.isNew) {
    await finalReportInsertSaving(fr, e);
  } else {
    await finalReportUpdateSaving(fr, e);
  }
}

async function finalReportInsertSaving(
  fr: FinalReport,
  e: LifecycleEvent<FinalReport>,
): Promise<void> {
  const user = remult.user as CurrentUser | undefined;
  if (!user) {
    e.repository.getEntityRef(fr).error = 'Authenticated user required';
    return;
  }
  const parent = await remult.repo(FireIncident).findId(fr.fireIncidentId);
  if (!parent) {
    e.fields.fireIncidentId.error = 'Parent fire not found';
    return;
  }
  if (parent.isDeleted) {
    e.repository.getEntityRef(fr).error = 'Parent fire is soft-deleted';
    return;
  }
  if (!TERMINAL_STATUSES.includes(parent.status)) {
    e.repository.getEntityRef(fr).error =
      'FinalReport requires parent fire to be in a terminal status (Safe*, NotFound)';
    return;
  }
  const existing = await remult.repo(FinalReport).count({ fireIncidentId: fr.fireIncidentId });
  if (existing > 0) {
    e.repository.getEntityRef(fr).error = 'FinalReport already exists for this fire';
    return;
  }
  const isElevated = remult.isAllowed(Roles.stateOfficer) || remult.isAllowed(Roles.admin);
  if (!isElevated && parent.districtId !== user.districtId) {
    e.repository.getEntityRef(fr).error =
      'IncidentEditor can only file FinalReports for fires in their own district';
    return;
  }
  fr.createdBy = user.id;
  fr.districtId = parent.districtId;
  fr.isParentDeleted = false;
  if (fr.isSignedOff === true) {
    fr.signedOffAt = new Date();
    fr.signedOffBy = user.id;
  }
}

async function finalReportUpdateSaving(
  fr: FinalReport,
  e: LifecycleEvent<FinalReport>,
): Promise<void> {
  const user = remult.user as CurrentUser | undefined;
  if (!user) {
    e.repository.getEntityRef(fr).error = 'Authenticated user required';
    return;
  }
  const internal = isServerInternal();
  const parent = await remult.repo(FireIncident).findId(fr.fireIncidentId);
  if (parent?.isDeleted) {
    e.repository.getEntityRef(fr).error = 'Parent fire is soft-deleted';
    return;
  }
  const wasSignedOff = e.fields.isSignedOff.originalValue === true;
  const isSignedOff = fr.isSignedOff === true;

  if (wasSignedOff && isSignedOff && !internal) {
    e.repository.getEntityRef(fr).error =
      'FinalReport is locked while signed off; call removeSignOff first';
    return;
  }
  if (!wasSignedOff && isSignedOff) {
    if (!(parent && TERMINAL_STATUSES.includes(parent.status))) {
      e.fields.isSignedOff.error = 'Cannot sign off: parent fire is not in a terminal status';
      return;
    }
    fr.signedOffAt = new Date();
    fr.signedOffBy = user.id;
  }
  if (wasSignedOff && !isSignedOff && !internal) {
    e.fields.isSignedOff.error =
      'removeSignOff is only available via the removeSignOff BackendMethod';
  }
}

async function finalReportSaved(fr: FinalReport, e: LifecycleEvent<FinalReport>): Promise<void> {
  const becameSignedOff =
    (e.isNew && fr.isSignedOff === true) ||
    (!e.isNew && e.fields.isSignedOff.originalValue !== true && fr.isSignedOff === true);
  if (!becameSignedOff) {
    return;
  }
  await withServerInternal(async () => {
    await remult.repo(FireIncident).update(fr.fireIncidentId, { nextReportDue: null });
  });
}

@Entity<FinalReport>('finalReports', {
  allowApiRead: [Roles.incidentEditor, Roles.stateOfficer, Roles.admin],
  allowApiInsert: [Roles.incidentEditor, Roles.stateOfficer, Roles.admin],
  allowApiUpdate: [Roles.incidentEditor, Roles.stateOfficer, Roles.admin],
  allowApiDelete: false,
  apiPrefilter: () => {
    const u = remult.user as CurrentUser | undefined;
    if (!u) {
      return { id: ['__never__'] };
    }
    const base = { isParentDeleted: false };
    if (remult.isAllowed(Roles.admin) || remult.isAllowed(Roles.stateOfficer)) {
      return base;
    }
    return { ...base, districtId: u.districtId ?? -1 };
  },
  defaultOrderBy: { createdAt: 'desc' },
  saving: (fr: FinalReport, e: LifecycleEvent<FinalReport>) => finalReportSaving(fr, e),
  saved: (fr: FinalReport, e: LifecycleEvent<FinalReport>) => finalReportSaved(fr, e),
})
export class FinalReport {
  @Fields.id()
  id = '';

  @Fields.string({ validate: Validators.required })
  fireIncidentId = '';

  @Relations.toOne(() => FireIncident, 'fireIncidentId')
  fireIncident?: FireIncident;

  @Fields.integer({ allowApiUpdate: false })
  districtId = 0;

  @Fields.boolean({ allowApiUpdate: false })
  isParentDeleted = false;

  @Fields.integer({ allowNull: true, validate: Validators.min(0) })
  stockLost?: number;

  @Fields.integer({ allowNull: true, validate: Validators.min(0) })
  homesLost?: number;

  @Fields.integer({ allowNull: true, validate: Validators.min(0) })
  shedsLost?: number;

  @Fields.number({ allowNull: true, validate: Validators.min(0) })
  fencingLostKm?: number;

  @Fields.number({ allowNull: true, validate: Validators.min(0) })
  cropLossHectares?: number;

  @Fields.string({ validate: Validators.maxLength(LIMITS.description) })
  infrastructureLosses = '';

  @Fields.string({ validate: Validators.maxLength(LIMITS.description) })
  otherLosses = '';

  @Fields.literal(() => INVESTIGATION_TYPE_VALUES, { allowNull: true })
  investigationType?: InvestigationType;

  @Fields.string({ validate: Validators.maxLength(LIMITS.mediumText) })
  investigationBy = '';

  @Fields.boolean()
  isOffenceSuspected = false;

  @Fields.literal(() => LEGAL_ACTION_STATUS_VALUES, { allowNull: true })
  legalActionStatus?: LegalActionStatus;

  @Fields.literal(() => COST_CLASS_VALUES, { allowNull: true })
  costClass?: CostClass;

  @Fields.number({ allowNull: true, validate: Validators.min(0) })
  burntStateForest?: number;

  @Fields.number({ allowNull: true, validate: Validators.min(0) })
  burntNationalPark?: number;

  @Fields.number({ allowNull: true, validate: Validators.min(0) })
  burntPrivateProperty?: number;

  @Fields.number({ allowNull: true, validate: Validators.min(0) })
  burntPlantation?: number;

  @Fields.number({ allowNull: true, validate: Validators.min(0) })
  burntOther?: number;

  @Fields.boolean()
  isSignedOff = false;

  @Fields.date({ allowApiUpdate: false })
  signedOffAt?: Date;

  @Fields.string({ allowApiUpdate: false })
  signedOffBy = '';

  @Fields.date({ allowApiUpdate: false })
  signOffRemovedAt?: Date;

  @Fields.string({ allowApiUpdate: false })
  signOffRemovedBy = '';

  @Fields.string({ allowApiUpdate: false })
  createdBy = '';

  @Fields.createdAt()
  createdAt?: Date;

  @Fields.updatedAt()
  updatedAt?: Date;
}

export const finalReportSchemaExtras: readonly string[] = [
  'ALTER TABLE "finalReports" ADD CONSTRAINT "finalReports_fireIncidentId_key" UNIQUE ("fireIncidentId")',
] as const;
