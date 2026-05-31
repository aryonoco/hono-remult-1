import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { type CurrentUser, DEV_USERS, FinalReport } from '@workspace/shared-domain';
import { remult } from 'remult';
import { of } from 'rxjs';
import { findAxeViolations } from '../../../../testing/axe-helper';
import { DevAuthService } from '../../../core/dev-auth.service';
import { NotificationService } from '../../../core/notification.service';
import { FinalReportFormComponent } from './final-report-form';

const ADMIN = DEV_USERS[0]!;
const FIRE_ID = 'fire-1';

const hang = (): Promise<never> => new Promise<never>(() => undefined);
const httpStub = { get: hang, post: hang, put: hang, delete: hang };

let notification: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
let announcer: { announce: ReturnType<typeof vi.fn> };

async function setup(
  user: CurrentUser | undefined,
  mode: 'create' | 'edit',
  id = FIRE_ID,
): Promise<ComponentFixture<FinalReportFormComponent>> {
  notification = { success: vi.fn(), error: vi.fn() };
  announcer = { announce: vi.fn() };
  const devAuthStub = {
    currentUser: () => user,
    currentUserId: user?.id,
    selectUser: async () => undefined,
  };
  const dialogStub = { open: vi.fn(() => ({ afterClosed: () => of(true) })) };
  TestBed.configureTestingModule({
    imports: [FinalReportFormComponent],
    providers: [
      provideRouter([]),
      { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
      provideNativeDateAdapter(),
      { provide: MAT_DATE_LOCALE, useValue: 'en-AU' },
      {
        provide: ActivatedRoute,
        useValue: { paramMap: of(convertToParamMap({ id })), data: of({ mode }) },
      },
      { provide: DevAuthService, useValue: devAuthStub },
      { provide: NotificationService, useValue: notification },
      { provide: LiveAnnouncer, useValue: announcer },
      { provide: MatDialog, useValue: dialogStub },
    ],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(FinalReportFormComponent);
  TestBed.tick();
  return fixture;
}

function instance(fixture: ComponentFixture<FinalReportFormComponent>): any {
  return fixture.componentInstance as any;
}

function reportRow(): FinalReport {
  return Object.assign(new FinalReport(), {
    id: 'fr-1',
    fireIncidentId: FIRE_ID,
    isSignedOff: false,
  });
}

function hasGroup(fixture: ComponentFixture<FinalReportFormComponent>, title: string): boolean {
  return instance(fixture)
    .builtForm()
    .groups.some((g: { title: string }) => g.title === title);
}

beforeEach(() => {
  localStorage.clear();
  remult.apiClient.httpClient = httpStub;
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('FinalReportFormComponent (create)', () => {
  it('includes the Sign-off group', async () => {
    const fixture = await setup(ADMIN, 'create');
    expect(instance(fixture).pageState()).toBe('ready');
    expect(hasGroup(fixture, 'Sign-off')).toBe(true);
  });

  it('inserts a new report and returns to the parent detail screen', async () => {
    const fixture = await setup(ADMIN, 'create');
    const inst = instance(fixture);
    vi.spyOn(remult.repo(FinalReport), 'validate').mockResolvedValue(undefined);
    const insertSpy = vi.spyOn(remult.repo(FinalReport), 'insert').mockResolvedValue(reportRow());
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await inst.onSave();
    expect(insertSpy).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/incidents', FIRE_ID]);
  });

  it('has no structural accessibility violations', async () => {
    const fixture = await setup(ADMIN, 'create');
    expect(await findAxeViolations(fixture.nativeElement)).toEqual([]);
  });
});

describe('FinalReportFormComponent (edit)', () => {
  it('loads the existing report by its parent fire id', async () => {
    const findFirstSpy = vi
      .spyOn(remult.repo(FinalReport), 'findFirst')
      .mockResolvedValue(reportRow());
    await setup(ADMIN, 'edit', FIRE_ID);
    expect(findFirstSpy).toHaveBeenCalledWith({ fireIncidentId: FIRE_ID });
  });

  it('excludes the Sign-off group', async () => {
    const fixture = await setup(ADMIN, 'edit', FIRE_ID);
    instance(fixture).editResource.set(reportRow());
    TestBed.tick();
    expect(hasGroup(fixture, 'Sign-off')).toBe(false);
  });

  it('shows not-found when no report exists for the incident', async () => {
    const fixture = await setup(ADMIN, 'edit', FIRE_ID);
    instance(fixture).editResource.set(undefined);
    TestBed.tick();
    expect(instance(fixture).pageState()).toBe('notFound');
  });

  it('updates the existing report (never inserts) and returns to the detail screen', async () => {
    const fixture = await setup(ADMIN, 'edit', FIRE_ID);
    const inst = instance(fixture);
    inst.editResource.set(reportRow());
    TestBed.tick();
    expect(inst.pageState()).toBe('ready');
    vi.spyOn(remult.repo(FinalReport), 'validate').mockResolvedValue(undefined);
    const updateSpy = vi.spyOn(remult.repo(FinalReport), 'update').mockResolvedValue(reportRow());
    const insertSpy = vi.spyOn(remult.repo(FinalReport), 'insert');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await inst.onSave();
    expect(updateSpy).toHaveBeenCalledWith('fr-1', expect.any(Object));
    expect(insertSpy).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/incidents', FIRE_ID]);
  });
});
