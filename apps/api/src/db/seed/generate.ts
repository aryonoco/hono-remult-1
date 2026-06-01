import {
  CAUSE_SOURCE_VALUES,
  type CurrentUser,
  computeFinancialYear,
  computeGlobalIncidentId,
  computeNextReportDue,
  DEV_USERS,
  DISTRICT_OPERATORS,
  FIRE_STATUS_VALUES,
  type FireStatus,
  FUEL_TYPE_VALUES,
  type FuelType,
  LEGAL_ACTION_STATUS_VALUES,
  MS_PER_DAY,
  MS_PER_HOUR,
  Roles,
  STATE_OPERATORS,
  FireStatus as Status,
} from '@workspace/shared-domain';
import tuning from './data/tuning.json';
import { ALL_DISTRICTS, districtByCode } from './districts';
import type { Rng, Weighted } from './prng';
import type { FixtureDataset, SituationReportRow } from './rows';
import {
  DATA_HORIZON,
  DISTRICT_SHARE_WEIGHTS,
  type EventCluster,
  financialYearOf,
  monthWeightFor,
  PEAK_MONTH_WEIGHT,
  ROLLING_ACTIVE,
  SEASONS,
  sampleClusterDate,
  sampleSeasonDate,
} from './seasons';
import { type Authors, type FireResult, type FireSpec, simulateFire } from './simulate';

// Default seed for the fixtures. Fixed so every build produces identical data.
const DEFAULT_SEED = 0x46_49_52_45; // "FIRE"

const HOURS_PER_DAY = 24;

// The first few rolling-active fires deterministically carry each interim status
// so the live set exercises the full going -> contained -> underControl
// progression and covers those enum values without retargeting any historical
// fire.
const ACTIVE_INTERIM_STATUSES: readonly FireStatus[] = [
  Status.going,
  Status.contained,
  Status.underControlFirst,
  Status.underControlSecond,
];

interface AuthorPools {
  readonly byDistrict: ReadonlyMap<number, readonly string[]>;
  readonly elevated: readonly string[];
}

// Shared environment threaded through the emit helpers (keeps params small).
interface GenEnv {
  readonly dataset: FixtureDataset;
  readonly rng: Rng;
  readonly allocator: FireNumberAllocator;
  readonly pools: AuthorPools;
  // Injected reference "now": the real wall-clock in production, a pinned date
  // in tests. The rolling-active overlay is anchored to it.
  readonly now: Date;
}

interface FireArgs {
  readonly districtCode: number;
  readonly reportedAt: Date;
  readonly severity: number;
  readonly forceMajor: boolean;
  readonly forceActive: boolean;
}

interface DatasetSummary {
  readonly fires: number;
  readonly sitreps: number;
  readonly finalReports: number;
  readonly active: number;
  readonly activeOverdue: number;
  readonly activeUpcoming: number;
  readonly softDeleted: number;
  readonly signedOff: number;
  readonly signOffRemoved: number;
  readonly major: number;
  readonly perSeason: ReadonlyMap<number, number>;
}

class FireNumberAllocator {
  private readonly counters = new Map<string, number>();

  next(districtCode: number, financialYear: number): number {
    const key = `${districtCode}:${financialYear}`;
    const value = (this.counters.get(key) ?? 0) + 1;
    this.counters.set(key, value);
    return value;
  }
}

function hasRole(user: CurrentUser, role: string): boolean {
  return user.roles?.includes(role) ?? false;
}

function buildAuthorPools(): AuthorPools {
  const byDistrict = new Map<number, string[]>();
  for (const d of ALL_DISTRICTS) {
    byDistrict.set(d.code, []);
  }
  for (const op of DISTRICT_OPERATORS) {
    if (op.districtId !== null) {
      byDistrict.get(op.districtId)?.push(op.id);
    }
  }
  // The dev incident-editors are real authors for their districts too.
  for (const u of DEV_USERS) {
    if (u.districtId !== null && hasRole(u, Roles.incidentEditor)) {
      byDistrict.get(u.districtId)?.push(u.id);
    }
  }
  const elevated = [
    ...STATE_OPERATORS.map((o) => o.id),
    ...DEV_USERS.filter((u) => hasRole(u, Roles.admin) || hasRole(u, Roles.stateOfficer)).map(
      (u) => u.id,
    ),
  ];
  return { byDistrict, elevated };
}

function normalisedShares(): ReadonlyMap<number, number> {
  const total = [...DISTRICT_SHARE_WEIGHTS.values()].reduce((s, w) => s + w, 0);
  const shares = new Map<number, number>();
  for (const [code, weight] of DISTRICT_SHARE_WEIGHTS) {
    shares.set(code, weight / total);
  }
  return shares;
}

