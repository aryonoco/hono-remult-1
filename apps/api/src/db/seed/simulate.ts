import {
  type CostClass,
  computeNextReportDue,
  type FireStatus,
  type IncidentLevel,
  type InvestigationType,
  type LegalActionStatus,
  MS_PER_DAY,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  type Potential,
  FireStatus as Status,
} from '@workspace/shared-domain';
import tuning from './data/tuning.json';
import {
  type Archetype,
  archetypeOf,
  pickCause,
  pickControlAgency,
  pickDetection,
  pickFuel,
  pickYesNoSkew,
  sampleFireSizeHa,
} from './distributions';
import type { DistrictGeo } from './districts';
import type { LatLng } from './geo';
import { sampleClusteredPoint } from './geo';
import { type NamedLocation, pickNamedLocation } from './names';
import {
  causeSourceOther,
  communityImpact,
  controlProgress,
  declaredBySource,
  deletionReason,
  infrastructureLosses,
  investigationBy,
  otherLosses,
  predictedBehaviour,
  significantEvents,
  signOffRemovedReason,
  strategy,
  weather,
} from './narratives';
import type { Rng, Weighted } from './prng';
import type { FinalReportRow, FireIncidentRow, SituationReportRow } from './rows';
import { ANCHOR } from './seasons';

// Turns one fire into the full record trail an operator would leave behind: the
// initial report, a sequence of situation reports that move the fire toward a
// terminal state, and (often) a final report that may be signed off, have its
// sign-off removed, or — for terminal, unsigned fires — be soft-deleted. Every
// denormalised field the live `saving`/`saved` hooks would compute (parent
// status, totals, area, nextReportDue, statusAsAt, report numbers) is reproduced
// here, so the seeded rows are indistinguishable from real ones. All behavioural
// constants live in tuning.json (aliased `T`).

const T: typeof tuning = tuning;
const TENTHS = 10;

interface Authors {
  readonly creator: string;
  readonly district: readonly string[];
  readonly elevated: readonly string[];
}

interface FireSpec {
  readonly district: DistrictGeo;
  readonly financialYear: number;
  readonly fireNumber: number;
  readonly globalIncidentId: number;
  readonly reportedAt: Date;
  readonly severity: number;
  readonly forceMajor: boolean;
  readonly authors: Authors;
}

interface FireResult {
  readonly fire: FireIncidentRow;
  readonly sitreps: SituationReportRow[];
  readonly finalReport: FinalReportRow | null;
}

// Per-fire context threaded through the builders (keeps parameter lists small).
interface Ctx {
  readonly rng: Rng;
  readonly spec: FireSpec;
  readonly detail: number;
}

type Outcome = 'active' | 'resolved' | 'nonEvent';

interface Plan {
  readonly outcome: Outcome;
  readonly terminal: FireStatus;
  readonly sitrepCount: number;
  readonly level: IncidentLevel;
  readonly major: boolean;
  readonly sizeHa: number;
}

interface Timeline {
  fireStartedAt: Date | null;
  fireDetectedAt: Date | null;
  firstCrewSentAt: Date | null;
  firstCrewArrivedAt: Date | null;
}

interface Resources {
  personnel: number;
  vehicles: number;
  aircraft: number;
}

const GOING_PATH: readonly FireStatus[] = [
  Status.going,
  Status.contained,
  Status.underControlFirst,
  Status.underControlSecond,
  Status.safe,
];

const POTENTIALS: readonly Potential[] = ['low', 'moderate', 'high'];

function weightedFrom<V extends string>(
  raw: readonly { readonly value: string; readonly weight: number }[],
): Weighted<V>[] {
  return raw.map((r): Weighted<V> => ({ value: r.value as V, weight: r.weight }));
}

const NON_EVENT_TERMINAL = weightedFrom<FireStatus>(T.nonEvent.terminal);
const INVESTIGATION_TYPES = weightedFrom<InvestigationType>(T.final.investigationTypes);
const LEGAL_STATUSES = weightedFrom<LegalActionStatus>(T.final.legalStatuses);

