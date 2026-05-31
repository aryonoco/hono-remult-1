import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import {
  type ComponentFixture,
  DeferBlockBehavior,
  DeferBlockState,
  TestBed,
} from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import {
  type CurrentUser,
  DEV_USERS,
  District,
  FinalReport,
  FireIncident,
  FireStatus,
  IncidentLevel,
  operatorName,
  SituationReport,
  statusTone,
} from '@workspace/shared-domain';
import { remult } from 'remult';
import { of } from 'rxjs';
import { findAxeViolations } from '../../../../testing/axe-helper';
import { DevAuthService } from '../../../core/dev-auth.service';
import { NotificationService } from '../../../core/notification.service';
import { IncidentDetailComponent } from './incident-detail';

const ADMIN = DEV_USERS[0]!; // admin, districtId null
const STATE_OFFICER = DEV_USERS[1]!; // stateOfficer, districtId null
const EDITOR = DEV_USERS[2]!; // incidentEditor, dev-editor-otway
const OTHER_EDITOR = DEV_USERS[3]!; // incidentEditor, dev-editor-latrobe
const VIEWER = DEV_USERS[5]!; // viewer, dev-viewer-otway

// `resource()` loads the fire over an HTTP GET that does not exist in a unit test. The transport is
// neutralised (the load never resolves) and the resolved state is driven white-box via the resource's
// writable value, matching the inert-transport approach in `incident-list.spec.ts`.
const hang = (): Promise<never> => new Promise<never>(() => undefined);
const httpStub = { get: hang, post: hang, put: hang, delete: hang };

// jsdom lacks `matchMedia` (the IncidentMapComponent's ThemeService consults it) and `IntersectionObserver`
// (Angular's `@defer (prefetch on idle)` map/final-report blocks register one). Stub both (test-only).
function stubBrowserApis(): void {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  );
  class IntersectionObserverStub {
    observe(): void {
      /* no-op */
    }
    unobserve(): void {
      /* no-op */
    }
    disconnect(): void {
      /* no-op */
    }
    takeRecords(): [] {
      return [];
    }
  }
  vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);
}

let notification: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
let announcer: { announce: ReturnType<typeof vi.fn> };

