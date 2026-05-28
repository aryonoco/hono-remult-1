import { Allow, Entity, Fields, type LifecycleEvent, Relations, remult, Validators } from 'remult';

import type { CurrentUser } from '../auth/current-user';
import { Roles } from '../auth/roles';
import { FIRE_STATUS_VALUES, FireStatus, POTENTIAL_VALUES, type Potential } from './enums';
import { FinalReport } from './final-report';
import { FireIncident } from './fire-incident';
import { computeNextReportDue, LIMITS, withServerInternal } from './helpers';

async function situationReportSaving(
  s: SituationReport,
  e: LifecycleEvent<SituationReport>,
): Promise<void> {
  if (!e.isNew) {
    return;
  }
  const user = remult.user as CurrentUser | undefined;
  if (!user) {
    e.repository.getEntityRef(s).error = 'Authenticated user required';
    return;
  }
  const parent = await remult.repo(FireIncident).findId(s.fireIncidentId);
  if (!parent) {
    e.fields.fireIncidentId.error = 'Parent fire not found';
    return;
  }
  if (parent.isDeleted) {
    e.repository.getEntityRef(s).error = 'Parent fire is soft-deleted';
    return;
  }
  const fr = await remult.repo(FinalReport).findFirst({ fireIncidentId: s.fireIncidentId });
  if (fr?.isSignedOff) {
    e.repository.getEntityRef(s).error = 'Parent fire is signed off';
    return;
  }
  const isElevated = remult.isAllowed(Roles.stateOfficer) || remult.isAllowed(Roles.admin);
  if (!isElevated && parent.districtId !== user.districtId) {
    e.repository.getEntityRef(s).error =
      'IncidentEditor can only submit sitreps for fires in their own district';
    return;
  }
  s.reportNumber =
    (await remult.repo(SituationReport).count({ fireIncidentId: s.fireIncidentId })) + 1;
  s.submittedBy = user.id;
  s.submittedAt = new Date();
  s.districtId = parent.districtId;
  s.isParentDeleted = false;
  if (s.fireName.trim() === '') {
    s.fireName = parent.name;
  }
  if (s.status === FireStatus.safeOverrun) {
    s.fireAreaHectares = 0;
  }
}

async function situationReportSaved(
  s: SituationReport,
  e: LifecycleEvent<SituationReport>,
): Promise<void> {
  if (!e.isNew) {
    return;
  }
  const parent = await remult.repo(FireIncident).findId(s.fireIncidentId);
  if (!parent) {
    return;
  }
  const prev = await remult
    .repo(SituationReport)
    .findFirst(
      { fireIncidentId: s.fireIncidentId, reportNumber: { '!=': s.reportNumber } },
      { orderBy: { reportNumber: 'desc' } },
    );
  const nextReportDue = computeNextReportDue({
    previousStatus: parent.status,
    newStatus: s.status,
    prevLoss: prev?.potentialLoss,
    prevSpread: prev?.potentialSpread,
    newLoss: s.potentialLoss,
    newSpread: s.potentialSpread,
  });
  const updates: Partial<FireIncident> = {
    status: s.status,
    totalPersonnel: s.personnel,
    totalVehicles: s.vehicles,
    totalAircraft: s.aircraft,
    nextReportDue,
  };
  if (s.status !== parent.status) {
    updates.statusAsAt = new Date();
  }
  if (s.fireAreaHectares !== undefined) {
    updates.fireAreaHectares = s.fireAreaHectares;
  }
  await withServerInternal(async () => {
    await remult.repo(FireIncident).update(parent.id, updates);
  });
}

@Entity<SituationReport>('situationReports', {
  allowApiRead: Allow.authenticated,
  allowApiInsert: [Roles.incidentEditor, Roles.stateOfficer, Roles.admin],
  allowApiUpdate: false,
  allowApiDelete: [Roles.stateOfficer, Roles.admin],
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
  defaultOrderBy: { reportNumber: 'desc' },
  saving: (sitrep: SituationReport, e: LifecycleEvent<SituationReport>) =>
    situationReportSaving(sitrep, e),
  saved: (sitrep: SituationReport, e: LifecycleEvent<SituationReport>) =>
    situationReportSaved(sitrep, e),
})
export class SituationReport {
  @Fields.id()
  id = '';

  @Fields.string({ validate: Validators.required })
  fireIncidentId = '';

  @Relations.toOne(() => FireIncident, 'fireIncidentId')
  fireIncident?: FireIncident;

  @Fields.integer({ allowApiUpdate: false })
  reportNumber = 0;

  @Fields.integer({ allowApiUpdate: false })
  districtId = 0;

  @Fields.boolean({ allowApiUpdate: false })
  isParentDeleted = false;

  @Fields.string({ validate: Validators.maxLength(LIMITS.name) })
  fireName = '';

  @Fields.literal(() => FIRE_STATUS_VALUES, { validate: Validators.required })
  status: FireStatus = FireStatus.going;

  @Fields.number({ allowNull: true, validate: Validators.min(0) })
  fireAreaHectares?: number;

  @Fields.string({ validate: Validators.maxLength(LIMITS.paragraph) })
  weatherConditions = '';

  @Fields.string({ validate: Validators.maxLength(LIMITS.paragraph) })
  currentStrategy = '';

  @Fields.string({ validate: Validators.maxLength(LIMITS.longText) })
  significantEvents = '';

  @Fields.string({ validate: Validators.maxLength(LIMITS.paragraph) })
  predictedBehaviour = '';

  @Fields.string({ validate: Validators.maxLength(LIMITS.paragraph) })
  controlProgress = '';

  @Fields.string({ validate: Validators.maxLength(LIMITS.paragraph) })
  communityImpact = '';

  @Fields.literal(() => POTENTIAL_VALUES, { allowNull: true })
  potentialLoss?: Potential;

  @Fields.literal(() => POTENTIAL_VALUES, { allowNull: true })
  potentialSpread?: Potential;

  @Fields.integer({ validate: Validators.min(0) })
  personnel = 0;

  @Fields.integer({ validate: Validators.min(0) })
  vehicles = 0;

  @Fields.integer({ validate: Validators.min(0) })
  aircraft = 0;

  @Fields.string({ allowApiUpdate: false })
  submittedBy = '';

  @Fields.date({ allowApiUpdate: false })
  submittedAt?: Date;

  @Fields.createdAt()
  createdAt?: Date;
}
