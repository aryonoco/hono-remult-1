import { DEV_USERS, SituationReport } from '@workspace/shared-domain';
import { InMemoryDataProvider, remult } from 'remult';
import { buildForm } from '../../../shared/forms/form-engine';
import { situationReportFormConfig } from './situation-report.form-config';

beforeEach(() => {
  remult.dataProvider = new InMemoryDataProvider();
  remult.user = DEV_USERS[1]!;
});

describe('situationReportFormConfig', () => {
  it('covers every editable field exactly once (no throw)', () => {
    expect(() =>
      buildForm(remult.repo(SituationReport), situationReportFormConfig, 'create', {
        fireIncidentId: 'f1',
      }),
    ).not.toThrow();
  });

  it('builds fireIncidentId readonly and integer resource fields', () => {
    const { form, groups } = buildForm(
      remult.repo(SituationReport),
      situationReportFormConfig,
      'create',
      {
        fireIncidentId: 'f1',
      },
    );
    expect(form.get('fireIncidentId')!.disabled).toBe(true);
    const byKey = new Map(groups.flatMap((g) => g.fields).map((f) => [f.key, f]));
    expect(byKey.get('personnel')!.widget).toBe('integer');
    expect(byKey.get('significantEvents')!.widget).toBe('textarea');
    expect(byKey.get('status')!.widget).toBe('select');
  });
});