async function setup(
  user: CurrentUser | undefined,
  dialogResult?: unknown,
): Promise<ComponentFixture<IncidentDetailComponent>> {
  notification = { success: vi.fn(), error: vi.fn() };
  announcer = { announce: vi.fn() };
  const devAuthStub = {
    currentUser: () => user,
    currentUserId: user?.id,
    selectUser: async () => undefined,
  };
  const dialogStub = { open: vi.fn(() => ({ afterClosed: () => of(dialogResult) })) };
  TestBed.configureTestingModule({
    imports: [IncidentDetailComponent],
    // The final-report panel is wrapped in `@defer (on viewport)`; jsdom has no IntersectionObserver, so
    // defer blocks are driven manually and rendered to Complete in `seed` when a final report is present.
    deferBlockBehavior: DeferBlockBehavior.Manual,
    providers: [
      provideRouter([]),
      { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
      { provide: ActivatedRoute, useValue: { paramMap: of(convertToParamMap({ id: 'fire-1' })) } },
      { provide: DevAuthService, useValue: devAuthStub },
      { provide: NotificationService, useValue: notification },
      { provide: LiveAnnouncer, useValue: announcer },
      { provide: MatDialog, useValue: dialogStub },
    ],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(IncidentDetailComponent);
  // The fire is loaded via `resource()` over a transport stubbed to hang, so the app is never "stable";
  // drive change detection synchronously with `TestBed.tick()` instead of awaiting `whenStable()`.
  TestBed.tick();
  return fixture;
}

function instance(fixture: ComponentFixture<IncidentDetailComponent>): any {
  return fixture.componentInstance as any;
}

async function seed(
  fixture: ComponentFixture<IncidentDetailComponent>,
  overrides: Partial<FireIncident> = {},
): Promise<FireIncident> {
  const fire = Object.assign(
    new FireIncident(),
    {
      id: 'fire-1',
      name: 'Test Fire',
      districtId: 12,
      fireNumber: 7,
      globalIncidentId: 101,
      status: FireStatus.going,
      incidentLevel: IncidentLevel.levelOne,
      isMajor: false,
      createdBy: EDITOR.id,
      reportedAt: new Date('2026-01-15T03:30:00Z'),
      statusAsAt: new Date('2026-01-15T03:30:00Z'),
      district: Object.assign(new District(), { id: 12, name: 'Otway' }),
      situationReports: [] as SituationReport[],
      finalReport: undefined as FinalReport | undefined,
    },
    overrides,
  );
  instance(fixture).fireResource.set(fire);
  TestBed.tick();
  // Render the final-report `@defer` block to Complete so its panel/actions can be asserted (no-op when the
  // guard hides it — e.g. for a viewer or an incident with no final report).
  const deferBlocks = await fixture.getDeferBlocks();
  await Promise.all(deferBlocks.map((block) => block.render(DeferBlockState.Complete)));
  TestBed.tick();
  return fire;
}

function sampleSitrep(): SituationReport {
  return Object.assign(new SituationReport(), {
    id: 'sr-1',
    reportNumber: 1,
    status: FireStatus.going,
    submittedAt: new Date('2026-01-16T03:30:00Z'),
    personnel: 5,
    vehicles: 2,
    aircraft: 0,
  });
}

function unsignedFinal(): FinalReport {
  return Object.assign(new FinalReport(), { id: 'fr-1', isSignedOff: false });
}

function signedFinal(): FinalReport {
  return Object.assign(new FinalReport(), {
    id: 'fr-1',
    isSignedOff: true,
    signedOffBy: 'dev-admin',
  });
}

function shown(fixture: ComponentFixture<IncidentDetailComponent>, testid: string): boolean {
  return (fixture.nativeElement as HTMLElement).querySelector(`[data-testid="${testid}"]`) !== null;
}

function text(fixture: ComponentFixture<IncidentDetailComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

const ACTION_TESTIDS = [
  'action-edit',
  'action-escalate',
  'action-sitrep',
  'action-create-final',
  'action-delete',
  'action-signoff',
  'action-remove-signoff',
  'action-edit-final',
  'final-report-panel',
];

function actionSnapshot(
  fixture: ComponentFixture<IncidentDetailComponent>,
): Record<string, boolean> {
  const snapshot: Record<string, boolean> = {};
  for (const testid of ACTION_TESTIDS) {
    snapshot[testid] = shown(fixture, testid);
  }
  return snapshot;
}

beforeEach(() => {
  localStorage.clear();
  stubBrowserApis();
  remult.apiClient.httpClient = httpStub;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('IncidentDetailComponent (gating matrix)', () => {
  it('viewer sees no actions and no final-report panel', async () => {
    const fixture = await setup(VIEWER);
    await seed(fixture, { status: FireStatus.safe, finalReport: unsignedFinal() });
    expect(actionSnapshot(fixture)).toMatchObject({
      'action-edit': false,
      'action-escalate': false,
      'action-sitrep': false,
      'action-create-final': false,
      'action-delete': false,
      'action-signoff': false,
      'action-remove-signoff': false,
      'action-edit-final': false,
      'final-report-panel': false,
    });
  });

  it('editor on own pre-sitrep fire sees Edit and New Sitrep only', async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, {});
    expect(actionSnapshot(fixture)).toMatchObject({
      'action-edit': true,
      'action-sitrep': true,
      'action-escalate': false,
      'action-delete': false,
      'action-create-final': false,
    });
  });

  it('editor loses Edit once a sitrep exists', async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, { situationReports: [sampleSitrep()] });
    expect(actionSnapshot(fixture)).toMatchObject({ 'action-edit': false, 'action-sitrep': true });
  });

  it("editor cannot edit another district editor's fire", async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, { createdBy: OTHER_EDITOR.id });
    expect(actionSnapshot(fixture)).toMatchObject({ 'action-edit': false, 'action-sitrep': true });
  });

  it('editor on own terminal fire can create a final report', async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, { status: FireStatus.safe });
    expect(actionSnapshot(fixture)).toMatchObject({
      'action-create-final': true,
      'action-edit': true,
      'action-sitrep': true,
      'action-delete': false,
    });
  });

  it('editor with a final report sees the subpanel and Sign off, not New Sitrep', async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, { status: FireStatus.safe, finalReport: unsignedFinal() });
    expect(actionSnapshot(fixture)).toMatchObject({
      'action-create-final': false,
      'action-sitrep': false,
      'action-edit': false,
      'final-report-panel': true,
      'action-signoff': true,
      'action-edit-final': true,
      'action-remove-signoff': false,
    });
  });

  it('state officer can escalate and edit a live fire', async () => {
    const fixture = await setup(STATE_OFFICER);
    await seed(fixture, {});
    expect(actionSnapshot(fixture)).toMatchObject({
      'action-escalate': true,
      'action-edit': true,
      'action-sitrep': true,
      'action-delete': false,
      'action-create-final': false,
    });
  });

  it('escalate disappears at level three', async () => {
    const fixture = await setup(STATE_OFFICER);
    await seed(fixture, { incidentLevel: IncidentLevel.levelThree });
    expect(actionSnapshot(fixture)).toMatchObject({ 'action-escalate': false });
  });

  it('admin on a terminal fire sees the full elevated action set', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, { status: FireStatus.safe });
    expect(actionSnapshot(fixture)).toMatchObject({
      'action-escalate': true,
      'action-delete': true,
      'action-create-final': true,
      'action-edit': true,
      'action-sitrep': true,
    });
  });

  it('a signed-off report locks every action except Remove sign-off', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, { status: FireStatus.safe, finalReport: signedFinal() });
    expect(actionSnapshot(fixture)).toMatchObject({
      'final-report-panel': true,
      'action-remove-signoff': true,
      'action-signoff': false,
      'action-edit-final': false,
      'action-edit': false,
      'action-escalate': false,
      'action-delete': false,
      'action-sitrep': false,
      'action-create-final': false,
    });
  });

  it('state officer can sign off, delete, and escalate a terminal fire with an unsigned report', async () => {
    const fixture = await setup(STATE_OFFICER);
    await seed(fixture, { status: FireStatus.safe, finalReport: unsignedFinal() });
    expect(actionSnapshot(fixture)).toMatchObject({
      'action-signoff': true,
      'action-delete': true,
      'action-escalate': true,
      'action-edit-final': true,
      'action-remove-signoff': false,
    });
  });

  it('prompts to select a dev user when anonymous', async () => {
    const fixture = await setup(undefined);
    expect(text(fixture)).toContain('Select a dev user');
    expect(shown(fixture, 'action-edit')).toBe(false);
    expect(shown(fixture, 'final-report-panel')).toBe(false);
  });

  it('shows not-found when the incident resolves empty', async () => {
    const fixture = await setup(ADMIN);
    instance(fixture).fireResource.set(undefined);
    TestBed.tick();
    expect(text(fixture)).toContain('Incident not found');
  });

  it('has no structural accessibility violations with the final-report panel rendered', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, { status: FireStatus.safe, finalReport: signedFinal() });
    expect(await findAxeViolations(fixture.nativeElement)).toEqual([]);
  });
});

