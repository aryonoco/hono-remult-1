import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import {
  type CurrentUser,
  DEV_USERS,
  District,
  FireIncident,
  FireStatus,
} from '@workspace/shared-domain';
import { remult } from 'remult';
import { of } from 'rxjs';
import { findAxeViolations } from '../../../../testing/axe-helper';
import { DevAuthService } from '../../../core/dev-auth.service';
import { NotificationService } from '../../../core/notification.service';
import { INVALID_CONTROL_SELECTOR } from '../../../shared/forms/focus-first-invalid';
import { IncidentFormComponent } from './incident-form';

const ADMIN = DEV_USERS[0]!; // admin, districtId null
const EDITOR = DEV_USERS[2]!; // incidentEditor, dev-editor-otway, districtId 12
const DISTRICT_ID = 12;
const HOUR_MS = 60 * 60 * 1000;
const FIRE_GROUP_COUNT = 6;

const hang = (): Promise<never> => new Promise<never>(() => undefined);
const httpStub = { get: hang, post: hang, put: hang, delete: hang };

let notification: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
let announcer: { announce: ReturnType<typeof vi.fn> };

async function setup(
  user: CurrentUser | undefined,
  id = '',
): Promise<ComponentFixture<IncidentFormComponent>> {
  notification = { success: vi.fn(), error: vi.fn() };
  announcer = { announce: vi.fn() };
  const devAuthStub = {
    currentUser: () => user,
    currentUserId: user?.id,
    selectUser: async () => undefined,
  };
  const dialogStub = { open: vi.fn(() => ({ afterClosed: () => of(true) })) };
  TestBed.configureTestingModule({
    imports: [IncidentFormComponent],
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
  const fixture = TestBed.createComponent(IncidentFormComponent);
  TestBed.tick();
  return fixture;
}

// White-box: the component is signal/resource-driven, so tests reach in for the built form and resources.
function instance(fixture: ComponentFixture<IncidentFormComponent>): any {
  return fixture.componentInstance as any;
}

function fillRequired(form: any): void {
  form.get('name').setValue('Test Fire');
  form.get('districtId').setValue(DISTRICT_ID);
  form.get('status').setValue(FireStatus.going);
  form.get('reportedAt').setValue(new Date(Date.now() - HOUR_MS));
}

beforeEach(() => {
  localStorage.clear();
  remult.apiClient.httpClient = httpStub;
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('IncidentFormComponent (create)', () => {
  it('renders the six groups with the district select enabled for an admin', async () => {
    const fixture = await setup(ADMIN);
    const inst = instance(fixture);
    expect(inst.pageState()).toBe('ready');
    expect(inst.builtForm().groups.length).toBe(FIRE_GROUP_COUNT);
    expect(inst.builtForm().form.get('districtId').disabled).toBe(false);
  });

  it('locks the district to the editor’s own district for a non-elevated editor', async () => {
    const fixture = await setup(EDITOR);
    const form = instance(fixture).builtForm().form;
    expect(form.get('districtId').disabled).toBe(true);
    expect(form.getRawValue().districtId).toBe(DISTRICT_ID);
  });

  it('prompts for a dev user and fires no district query when anonymous', async () => {
    const findSpy = vi.spyOn(remult.repo(District), 'find');
    const fixture = await setup(undefined);
    expect(instance(fixture).pageState()).toBe('anonymous');
    expect(findSpy).not.toHaveBeenCalled();
  });

  it('inserts and navigates to the new detail screen on a clean save', async () => {
    const fixture = await setup(ADMIN);
    const inst = instance(fixture);
    fillRequired(inst.builtForm().form);
    const saved = Object.assign(new FireIncident(), { id: 'fire-new' });
    vi.spyOn(remult.repo(FireIncident), 'validate').mockResolvedValue(undefined);
    const insertSpy = vi.spyOn(remult.repo(FireIncident), 'insert').mockResolvedValue(saved);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await inst.onSave();
    expect(insertSpy).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/incidents', 'fire-new']);
    expect(notification.success).toHaveBeenCalled();
    expect(announcer.announce).toHaveBeenCalledWith('Incident saved', 'polite');
  });

  it('blocks the save and does not insert when a required field is empty', async () => {
    const fixture = await setup(ADMIN);
    const inst = instance(fixture);
    inst.builtForm().form.get('name').setValue('');
    const insertSpy = vi.spyOn(remult.repo(FireIncident), 'insert');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await inst.onSave();
    expect(insertSpy).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(inst.builtForm().form.get('name').touched).toBe(true);
  });

  it('renders an invalid control the focus selector can match after a blocked save', async () => {
    const fixture = await setup(ADMIN);
    const inst = instance(fixture);
    inst.builtForm().form.get('name').setValue('');
    await inst.onSave();
    TestBed.tick();
    // The focus-on-error selector targets the control element directly (Angular puts ng-invalid there).
    expect(
      (fixture.nativeElement as HTMLElement).querySelector(INVALID_CONTROL_SELECTOR),
    ).not.toBeNull();
  });

  it('surfaces a server rejection as a control error without navigating', async () => {
    const fixture = await setup(ADMIN);
    const inst = instance(fixture);
    const form = inst.builtForm().form;
    fillRequired(form);
    vi.spyOn(remult.repo(FireIncident), 'validate').mockResolvedValue({
      message: 'Validation failed',
      modelState: { name: 'Name already exists' },
    } as any);
    const insertSpy = vi.spyOn(remult.repo(FireIncident), 'insert');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await inst.onSave();
    expect(insertSpy).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(notification.error).toHaveBeenCalled();
    expect((form.get('name').errors as any)?.server).toBe('Name already exists');
  });

  it('has no structural accessibility violations', async () => {
    const fixture = await setup(ADMIN);
    expect(await findAxeViolations(fixture.nativeElement)).toEqual([]);
  });
});

describe('IncidentFormComponent (edit)', () => {
  function seededFire(): FireIncident {
    return Object.assign(new FireIncident(), {
      id: 'fire-1',
      name: 'Original',
      districtId: DISTRICT_ID,
      status: FireStatus.going,
      reportedAt: new Date(Date.now() - HOUR_MS),
    });
  }

  it('stays in the loading state while the record loads', async () => {
    const fixture = await setup(ADMIN, 'fire-1');
    expect(instance(fixture).pageState()).toBe('loading');
  });

  it('shows not-found when the record resolves empty', async () => {
    const fixture = await setup(ADMIN, 'fire-1');
    instance(fixture).editResource.set(undefined);
    TestBed.tick();
    expect(instance(fixture).pageState()).toBe('notFound');
  });

  it('updates the existing record (never inserts) and returns to the detail screen', async () => {
    const fixture = await setup(ADMIN, 'fire-1');
    const inst = instance(fixture);
    inst.editResource.set(seededFire());
    TestBed.tick();
    expect(inst.pageState()).toBe('ready');
    inst.builtForm().form.get('name').setValue('Renamed');
    vi.spyOn(remult.repo(FireIncident), 'validate').mockResolvedValue(undefined);
    const updateSpy = vi.spyOn(remult.repo(FireIncident), 'update').mockResolvedValue(seededFire());
    const insertSpy = vi.spyOn(remult.repo(FireIncident), 'insert');
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await inst.onSave();
    expect(updateSpy).toHaveBeenCalledWith('fire-1', expect.objectContaining({ name: 'Renamed' }));
    expect(insertSpy).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(['/incidents', 'fire-1']);
  });
});
