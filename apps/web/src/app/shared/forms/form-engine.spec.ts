import { signal } from '@angular/core';
import { type AbstractControl, Validators } from '@angular/forms';
import {
  DEV_USERS,
  District,
  FireIncident,
  LIMITS,
  SituationReport,
} from '@workspace/shared-domain';
import { InMemoryDataProvider, remult } from 'remult';
import { buildFireIncidentFormConfig } from '../../features/fire-incidents/incident-form/fire-incident.form-config';
import { situationReportFormConfig } from '../../features/fire-incidents/sitrep-form/situation-report.form-config';
import { buildForm, submitEntityForm } from './form-engine';
import type { KnownValidationErrors, SelectOption } from './form-engine.types';

const OFFICER = DEV_USERS[1]!;
const DISTRICT_ID = 12;
const noDistricts = signal<readonly SelectOption[]>([]);
const NOT_PLACED_RE = /not placed in any form group/;
const DUPLICATE_GROUP_RE = /more than one form group/;
const EXCLUDED_FIELD_RE = /excluded or unknown/;

function errs(control: AbstractControl | null): KnownValidationErrors {
  return (control?.errors ?? {}) as KnownValidationErrors;
}

beforeEach(() => {
  remult.dataProvider = new InMemoryDataProvider();
  remult.user = OFFICER;
});

describe('buildForm exclusions + widgets', () => {
  it('excludes server-managed, relation, and config-excluded fields', () => {
    const { form } = buildForm(
      remult.repo(FireIncident),
      buildFireIncidentFormConfig(noDistricts),
      'create',
    );
    for (const key of [
      'id',
      'financialYear',
      'fireNumber',
      'globalIncidentId',
      'createdBy',
      'createdAt',
      'updatedAt',
      'statusAsAt',
      'totalPersonnel',
      'nextReportDue',
      'isDeleted',
      'district',
      'situationReports',
      'finalReport',
      'incidentLevel',
    ]) {
      expect(form.get(key)).toBeNull();
    }
  });

  it('resolves widgets from metadata + hints', () => {
    const { groups } = buildForm(
      remult.repo(FireIncident),
      buildFireIncidentFormConfig(noDistricts),
      'create',
    );
    const byKey = new Map(groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get('status')!.widget).toBe('select');
    expect(byKey.get('districtId')!.widget).toBe('select');
    expect(byKey.get('reportedAt')!.widget).toBe('datetime');
    expect(byKey.get('isMajor')!.widget).toBe('slideToggle');
    expect(byKey.get('isCauseConfirmed')!.widget).toBe('checkbox');
    expect(byKey.get('locationDescription')!.widget).toBe('textarea');
    expect(byKey.get('latitude')!.widget).toBe('number');
    expect(byKey.get('name')!.widget).toBe('text');
  });

  it('attaches required + maxLength validators from hints', () => {
    const { form } = buildForm(
      remult.repo(FireIncident),
      buildFireIncidentFormConfig(noDistricts),
      'create',
    );
    expect(form.get('name')!.hasValidator(Validators.required)).toBe(true);
    form.get('name')!.setValue('x'.repeat(LIMITS.name + 1));
    expect(errs(form.get('name')).maxlength).toBeTruthy();
  });

  it('builds readonly fields disabled: present in getRawValue, absent from value', () => {
    const { form } = buildForm(remult.repo(SituationReport), situationReportFormConfig, 'create', {
      fireIncidentId: 'fire-1',
    });
    expect(form.get('fireIncidentId')!.disabled).toBe(true);
    expect((form.value as { fireIncidentId?: unknown }).fireIncidentId).toBeUndefined();
    expect((form.getRawValue() as { fireIncidentId?: unknown }).fireIncidentId).toBe('fire-1');
  });

  it('flags a future value on a maxNow field (reportedAt) and clears it for a past value', () => {
    const { form } = buildForm(
      remult.repo(FireIncident),
      buildFireIncidentFormConfig(noDistricts),
      'create',
    );
    const reportedAt = form.get('reportedAt')!;
    reportedAt.setValue(new Date(Date.now() + 60 * 60 * 1000));
    expect(errs(reportedAt).maxNow).toBe(true);
    reportedAt.setValue(new Date(Date.now() - 60 * 60 * 1000));
    expect(errs(reportedAt).maxNow).toBeUndefined();
  });

  it('initialises number controls as nullable', () => {
    const { form } = buildForm(
      remult.repo(FireIncident),
      buildFireIncidentFormConfig(noDistricts),
      'create',
    );
    const latitude = form.get('latitude')!;
    expect(latitude.value).toBeNull();
    latitude.setValue(null);
    expect(latitude.value).toBeNull();
  });
});

