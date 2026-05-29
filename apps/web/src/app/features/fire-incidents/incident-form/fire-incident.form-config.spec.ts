import { signal } from '@angular/core';
import { Validators } from '@angular/forms';
import { DEV_USERS, FireIncident } from '@workspace/shared-domain';
import { InMemoryDataProvider, remult } from 'remult';
import { buildForm } from '../../../shared/forms/form-engine';
import type { SelectOption } from '../../../shared/forms/form-engine.types';
import { buildFireIncidentFormConfig } from './fire-incident.form-config';

const noDistricts = signal<readonly SelectOption[]>([]);

beforeEach(() => {
  remult.dataProvider = new InMemoryDataProvider();
  remult.user = DEV_USERS[1]!;
});

// biome-ignore lint/security/noSecrets: test description string, not a secret
describe('buildFireIncidentFormConfig', () => {
  it('covers every editable field exactly once (no throw)', () => {
    expect(() =>
      buildForm(remult.repo(FireIncident), buildFireIncidentFormConfig(noDistricts), 'create'),
    ).not.toThrow();
  });

  it('excludes incidentLevel and server-managed fields, renders enums + dates correctly', () => {
    const { form, groups } = buildForm(
      remult.repo(FireIncident),
      buildFireIncidentFormConfig(noDistricts),
      'create',
    );
    expect(form.get('incidentLevel')).toBeNull();
    expect(form.get('fireNumber')).toBeNull();
    const byKey = new Map(groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get('detectionMethod')!.widget).toBe('select');
    expect(byKey.get('declaredByTimestamp')!.widget).toBe('datetime');
  });

  it('marks name/districtId/status/reportedAt required', () => {
    const { form } = buildForm(
      remult.repo(FireIncident),
      buildFireIncidentFormConfig(noDistricts),
      'create',
    );
    for (const key of ['name', 'districtId', 'status', 'reportedAt']) {
      expect(form.get(key)!.hasValidator(Validators.required)).toBe(true);
    }
  });
});
