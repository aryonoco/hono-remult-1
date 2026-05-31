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
  YES_NO_VALUES,
} from '@workspace/shared-domain';
import { InMemoryDataProvider, remult } from 'remult';
import { beforeAll, describe, expect, it } from 'vitest';

import { ALL_DISTRICTS, districtByCode } from './districts';
import { DEFAULT_SEED, generateDataset, summarise } from './generate';
import { pointInPolygon } from './geo';
import { Rng } from './prng';
import type { FireIncidentRow, FixtureDataset, SituationReportRow } from './rows';
import { ANCHOR } from './seasons';

const data: FixtureDataset = generateDataset(new Rng(DEFAULT_SEED));

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
  it('produces identical output for the same seed', () => {
    const a = generateDataset(new Rng(DEFAULT_SEED));
    const b = generateDataset(new Rng(DEFAULT_SEED));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('generates a substantial, season-weighted dataset', () => {
    const s = summarise(data);
    expect(s.fires).toBeGreaterThan(10000);
    // FY2020 (Black Summer) is the busiest; the triple-La-Nina years are quietest.
    const busiest = Math.max(...s.perSeason.values());
    const quietest = Math.min(...s.perSeason.values());
    expect(s.perSeason.get(2020)).toBe(busiest);
    expect(s.perSeason.get(2021)).toBe(quietest);
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
  it('keeps every reportedAt at or before the anchor', () => {
    for (const f of data.fires) {
      expect(f.reportedAt.getTime()).toBeLessThanOrEqual(ANCHOR.getTime());
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
    const s = summarise(data);
    expect(s.active).toBeGreaterThan(0);
    expect(s.softDeleted).toBeGreaterThan(0);
    expect(s.signedOff).toBeGreaterThan(0);
    expect(s.signOffRemoved).toBeGreaterThan(0);
    expect(s.major).toBeGreaterThan(0);
    expect(data.fires.some((f) => f.incidentLevel === 'levelTwo')).toBe(true);
    expect(data.fires.some((f) => f.incidentLevel === 'levelThree')).toBe(true);
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