function simulateFire(rng: Rng, spec: FireSpec): FireResult {
  const sizeHa = sampleFireSizeHa(rng, spec.severity);
  const plan = planLifecycle(rng, spec, sizeHa);
  const ctx: Ctx = { rng, spec, detail: rng.next() };
  const located = pickNamedLocation(rng, spec.district);
  const point = sampleClusteredPoint(rng, {
    polygon: spec.district.polygon,
    bbox: spec.district.bbox,
    centres: [located.locality],
    jitterDeg: T.fuelJitterDeg,
  });

  const fire = buildInitialFire(ctx, plan, located, point);
  const sitreps = buildSitreps(ctx, fire, plan);
  applyLatestSitrep(fire, sitreps, plan);
  const finalReport = maybeBuildFinalReport(ctx, fire, sitreps, plan);
  return { fire, sitreps, finalReport };
}

function buildInitialFire(
  ctx: Ctx,
  plan: Plan,
  located: NamedLocation,
  point: LatLng,
): FireIncidentRow {
  const { rng, spec, detail } = ctx;
  const archetype = archetypeOf(spec.district.code);
  const createdAt = new Date(
    spec.reportedAt.getTime() +
      rng.int(T.createdDelayMinutes.min, T.createdDelayMinutes.max) * MS_PER_MINUTE,
  );
  const timeline = buildTimeline(rng, spec.reportedAt);
  const initialStatus = plan.outcome === 'nonEvent' ? plan.terminal : Status.going;

  return {
    id: rng.uuid(),
    financialYear: spec.financialYear,
    fireNumber: spec.fireNumber,
    globalIncidentId: spec.globalIncidentId,
    name: located.fireName,
    createdBy: spec.authors.creator,
    createdAt,
    updatedAt: createdAt,
    districtId: spec.district.code,
    locationDescription: locationDescription(rng, located.locality.name, detail),
    latitude: point.lat,
    longitude: point.lng,
    status: initialStatus,
    statusAsAt: createdAt,
    incidentLevel: plan.level,
    isMajor: plan.major,
    declaredBySource: plan.major ? declaredBySource(rng) : '',
    declaredByTimestamp: plan.major
      ? new Date(
          createdAt.getTime() +
            rng.int(T.declaredMinutes.min, T.declaredMinutes.max) * MS_PER_MINUTE,
        )
      : null,
    reportedAt: spec.reportedAt,
    ...timeline,
    ...buildClassification(rng, archetype, plan),
    fireAreaHectares: initialStatus === Status.safeOverrun ? 0 : plan.sizeHa,
    burntAreaHectares: rng.bool(T.burntArea.present)
      ? round1(plan.sizeHa * rng.float(T.burntArea.minFrac, T.burntArea.maxFrac))
      : null,
    totalPersonnel: 0,
    totalVehicles: 0,
    totalAircraft: 0,
    nextReportDue: new Date(createdAt.getTime() + T.initialNextDueMinutes * MS_PER_MINUTE),
    isDeleted: false,
    deletionReason: '',
  };
}

// Detection, cause and initial-response fields for the initial report.
function buildClassification(
  rng: Rng,
  archetype: Archetype,
  plan: Plan,
): Pick<
  FireIncidentRow,
  | 'detectionMethod'
  | 'causeSource'
  | 'causeSourceOther'
  | 'isCauseConfirmed'
  | 'isLandManagerNotified'
  | 'isControlAgencyNotified'
  | 'isFireMapAttached'
  | 'controlAgency'
  | 'fuelType'