describe('assertGroupsCoverIncluded', () => {
  it('throws when an included field is in no group', () => {
    const config = buildFireIncidentFormConfig(noDistricts);
    const broken = { ...config, groups: config.groups.slice(1) };
    expect(() => buildForm(remult.repo(FireIncident), broken, 'create')).toThrow(NOT_PLACED_RE);
  });

  it('throws when a field appears in more than one group', () => {
    const config = buildFireIncidentFormConfig(noDistricts);
    const broken = { ...config, groups: [...config.groups, config.groups[0]!] };
    expect(() => buildForm(remult.repo(FireIncident), broken, 'create')).toThrow(
      DUPLICATE_GROUP_RE,
    );
  });

  it('throws when a group lists an excluded/unknown field', () => {
    const config = buildFireIncidentFormConfig(noDistricts);
    const broken = {
      ...config,
      groups: [...config.groups, { title: 'X', fields: ['totalPersonnel'] as any }],
    };
    expect(() => buildForm(remult.repo(FireIncident), broken, 'create')).toThrow(EXCLUDED_FIELD_RE);
  });
});

describe('submitEntityForm', () => {
  beforeEach(async () => {
    await remult.repo(District).insert({
      id: DISTRICT_ID,
      name: 'Otway',
      regionId: 1,
      regionName: 'Barwon South West',
      isActive: true,
    });
  });

  it('applies repo.validate field errors and skips insert', async () => {
    const config = buildFireIncidentFormConfig(noDistricts);
    const { form } = buildForm(remult.repo(FireIncident), config, 'create');
    form.get('name')!.setValue('');
    const before = await remult.repo(FireIncident).count();
    const result = await submitEntityForm(remult.repo(FireIncident), form, 'create');
    expect(result.isErr()).toBe(true);
    expect(errs(form.get('name')).server).toBeTruthy();
    expect(await remult.repo(FireIncident).count()).toBe(before);
  });

  it('inserts on clean data and returns ok', async () => {
    const config = buildFireIncidentFormConfig(noDistricts);
    const { form } = buildForm(remult.repo(FireIncident), config, 'create');
    form.get('name')!.setValue('Test Fire');
    form.get('districtId')!.setValue(DISTRICT_ID);
    form.get('reportedAt')!.setValue(new Date());
    const result = await submitEntityForm(remult.repo(FireIncident), form, 'create');
    expect(result.isOk()).toBe(true);
    expect(await remult.repo(FireIncident).count()).toBe(1);
  });

  it('updates the existing record in edit mode without inserting a duplicate', async () => {
    const created = await remult.repo(FireIncident).insert({
      name: 'Original',
      districtId: DISTRICT_ID,
      reportedAt: new Date(),
    });
    expect(await remult.repo(FireIncident).count()).toBe(1);

    const config = buildFireIncidentFormConfig(noDistricts);
    const { form } = buildForm(remult.repo(FireIncident), config, 'edit', created);
    form.get('name')!.setValue('Renamed');
    const result = await submitEntityForm(remult.repo(FireIncident), form, 'edit', created);

    expect(result.isOk()).toBe(true);
    expect(await remult.repo(FireIncident).count()).toBe(1);
    const reloaded = await remult.repo(FireIncident).findId(created.id);
    expect(reloaded?.name).toBe('Renamed');
  });
});