function authorsFor(rng: Rng, pools: AuthorPools, districtCode: number): Authors {
  const district = pools.byDistrict.get(districtCode) ?? [];
  // Mostly a local editor files the report; occasionally a state officer does
  // (cross-district / the elevated "create anywhere" path).
  const creator =
    district.length === 0 || rng.bool(tuning.elevatedCreateProb)
      ? rng.pick(pools.elevated)
      : rng.pick(district);
  return { creator, district, elevated: pools.elevated };
}

function emitFire(env: GenEnv, args: FireArgs): FireResult {
  const { dataset, rng, allocator, pools } = env;
  const district = districtByCode(args.districtCode);
  const financialYear = computeFinancialYear(args.reportedAt);
  const fireNumber = allocator.next(args.districtCode, financialYear);
  const spec: FireSpec = {
    district,
    financialYear,
    fireNumber,
    globalIncidentId: computeGlobalIncidentId(financialYear, args.districtCode, fireNumber),
    reportedAt: args.reportedAt,
    severity: args.severity,
    forceMajor: args.forceMajor,
    forceActive: args.forceActive,
    now: env.now,
    authors: authorsFor(rng, pools, args.districtCode),
  };
  const result = simulateFire(rng, spec);
  dataset.fires.push(result.fire);
  dataset.sitreps.push(...result.sitreps);
  if (result.finalReport !== null) {
    dataset.finalReports.push(result.finalReport);
  }
  return result;
}

function emitCluster(env: GenEnv, cluster: EventCluster): void {
  for (let i = 0; i < cluster.count; i++) {
    emitFire(env, {
      districtCode: cluster.districtCode,
      reportedAt: sampleClusterDate(env.rng, cluster, DATA_HORIZON),
      severity: clamp01(
        cluster.severity +
          env.rng.float(-tuning.clusterSeverityJitter, tuning.clusterSeverityJitter),
      ),
      forceMajor: env.rng.bool(cluster.majorShare),
      forceActive: false,
    });
  }
}

function generateDataset(rng: Rng, now: Date = new Date()): FixtureDataset {
  const env: GenEnv = {
    dataset: { fires: [], sitreps: [], finalReports: [] },
    rng,
    allocator: new FireNumberAllocator(),
    pools: buildAuthorPools(),
    now,
  };
  const shares = normalisedShares();

  // Pass 1 — the deterministic seasonal base. Every fire across FY2018-FY2029
  // gets a complete resolved lifecycle; report dates are sampled inside their
  // financial year (clamped to the data horizon), so no historical season holds
  // dangling active state.
  for (const season of SEASONS) {
    for (const district of ALL_DISTRICTS) {
      const count = Math.round(season.statewide * (shares.get(district.code) ?? 0));
      for (let i = 0; i < count; i++) {
        emitFire(env, {
          districtCode: district.code,
          reportedAt: sampleSeasonDate(rng, season.fy, DATA_HORIZON),
          severity: clamp01(
            season.severity + rng.float(-tuning.severityJitter, tuning.severityJitter),
          ),
          forceMajor: false,
          forceActive: false,
        });
      }
    }
    for (const cluster of season.clusters) {
      emitCluster(env, cluster);
    }
  }

  // Pass 2 — the rolling-active overlay, anchored to `now`.
  emitRollingActive(env);

  ensureEnumCoverage(env.dataset);
  return env.dataset;
}

// Deterministically generate the seasonally-scaled handful of genuinely-active
// fires around `now`. The count tracks the reference month's fire intensity
// (summer-peak, winter-low) with a small floor so the live view is never empty.
// Each fire ignited in the recent past and most carry a *future* nextReportDue,
// so an overdue report is the exception rather than the rule (the DASH-3 fix).
function emitRollingActive(env: GenEnv): void {
  const { rng, now } = env;
  const currentFy = financialYearOf(now);
  const season = SEASONS.find((s) => s.fy === currentFy);
  if (season === undefined) {
    return;
  }
  const count = rollingActiveCount(now);
  // A fixed minority fall due in the past (rounded from overdueShare), so overdue
  // is exercised but stays the exception however small the seasonal set is.
  const overdueCount = Math.round(count * ROLLING_ACTIVE.overdueShare);
  const districtPicker = activeDistrictWeights();
  for (let i = 0; i < count; i++) {
    const districtCode = rng.weighted(districtPicker);
    const reportedAt = activeReportedAt(rng, now);
    const result = emitFire(env, {
      districtCode,
      reportedAt,
      severity: clamp01(season.severity + rng.float(-tuning.severityJitter, tuning.severityJitter)),
      forceMajor: false,
      forceActive: true,
    });
    // The first fires deterministically carry each interim status so the live
    // set exercises the full going -> contained -> underControl progression and
    // covers those enum values without retargeting any historical fire.
    const forced = ACTIVE_INTERIM_STATUSES[i];
    if (forced !== undefined) {
      retargetActiveTail(result, forced);
    }
    result.fire.nextReportDue = activeNextReportDue(rng, now, i < overdueCount);
  }
}