> {
  const cause = pickCause(rng, archetype);
  return {
    detectionMethod: pickDetection(rng, archetype),
    causeSource: cause,
    causeSourceOther: cause === 'other' ? causeSourceOther(rng) : '',
    isCauseConfirmed: rng.bool(
      plan.outcome === 'resolved' ? T.causeConfirm.resolvedProb : T.causeConfirm.otherProb,
    ),
    isLandManagerNotified: rng.bool(T.notify.landPresent)
      ? pickYesNoSkew(rng, T.notify.landYes)
      : null,
    isControlAgencyNotified: rng.bool(T.notify.controlPresent)
      ? pickYesNoSkew(rng, T.notify.controlYes)
      : null,
    isFireMapAttached: rng.bool(plan.level === 'levelOne' ? T.fireMap.l1Prob : T.fireMap.otherProb),
    controlAgency: rng.bool(T.controlAgencyPresent) ? pickControlAgency(rng) : null,
    fuelType: pickFuel(rng, archetype),
  };
}

function planLifecycle(rng: Rng, spec: FireSpec, sizeHa: number): Plan {
  const daysToAnchor = (ANCHOR.getTime() - spec.reportedAt.getTime()) / MS_PER_DAY;
  const isActive = daysToAnchor < T.activeWindowDays && rng.bool(T.activeProbability);
  const level = levelFor(rng, sizeHa, spec);
  const major =
    spec.forceMajor ||
    (level !== 'levelOne' && rng.bool(level === 'levelThree' ? T.major.l3Prob : T.major.l2Prob));

  if (!isActive && sizeHa < T.nonEvent.sizeMaxHa && rng.bool(T.nonEvent.probability)) {
    return {
      outcome: 'nonEvent',
      terminal: rng.weighted(NON_EVENT_TERMINAL),
      sitrepCount: rng.int(0, 1),
      level: 'levelOne',
      major: false,
      sizeHa,
    };
  }

  const sitrepCount = sitrepCountFor(rng, level, isActive);
  if (isActive) {
    return { outcome: 'active', terminal: Status.going, sitrepCount, level, major, sizeHa };
  }
  const terminal = rng.bool(T.overrunProbability) ? Status.safeOverrun : Status.safe;
  return {
    outcome: 'resolved',
    terminal,
    sitrepCount: Math.max(1, sitrepCount),
    level,
    major,
    sizeHa,
  };
}

function levelFor(rng: Rng, sizeHa: number, spec: FireSpec): IncidentLevel {
  if (
    spec.forceMajor ||
    sizeHa > T.level.l3SizeHa ||
    (spec.severity > T.level.l3Severity && rng.bool(T.level.l3HighSevProb))
  ) {
    return rng.bool(T.level.l3WhenBigProb) ? 'levelThree' : 'levelTwo';
  }
  if (
    sizeHa > T.level.l2SizeHa ||
    (spec.severity > T.level.l2Severity && rng.bool(T.level.l2Prob))
  ) {
    return 'levelTwo';
  }
  return 'levelOne';
}

function sitrepCountFor(rng: Rng, level: IncidentLevel, isActive: boolean): number {
  if (level === 'levelThree') {
    return rng.int(
      isActive ? T.sitrepCount.l3ActiveMin : T.sitrepCount.l3ResolvedMin,
      T.sitrepCount.l3Max,
    );
  }
  if (level === 'levelTwo') {
    return rng.int(
      isActive ? T.sitrepCount.l2ActiveMin : T.sitrepCount.l2ResolvedMin,
      T.sitrepCount.l2Max,
    );
  }
  return rng.int(0, T.sitrepCount.l1Max);
}

function buildTimeline(rng: Rng, reportedAt: Date): Timeline {
  const t = reportedAt.getTime();
  const tl = T.timelineMinutes;
  // Chain: started <= detected <= reported <= crew sent <= crew arrived.
  const fireDetectedAt = rng.bool(tl.detectedProb)
    ? new Date(t - rng.int(tl.detectedMin, tl.detectedMax) * MS_PER_MINUTE)
    : null;
  const fireStartedAt =
    fireDetectedAt && rng.bool(tl.startedProb)
      ? new Date(fireDetectedAt.getTime() - rng.int(tl.startedMin, tl.startedMax) * MS_PER_MINUTE)
      : null;
  const firstCrewSentAt = rng.bool(tl.crewSentProb)
    ? new Date(t + rng.int(tl.crewSentMin, tl.crewSentMax) * MS_PER_MINUTE)
    : null;
  const firstCrewArrivedAt =
    firstCrewSentAt && rng.bool(tl.crewArrivedProb)
      ? new Date(
          firstCrewSentAt.getTime() + rng.int(tl.crewArrivedMin, tl.crewArrivedMax) * MS_PER_MINUTE,
        )
      : null;
  return { fireStartedAt, fireDetectedAt, firstCrewSentAt, firstCrewArrivedAt };
}

