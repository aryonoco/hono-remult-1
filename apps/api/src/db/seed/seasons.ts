import { MS_PER_DAY, MS_PER_HOUR } from '@workspace/shared-domain';
import seasonData from './data/seasons.json';
import type { Rng } from './prng';

// Fire-season model for FY2018-FY2026. The data (counts, severity, megafire
// clusters, calendar weighting) lives in seasons.json; this module parses its
// dates and exposes typed season records plus the date samplers. A Victorian
// fire season's summer peak falls in the second calendar year, so the 2019-20
// Black Summer is FY2020.

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

function parseDate(iso: string): Date {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`seasons.json: invalid date "${iso}"`);
  }
  return date;
}

const ANCHOR: Date = parseDate(seasonData.anchor);

const SEASONS: readonly Season[] = seasonData.seasons.map((s) => ({
  fy: s.fy,
  statewide: s.statewide,
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

const MONTH_WEIGHTS: readonly { readonly month: number; readonly weight: number }[] =
  seasonData.monthWeights;

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
// period, never later than `maxDate` (the anchor, for the in-progress season).
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
  // Late in a truncated season every summer draw overshot the anchor; place the
  // fire in the final fortnight before it instead.
  const ms =
    maxDate.getTime() -
    rng.int(0, FALLBACK_MAX_DAYS) * MS_PER_DAY -
    rng.int(FALLBACK_MIN_HOURS, FALLBACK_MAX_HOURS) * MS_PER_HOUR;
  return new Date(ms);
}

// A report date inside an event cluster's window (clamped to the anchor).
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
  ANCHOR,
  DISTRICT_SHARE_WEIGHTS,
  type EventCluster,
  SEASONS,
  type Season,
  sampleClusterDate,
  sampleSeasonDate,
};