// Re-point an active fire's denormalised status to `status` (and its last sitrep,
// when present), preserving its now-anchored timeline, so the rolling set covers
// every interim FireStatus deterministically. Active fires always have at least
// one sitrep (see planLifecycle), so the parent and its latest report stay
// consistent.
function retargetActiveTail(result: FireResult, status: FireStatus): void {
  result.fire.status = status;
  const last = result.sitreps[result.sitreps.length - 1];
  if (last !== undefined) {
    last.status = status;
    result.fire.statusAsAt = last.submittedAt;
  }
}

// Active count = peakCount scaled by the reference month's share of the peak
// monthly weight, floored so deep winter still shows a handful.
function rollingActiveCount(now: Date): number {
  const month = now.getUTCMonth() + 1;
  const scaled = Math.round((ROLLING_ACTIVE.peakCount * monthWeightFor(month)) / PEAK_MONTH_WEIGHT);
  return Math.max(ROLLING_ACTIVE.floorCount, scaled);
}

// Ignition in the recent past (days before `now`), so the fire is genuinely
// burning now rather than a stale record.
function activeReportedAt(rng: Rng, now: Date): Date {
  const ageDays = rng.int(ROLLING_ACTIVE.ageDaysMin, ROLLING_ACTIVE.ageDaysMax);
  const extraHours = rng.int(0, HOURS_PER_DAY - 1);
  return new Date(now.getTime() - ageDays * MS_PER_DAY - extraHours * MS_PER_HOUR);
}

// An `overdue` report fell due a few hours ago; otherwise the next report is due
// a little way into the future. The caller decides which (a fixed minority are
// overdue) so the dashboard's overdue state is exercised but stays rare.
function activeNextReportDue(rng: Rng, now: Date, overdue: boolean): Date {
  if (overdue) {
    const lag = rng.int(ROLLING_ACTIVE.overdueLagHoursMin, ROLLING_ACTIVE.overdueLagHoursMax);
    return new Date(now.getTime() - lag * MS_PER_HOUR);
  }
  const lead = rng.int(ROLLING_ACTIVE.upcomingLeadHoursMin, ROLLING_ACTIVE.upcomingLeadHoursMax);
  return new Date(now.getTime() + lead * MS_PER_HOUR);
}

// Weighted district list for active fires, mirroring the statewide share split.
function activeDistrictWeights(): readonly Weighted<number>[] {
  return ALL_DISTRICTS.map((d) => ({
    value: d.code,
    weight: DISTRICT_SHARE_WEIGHTS.get(d.code) ?? 1,
  }));
}

// A few enum values never arise from the realistic draws (spinifex/buttongrass
// fuels don't occur here; some rare causes and legal statuses sit outside the
// archetype mixes; underControlSecond is only ever an interim sitrep status, not
// a fire's final state). The showcase wants every value to appear at least once,
// so we backfill the missing ones onto plausible existing records — each is
// still a value an operator could legitimately have entered — using a fixed scan
// order so the result stays deterministic.
function ensureEnumCoverage(dataset: FixtureDataset): void {
  const cov = tuning.coverage;
  // Edge fuels are placed in the only country where they are conceivable.
  setFuelOnDistrict(dataset, 'spinifex', cov.spinifexDistricts, cov.fuelCount);
  setFuelOnDistrict(dataset, 'buttongrass', cov.buttongrassDistricts, cov.fuelCount);
  backfillFuel(dataset);
  backfillCause(dataset);
  backfillLegalStatus(dataset);
  backfillParentStatus(dataset);
}

function setFuelOnDistrict(
  dataset: FixtureDataset,
  fuel: FuelType,
  districtCodes: readonly number[],
  count: number,
): void {
  let applied = 0;
  for (const fire of dataset.fires) {
    if (applied >= count) {
      return;
    }
    if (districtCodes.includes(fire.districtId) && fire.fuelType !== fuel) {
      fire.fuelType = fuel;
      applied++;
    }
  }
}

function backfillFuel(dataset: FixtureDataset): void {
  const present = new Set(dataset.fires.map((f) => f.fuelType));
  const missing = FUEL_TYPE_VALUES.filter((v) => !present.has(v));
  assignToFires(dataset, missing, (fire, fuel) => {
    fire.fuelType = fuel;
  });
}

function backfillCause(dataset: FixtureDataset): void {
  const present = new Set(dataset.fires.map((f) => f.causeSource));
  const missing = CAUSE_SOURCE_VALUES.filter((v) => !present.has(v));
  assignToFires(dataset, missing, (fire, cause) => {
    fire.causeSource = cause;
    fire.causeSourceOther =
      cause === 'other' ? 'Cause recorded under "other"; see incident notes.' : '';
  });
}