function buildSitreps(ctx: Ctx, fire: FireIncidentRow, plan: Plan): SituationReportRow[] {
  const { rng, spec, detail } = ctx;
  const sitreps: SituationReportRow[] = [];
  if (plan.sitrepCount === 0) {
    return sitreps;
  }
  const statuses = statusSequence(plan);
  let cursor =
    fire.createdAt.getTime() +
    rng.int(T.sitrep.firstMinMinutes, T.sitrep.firstMaxMinutes) * MS_PER_MINUTE;
  let area = plan.sizeHa * rng.float(T.sitrep.initialAreaMinFrac, T.sitrep.initialAreaMaxFrac);

  for (let i = 0; i < plan.sitrepCount; i++) {
    const status = statuses[i] ?? statuses[statuses.length - 1] ?? Status.going;
    area =
      status === Status.going
        ? Math.min(
            plan.sizeHa,
            area * rng.float(T.sitrep.areaGrowthMin, T.sitrep.areaGrowthMax) +
              rng.float(0, T.sitrep.areaGrowthAddMax),
          )
        : plan.sizeHa;
    const submittedAt = new Date(cursor);
    const resources = resourcesFor(rng, plan.level, status);

    sitreps.push({
      id: rng.uuid(),
      fireIncidentId: fire.id,
      reportNumber: i + 1,
      districtId: spec.district.code,
      isParentDeleted: false,
      fireName: fire.name,
      status,
      fireAreaHectares: status === Status.safeOverrun ? 0 : round1(area),
      weatherConditions: weather(rng, spec.severity, detail),
      currentStrategy: strategy(rng, status, detail),
      significantEvents: significantEvents(rng, detail),
      predictedBehaviour: predictedBehaviour(rng, spec.severity, detail),
      controlProgress: controlProgress(rng, detail),
      communityImpact: communityImpact(rng, spec.severity, detail),
      potentialLoss: rng.bool(T.sitrep.potentialPresentProb) ? rng.pick(POTENTIALS) : null,
      potentialSpread: rng.bool(T.sitrep.potentialPresentProb) ? rng.pick(POTENTIALS) : null,
      personnel: resources.personnel,
      vehicles: resources.vehicles,
      aircraft: resources.aircraft,
      submittedBy: pickAuthor(rng, spec.authors),
      submittedAt,
      createdAt: submittedAt,
    });

    cursor += sitrepInterval(rng, status);
  }
  return sitreps;
}

function statusSequence(plan: Plan): readonly FireStatus[] {
  if (plan.outcome === 'active') {
    const reach = Math.min(plan.sitrepCount, T.sitrep.activeReachMax);
    return GOING_PATH.slice(0, Math.max(1, reach)).filter((s) => s !== Status.safe);
  }
  const steps: FireStatus[] = [];
  const interior = GOING_PATH.slice(0, GOING_PATH.length - 1);
  for (let i = 0; i < plan.sitrepCount - 1; i++) {
    steps.push(interior[Math.min(i, interior.length - 1)] ?? Status.going);
  }
  steps.push(plan.terminal);
  return steps;
}

