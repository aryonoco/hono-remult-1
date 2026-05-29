import type { LifecycleEvent } from 'remult';

import { FireStatus, Potential } from './enums';
import type { FireIncident } from './fire-incident';
import {
  computeFinancialYear,
  computeGlobalIncidentId,
  computeNextReportDue,
  validateAdjacentTimestamps,
} from './helpers';

const REF = new Date('2026-01-01T00:00:00.000Z');
const T = REF.getTime();

// Cadence offsets (mirror the private constants in helpers.ts; pinned here on purpose).
const RAPID_MS = 900_000; // 15 minutes
const ACTIVE_GOING_MS = 7_200_000; // 2 hours
const ACTIVE_CONTAINED_MS = 86_400_000; // 24 hours
const MONTH_MS = 2_592_000_000; // 30 days nominal

const YEAR_2026 = 2026;
const YEAR_2027 = 2027;
const GID_DISTRICT = 47;
const GID_FIRE = 42;
const GID_EXPECTED = 102647042;

describe('computeNextReportDue', () => {
  it('rule 1: contained-family → going returns the rapid cadence', () => {
    const r = computeNextReportDue({
      previousStatus: FireStatus.contained,
      newStatus: FireStatus.going,
      prevLoss: null,
      prevSpread: null,
      newLoss: null,
      newSpread: null,
      now: REF,
    });
    expect(r?.getTime()).toBe(T + RAPID_MS);
  });

  it('rule 1 beats rule 5: re-escalation to going wins over going+high', () => {
    const r = computeNextReportDue({
      previousStatus: FireStatus.underControlFirst,
      newStatus: FireStatus.going,
      prevLoss: null,
      prevSpread: null,
      newLoss: Potential.high,
      newSpread: null,
      now: REF,
    });
    expect(r?.getTime()).toBe(T + RAPID_MS);
  });

  it('rule 2 beats rule 6: escalating potential while contained returns rapid', () => {
    const r = computeNextReportDue({
      previousStatus: FireStatus.going,
      newStatus: FireStatus.contained,
      prevLoss: Potential.low,
      prevSpread: null,
      newLoss: Potential.high,
      newSpread: null,
      now: REF,
    });
    expect(r?.getTime()).toBe(T + RAPID_MS);
  });

  it('rule 2: newly-set potential (null → moderate) counts as escalation', () => {
    const r = computeNextReportDue({
      previousStatus: FireStatus.going,
      newStatus: FireStatus.underControlSecond,
      prevLoss: null,
      prevSpread: null,
      newLoss: Potential.moderate,
      newSpread: null,
      now: REF,
    });
    expect(r?.getTime()).toBe(T + RAPID_MS);
  });

  it('rule 3: a safe-variant status returns the monthly cadence', () => {
    const r = computeNextReportDue({
      previousStatus: FireStatus.going,
      newStatus: FireStatus.safe,
      prevLoss: null,
      prevSpread: null,
      newLoss: null,
      newSpread: null,
      now: REF,
    });
    expect(r?.getTime()).toBe(T + MONTH_MS);
  });

  it('rule 4: notFound returns null (no further report due)', () => {
    const r = computeNextReportDue({
      previousStatus: FireStatus.going,
      newStatus: FireStatus.notFound,
      prevLoss: null,
      prevSpread: null,
      newLoss: null,
      newSpread: null,
      now: REF,
    });
    expect(r).toBeNull();
  });

  it('rule 5: going with high potential returns the active-going cadence', () => {
    const r = computeNextReportDue({
      previousStatus: FireStatus.going,
      newStatus: FireStatus.going,
      prevLoss: null,
      prevSpread: null,
      newLoss: Potential.high,
      newSpread: null,
      now: REF,
    });
    expect(r?.getTime()).toBe(T + ACTIVE_GOING_MS);
  });

  it('rule 6: contained without escalation returns the active-contained cadence', () => {
    const r = computeNextReportDue({
      previousStatus: FireStatus.going,
      newStatus: FireStatus.contained,
      prevLoss: Potential.low,
      prevSpread: Potential.low,
      newLoss: Potential.low,
      newSpread: Potential.low,
      now: REF,
    });
    expect(r?.getTime()).toBe(T + ACTIVE_CONTAINED_MS);
  });

  it('rule 7: going without high potential falls back to active-going', () => {
    const r = computeNextReportDue({
      previousStatus: FireStatus.going,
      newStatus: FireStatus.going,
      prevLoss: Potential.low,
      prevSpread: Potential.low,
      newLoss: Potential.low,
      newSpread: Potential.low,
      now: REF,
    });
    expect(r?.getTime()).toBe(T + ACTIVE_GOING_MS);
  });
});