// Assign each missing value to a distinct, non-deleted fire in scan order.
function assignToFires<V>(
  dataset: FixtureDataset,
  missing: readonly V[],
  apply: (fire: FixtureDataset['fires'][number], value: V) => void,
): void {
  let i = 0;
  for (const fire of dataset.fires) {
    const value = missing[i];
    if (value === undefined) {
      return;
    }
    if (!fire.isDeleted) {
      apply(fire, value);
      i++;
    }
  }
}

function backfillLegalStatus(dataset: FixtureDataset): void {
  const present = new Set(dataset.finalReports.map((fr) => fr.legalActionStatus));
  const missing = LEGAL_ACTION_STATUS_VALUES.filter((v) => !present.has(v));
  let i = 0;
  for (const fr of dataset.finalReports) {
    const status = missing[i];
    if (status === undefined) {
      return;
    }
    fr.legalActionStatus = status;
    fr.isOffenceSuspected = true;
    i++;
  }
}

// underControlSecond (and any other status a run happened to miss) never becomes
// a fire's *current* status naturally. Rewrite the tail of an active fire so its
// last sitrep and the denormalised parent status both carry the missing value,
// keeping the records internally consistent.
function backfillParentStatus(dataset: FixtureDataset): void {
  const present = new Set<string>(dataset.fires.map((f) => f.status));
  const missing = FIRE_STATUS_VALUES.filter((s) => !present.has(s));
  if (missing.length === 0) {
    return;
  }
  const sitrepsByFire = new Map<string, SituationReportRow[]>();
  for (const s of dataset.sitreps) {
    const list = sitrepsByFire.get(s.fireIncidentId);
    if (list === undefined) {
      sitrepsByFire.set(s.fireIncidentId, [s]);
    } else {
      list.push(s);
    }
  }
  const hasFinal = new Set(dataset.finalReports.map((fr) => fr.fireIncidentId));
  let i = 0;
  for (const fire of dataset.fires) {
    const status = missing[i];
    if (status === undefined) {
      return;
    }
    const reps = sitrepsByFire.get(fire.id);
    if (fire.isDeleted || hasFinal.has(fire.id) || isTerminal(fire.status) || !reps?.length) {
      continue;
    }
    retargetStatus(fire, reps, status);
    i++;
  }
}

function retargetStatus(
  fire: FixtureDataset['fires'][number],
  reps: readonly SituationReportRow[],
  status: FireStatus,
): void {
  const last = reps[reps.length - 1];
  const prev = reps[reps.length - 2];
  if (last === undefined) {
    return;
  }
  last.status = status;
  fire.status = status;
  fire.statusAsAt = last.submittedAt;
  if (status === Status.safeOverrun) {
    last.fireAreaHectares = 0;
    fire.fireAreaHectares = 0;
  }
  fire.nextReportDue = computeNextReportDue({
    previousStatus: prev?.status ?? Status.going,
    newStatus: status,
    prevLoss: prev?.potentialLoss,
    prevSpread: prev?.potentialSpread,
    newLoss: last.potentialLoss,
    newSpread: last.potentialSpread,
    now: last.submittedAt,
  });
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

function isTerminal(status: string): boolean {
  return (
    status === 'safe' ||
    status === 'safeOverrun' ||
    status === 'safeNotFound' ||
    status === 'safeFalseAlarm' ||
    status === 'notFound'
  );
}

function isActiveFire(f: FixtureDataset['fires'][number]): boolean {
  return !f.isDeleted && f.nextReportDue !== null && !isTerminal(f.status);
}

function summarise(dataset: FixtureDataset, now: Date = new Date()): DatasetSummary {
  const perSeason = new Map<number, number>();
  for (const f of dataset.fires) {
    perSeason.set(f.financialYear, (perSeason.get(f.financialYear) ?? 0) + 1);
  }
  const active = dataset.fires.filter(isActiveFire);
  const activeOverdue = active.filter(
    (f) => f.nextReportDue !== null && f.nextReportDue.getTime() < now.getTime(),
  ).length;
  return {
    fires: dataset.fires.length,
    sitreps: dataset.sitreps.length,
    finalReports: dataset.finalReports.length,
    active: active.length,
    activeOverdue,
    activeUpcoming: active.length - activeOverdue,
    softDeleted: dataset.fires.filter((f) => f.isDeleted).length,
    signedOff: dataset.finalReports.filter((fr) => fr.isSignedOff).length,
    signOffRemoved: dataset.finalReports.filter((fr) => fr.signOffRemovedAt !== null).length,
    major: dataset.fires.filter((f) => f.isMajor).length,
    perSeason,
  };
}

export { type DatasetSummary, DEFAULT_SEED, generateDataset, summarise };
