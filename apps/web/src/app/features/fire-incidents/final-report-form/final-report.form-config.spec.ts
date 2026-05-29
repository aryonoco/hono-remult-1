import { DEV_USERS, FinalReport } from '@workspace/shared-domain';
import { InMemoryDataProvider, remult } from 'remult';
import { buildForm } from '../../../shared/forms/form-engine';
import { buildFinalReportFormConfig } from './final-report.form-config';

beforeEach(() => {
  remult.dataProvider = new InMemoryDataProvider();
  remult.user = DEV_USERS[1]!;
});

// biome-ignore lint/security/noSecrets: test description string, not a secret
describe('buildFinalReportFormConfig', () => {
  it('covers every editable field exactly once on create and edit (no throw)', () => {
    expect(() =>
      buildForm(remult.repo(FinalReport), buildFinalReportFormConfig('create'), 'create', {
        fireIncidentId: 'f1',
      }),
    ).not.toThrow();
    expect(() =>
      buildForm(remult.repo(FinalReport), buildFinalReportFormConfig('edit'), 'edit', {
        fireIncidentId: 'f1',
      }),
    ).not.toThrow();
  });

  it('includes isSignedOff on create, excludes it on edit', () => {
    const create = buildForm(
      remult.repo(FinalReport),
      buildFinalReportFormConfig('create'),
      'create',
      {
        fireIncidentId: 'f1',
      },
    );
    const edit = buildForm(remult.repo(FinalReport), buildFinalReportFormConfig('edit'), 'edit', {
      fireIncidentId: 'f1',
    });
    expect(create.form.get('isSignedOff')).not.toBeNull();
    expect(edit.form.get('isSignedOff')).toBeNull();
  });

  it('builds integer loss fields and a readonly incident id', () => {
    const { form, groups } = buildForm(
      remult.repo(FinalReport),
      buildFinalReportFormConfig('create'),
      'create',
      {
        fireIncidentId: 'f1',
      },
    );
    expect(form.get('fireIncidentId')!.disabled).toBe(true);
    const byKey = new Map(groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get('stockLost')!.widget).toBe('integer');
    expect(byKey.get('costClass')!.widget).toBe('select');
  });
});
