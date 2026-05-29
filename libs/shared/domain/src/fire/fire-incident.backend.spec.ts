import { InMemoryDataProvider, remult } from 'remult';

import { DEV_USERS } from '../auth/dev-users';
import { District } from './district';
import { FireStatus, IncidentLevel } from './enums';
import { FinalReport } from './final-report';
import { FireIncident } from './fire-incident';
import { LIMITS, withServerInternal } from './helpers';
import { SituationReport } from './situation-report';

const OFFICER = DEV_USERS[1]!; // dev-state-officer: elevated, districtId null
const DISTRICT_ID = 12;
const REGION_ID = 1;

function seedFire(overrides: Partial<FireIncident> = {}): Promise<FireIncident> {
  return remult.repo(FireIncident).insert({
    name: 'Test Fire',
    districtId: DISTRICT_ID,
    reportedAt: new Date(),
    ...overrides,
  });
}

async function reloadFire(id: string): Promise<FireIncident> {
  const fire = await remult.repo(FireIncident).findId(id);
  return fire!;
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

describe('FireIncident.getNextFireNumber', () => {
  it('starts at 1 and increments with each fire in the district + financial year', async () => {
    expect(await FireIncident.getNextFireNumber(DISTRICT_ID)).toBe(1);
    await seedFire();
    await seedFire();
    expect(await FireIncident.getNextFireNumber(DISTRICT_ID)).toBe(3);
  });

  it('counts soft-deleted fires (EMI parity)', async () => {
    const fire = await seedFire();
    await withServerInternal(() => remult.repo(FireIncident).update(fire.id, { isDeleted: true }));
    expect(await FireIncident.getNextFireNumber(DISTRICT_ID)).toBe(2);
  });
});

describe('FireIncident.escalate', () => {
  it('raises the incident level and bumps statusAsAt', async () => {
    const fire = await seedFire();
    await FireIncident.escalate(fire.id, IncidentLevel.levelTwo);
    const reloaded = await reloadFire(fire.id);
    expect(reloaded.incidentLevel).toBe(IncidentLevel.levelTwo);
    expect(reloaded.statusAsAt!.getTime()).toBeGreaterThanOrEqual(fire.statusAsAt!.getTime());
  });

  it('rejects an equal target level', async () => {
    const fire = await seedFire({ incidentLevel: IncidentLevel.levelTwo });
    await expect(FireIncident.escalate(fire.id, IncidentLevel.levelTwo)).rejects.toThrow(
      'strictly greater',
    );
  });

  it('rejects a de-escalation', async () => {
    const fire = await seedFire({ incidentLevel: IncidentLevel.levelThree });
    await expect(FireIncident.escalate(fire.id, IncidentLevel.levelTwo)).rejects.toThrow(
      'strictly greater',
    );
  });

  it('rejects a soft-deleted fire', async () => {
    const fire = await seedFire();
    await withServerInternal(() => remult.repo(FireIncident).update(fire.id, { isDeleted: true }));
    await expect(FireIncident.escalate(fire.id, IncidentLevel.levelTwo)).rejects.toThrow(
      'soft-deleted',
    );
  });

  it('rejects a fire whose final report is signed off', async () => {
    const fire = await seedFire({ status: FireStatus.safe });
    await remult.repo(FinalReport).insert({ fireIncidentId: fire.id, isSignedOff: true });
    await expect(FireIncident.escalate(fire.id, IncidentLevel.levelTwo)).rejects.toThrow(
      'signed off',
    );
  });

  it('rejects an unknown fire', async () => {
    await expect(FireIncident.escalate('missing', IncidentLevel.levelTwo)).rejects.toThrow(
      'Fire not found',
    );
  });
});

describe('FireIncident.softDelete', () => {
  async function seedTerminalFireWithChildren(): Promise<FireIncident> {
    const fire = await seedFire();
    await remult
      .repo(SituationReport)
      .insert({ fireIncidentId: fire.id, status: FireStatus.going });
    await remult.repo(SituationReport).insert({ fireIncidentId: fire.id, status: FireStatus.safe });
    await remult.repo(FinalReport).insert({ fireIncidentId: fire.id });
    return reloadFire(fire.id);
  }

  it('cascades isParentDeleted to every child, then marks the fire deleted', async () => {
    const fire = await seedTerminalFireWithChildren();
    expect(fire.status).toBe(FireStatus.safe);

    await FireIncident.softDelete(fire.id, 'Duplicate incident');

    const reloaded = await reloadFire(fire.id);
    expect(reloaded.isDeleted).toBe(true);
    expect(reloaded.deletionReason).toBe('Duplicate incident');
    expect(reloaded.nextReportDue ?? null).toBeNull();

    const sitreps = await remult.repo(SituationReport).find({ where: { fireIncidentId: fire.id } });
    expect(sitreps).toHaveLength(2);
    expect(sitreps.every((s) => s.isParentDeleted)).toBe(true);

    const fr = await remult.repo(FinalReport).findFirst({ fireIncidentId: fire.id });
    expect(fr?.isParentDeleted).toBe(true);
  });

  it('rejects a fire that is not in a terminal status', async () => {
    const fire = await seedFire();
    await expect(FireIncident.softDelete(fire.id, 'reason')).rejects.toThrow('terminal status');
  });

  it('rejects a fire whose final report is signed off', async () => {
    const fire = await seedFire({ status: FireStatus.safe });
    await remult.repo(FinalReport).insert({ fireIncidentId: fire.id, isSignedOff: true });
    await expect(FireIncident.softDelete(fire.id, 'reason')).rejects.toThrow('signed off');
  });

  it('rejects an empty reason', async () => {
    await expect(FireIncident.softDelete('any', '')).rejects.toThrow('1-500 chars');
  });

  it('rejects an over-length reason', async () => {
    const reason = 'a'.repeat(LIMITS.description + 1);
    await expect(FireIncident.softDelete('any', reason)).rejects.toThrow('1-500 chars');
  });
});
