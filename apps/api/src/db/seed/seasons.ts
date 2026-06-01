import { MS_PER_DAY, MS_PER_HOUR } from '@workspace/shared-domain';
import seasonData from './data/seasons.json';
import { Rng } from './prng';

// Fire-season model for FY2018-FY2029. The data (counts, severity, megafire
// clusters, calendar weighting, rolling-active tuning) lives in seasons.json;
// this module parses its dates and exposes typed season records plus the date
// samplers. A Victorian fire season's summer peak falls in the second calendar
// year, so the 2019-20 Black Summer is FY2020.
//
// FY2027/28/29 are *analogue* seasons whose statewide target is the analogue
// historical year jittered +/- statewideJitterFraction. The jitter is drawn from
// a per-FY-seeded PRNG (independent of the main generation stream), so SEASONS is
// a pure function of the committed JSON and stays byte-stable regardless of call
// order.
//
// There is no fixed ANCHOR. Historical report dates are sampled inside each
// financial year, clamped to `dataHorizon` (well past FY2029) so the whole
// FY2018-FY2029 dataset materialises immediately; the live "active now" overlay
// is anchored to the injected reference date in generate.ts instead.

interface EventCluster {
  readonly label: string;
  readonly districtCode: number;
  readonly count: number;
  readonly windowStart: Date;
  readonly windowEnd: Date;
  readonly severity: number;
  readonly majorShare: number;
}

interface Season {
  readonly fy: number;
  readonly statewide: number;
  readonly severity: number;
  readonly note: string;
  readonly clusters: readonly EventCluster[];
}

interface MonthWeight {
  readonly month: number;
  readonly weight: number;
}

interface RollingActiveConfig {
  readonly peakCount: number;
  readonly floorCount: number;
  readonly ageDaysMin: number;
  readonly ageDaysMax: number;
  readonly overdueShare: number;
  readonly overdueLagHoursMin: number;
  readonly overdueLagHoursMax: number;
  readonly upcomingLeadHoursMin: number;
  readonly upcomingLeadHoursMax: number;
}

const FY_BOUNDARY_MONTH = 7; // July starts a new financial year
const EARLIEST_HOUR = 7;
const LATEST_HOUR = 22;
const PEAK_HOUR = 14;
const HOUR_SPREAD = 3.5;
const MAX_DATE_ATTEMPTS = 8;
const FALLBACK_MAX_DAYS = 14;
const FALLBACK_MIN_HOURS = 2;
const FALLBACK_MAX_HOURS = 10;
const LAST_DAY_PROBE = 0;

// Salt for the per-FY jitter PRNG so it never aliases the main "FIRE" seed, and
// a multiplier that spreads adjacent FYs into well-separated 32-bit seeds.
const JITTER_SALT = 0x5ea5_0000;
const JITTER_MULTIPLIER = 0x9e37_79b1;
const JITTER_WARMUP = 4;
const PERCENT = 100;

function parseDate(iso: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`seasons.json: invalid date "${iso}"`);
  }
  return date;
}

const STATEWIDE_JITTER_FRACTION: number = seasonData.meta.statewideJitterFraction;
const DERIVED_FROM: Readonly<Record<string, number>> = seasonData.meta.derivedFrom;

// Deterministic +/- jitterFraction wobble of a base statewide target, seeded
// from the target FY so the same FY always yields the same count.
function jitterStatewide(base: number, fy: number): number {
  // biome-ignore lint/suspicious/noBitwiseOperators: 32-bit PRNG seed mix
  const seed = (Math.imul(fy, JITTER_MULTIPLIER) ^ JITTER_SALT) >>> 0;
  const rng = new Rng(seed);
  for (let i = 0; i < JITTER_WARMUP; i += 1) {
    rng.next();
  }
  const factor = 1 + (rng.next() * 2 - 1) * STATEWIDE_JITTER_FRACTION;
  return Math.round((base * factor) / PERCENT) * PERCENT;
}

function resolveStatewide(raw: { readonly fy: number; readonly statewide: number }): number {
  if (Object.hasOwn(DERIVED_FROM, String(raw.fy))) {
    return jitterStatewide(raw.statewide, raw.fy);
  }
  return raw.statewide;
}