function resourcesFor(rng: Rng, level: IncidentLevel, status: FireStatus): Resources {
  const winding = status !== Status.going && status !== Status.contained;
  if (level === 'levelThree') {
    const r = T.resources.l3;
    const personnel = winding ? rng.int(r.windMin, r.windMax) : rng.int(r.peakMin, r.peakMax);
    return {
      personnel,
      vehicles: rng.int(r.vehMin, r.vehMax),
      aircraft: rng.int(r.airMin, r.airMax),
    };
  }
  if (level === 'levelTwo') {
    const r = T.resources.l2;
    const personnel = winding ? rng.int(r.windMin, r.windMax) : rng.int(r.peakMin, r.peakMax);
    return {
      personnel,
      vehicles: rng.int(r.vehMin, r.vehMax),
      aircraft: rng.int(r.airMin, r.airMax),
    };
  }
  const r = T.resources.l1;
  return {
    personnel: rng.int(r.persMin, r.persMax),
    vehicles: rng.int(r.vehMin, r.vehMax),
    aircraft: rng.bool(r.airProb) ? rng.int(r.airMin, r.airMax) : 0,
  };
}

function sitrepInterval(rng: Rng, status: FireStatus): number {
  const h = T.sitrep.intervalHours;
  if (status === Status.going) {
    return rng.int(h.goingMin, h.goingMax) * MS_PER_HOUR;
  }
  if (status === Status.contained) {
    return rng.int(h.containedMin, h.containedMax) * MS_PER_HOUR;
  }
  return rng.int(h.otherMin, h.otherMax) * MS_PER_HOUR;
}

// Replicate the SituationReport `saved` hook: the latest sitrep drives the
// parent's status, totals, area, statusAsAt and nextReportDue.
function applyLatestSitrep(
  fire: FireIncidentRow,
  sitreps: readonly SituationReportRow[],
  plan: Plan,
): void {
  const last = sitreps[sitreps.length - 1];
  if (last === undefined) {
    return;
  }
  const prev = sitreps[sitreps.length - 2];
  fire.status = last.status;
  fire.totalPersonnel = last.personnel;
  fire.totalVehicles = last.vehicles;
  fire.totalAircraft = last.aircraft;
  if (last.fireAreaHectares !== null) {
    fire.fireAreaHectares = last.fireAreaHectares;
  }
  fire.statusAsAt = last.submittedAt;
  fire.nextReportDue = computeNextReportDue({
    previousStatus: prev?.status ?? Status.going,
    newStatus: last.status,
    prevLoss: prev?.potentialLoss,
    prevSpread: prev?.potentialSpread,
    newLoss: last.potentialLoss,
    newSpread: last.potentialSpread,
    now: last.submittedAt,
  });
  fire.updatedAt = last.submittedAt;
  if (plan.outcome === 'active' && fire.nextReportDue === null) {
    fire.nextReportDue = new Date(last.submittedAt.getTime() + T.activeNextDueHours * MS_PER_HOUR);
  }
}

function maybeBuildFinalReport(
  ctx: Ctx,
  fire: FireIncidentRow,
  sitreps: SituationReportRow[],
  plan: Plan,
): FinalReportRow | null {
  const { rng } = ctx;
  if (plan.outcome !== 'resolved') {
    return null;
  }
  const fileProbability = plan.level === 'levelOne' ? T.final.fileL1Prob : T.final.fileOtherProb;
  const lastSitrep = sitreps[sitreps.length - 1];
  const closedAt = lastSitrep
    ? new Date(
        lastSitrep.submittedAt.getTime() +
          rng.int(T.final.closeMinDays, T.final.closeMaxDays) * MS_PER_DAY,
      )
    : new Date(
        fire.createdAt.getTime() +
          rng.int(T.final.closeMinDays, T.final.closeNoSitrepMaxDays) * MS_PER_DAY,
      );

  if (!rng.bool(fileProbability)) {
    if (rng.bool(T.final.unsignedSoftDeleteProb)) {
      softDelete(fire, sitreps, rng, closedAt);
    }
    return null;
  }

  const fr = buildFinalReport(ctx, fire, plan, closedAt);
  if (fr.isSignedOff) {
    fire.nextReportDue = null;
    if (rng.bool(T.final.signOffRemovedProb)) {
      removeSignOff(ctx, fire, fr, sitreps);
    }
  } else if (rng.bool(T.final.resolvedSoftDeleteProb)) {
    softDelete(fire, sitreps, rng, closedAt);
    return null;
  }
  return fr;
}

