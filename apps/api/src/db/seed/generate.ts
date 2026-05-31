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
  Roles,
  STATE_OPERATORS,
  FireStatus as Status,
} from '@workspace/shared-domain';
import tuning from './data/tuning.json';
import { ALL_DISTRICTS, districtByCode } from './districts';
import type { Rng } from './prng';
import type { FixtureDataset, SituationReportRow } from './rows';
import {
  ANCHOR,
  DISTRICT_SHARE_WEIGHTS,
  type EventCluster,
  SEASONS,
  sampleClusterDate,
  sampleSeasonDate,
} from './seasons';
import { type Authors, type FireSpec, simulateFire } from './simulate';

// Default seed for the fixtures. Fixed so every build produces identical data.
const DEFAULT_SEED = 0x46_49_52_45; // "FIRE"

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
}

interface FireArgs {
  readonly districtCode: number;
  readonly reportedAt: Date;
  readonly severity: number;
  readonly forceMajor: boolean;
}

interface DatasetSummary {
  readonly fires: number;
  readonly sitreps: number;
  readonly finalReports: number;
  readonly active: number;
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

function emitFire(env: GenEnv, args: FireArgs): void {
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
    authors: authorsFor(rng, pools, args.districtCode),
  };
  const result = simulateFire(rng, spec);
  dataset.fires.push(result.fire);
  dataset.sitreps.push(...result.sitreps);
  if (result.finalReport !== null) {
    dataset.finalReports.push(result.finalReport);
  }
}

function emitCluster(env: GenEnv, cluster: EventCluster): void {
  for (let i = 0; i < cluster.count; i++) {
    emitFire(env, {
      districtCode: cluster.districtCode,
      reportedAt: sampleClusterDate(env.rng, cluster, ANCHOR),
      severity: clamp01(
        cluster.severity +
          env.rng.float(-tuning.clusterSeverityJitter, tuning.clusterSeverityJitter),
      ),
      forceMajor: env.rng.bool(cluster.majorShare),
    });
  }
}

function generateDataset(rng: Rng): FixtureDataset {
  const env: GenEnv = {
    dataset: { fires: [], sitreps: [], finalReports: [] },
    rng,
    allocator: new FireNumberAllocator(),
    pools: buildAuthorPools(),
  };
  const shares = normalisedShares();

  for (const season of SEASONS) {
    for (const district of ALL_DISTRICTS) {
      const count = Math.round(season.statewide * (shares.get(district.code) ?? 0));
      for (let i = 0; i < count; i++) {
        emitFire(env, {
          districtCode: district.code,
          reportedAt: sampleSeasonDate(rng, season.fy, ANCHOR),
          severity: clamp01(
            season.severity + rng.float(-tuning.severityJitter, tuning.severityJitter),
          ),
          forceMajor: false,
        });
      }
    }
    for (const cluster of season.clusters) {
      emitCluster(env, cluster);
    }
  }

  ensureEnumCoverage(env.dataset);
  return env.dataset;
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

function summarise(dataset: FixtureDataset): DatasetSummary {
  const perSeason = new Map<number, number>();
  for (const f of dataset.fires) {
    perSeason.set(f.financialYear, (perSeason.get(f.financialYear) ?? 0) + 1);
  }
  return {
    fires: dataset.fires.length,
    sitreps: dataset.sitreps.length,
    finalReports: dataset.finalReports.length,
    active: dataset.fires.filter(
      (f) => !f.isDeleted && f.nextReportDue !== null && !isTerminal(f.status),
    ).length,
    softDeleted: dataset.fires.filter((f) => f.isDeleted).length,
    signedOff: dataset.finalReports.filter((fr) => fr.isSignedOff).length,
    signOffRemoved: dataset.finalReports.filter((fr) => fr.signOffRemovedAt !== null).length,
    major: dataset.fires.filter((f) => f.isMajor).length,
    perSeason,
  };
}

export { type DatasetSummary, DEFAULT_SEED, generateDataset, summarise };
