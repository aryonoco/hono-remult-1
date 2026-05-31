import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { type CurrentUser, DEV_USERS, FireStatus, SituationReport } from '@workspace/shared-domain';
import { remult } from 'remult';
import { of } from 'rxjs';
import { findAxeViolations } from '../../../../testing/axe-helper';
import { DevAuthService } from '../../../core/dev-auth.service';
import { NotificationService } from '../../../core/notification.service';
import { SituationReportFormComponent } from './situation-report-form';

const ADMIN = DEV_USERS[0]!;
const FIRE_ID = 'fire-1';

const hang = (): Promise<never> => new Promise<never>(() => undefined);
const httpStub = { get: hang, post: hang, put: hang, delete: hang };

let notification: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
let announcer: { announce: ReturnType<typeof vi.fn> };

async function setup(
  user: CurrentUser | undefined,
  id = FIRE_ID,
): Promise<ComponentFixture<SituationReportFormComponent>> {
  notification = { success: vi.fn(), error: vi.fn() };
  announcer = { announce: vi.fn() };
  const devAuthStub = {
    currentUser: () => user,
    currentUserId: user?.id,
    selectUser: async () => undefined,
  };
  const dialogStub = { open: vi.fn(() => ({ afterClosed: () => of(true) })) };
  TestBed.configureTestingModule({
    imports: [SituationReportFormComponent],
    providers: [
      provideRouter([]),
      { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
      provideNativeDateAdapter(),
      { provide: MAT_DATE_LOCALE, useValue: 'en-AU' },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id })) } },
      { provide: DevAuthService, useValue: devAuthStub },
      { provide: NotificationService, useValue: notification },
      { provide: LiveAnnouncer, useValue: announcer },
      { provide: MatDialog, useValue: dialogStub },
    ],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(SituationReportFormComponent);
  TestBed.tick();
  return fixture;
}

function instance(fixture: ComponentFixture<SituationReportFormComponent>): any {
  return fixture.componentInstance as any;
}

beforeEach(() => {
  localStorage.clear();
  remult.apiClient.httpClient = httpStub;
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('SituationReportFormComponent', () => {
  it('seeds the parent incident id into a readonly control', async () => {
    const fixture = await setup(ADMIN);
    const form = instance(fixture).builtForm().form;
    expect(form.get('fireIncidentId').disabled).toBe(true);
    expect(form.getRawValue().fireIncidentId).toBe(FIRE_ID);
  });

  it('prompts for a dev user when anonymous', async () => {
    const fixture = await setup(undefined);
    expect(instance(fixture).pageState()).toBe('anonymous');
  });

  it('blocks the save when the required status is cleared', async () => {
    const fixture = await setup(ADMIN);
    const inst = instance(fixture);
    inst.builtForm().form.get('status').setValue(null);
    const insertSpy = vi.spyOn(remult.repo(SituationReport), 'insert');
    await inst.onSave();
    expect(insertSpy).not.toHaveBeenCalled();
    expect(inst.builtForm().form.get('status').touched).toBe(true);
  });

  it('inserts a new report and returns to the parent detail screen', async () => {
    const fixture = await setup(ADMIN);
    const inst = instance(fixture);
    inst.builtForm().form.get('status').setValue(FireStatus.going);
    vi.spyOn(remult.repo(SituationReport), 'validate').mockResolvedValue(undefined);
    const insertSpy = vi
      .spyOn(remult.repo(SituationReport), 'insert')
      .mockResolvedValue(Object.assign(new SituationReport(), { id: 'sr-1' }));
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await inst.onSave();
    expect(insertSpy).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/incidents', FIRE_ID]);
    expect(notification.success).toHaveBeenCalled();
  });

  it('has no structural accessibility violations', async () => {
    const fixture = await setup(ADMIN);
    expect(await findAxeViolations(fixture.nativeElement)).toEqual([]);
  });
});