function buildFinalReport(
  ctx: Ctx,
  fire: FireIncidentRow,
  plan: Plan,
  closedAt: Date,
): FinalReportRow {
  const { rng, spec, detail } = ctx;
  const area = plan.sizeHa;
  const big = area > T.final.bigFireHa;
  const signed = rng.bool(T.final.signedProbability);
  const deliberate = fire.causeSource === 'deliberateLightingMalicious';

  return {
    id: rng.uuid(),
    fireIncidentId: fire.id,
    districtId: spec.district.code,
    isParentDeleted: false,
    stockLost:
      big && rng.bool(T.final.stockProb) ? rng.int(0, T.final.stockMax) : nullableZero(rng),
    homesLost:
      big && rng.bool(T.final.homesProb) ? rng.int(0, T.final.homesMax) : nullableZero(rng),
    shedsLost:
      big && rng.bool(T.final.shedsProb) ? rng.int(0, T.final.shedsMax) : nullableZero(rng),
    fencingLostKm:
      big && rng.bool(T.final.fencingProb) ? round1(rng.float(0, T.final.fencingMax)) : null,
    cropLossHectares:
      big && rng.bool(T.final.cropProb) ? round1(rng.float(0, T.final.cropMax)) : null,
    infrastructureLosses: infrastructureLosses(rng, detail),
    otherLosses: otherLosses(rng, detail),
    investigationType: rng.bool(T.final.investigationPresentProb)
      ? rng.weighted(INVESTIGATION_TYPES)
      : null,
    investigationBy: rng.bool(T.final.investigationByProb) ? investigationBy(rng) : '',
    isOffenceSuspected: deliberate
      ? rng.bool(T.final.offenceDeliberateProb)
      : rng.bool(T.final.offenceDefaultProb),
    legalActionStatus: legalStatusFor(rng, deliberate),
    costClass: costClassFor(rng, area),
    ...burntLandBreakdown(rng, fire, area),
    isSignedOff: signed,
    signedOffAt: signed
      ? new Date(closedAt.getTime() + rng.int(0, T.final.signDelayMaxDays) * MS_PER_DAY)
      : null,
    signedOffBy: signed ? rng.pick(spec.authors.district) : '',
    signOffRemovedAt: null,
    signOffRemovedBy: '',
    signOffRemovedReason: '',
    createdBy: rng.pick(spec.authors.district),
    createdAt: closedAt,
    updatedAt: closedAt,
  };
}

function legalStatusFor(rng: Rng, deliberate: boolean): LegalActionStatus | null {
  if (deliberate) {
    return rng.weighted(LEGAL_STATUSES);
  }
  return rng.bool(T.final.legalNoActionProb) ? 'noAction' : null;
}

function burntLandBreakdown(
  rng: Rng,
  fire: FireIncidentRow,
  area: number,
): Pick<
  FinalReportRow,
  | 'burntStateForest'
  | 'burntNationalPark'
  | 'burntPrivateProperty'
  | 'burntPlantation'
  | 'burntOther'
> {
  const b = T.burntLand;
  const forestHeavy = fire.fuelType === 'forest' || fire.fuelType === 'woodland';
  const stateForest = forestHeavy
    ? rng.float(b.forestSfMin, b.forestSfMax)
    : rng.float(b.nonForestSfMin, b.nonForestSfMax);
  const nationalPark = rng.float(b.npMin, b.npMax);
  const plantation =
    fire.fuelType === 'pine'
      ? rng.float(b.pinePlantMin, b.pinePlantMax)
      : rng.float(b.nonPinePlantMin, b.nonPinePlantMax);
  const privateProp = rng.float(b.privMin, b.privMax);
  const other = Math.max(0, 1 - (stateForest + nationalPark + plantation + privateProp));
  return {
    burntStateForest: rng.bool(b.sfPresent) ? round1(area * stateForest) : null,
    burntNationalPark: rng.bool(b.npPresent) ? round1(area * nationalPark) : null,
    burntPrivateProperty: rng.bool(b.privPresent) ? round1(area * privateProp) : null,
    burntPlantation: rng.bool(b.plantPresent) ? round1(area * plantation) : null,
    burntOther: rng.bool(b.otherPresent) ? round1(area * other) : null,
  };
}

