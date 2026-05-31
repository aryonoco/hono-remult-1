import { err, ok, ResultAsync, safeTry } from 'neverthrow';
import {
  Allow,
  BackendMethod,
  Entity,
  Fields,
  type LifecycleEvent,
  type RelationOptions,
  Relations,
  type Remult,
  remult,
  type ValidateFieldEvent,
  Validators,
} from 'remult';

import type { CurrentUser } from '../auth/current-user';
import { Roles } from '../auth/roles';
import { District } from './district';
import {
  CAUSE_SOURCE_VALUES,
  type CauseSource,
  CONTROL_AGENCY_VALUES,
  type ControlAgency,
  FIRE_DETECTION_METHOD_VALUES,
  FIRE_STATUS_VALUES,
  type FireDetectionMethod,
  FireStatus,
  FUEL_TYPE_VALUES,
  type FuelType,
  INCIDENT_LEVEL_VALUES,
  IncidentLevel,
  YES_NO_VALUES,
  type YesNo,
} from './enums';
import { FinalReport } from './final-report';
import { type FirePerimeter, validateFirePerimeter } from './geo-types';
import {
  computeFinancialYear,
  computeGlobalIncidentId,
  INITIAL_REPORT_MS,
  isServerInternal,
  LEVEL_ORDER,
  LIMITS,
  TERMINAL_STATUSES,
  toError,
  validateAdjacentTimestamps,
  withServerInternal,
} from './helpers';
import { SituationReport } from './situation-report';

// Surface the isomorphic perimeter validator's message through Remult's field
// validation. A null/absent perimeter is allowed (allowNull); only a present
// value is checked.
function validateFirePerimeterField(
  _fire: FireIncident,
  e: ValidateFieldEvent<FireIncident, FirePerimeter | null>,
): void {
  if (e.value === null || e.value === undefined) {
    return;
  }
  const result = validateFirePerimeter(e.value);
  if (result !== true) {
    e.error = result;
  }
}

async function fireIncidentSaving(
  fire: FireIncident,
  e: LifecycleEvent<FireIncident>,
): Promise<void> {
  if (e.isNew) {
    await fireIncidentInsertSaving(fire, e);
  } else {
    await fireIncidentUpdateSaving(fire, e);
  }
}

function validateIsMajorFields(
  fire: FireIncident,
  e: LifecycleEvent<FireIncident>,
  now: Date,
): boolean {
  if (!fire.isMajor) {
    return true;
  }
  if (fire.declaredBySource.length === 0) {
    e.fields.declaredBySource.error =
      'declaredBySource is required (1-200 chars) when isMajor is true';
    return false;
  }
  if (!fire.declaredByTimestamp || fire.declaredByTimestamp > now) {
    e.fields.declaredByTimestamp.error =
      'declaredByTimestamp is required and must be <= now when isMajor is true';
    return false;
  }
  return true;
}

async function fireIncidentInsertSaving(
  fire: FireIncident,
  e: LifecycleEvent<FireIncident>,
): Promise<void> {
  const now = new Date();
  const user = remult.user as CurrentUser | undefined;
  if (!user) {
    e.repository.getEntityRef(fire).error = 'Authenticated user required';
    return;
  }
  if (!fire.reportedAt || fire.reportedAt > now) {
    e.fields.reportedAt.error = 'reportedAt is required and must be <= now';
    return;
  }
  const district = await remult.repo(District).findId(fire.districtId);
  if (!district?.isActive) {
    e.fields.districtId.error = 'districtId must reference an active district';
    return;
  }
  const isElevated = remult.isAllowed(Roles.stateOfficer) || remult.isAllowed(Roles.admin);
  if (!isElevated && fire.districtId !== user.districtId) {
    e.fields.districtId.error = 'IncidentEditor can only create fires in their own district';
    return;
  }
  fire.createdBy = user.id;
  fire.financialYear = computeFinancialYear(now);
  fire.fireNumber =
    (await remult.repo(FireIncident).count({
      districtId: fire.districtId,
      financialYear: fire.financialYear,
    })) + 1;
  fire.globalIncidentId = computeGlobalIncidentId(
    fire.financialYear,
    fire.districtId,
    fire.fireNumber,
  );
  fire.statusAsAt = now;
  fire.nextReportDue = new Date(now.getTime() + INITIAL_REPORT_MS);
  fire.isDeleted = false;
  fire.deletionReason = '';
  fire.totalPersonnel = 0;
  fire.totalVehicles = 0;
  fire.totalAircraft = 0;
  if (fire.status === FireStatus.safeOverrun) {
    fire.fireAreaHectares = 0;
  }
  if (!validateIsMajorFields(fire, e, now)) {
    return;
  }
  validateAdjacentTimestamps(fire, e);
}