describe('IncidentDetailComponent (actions)', () => {
  it('escalate calls the BackendMethod and notifies', async () => {
    const fixture = await setup(ADMIN, IncidentLevel.levelTwo);
    await seed(fixture, {});
    const spy = vi.spyOn(FireIncident, 'escalate').mockResolvedValue(undefined);
    await instance(fixture).onEscalate();
    expect(spy).toHaveBeenCalledWith('fire-1', IncidentLevel.levelTwo);
    expect(notification.success).toHaveBeenCalled();
  });

  it('escalate does nothing when cancelled', async () => {
    const fixture = await setup(ADMIN, undefined);
    await seed(fixture, {});
    const spy = vi.spyOn(FireIncident, 'escalate').mockResolvedValue(undefined);
    await instance(fixture).onEscalate();
    expect(spy).not.toHaveBeenCalled();
  });

  it('delete calls softDelete and navigates to the list', async () => {
    const fixture = await setup(ADMIN, { reason: 'cleanup' });
    await seed(fixture, { status: FireStatus.safe });
    const spy = vi.spyOn(FireIncident, 'softDelete').mockResolvedValue(undefined);
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    await instance(fixture).onDelete();
    expect(spy).toHaveBeenCalledWith('fire-1', 'cleanup');
    expect(navigate).toHaveBeenCalledWith(['/incidents']);
  });

  it('delete does nothing when cancelled', async () => {
    const fixture = await setup(ADMIN, undefined);
    await seed(fixture, { status: FireStatus.safe });
    const spy = vi.spyOn(FireIncident, 'softDelete').mockResolvedValue(undefined);
    await instance(fixture).onDelete();
    expect(spy).not.toHaveBeenCalled();
  });

  it('sign off updates the final report', async () => {
    const fixture = await setup(EDITOR, true);
    await seed(fixture, { status: FireStatus.safe, finalReport: unsignedFinal() });
    const spy = vi.spyOn(remult.repo(FinalReport), 'update').mockResolvedValue(signedFinal());
    await instance(fixture).onSignOff();
    expect(spy).toHaveBeenCalledWith('fr-1', { isSignedOff: true });
    expect(notification.success).toHaveBeenCalled();
  });

  it('sign off does nothing when cancelled', async () => {
    const fixture = await setup(EDITOR, false);
    await seed(fixture, { status: FireStatus.safe, finalReport: unsignedFinal() });
    const spy = vi.spyOn(remult.repo(FinalReport), 'update').mockResolvedValue(unsignedFinal());
    await instance(fixture).onSignOff();
    expect(spy).not.toHaveBeenCalled();
  });

  it('remove sign-off calls the BackendMethod', async () => {
    const fixture = await setup(ADMIN, { reason: 'reopen' });
    await seed(fixture, { status: FireStatus.safe, finalReport: signedFinal() });
    const spy = vi.spyOn(FinalReport, 'removeSignOff').mockResolvedValue(undefined);
    await instance(fixture).onRemoveSignOff();
    expect(spy).toHaveBeenCalledWith('fr-1', 'reopen');
    expect(notification.success).toHaveBeenCalled();
  });

  it('remove sign-off does nothing when cancelled', async () => {
    const fixture = await setup(ADMIN, undefined);
    await seed(fixture, { status: FireStatus.safe, finalReport: signedFinal() });
    const spy = vi.spyOn(FinalReport, 'removeSignOff').mockResolvedValue(undefined);
    await instance(fixture).onRemoveSignOff();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('IncidentDetailComponent (map points + author names)', () => {
  it('derives one map point with the status tone when coordinates are present', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, {
      status: FireStatus.going,
      latitude: -38.1,
      longitude: 143.5,
      name: 'Coastal Fire',
    });
    const points = instance(fixture).detailMapPoints();
    expect(points).toEqual([
      { lat: -38.1, lng: 143.5, tone: statusTone(FireStatus.going), name: 'Coastal Fire' },
    ]);
  });

  it('derives no map points when coordinates are missing', async () => {
    const fixture = await setup(ADMIN);
    // The seeded fire has no latitude/longitude, so the map falls back to its empty state.
    await seed(fixture, {});
    expect(instance(fixture).detailMapPoints()).toEqual([]);
  });

  it('resolves an author id to an operator display name', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, {});
    expect(instance(fixture).authorName(EDITOR.id)).toBe(operatorName(EDITOR.id));
  });
});
