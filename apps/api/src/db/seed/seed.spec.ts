import {
  CAUSE_SOURCE_VALUES,
  CONTROL_AGENCY_VALUES,
  COST_CLASS_VALUES,
  computeFinancialYear,
  computeGlobalIncidentId,
  FIRE_DETECTION_METHOD_VALUES,
  FIRE_STATUS_VALUES,
  FinalReport,
  FireIncident,
  FUEL_TYPE_VALUES,
  INCIDENT_LEVEL_VALUES,
  INVESTIGATION_TYPE_VALUES,
  LEGAL_ACTION_STATUS_VALUES,
  POTENTIAL_VALUES,
  SituationReport,
  TERMINAL_STATUSES,
  TIMESTAMP_PAIRS,
  validateFirePerimeter,
  YES_NO_VALUES,
} from '@workspace/shared-domain';
import { InMemoryDataProvider, remult } from 'remult';
import { beforeAll, describe, expect, it } from 'vitest';

import { ALL_DISTRICTS, districtByCode } from './districts';
import { DEFAULT_SEED, generateDataset, summarise } from './generate';
import { pointInPolygon } from './geo';
import { Rng } from './prng';
import type { FireIncidentRow, FixtureDataset, SituationReportRow } from './rows';
import { DATA_HORIZON, FIRST_FY, LAST_FY } from './seasons';

// The seed is deterministic only for a fixed reference date AND PRNG seed. Pin
// "now" so the rolling-active overlay (anchored to it) is byte-stable across
// runs. 2026-06-01 is early winter, matching the app's real-clock view at the
// time of writing — so the active set should be small and seasonally sane.
const PINNED_NOW = new Date('2026-06-01T00:00:00.000Z');
const PINNED_NOW_FY = 2026;

const data: FixtureDataset = generateDataset(new Rng(DEFAULT_SEED), PINNED_NOW);

// Index the sitreps by fire once, preserving generation order (report-number order).
const sitrepsByFire = new Map<string, SituationReportRow[]>();
for (const s of data.sitreps) {
  const list = sitrepsByFire.get(s.fireIncidentId);
  if (list) {
    list.push(s);
  } else {
    sitrepsByFire.set(s.fireIncidentId, [s]);
  }
}
const fireById = new Map<string, FireIncidentRow>(data.fires.map((f) => [f.id, f]));

function lastSitrep(fireId: string): SituationReportRow | undefined {
  const list = sitrepsByFire.get(fireId);
  return list?.[list.length - 1];
}