async function checkLocks(fire: FireIncident, e: LifecycleEvent<FireIncident>): Promise<boolean> {
  const fr = await remult.repo(FinalReport).findFirst({ fireIncidentId: fire.id });
  if (fr?.isSignedOff) {
    e.repository.getEntityRef(fire).error =
      'FireIncident is locked while FinalReport is signed off; call removeSignOff first';
    return false;
  }
  if (e.fields.isDeleted.originalValue === true && fire.isDeleted === true) {
    e.repository.getEntityRef(fire).error =
      'FireIncident is soft-deleted; no further edits permitted';
    return false;
  }
  return true;
}

async function editorOnlyRestrictions(
  fire: FireIncident,
  e: LifecycleEvent<FireIncident>,
  user: CurrentUser,
): Promise<void> {
  if (fire.createdBy !== user.id) {
    e.repository.getEntityRef(fire).error = 'IncidentEditor can only edit fires they created';
    return;
  }
  const sitrepCount = await remult.repo(SituationReport).count({ fireIncidentId: fire.id });
  if (sitrepCount > 0) {
    e.repository.getEntityRef(fire).error =
      'FireIncident cannot be edited after first SituationReport';
    return;
  }
  const finalCount = await remult.repo(FinalReport).count({ fireIncidentId: fire.id });
  if (finalCount > 0) {
    e.repository.getEntityRef(fire).error =
      'FireIncident cannot be edited after FinalReport exists';
  }
}

async function fireIncidentUpdateSaving(
  fire: FireIncident,
  e: LifecycleEvent<FireIncident>,
): Promise<void> {
  const now = new Date();
  const user = remult.user as CurrentUser | undefined;
  if (!user) {
    e.repository.getEntityRef(fire).error = 'Authenticated user required';
    return;
  }
  const internal = isServerInternal();

  if (!internal) {
    const ok = await checkLocks(fire, e);
    if (!ok) {
      return;
    }
  }
  if (e.fields.isMajor.originalValue === true && fire.isMajor === false) {
    e.fields.isMajor.error = 'isMajor is one-way; cannot be set back to false';
    return;
  }
  if (e.fields.status.originalValue !== fire.status) {
    fire.statusAsAt = now;
  }
  if (fire.status === FireStatus.safeOverrun) {
    fire.fireAreaHectares = 0;
  }
  if (!validateIsMajorFields(fire, e, now)) {
    return;
  }
  if (!validateAdjacentTimestamps(fire, e)) {
    return;
  }

  if (internal) {
    return;
  }
  const isElevated = remult.isAllowed(Roles.stateOfficer) || remult.isAllowed(Roles.admin);
  if (isElevated) {
    return;
  }
  await editorOnlyRestrictions(fire, e, user);
}

@Entity<FireIncident>('fireIncidents', {
  allowApiRead: Allow.authenticated,
  allowApiInsert: [Roles.incidentEditor, Roles.stateOfficer, Roles.admin],
  allowApiUpdate: (_fire: FireIncident | undefined, c: Remult | undefined): boolean => {
    if (!c?.user) {
      return false;
    }
    if (c.isAllowed(Roles.admin)) {
      return true;
    }
    if (c.isAllowed(Roles.stateOfficer)) {
      return true;
    }
    if (c.isAllowed(Roles.incidentEditor)) {
      return true;
    }
    return false;
  },
  allowApiDelete: false,
  apiPrefilter: () => {
    const u = remult.user as CurrentUser | undefined;
    if (!u) {
      return { id: ['__never__'] };
    }
    const base = { isDeleted: { '!=': true } };
    if (remult.isAllowed(Roles.admin) || remult.isAllowed(Roles.stateOfficer)) {
      return base;
    }
    return { ...base, districtId: u.districtId ?? -1 };
  },
  defaultOrderBy: { createdAt: 'desc' },
  saving: (fire: FireIncident, e: LifecycleEvent<FireIncident>) => fireIncidentSaving(fire, e),
})
export class FireIncident {
  @Fields.id()
  id = '';

  @Fields.integer({ allowApiUpdate: false })
  financialYear = 0;

  @Fields.integer({ allowApiUpdate: false })
  fireNumber = 0;

  @Fields.integer({ allowApiUpdate: false })
  globalIncidentId = 0;