describe('computeFinancialYear', () => {
  it('a March date stays in the same financial year', () => {
    expect(computeFinancialYear(new Date('2026-03-15T02:00:00Z'))).toBe(YEAR_2026);
  });

  it('an August date rolls into the next financial year', () => {
    expect(computeFinancialYear(new Date('2025-08-15T02:00:00Z'))).toBe(YEAR_2026);
  });

  it('respects the Melbourne timezone at the UTC day boundary', () => {
    // 2026-06-30T15:00Z is 2026-07-01 01:00 in Melbourne (AEST, UTC+10) → next FY.
    expect(computeFinancialYear(new Date('2026-06-30T15:00:00Z'))).toBe(YEAR_2027);
  });
});

describe('computeGlobalIncidentId', () => {
  it('packs financial year, district and fire number into a stable id', () => {
    expect(computeGlobalIncidentId(YEAR_2026, GID_DISTRICT, GID_FIRE)).toBe(GID_EXPECTED);
  });
});

describe('validateAdjacentTimestamps', () => {
  const t1 = new Date('2026-01-01T01:00:00Z');
  const t2 = new Date('2026-01-01T02:00:00Z');
  const t3 = new Date('2026-01-01T03:00:00Z');
  const t4 = new Date('2026-01-01T04:00:00Z');
  const t5 = new Date('2026-01-01T05:00:00Z');

  function makeFire(times: {
    fireStartedAt?: Date;
    fireDetectedAt?: Date;
    reportedAt?: Date;
    firstCrewSentAt?: Date;
    firstCrewArrivedAt?: Date;
  }): FireIncident {
    return times as unknown as FireIncident;
  }

  // validateAdjacentTimestamps sets the error on the first out-of-order pair and returns,
  // so a single shared field-ref captures whether any error was raised.
  function makeEvent(): { e: LifecycleEvent<FireIncident>; ref: { error: string } } {
    const ref = { error: '' };
    const e = {
      fields: { find: (): { error: string } => ref },
    } as unknown as LifecycleEvent<FireIncident>;
    return { e, ref };
  }

  it('accepts a fully ordered chain', () => {
    const { e, ref } = makeEvent();
    const fire = makeFire({
      fireStartedAt: t1,
      fireDetectedAt: t2,
      reportedAt: t3,
      firstCrewSentAt: t4,
      firstCrewArrivedAt: t5,
    });
    expect(validateAdjacentTimestamps(fire, e)).toBe(true);
    expect(ref.error).toBe('');
  });

  it('rejects fireStartedAt after fireDetectedAt', () => {
    const { e, ref } = makeEvent();
    const fire = makeFire({ fireStartedAt: t2, fireDetectedAt: t1 });
    expect(validateAdjacentTimestamps(fire, e)).toBe(false);
    expect(ref.error).not.toBe('');
  });

  it('rejects fireDetectedAt after reportedAt', () => {
    const { e, ref } = makeEvent();
    const fire = makeFire({ fireStartedAt: t1, fireDetectedAt: t2, reportedAt: t1 });
    expect(validateAdjacentTimestamps(fire, e)).toBe(false);
    expect(ref.error).not.toBe('');
  });

  it('rejects reportedAt after firstCrewSentAt', () => {
    const { e, ref } = makeEvent();
    const fire = makeFire({
      fireStartedAt: t1,
      fireDetectedAt: t2,
      reportedAt: t4,
      firstCrewSentAt: t3,
    });
    expect(validateAdjacentTimestamps(fire, e)).toBe(false);
    expect(ref.error).not.toBe('');
  });

  it('rejects firstCrewSentAt after firstCrewArrivedAt', () => {
    const { e, ref } = makeEvent();
    const fire = makeFire({
      fireStartedAt: t1,
      fireDetectedAt: t2,
      reportedAt: t3,
      firstCrewSentAt: t5,
      firstCrewArrivedAt: t4,
    });
    expect(validateAdjacentTimestamps(fire, e)).toBe(false);
    expect(ref.error).not.toBe('');
  });

  it('skips pairs where either timestamp is missing', () => {
    const { e, ref } = makeEvent();
    const fire = makeFire({ fireStartedAt: t1, reportedAt: t3, firstCrewArrivedAt: t5 });
    expect(validateAdjacentTimestamps(fire, e)).toBe(true);
    expect(ref.error).toBe('');
  });
});