const DATA_HORIZON: Date = parseDate(seasonData.dataHorizon);

const SEASONS: readonly Season[] = seasonData.seasons.map((s) => ({
  fy: s.fy,
  statewide: resolveStatewide(s),
  severity: s.severity,
  note: s.note,
  clusters: s.clusters.map((c) => ({
    label: c.label,
    districtCode: c.districtCode,
    count: c.count,
    windowStart: parseDate(c.windowStart),
    windowEnd: parseDate(c.windowEnd),
    severity: c.severity,
    majorShare: c.majorShare,
  })),
}));

const DISTRICT_SHARE_WEIGHTS: ReadonlyMap<number, number> = new Map(
  Object.entries(seasonData.districtShareWeights).map(([code, weight]) => [Number(code), weight]),
);

const MONTH_WEIGHTS: readonly MonthWeight[] = seasonData.monthWeights;

const PEAK_MONTH_WEIGHT: number = Math.max(...MONTH_WEIGHTS.map((m) => m.weight));

const ROLLING_ACTIVE: RollingActiveConfig = seasonData.rollingActive;

const FIRST_FY: number = Math.min(...SEASONS.map((s) => s.fy));
const LAST_FY: number = Math.max(...SEASONS.map((s) => s.fy));

/** Financial year that `date` falls in (Jul starts a new FY). */
function financialYearOf(date: Date): number {
  const month = date.getUTCMonth() + 1;
  const year = date.getUTCFullYear();
  return month >= FY_BOUNDARY_MONTH ? year + 1 : year;
}

/** Calendar-month weight for `month` (1-12); 0 if the month is absent. */
function monthWeightFor(month: number): number {
  return MONTH_WEIGHTS.find((m) => m.month === month)?.weight ?? 0;
}

function calendarYearForMonth(fy: number, month: number): number {
  return month >= FY_BOUNDARY_MONTH ? fy - 1 : fy;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, LAST_DAY_PROBE)).getUTCDate();
}

function sampleDaytimeHour(rng: Rng): number {
  const h = Math.round(PEAK_HOUR + rng.gaussian() * HOUR_SPREAD);
  return Math.min(LATEST_HOUR, Math.max(EARLIEST_HOUR, h));
}

// A report date within the financial year, weighted to the summer danger
// period, never later than `maxDate` (the data horizon).
function sampleSeasonDate(rng: Rng, fy: number, maxDate: Date): Date {
  for (let attempt = 0; attempt < MAX_DATE_ATTEMPTS; attempt++) {
    const { month } = rng.weighted(MONTH_WEIGHTS.map((m) => ({ value: m, weight: m.weight })));
    const year = calendarYearForMonth(fy, month);
    const day = rng.int(1, daysInMonth(year, month));
    const date = new Date(Date.UTC(year, month - 1, day, sampleDaytimeHour(rng)));
    if (date.getTime() <= maxDate.getTime()) {
      return date;
    }
  }
  // Defensive fallback (only reachable if the horizon falls mid-FY): place the
  // fire in the final fortnight before the horizon.
  const ms =
    maxDate.getTime() -
    rng.int(0, FALLBACK_MAX_DAYS) * MS_PER_DAY -
    rng.int(FALLBACK_MIN_HOURS, FALLBACK_MAX_HOURS) * MS_PER_HOUR;
  return new Date(ms);
}

// A report date inside an event cluster's window (clamped to the data horizon).
function sampleClusterDate(rng: Rng, cluster: EventCluster, maxDate: Date): Date {
  const start = cluster.windowStart.getTime();
  const end = Math.min(cluster.windowEnd.getTime(), maxDate.getTime());
  const span = Math.max(0, end - start);
  const d = new Date(start + Math.floor(rng.next() * span));
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), sampleDaytimeHour(rng)),
  );
}

export {
  DATA_HORIZON,
  DISTRICT_SHARE_WEIGHTS,
  type EventCluster,
  FIRST_FY,
  financialYearOf,
  LAST_FY,
  monthWeightFor,
  PEAK_MONTH_WEIGHT,
  ROLLING_ACTIVE,
  type RollingActiveConfig,
  SEASONS,
  type Season,
  sampleClusterDate,
  sampleSeasonDate,
};