  @Fields.string({ validate: [Validators.required, Validators.maxLength(LIMITS.name)] })
  name = '';

  @Fields.string({ allowApiUpdate: false })
  createdBy = '';

  @Fields.createdAt()
  createdAt?: Date;

  @Fields.updatedAt()
  updatedAt?: Date;

  @Fields.integer({ validate: Validators.required })
  districtId = 0;

  @Relations.toOne(() => District, 'districtId')
  district?: District;

  @Fields.string({ validate: Validators.maxLength(LIMITS.description) })
  locationDescription = '';

  @Fields.number({
    allowNull: true,
    validate: Validators.range([LIMITS.latitudeMin, LIMITS.latitudeMax]),
  })
  latitude?: number;

  @Fields.number({
    allowNull: true,
    validate: Validators.range([LIMITS.longitudeMin, LIMITS.longitudeMax]),
  })
  longitude?: number;

  @Fields.literal(() => FIRE_STATUS_VALUES, { validate: Validators.required })
  status: FireStatus = FireStatus.going;

  @Fields.date({ allowApiUpdate: false })
  statusAsAt?: Date;

  @Fields.literal(() => INCIDENT_LEVEL_VALUES, { validate: Validators.required })
  incidentLevel: IncidentLevel = IncidentLevel.levelOne;

  @Fields.boolean()
  isMajor = false;

  @Fields.string({ validate: Validators.maxLength(LIMITS.mediumText) })
  declaredBySource = '';

  @Fields.date()
  declaredByTimestamp?: Date;

  @Fields.date({ validate: Validators.required })
  reportedAt?: Date;

  @Fields.date()
  fireStartedAt?: Date;

  @Fields.date()
  fireDetectedAt?: Date;

  @Fields.date()
  firstCrewSentAt?: Date;

  @Fields.date()
  firstCrewArrivedAt?: Date;

  @Fields.literal(() => FIRE_DETECTION_METHOD_VALUES, { allowNull: true })
  detectionMethod?: FireDetectionMethod;

  @Fields.literal(() => CAUSE_SOURCE_VALUES, { allowNull: true })
  causeSource?: CauseSource;

  @Fields.string({ validate: Validators.maxLength(LIMITS.description) })
  causeSourceOther = '';

  @Fields.boolean()
  isCauseConfirmed = false;

  @Fields.literal(() => YES_NO_VALUES, { allowNull: true })
  isLandManagerNotified?: YesNo;

  @Fields.literal(() => YES_NO_VALUES, { allowNull: true })
  isControlAgencyNotified?: YesNo;

  @Fields.boolean()
  isFireMapAttached = false;

  @Fields.literal(() => CONTROL_AGENCY_VALUES, { allowNull: true })
  controlAgency?: ControlAgency;

  @Fields.literal(() => FUEL_TYPE_VALUES, { allowNull: true })
  fuelType?: FuelType;

  @Fields.json<FireIncident, FirePerimeter | null>({
    allowNull: true,
    // Persist as Postgres jsonb (binary, indexable) rather than the json the
    // provider would default to — the perimeter is queried/decoded, never
    // round-tripped as raw text.
    valueConverter: { fieldTypeInDb: 'jsonb' },
    validate: validateFirePerimeterField,
  })
  firePerimeterGeo?: FirePerimeter | null;

  @Fields.number({ allowNull: true, validate: Validators.min(0) })
  fireAreaHectares?: number;

  @Fields.number({ allowNull: true, validate: Validators.min(0) })
  burntAreaHectares?: number;

  @Fields.integer({ allowApiUpdate: false, validate: Validators.min(0) })
  totalPersonnel = 0;

  @Fields.integer({ allowApiUpdate: false, validate: Validators.min(0) })
  totalVehicles = 0;

  @Fields.integer({ allowApiUpdate: false, validate: Validators.min(0) })
  totalAircraft = 0;

  @Fields.date({ allowApiUpdate: false, allowNull: true })
  nextReportDue?: Date | null;

  @Fields.boolean({ allowApiUpdate: false })
  isDeleted = false;

  @Fields.string({ allowApiUpdate: false, validate: Validators.maxLength(LIMITS.description) })
  deletionReason = '';

  @Relations.toMany(() => SituationReport, 'fireIncidentId')
  situationReports?: SituationReport[];

  @Relations.toOne(() => FinalReport, {
    fields: { fireIncidentId: 'id' },
  } as RelationOptions<FireIncident, FinalReport, FireIncident>)
  finalReport?: FinalReport;