describe('determinism', () => {
  it('produces identical output for the same seed and reference date', () => {
    const a = generateDataset(new Rng(DEFAULT_SEED), PINNED_NOW);
    const b = generateDataset(new Rng(DEFAULT_SEED), PINNED_NOW);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('generates a substantial, season-weighted dataset', () => {
    const s = summarise(data, PINNED_NOW);
    expect(s.fires).toBeGreaterThan(10000);
    // FY2020 (Black Summer) is the busiest year of the real historical record
    // (FY2018-2026); the jittered future analogues FY2027-29 are validated
    // separately and may, within their +/-15% band, edge above it. The
    // triple-La-Nina FY2021 stays the quietest year overall.
    const historicalBusiest = Math.max(
      ...[...s.perSeason.entries()].filter(([fy]) => fy <= 2026).map(([, n]) => n),
    );
    const quietest = Math.min(...s.perSeason.values());
    expect(s.perSeason.get(2020)).toBe(historicalBusiest);
    expect(s.perSeason.get(2021)).toBe(quietest);
  });
});

describe('financial-year coverage', () => {
  it('covers every financial year from FY2018 to FY2029', () => {
    expect(FIRST_FY).toBe(2018);
    expect(LAST_FY).toBe(2029);
    const fys = new Set(data.fires.map((f) => f.financialYear));
    for (let fy = FIRST_FY; fy <= LAST_FY; fy++) {
      expect(fys, `missing FY${fy}`).toContain(fy);
    }
  });

  it('derives FY2027/28/29 counts within +/-15% of their analogue seasons', () => {
    const perSeason = summarise(data, PINNED_NOW).perSeason;
    // FY2027<-FY2018, FY2028<-FY2019, FY2029<-FY2020.
    const analogues: ReadonlyArray<readonly [number, number]> = [
      [2027, 2018],
      [2028, 2019],
      [2029, 2020],
    ];
    for (const [derivedFy, baseFy] of analogues) {
      const derived = perSeason.get(derivedFy) ?? 0;
      const base = perSeason.get(baseFy) ?? 0;
      // +/-1 row absorbs the per-district rounding when the jittered target is
      // apportioned across the 16 districts.
      const lower = Math.floor(base * 0.85) - ALL_DISTRICTS.length;
      const upper = Math.ceil(base * 1.15) + ALL_DISTRICTS.length;
      expect(derived, `FY${derivedFy} vs FY${baseFy}`).toBeGreaterThanOrEqual(lower);
      expect(derived, `FY${derivedFy} vs FY${baseFy}`).toBeLessThanOrEqual(upper);
    }
  });
});

describe('seasonality', () => {
  it('ignites far more fires in summer than in late autumn / winter', () => {
    const byMonth = new Array<number>(12).fill(0);
    for (const f of data.fires) {
      byMonth[f.reportedAt.getUTCMonth()] = (byMonth[f.reportedAt.getUTCMonth()] ?? 0) + 1;
    }
    // UTC month indices: 0=Jan ... 11=Dec. The summer danger period (Dec-Feb)
    // must dwarf the quiet late-autumn/winter months (May-Jun).
    const summer = (byMonth[0] ?? 0) + (byMonth[1] ?? 0) + (byMonth[11] ?? 0);
    const winter = (byMonth[4] ?? 0) + (byMonth[5] ?? 0);
    expect(summer).toBeGreaterThan(winter * 3);
  });
});

describe('identity & numbering', () => {
  it('assigns a unique globalIncidentId to every fire', () => {
    const ids = new Set(data.fires.map((f) => f.globalIncidentId));
    expect(ids.size).toBe(data.fires.length);
  });

  it('derives financialYear and globalIncidentId from the canonical helpers', () => {
    for (const f of data.fires) {
      expect(f.financialYear).toBe(computeFinancialYear(f.reportedAt));
      expect(f.globalIncidentId).toBe(
        computeGlobalIncidentId(f.financialYear, f.districtId, f.fireNumber),
      );
    }
  });

  it('numbers fires 1..N sequentially within each district + financial year', () => {
    const groups = new Map<string, number[]>();
    for (const f of data.fires) {
      const key = `${f.districtId}:${f.financialYear}`;
      const list = groups.get(key) ?? [];
      list.push(f.fireNumber);
      groups.set(key, list);
    }
    for (const numbers of groups.values()) {
      const sorted = [...numbers].sort((a, b) => a - b);
      expect(sorted).toEqual(numbers.map((_, i) => i + 1));
    }
  });
});

describe('timestamps', () => {
  it('keeps every reportedAt at or before the data horizon', () => {
    for (const f of data.fires) {
      expect(f.reportedAt.getTime()).toBeLessThanOrEqual(DATA_HORIZON.getTime());
    }
  });

  it('orders the timeline (each adjacent pair, when both present)', () => {
    for (const f of data.fires) {
      for (const [earlier, later] of TIMESTAMP_PAIRS) {
        const a = f[earlier];
        const b = f[later];
        if (a && b) {
          expect(a.getTime()).toBeLessThanOrEqual(b.getTime());
        }
      }
      expect(f.reportedAt.getTime()).toBeLessThanOrEqual(f.createdAt.getTime());
    }
  });

  it('completes the declaration fields on every major fire', () => {
    for (const f of data.fires) {
      if (f.isMajor) {
        expect(f.declaredBySource.length).toBeGreaterThan(0);
        expect(f.declaredByTimestamp).not.toBeNull();
      }
    }
  });
});

describe('lifecycle consistency', () => {
  it('only files final reports against fires in a terminal status', () => {
    for (const fr of data.finalReports) {
      const parent = fireById.get(fr.fireIncidentId);
      expect(parent).toBeDefined();
      expect(TERMINAL_STATUSES).toContain(parent?.status);
    }
  });

  it('nulls nextReportDue on signed-off fires and clears parent on soft delete', () => {
    for (const fr of data.finalReports) {
      if (fr.isSignedOff) {
        expect(fireById.get(fr.fireIncidentId)?.nextReportDue).toBeNull();
      }
      // A removed sign-off must leave the report un-signed again.
      if (fr.signOffRemovedAt !== null) {
        expect(fr.isSignedOff).toBe(false);
      }
    }
  });

  it('cascades soft deletion to children and clears the schedule', () => {
    for (const f of data.fires) {
      if (f.isDeleted) {
        expect(f.nextReportDue).toBeNull();
        expect(f.deletionReason.length).toBeGreaterThan(0);
      }
      // A child's isParentDeleted always mirrors its parent's deletion state.
      for (const s of sitrepsByFire.get(f.id) ?? []) {
        expect(s.isParentDeleted).toBe(f.isDeleted);
      }
    }
  });

  it('denormalises the latest sitrep onto the parent fire', () => {
    for (const f of data.fires) {
      const last = lastSitrep(f.id);
      if (last) {
        expect(f.status).toBe(last.status);
        expect(f.statusAsAt.getTime()).toBe(last.submittedAt.getTime());
        expect(f.totalPersonnel).toBe(last.personnel);
        expect(f.totalVehicles).toBe(last.vehicles);
        expect(f.totalAircraft).toBe(last.aircraft);
      }
    }
  });

  it('numbers sitreps 1..N per fire and denormalises the district', () => {
    for (const [fireId, reps] of sitrepsByFire) {
      const parent = fireById.get(fireId);
      expect(parent).toBeDefined();
      reps.forEach((s, i) => {
        expect(s.reportNumber).toBe(i + 1);
        expect(s.districtId).toBe(parent?.districtId);
      });
    }
  });
});

describe('geography', () => {
  it('places every fire inside its own district polygon', () => {
    for (const f of data.fires) {
      expect(f.latitude).not.toBeNull();
      expect(f.longitude).not.toBeNull();
      const district = districtByCode(f.districtId);
      const inside = pointInPolygon(f.longitude as number, f.latitude as number, district.polygon);
      expect(inside, `fire ${f.globalIncidentId} (${f.name}) outside ${district.name}`).toBe(true);
    }
  });

  it('only uses the 16 known districts', () => {
    const known = new Set(ALL_DISTRICTS.map((d) => d.code));
    for (const f of data.fires) {
      expect(known.has(f.districtId)).toBe(true);
    }
  });
});

describe('fire perimeter geometry', () => {
  const NoPerimeterStatuses = new Set([
    'safeOverrun',
    'notFound',
    'safeNotFound',
    'safeFalseAlarm',
  ]);

  it('emits well-formed closed rings clipped to the district polygon', () => {
    for (const f of data.fires) {
      if (f.firePerimeterGeo === null) {
        continue;
      }
      // Domain validator: type Polygon, closed outer ring of >=4 in-bounds points.
      expect(validateFirePerimeter(f.firePerimeterGeo)).toBe(true);
      const ring = f.firePerimeterGeo.coordinates[0]!;
      expect(ring.length).toBeGreaterThanOrEqual(4);
      const first = ring[0]!;
      const last = ring[ring.length - 1]!;
      expect(last[0]).toBe(first[0]);
      expect(last[1]).toBe(first[1]);
      const district = districtByCode(f.districtId);
      for (const [lng, lat] of ring) {
        expect(
          pointInPolygon(lng, lat, district.polygon),
          `perimeter vertex of fire ${f.globalIncidentId} outside ${district.name}`,
        ).toBe(true);
      }
    }
  });

  it('nulls the perimeter for every no-fire terminal outcome', () => {
    // The footprint decision keys off the *terminal* status, so every fire that
    // ends safeOverrun / notFound / safeNotFound / safeFalseAlarm carries a null
    // perimeter — including overruns reached via the resolved (sitrep-bearing)
    // path, whose area is reset to zero. The pin stays the sole locator.
    const skipped = data.fires.filter((f) => NoPerimeterStatuses.has(f.status));
    expect(skipped.length).toBeGreaterThan(0);
    for (const f of skipped) {
      expect(
        f.firePerimeterGeo,
        `fire ${f.globalIncidentId} ended ${f.status} but kept a perimeter`,
      ).toBeNull();
    }
  });

  it('covers the resolved-path safeOverrun no-perimeter case', () => {
    // safeOverrun arises almost entirely via the resolved path (sitreps present,
    // area zeroed). Guard that this regression-prone case is actually exercised:
    // such fires must exist, have sitreps, zero area, and a null perimeter.
    const overruns = data.fires.filter(
      (f) => f.status === 'safeOverrun' && (sitrepsByFire.get(f.id)?.length ?? 0) > 0,
    );
    expect(overruns.length).toBeGreaterThan(0);
    for (const f of overruns) {
      expect(f.fireAreaHectares).toBe(0);
      expect(f.firePerimeterGeo).toBeNull();
    }
  });

  it('covers both the perimeter and the null-perimeter paths', () => {
    expect(data.fires.some((f) => f.firePerimeterGeo !== null)).toBe(true);
    expect(data.fires.some((f) => f.firePerimeterGeo === null)).toBe(true);
  });
});

describe('enum coverage — every value appears at least once', () => {
  const fireValues = (key: keyof FireIncidentRow): Set<unknown> =>
    new Set(data.fires.map((f) => f[key]));

  it.each([
    ['fuelType', FUEL_TYPE_VALUES],
    ['causeSource', CAUSE_SOURCE_VALUES],
    ['status', FIRE_STATUS_VALUES],
    ['incidentLevel', INCIDENT_LEVEL_VALUES],
    ['detectionMethod', FIRE_DETECTION_METHOD_VALUES],
    ['controlAgency', CONTROL_AGENCY_VALUES],
  ])('covers every %s', (key, values) => {
    const present = fireValues(key as keyof FireIncidentRow);
    for (const v of values) {
      expect(present, `missing ${key} = ${v}`).toContain(v);
    }
  });

  it('covers every yes/no and potential value', () => {
    const yesNo = new Set([
      ...data.fires.map((f) => f.isLandManagerNotified),
      ...data.fires.map((f) => f.isControlAgencyNotified),
    ]);
    for (const v of YES_NO_VALUES) {
      expect(yesNo).toContain(v);
    }
    const potential = new Set([
      ...data.sitreps.map((s) => s.potentialLoss),
      ...data.sitreps.map((s) => s.potentialSpread),
    ]);
    for (const v of POTENTIAL_VALUES) {
      expect(potential).toContain(v);
    }
  });

  it('covers every final-report enum value', () => {
    const cost = new Set(data.finalReports.map((fr) => fr.costClass));
    const investigation = new Set(data.finalReports.map((fr) => fr.investigationType));
    const legal = new Set(data.finalReports.map((fr) => fr.legalActionStatus));
    for (const v of COST_CLASS_VALUES) {
      expect(cost).toContain(v);
    }
    for (const v of INVESTIGATION_TYPE_VALUES) {
      expect(investigation).toContain(v);
    }
    for (const v of LEGAL_ACTION_STATUS_VALUES) {
      expect(legal).toContain(v);
    }
  });
});

describe('lifecycle-state coverage', () => {
  it('includes at least one of every special state', () => {
    const s = summarise(data, PINNED_NOW);
    expect(s.active).toBeGreaterThan(0);
    expect(s.softDeleted).toBeGreaterThan(0);
    expect(s.signedOff).toBeGreaterThan(0);
    expect(s.signOffRemoved).toBeGreaterThan(0);
    expect(s.major).toBeGreaterThan(0);
    expect(data.fires.some((f) => f.incidentLevel === 'levelTwo')).toBe(true);
    expect(data.fires.some((f) => f.incidentLevel === 'levelThree')).toBe(true);
  });
});

describe('rolling-active overlay (DASH-3)', () => {
  const ActiveWinterMax = 6;
  const MinSummerActive = 10;
  const MaxActiveAgeDays = 18;
  const JanuaryNow = new Date('2027-01-15T00:00:00.000Z');
  const MayNow = new Date('2027-05-15T00:00:00.000Z');
  const isTerminalStatus = (s: string): boolean => TERMINAL_STATUSES.includes(s as never);
  const activeFires = (set: FixtureDataset): FireIncidentRow[] =>
    set.fires.filter((f) => !f.isDeleted && f.nextReportDue != null && !isTerminalStatus(f.status));

  it('keeps the winter active set small and seasonally sane', () => {
    const s = summarise(data, PINNED_NOW);
    expect(s.active).toBeGreaterThan(0);
    expect(s.active).toBeLessThanOrEqual(ActiveWinterMax);
    expect(s.active).toBeLessThan(s.fires);
  });

  it('makes overdue the exception: most active reports fall due in the future', () => {
    const s = summarise(data, PINNED_NOW);
    expect(s.activeUpcoming).toBeGreaterThan(s.activeOverdue);
  });

  it('anchors every active fire to a recent ignition before now', () => {
    for (const f of activeFires(data)) {
      expect(f.reportedAt.getTime()).toBeLessThanOrEqual(PINNED_NOW.getTime());
      const ageDays = (PINNED_NOW.getTime() - f.reportedAt.getTime()) / (24 * 60 * 60 * 1000);
      expect(ageDays).toBeLessThanOrEqual(MaxActiveAgeDays);
      expect(isTerminalStatus(f.status)).toBe(false);
    }
  });

  it('scales the active set by season — January dwarfs May', () => {
    const january = generateDataset(new Rng(DEFAULT_SEED), JanuaryNow);
    const may = generateDataset(new Rng(DEFAULT_SEED), MayNow);
    const januaryActive = summarise(january, JanuaryNow).active;
    const mayActive = summarise(may, MayNow).active;
    expect(januaryActive).toBeGreaterThanOrEqual(MinSummerActive);
    expect(januaryActive).toBeGreaterThan(mayActive);
    expect(mayActive).toBeLessThanOrEqual(ActiveWinterMax + MinSummerActive);
  });

  it('confines active fires to the financial year containing now', () => {
    const activeSeasons = new Set(activeFires(data).map((f) => f.financialYear));
    expect([...activeSeasons]).toEqual([PINNED_NOW_FY]);
  });
});

describe('column drift guard', () => {
  beforeAll(() => {
    remult.dataProvider = new InMemoryDataProvider();
  });

  const storedColumns = (entity: any, relations: readonly string[]): Set<string> =>
    new Set(
      remult
        .repo(entity)
        .metadata.fields.toArray()
        .map((f) => f.key)
        .filter((k) => !relations.includes(k)),
    );

  it('generates exactly the columns each entity persists', () => {
    expect(new Set(Object.keys(data.fires[0]!))).toEqual(
      storedColumns(FireIncident, ['district', 'situationReports', 'finalReport']),
    );
    expect(new Set(Object.keys(data.sitreps[0]!))).toEqual(
      storedColumns(SituationReport, ['fireIncident']),
    );
    expect(new Set(Object.keys(data.finalReports[0]!))).toEqual(
      storedColumns(FinalReport, ['fireIncident']),
    );
  });
});
