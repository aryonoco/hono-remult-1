import type { LifecycleEvent } from 'remult';
import { remult } from 'remult';

import { FireStatus, IncidentLevel, Potential } from './enums';
import type { FireIncident } from './fire-incident';

const RAPID_REPORT_MS = 900_000; // 15 minutes
const ACTIVE_GOING_MS = 7_200_000; // 2 hours
const ACTIVE_CONTAINED_MS = 86_400_000; // 24 hours
const FY_BOUNDARY_MONTH = 6;
const TWO_DIGIT_MOD = 100;
const FIRE_NUMBER_DIGITS = 3;
const RADIX_DECIMAL = 10;

interface WithInternal {
  __serverInternal?: boolean;
}

type TimestampField =
  | 'fireStartedAt'
  | 'fireDetectedAt'
  | 'reportedAt'
  | 'firstCrewSentAt'
  | 'firstCrewArrivedAt';

const TIMESTAMP_PAIRS: readonly (readonly [TimestampField, TimestampField])[] = [
  ['fireStartedAt', 'fireDetectedAt'],
  ['fireDetectedAt', 'reportedAt'],
  // biome-ignore lint/security/noSecrets: entity field names, not a secret
  ['reportedAt', 'firstCrewSentAt'],
  // biome-ignore lint/security/noSecrets: entity field names, not a secret
  ['firstCrewSentAt', 'firstCrewArrivedAt'],
] as const;

export const LIMITS = {
  districtIdMin: 1,
  districtIdMax: 99,
  shortText: 100,
  mediumText: 200,
  name: 255,
  description: 500,
  paragraph: 1000,
  longText: 5000,
  latitudeMin: -90,
  latitudeMax: 90,
  longitudeMin: -180,
  longitudeMax: 180,
} as const;

export const TERMINAL_STATUSES: readonly FireStatus[] = [
  FireStatus.safe,
  FireStatus.safeOverrun,
  FireStatus.safeNotFound,
  FireStatus.safeFalseAlarm,
  FireStatus.notFound,
] as const;

export const SAFE_VARIANT_STATUSES: readonly FireStatus[] = [
  FireStatus.safe,
  FireStatus.safeOverrun,
  FireStatus.safeNotFound,
  FireStatus.safeFalseAlarm,
] as const;

export const ACTIVE_CONTAINED_STATUSES: readonly FireStatus[] = [
  FireStatus.contained,
  FireStatus.underControlFirst,
  FireStatus.underControlSecond,
] as const;

export const POTENTIAL_ORDER: Record<Potential, number> = {
  [Potential.low]: 1,
  [Potential.moderate]: 2,
  [Potential.high]: 3,
};

export const LEVEL_ORDER: Record<IncidentLevel, number> = {
  [IncidentLevel.levelOne]: 1,
  [IncidentLevel.levelTwo]: 2,
  [IncidentLevel.levelThree]: 3,
};

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR: number = 3_600_000;
export const MS_PER_DAY: number = 86_400_000;
export const MS_PER_MONTH_NOMINAL: number = 2_592_000_000;
export const INITIAL_REPORT_MS = 1_800_000; // 30 minutes

export const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

export interface ComputeNextReportDueArgs {
  previousStatus: FireStatus;
  newStatus: FireStatus;
  prevLoss: Potential | null | undefined;
  prevSpread: Potential | null | undefined;
  newLoss: Potential | null | undefined;
  newSpread: Potential | null | undefined;
  now?: Date;
}

export function computeFinancialYear(now: Date): number {
  const melbourne = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));
  const year = melbourne.getFullYear();
  const month = melbourne.getMonth() + 1;
  if (month > FY_BOUNDARY_MONTH) {
    return year + 1;
  }
  return year;
}

export function computeGlobalIncidentId(
  financialYear: number,
  districtId: number,
  fireNumber: number,
): number {
  const fy2 = (financialYear % TWO_DIGIT_MOD).toString().padStart(2, '0');
  const dist2 = districtId.toString().padStart(2, '0');
  const fire3 = fireNumber.toString().padStart(FIRE_NUMBER_DIGITS, '0');
  return Number.parseInt(`10${fy2}${dist2}${fire3}`, RADIX_DECIMAL);
}

export function computeNextReportDue(args: ComputeNextReportDueArgs): Date | null {
  const now = args.now ?? new Date();
  const t = now.getTime();
  const escalated = (
    prev: Potential | null | undefined,
    next: Potential | null | undefined,
  ): boolean => next != null && (prev == null || POTENTIAL_ORDER[next] > POTENTIAL_ORDER[prev]);

  if (
    ACTIVE_CONTAINED_STATUSES.includes(args.previousStatus) &&
    args.newStatus === FireStatus.going
  ) {
    return new Date(t + RAPID_REPORT_MS);
  }
  if (
    ACTIVE_CONTAINED_STATUSES.includes(args.newStatus) &&
    (escalated(args.prevLoss, args.newLoss) || escalated(args.prevSpread, args.newSpread))
  ) {
    return new Date(t + RAPID_REPORT_MS);
  }
  if (SAFE_VARIANT_STATUSES.includes(args.newStatus)) {
    return new Date(t + MS_PER_MONTH_NOMINAL);
  }
  if (args.newStatus === FireStatus.notFound) {
    return null;
  }
  if (
    args.newStatus === FireStatus.going &&
    (args.newLoss === Potential.high || args.newSpread === Potential.high)
  ) {
    return new Date(t + ACTIVE_GOING_MS);
  }
  if (ACTIVE_CONTAINED_STATUSES.includes(args.newStatus)) {
    return new Date(t + ACTIVE_CONTAINED_MS);
  }
  return new Date(t + ACTIVE_GOING_MS);
}

export async function withServerInternal<T>(fn: () => Promise<T>): Promise<T> {
  const r = remult as unknown as WithInternal;
  r.__serverInternal = true;
  try {
    return await fn();
  } finally {
    r.__serverInternal = false;
  }
}

export function isServerInternal(): boolean {
  return (remult as unknown as WithInternal).__serverInternal === true;
}

export function validateAdjacentTimestamps(
  fire: FireIncident,
  e: LifecycleEvent<FireIncident>,
): boolean {
  for (const [earlier, later] of TIMESTAMP_PAIRS) {
    const a = fire[earlier];
    const b = fire[later];
    if (a && b && a > b) {
      e.fields.find(later).error = `${later} must be on or after ${earlier}`;
      return false;
    }
  }
  return true;
}