  @BackendMethod({ allowed: Allow.authenticated })
  static async getNextFireNumber(districtId: number): Promise<number> {
    const fy = computeFinancialYear(new Date());
    return (await remult.repo(FireIncident).count({ districtId, financialYear: fy })) + 1;
  }

  @BackendMethod({ allowed: [Roles.stateOfficer, Roles.admin] })
  static async escalate(fireId: string, newLevel: IncidentLevel): Promise<void> {
    // must-use-result lacks yield* support; safeTry consumes each Result.
    const result = await safeTry(async function* () {
      // eslint-disable-next-line neverthrow/must-use-result
      const fire = yield* ResultAsync.fromPromise(
        remult.repo(FireIncident).findId(fireId),
        toError,
      );
      if (!fire) {
        return err(new Error('Fire not found'));
      }
      if (fire.isDeleted) {
        return err(new Error('Fire is soft-deleted'));
      }
      // eslint-disable-next-line neverthrow/must-use-result
      const fr = yield* ResultAsync.fromPromise(
        remult.repo(FinalReport).findFirst({ fireIncidentId: fireId }),
        toError,
      );
      if (fr?.isSignedOff) {
        return err(new Error('Fire is signed off; call removeSignOff first'));
      }
      if (LEVEL_ORDER[newLevel] <= LEVEL_ORDER[fire.incidentLevel]) {
        return err(new Error('newLevel must be strictly greater than current level'));
      }
      // eslint-disable-next-line neverthrow/must-use-result
      yield* ResultAsync.fromPromise(
        withServerInternal(() =>
          remult
            .repo(FireIncident)
            .update(fireId, { incidentLevel: newLevel, statusAsAt: new Date() }),
        ),
        toError,
      );
      return ok(undefined);
    });
    result.match(
      () => undefined,
      (e) => {
        throw e;
      },
    );
  }

  @BackendMethod({ allowed: [Roles.stateOfficer, Roles.admin] })
  static async softDelete(fireId: string, reason: string): Promise<void> {
    // must-use-result lacks yield* support; safeTry consumes each Result.
    const result = await safeTry(async function* () {
      if (reason.length < 1 || reason.length > LIMITS.description) {
        return err(new Error('reason must be 1-500 chars'));
      }
      // eslint-disable-next-line neverthrow/must-use-result
      const fire = yield* ResultAsync.fromPromise(
        remult.repo(FireIncident).findId(fireId),
        toError,
      );
      if (!fire) {
        return err(new Error('Fire not found'));
      }
      if (!TERMINAL_STATUSES.includes(fire.status)) {
        return err(new Error('Fire must be in a terminal status to be soft-deleted'));
      }
      // eslint-disable-next-line neverthrow/must-use-result
      const fr = yield* ResultAsync.fromPromise(
        remult.repo(FinalReport).findFirst({ fireIncidentId: fireId }),
        toError,
      );
      if (fr?.isSignedOff) {
        return err(new Error('Fire is signed off; call removeSignOff first'));
      }
      // eslint-disable-next-line neverthrow/must-use-result
      yield* ResultAsync.fromPromise(
        withServerInternal(async () => {
          // Children FIRST (while the parent is still not-deleted), parent LAST —
          // finalReportUpdateSaving rejects any update once parent.isDeleted, even when internal.
          const sitreps = await remult
            .repo(SituationReport)
            .find({ where: { fireIncidentId: fireId } });
          await Promise.all(
            sitreps.map((s) =>
              remult.repo(SituationReport).update(s.id, { isParentDeleted: true }),
            ),
          );
          if (fr) {
            await remult.repo(FinalReport).update(fr.id, { isParentDeleted: true });
          }
          await remult.repo(FireIncident).update(fireId, {
            isDeleted: true,
            deletionReason: reason,
            nextReportDue: null,
          });
        }),
        toError,
      );
      return ok(undefined);
    });
    result.match(
      () => undefined,
      (e) => {
        throw e;
      },
    );
  }
}

export const fireIncidentSchemaExtras: readonly string[] = [
  'ALTER TABLE "fireIncidents" ADD CONSTRAINT "fireIncidents_districtId_financialYear_fireNumber_key" UNIQUE ("districtId", "financialYear", "fireNumber")',
  // biome-ignore lint/security/noSecrets: SQL constraint name, not a secret
  'ALTER TABLE "fireIncidents" ADD CONSTRAINT "fireIncidents_globalIncidentId_key" UNIQUE ("globalIncidentId")',
] as const;