function removeSignOff(
  ctx: Ctx,
  fire: FireIncidentRow,
  fr: FinalReportRow,
  sitreps: readonly SituationReportRow[],
): void {
  const { rng, spec } = ctx;
  fr.isSignedOff = false;
  const removedAt = new Date(
    (fr.signedOffAt ?? fr.createdAt).getTime() +
      rng.int(T.removeSignOffDays.min, T.removeSignOffDays.max) * MS_PER_DAY,
  );
  fr.signOffRemovedAt = removedAt;
  // Only state officers / admins can remove a sign-off.
  fr.signOffRemovedBy =
    spec.authors.elevated.length > 0 ? rng.pick(spec.authors.elevated) : spec.authors.creator;
  fr.signOffRemovedReason = signOffRemovedReason(rng);
  fr.updatedAt = removedAt;
  const last = sitreps[sitreps.length - 1];
  const prev = sitreps[sitreps.length - 2];
  fire.nextReportDue = last
    ? computeNextReportDue({
        previousStatus: prev?.status ?? fire.status,
        newStatus: last.status,
        prevLoss: prev?.potentialLoss,
        prevSpread: prev?.potentialSpread,
        newLoss: last.potentialLoss,
        newSpread: last.potentialSpread,
        now: removedAt,
      })
    : new Date(removedAt.getTime() + T.initialNextDueMinutes * MS_PER_MINUTE);
  fire.updatedAt = removedAt;
}

function softDelete(
  fire: FireIncidentRow,
  sitreps: SituationReportRow[],
  rng: Rng,
  at: Date,
): void {
  fire.isDeleted = true;
  fire.deletionReason = deletionReason(rng);
  fire.nextReportDue = null;
  fire.updatedAt = at;
  for (const s of sitreps) {
    s.isParentDeleted = true;
  }
}

function pickAuthor(rng: Rng, authors: Authors): string {
  if (rng.bool(T.sameAuthorProb)) {
    return authors.creator;
  }
  return authors.district.length > 0 ? rng.pick(authors.district) : authors.creator;
}

function costClassFor(rng: Rng, area: number): CostClass {
  if (area > T.cost.veryBigHa) {
    return 'hundredThousandOrGreater';
  }
  if (area > T.cost.bigHa) {
    return rng.pick(['fiftyThousandToNinetyNineNineNineNine', 'hundredThousandOrGreater']);
  }
  if (area > T.cost.medHa) {
    return rng.pick(['tenThousandToNineteenNineNineNine', 'twentyThousandToFortyNineNineNineNine']);
  }
  if (area > T.cost.smallHa) {
    return rng.pick(['thousandToFourNineNineNine', 'fiveThousandToNineNineNineNine']);
  }
  return rng.pick(['lessThanThousand', 'thousandToFourNineNineNine']);
}

function locationDescription(rng: Rng, locality: string, detail: number): string {
  if (rng.next() > detail * T.location.presentFactor) {
    return '';
  }
  const bearing = rng.pick(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
  return `Approx ${rng.int(T.location.minKm, T.location.maxKm)} km ${bearing} of ${locality}.`;
}

function nullableZero(rng: Rng): number | null {
  return rng.bool(T.nullableZeroProb) ? 0 : null;
}

function round1(n: number): number {
  return Math.round(n * TENTHS) / TENTHS;
}

export { type Authors, type FireResult, type FireSpec, simulateFire };
