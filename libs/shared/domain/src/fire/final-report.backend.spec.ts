import { InMemoryDataProvider, remult } from 'remult';

import { DEV_USERS } from '../auth/dev-users';
import { District } from './district';
import { FireStatus } from './enums';
import { FinalReport } from './final-report';
import { FireIncident } from './fire-incident';
import { INITIAL_REPORT_MS, LIMITS } from './helpers';
import { SituationReport } from './situation-report';

const OFFICER = DEV_USERS[1]!; // dev-state-officer: elevated, districtId null
const DISTRICT_ID = 12;
const REGION_ID = 1;

async function seedSignedOffReport(withSitreps: boolean): Promise<FinalReport> {
  const fire = await remult.repo(FireIncident).insert({
    name: 'Test Fire',
    districtId: DISTRICT_ID,
    reportedAt: new Date(),
    status: withSitreps ? FireStatus.going : FireStatus.safe,
  });
  if (withSitreps) {
    await remult
      .repo(SituationReport)
      .insert({ fireIncidentId: fire.id, status: FireStatus.going });
    await remult.repo(SituationReport).insert({ fireIncidentId: fire.id, status: FireStatus.safe });
  }
  return remult.repo(FinalReport).insert({ fireIncidentId: fire.id, isSignedOff: true });
}

beforeEach(async () => {
  remult.dataProvider = new InMemoryDataProvider();
  remult.user = OFFICER;
  await remult.repo(District).insert({
    id: DISTRICT_ID,
    name: 'Otway',
    regionId: REGION_ID,
    regionName: 'Barwon South West',
    isActive: true,
  });
});

describe('FinalReport.removeSignOff', () => {
  it('clears the sign-off, records who/why, and reopens the report for editing', async () => {
    const fr = await seedSignedOffReport(true);
    expect(fr.isSignedOff).toBe(true);

    await FinalReport.removeSignOff(fr.id, 'Loss figures revised');

    const reloaded = (await remult.repo(FinalReport).findId(fr.id))!;
    expect(reloaded.isSignedOff).toBe(false);
    expect(reloaded.signOffRemovedAt).toBeInstanceOf(Date);
    expect(reloaded.signOffRemovedBy).toBe(OFFICER.id);
    expect(reloaded.signOffRemovedReason).toBe('Loss figures revised');

    const parent = (await remult.repo(FireIncident).findId(fr.fireIncidentId))!;
    expect(parent.nextReportDue ?? null).not.toBeNull();

    // The report is unlocked again: a follow-up edit no longer throws.
    await expect(
      remult.repo(FinalReport).update(fr.id, { otherLosses: 'Revised totals' }),
    ).resolves.toBeDefined();
  });

  it('falls back to the initial cadence when the fire has no sitreps', async () => {
    const fr = await seedSignedOffReport(false);

    const before = Date.now();
    await FinalReport.removeSignOff(fr.id, 'Reopened');
    const after = Date.now();

    const parent = (await remult.repo(FireIncident).findId(fr.fireIncidentId))!;
    const due = parent.nextReportDue;
    expect(due).not.toBeNull();
    expect(due!.getTime()).toBeGreaterThanOrEqual(before + INITIAL_REPORT_MS);
    expect(due!.getTime()).toBeLessThanOrEqual(after + INITIAL_REPORT_MS);
  });

  it('rejects a report that is not signed off', async () => {
    const fire = await remult.repo(FireIncident).insert({
      name: 'Test Fire',
      districtId: DISTRICT_ID,
      reportedAt: new Date(),
      status: FireStatus.safe,
    });
    const fr = await remult.repo(FinalReport).insert({ fireIncidentId: fire.id });
    await expect(FinalReport.removeSignOff(fr.id, 'reason')).rejects.toThrow('not signed off');
  });

  it('rejects an unknown report', async () => {
    await expect(FinalReport.removeSignOff('missing', 'reason')).rejects.toThrow(
      'FinalReport not found',
    );
  });

  it('rejects an empty reason', async () => {
    await expect(FinalReport.removeSignOff('any', '')).rejects.toThrow('1-500 chars');
  });

  it('rejects an over-length reason', async () => {
    const reason = 'a'.repeat(LIMITS.description + 1);
    await expect(FinalReport.removeSignOff('any', reason)).rejects.toThrow('1-500 chars');
  });
});
