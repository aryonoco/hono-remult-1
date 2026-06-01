import { LiveAnnouncer } from '@angular/cdk/a11y';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import {
  type ComponentFixture,
  DeferBlockBehavior,
  DeferBlockState,
  TestBed,
} from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Title } from '@angular/platform-browser';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import {
  type CurrentUser,
  DEV_USERS,
  District,
  FIRE_STATUS_LABELS,
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
import { BreadcrumbService } from '../../../core/breadcrumb.service';
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
      district: Object.assign(new District(), {
        id: 12,
        name: 'Otway',
        regionId: 4,
        regionName: 'Barwon South West',
      }),
      financialYear: 2026,
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
  it('derives one map point with the status tone, area and status label when coordinates are present', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, {
      status: FireStatus.going,
      latitude: -38.1,
      longitude: 143.5,
      name: 'Coastal Fire',
      fireAreaHectares: 1200,
    });
    const points = instance(fixture).detailMapPoints();
    expect(points).toEqual([
      {
        id: expect.any(String),
        lat: -38.1,
        lng: 143.5,
        tone: statusTone(FireStatus.going),
        name: 'Coastal Fire',
        areaHa: 1200,
        status: FIRE_STATUS_LABELS[FireStatus.going],
        // The pin links to the incident via its id, and reads level (size) + Major (casing + pulse).
        level: 1,
        major: false,
      },
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

describe('IncidentDetailComponent (document title)', () => {
  it('sets the document title to the incident name once the fire loads', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, { name: 'Otway Ridge Fire' });
    // Overrides the route's 'Incident' fallback title with the loaded incident name + wordmark suffix.
    expect(TestBed.inject(Title).getTitle()).toBe('Otway Ridge Fire — Fire Incidents');
  });
});

describe('IncidentDetailComponent (breadcrumb name)', () => {
  it('publishes the incident name to the breadcrumb service when the fire loads', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, { name: 'Otway Ridge Fire' });
    // The shell breadcrumb reads this to show the name in place of the raw `:id` segment.
    expect(TestBed.inject(BreadcrumbService).dynamicLabel()).toBe('Otway Ridge Fire');
  });

  it('clears the published name on destroy so it never bleeds into the next incident', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, { name: 'Otway Ridge Fire' });
    const breadcrumb = TestBed.inject(BreadcrumbService);
    expect(breadcrumb.dynamicLabel()).toBe('Otway Ridge Fire');
    fixture.destroy();
    expect(breadcrumb.dynamicLabel()).toBeNull();
  });
});

describe('IncidentDetailComponent (hero, stats, map + timeline)', () => {
  function el(fixture: ComponentFixture<IncidentDetailComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the severity hero with status badge, level, cadence + author', async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, { status: FireStatus.going, incidentLevel: IncidentLevel.levelTwo });
    const hero = el(fixture).querySelector('.detail-hero');
    expect(hero).not.toBeNull();
    expect(hero?.classList.contains('detail-hero--going')).toBe(true);
    expect(hero?.querySelector('app-status-badge')).not.toBeNull();
    const countdown = hero?.querySelector('app-cadence-countdown');
    expect(countdown).not.toBeNull();
    // On the status-coloured hero the countdown must use the inverse appearance so it inherits the
    // on-colour text rather than rendering its own (same-hue, invisible) status colour.
    expect(countdown?.getAttribute('appearance')).toBe('inverse');
    expect(el(fixture).textContent).toContain('Level 2');
    expect(el(fixture).textContent).toContain(operatorName(EDITOR.id));
  });

  it('renders three instrument stat tiles with mono values', async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, { fireAreaHectares: 1240, totalPersonnel: 42, totalVehicles: 8 });
    const stats = el(fixture).querySelectorAll('.detail-stats .stat');
    expect(stats.length).toBe(3);
    expect(el(fixture).textContent).toContain('42');
  });

  it('wraps the hero cadence countdown in an urgency-toned chip', async () => {
    const fixture = await setup(EDITOR);
    // A non-terminal fire whose next report is already due renders the overdue chip variant.
    await seed(fixture, {
      status: FireStatus.going,
      nextReportDue: new Date('2026-01-15T00:00:00Z'),
    });
    instance(fixture).now.set(new Date('2026-01-15T03:30:00Z'));
    TestBed.tick();
    const chip = el(fixture).querySelector('.detail-hero__cadence');
    expect(chip).not.toBeNull();
    expect(chip?.classList.contains('detail-hero__cadence--overdue')).toBe(true);
    // The countdown stays inside the chip so chip styling and figure move together.
    expect(chip?.querySelector('app-cadence-countdown')).not.toBeNull();
  });

  // The hero cadence chip has four urgency variants; the overdue case is covered above. These pin the
  // clock relative to nextReportDue (the soon threshold is 60 min) so each remaining variant is exercised.
  it('renders the soon cadence-chip variant when the next report is due within the hour', async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, {
      status: FireStatus.going,
      nextReportDue: new Date('2026-01-15T04:00:00Z'),
    });
    instance(fixture).now.set(new Date('2026-01-15T03:30:00Z')); // due in 30 min → soon
    TestBed.tick();
    const chip = el(fixture).querySelector('.detail-hero__cadence');
    expect(chip?.classList.contains('detail-hero__cadence--soon')).toBe(true);
  });

  it('renders the upcoming cadence-chip variant when the next report is comfortably ahead', async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, {
      status: FireStatus.going,
      nextReportDue: new Date('2026-01-15T07:30:00Z'),
    });
    instance(fixture).now.set(new Date('2026-01-15T03:30:00Z')); // due in 4 h → upcoming
    TestBed.tick();
    const chip = el(fixture).querySelector('.detail-hero__cadence');
    expect(chip?.classList.contains('detail-hero__cadence--upcoming')).toBe(true);
  });

  it('renders the none cadence-chip variant for a terminal fire (no live reporting clock)', async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, { status: FireStatus.safe }); // terminal → no cadence due
    instance(fixture).now.set(new Date('2026-01-15T03:30:00Z'));
    TestBed.tick();
    const chip = el(fixture).querySelector('.detail-hero__cadence');
    expect(chip?.classList.contains('detail-hero__cadence--none')).toBe(true);
  });

  it('mutes and labels zero crew/aircraft stat tiles', async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, { totalPersonnel: 0, totalVehicles: 0, totalAircraft: 0 });
    const zeroTiles = el(fixture).querySelectorAll('.detail-stats .stat--zero');
    // Personnel (0) and Vehicles/aircraft (0/0) are both flagged as none-assigned.
    expect(zeroTiles.length).toBe(2);
    expect(el(fixture).querySelectorAll('.detail-stats .stat__none').length).toBe(2);
    expect(el(fixture).textContent).toContain('(none assigned)');
  });

  it('keeps a positive crew tile out of the zero treatment', async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, { totalPersonnel: 12, totalVehicles: 0, totalAircraft: 0 });
    const tiles = [...el(fixture).querySelectorAll('.detail-stats .stat')];
    const personnel = tiles.find((t) => t.querySelector('dt')?.textContent === 'Personnel');
    expect(personnel?.classList.contains('stat--zero')).toBe(false);
  });

  it('offers the create-sitrep CTA from the empty state for an editor', async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, { situationReports: [] });
    const empty = el(fixture).querySelector('.panel--empty');
    expect(empty).not.toBeNull();
    // The live region announces the empty message only; the interactive CTA must sit OUTSIDE it (an
    // interactive control inside a role="status" region is re-announced on every update).
    const liveRegion = empty?.querySelector('[role=status]');
    expect(liveRegion?.textContent).toContain('No situation reports yet');
    expect(liveRegion?.querySelector('[data-testid="action-sitrep-empty"]')).toBeNull();
    expect(shown(fixture, 'action-sitrep-empty')).toBe(true);
  });

  it('hides the empty-state CTA from a viewer who cannot create sitreps', async () => {
    const fixture = await setup(VIEWER);
    await seed(fixture, { situationReports: [] });
    expect(el(fixture).querySelector('.panel--empty')).not.toBeNull();
    expect(shown(fixture, 'action-sitrep-empty')).toBe(false);
  });

  it('mounts the timeline and defers the map behind its placeholder', async () => {
    const fixture = await setup(EDITOR);
    const fire = Object.assign(new FireIncident(), {
      id: 'fire-1',
      name: 'Placeholder Fire',
      districtId: 12,
      fireNumber: 7,
      globalIncidentId: 101,
      status: FireStatus.going,
      incidentLevel: IncidentLevel.levelOne,
      isMajor: false,
      createdBy: EDITOR.id,
      reportedAt: new Date('2026-01-15T03:30:00Z'),
      statusAsAt: new Date('2026-01-15T03:30:00Z'),
      situationReports: [] as SituationReport[],
    });
    instance(fixture).fireResource.set(fire);
    TestBed.tick();
    const deferBlocks = await fixture.getDeferBlocks();
    await Promise.all(deferBlocks.map((block) => block.render(DeferBlockState.Placeholder)));
    TestBed.tick();
    expect(el(fixture).querySelector('app-incident-timeline')).not.toBeNull();
    expect(el(fixture).querySelector('[data-testid="map-placeholder"]')).not.toBeNull();
  });

  it('renders the map component once the deferred block loads', async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, { latitude: -38.1, longitude: 143.5 });
    expect(el(fixture).querySelector('app-incident-map')).not.toBeNull();
  });

  it('keeps every preserved action testid + the final-report placeholder resolvable', async () => {
    const fixture = await setup(ADMIN);
    const fire = Object.assign(new FireIncident(), {
      id: 'fire-1',
      name: 'Preserved Fire',
      districtId: 12,
      fireNumber: 7,
      globalIncidentId: 101,
      status: FireStatus.safe,
      incidentLevel: IncidentLevel.levelOne,
      isMajor: false,
      createdBy: EDITOR.id,
      reportedAt: new Date('2026-01-15T03:30:00Z'),
      statusAsAt: new Date('2026-01-15T03:30:00Z'),
      situationReports: [] as SituationReport[],
      finalReport: unsignedFinal(),
    });
    instance(fixture).fireResource.set(fire);
    TestBed.tick();
    const deferBlocks = await fixture.getDeferBlocks();
    await Promise.all(deferBlocks.map((block) => block.render(DeferBlockState.Placeholder)));
    TestBed.tick();
    // Admin on a terminal fire with an unsigned final report sees the elevated action set.
    expect(shown(fixture, 'action-edit')).toBe(true);
    expect(shown(fixture, 'action-escalate')).toBe(true);
    expect(shown(fixture, 'action-create-final')).toBe(false);
    expect(shown(fixture, 'action-delete')).toBe(true);
    expect(shown(fixture, 'final-report-placeholder')).toBe(true);
  });

  it('has no structural accessibility violations with hero + map + timeline', async () => {
    const fixture = await setup(EDITOR);
    await seed(fixture, {
      status: FireStatus.going,
      latitude: -38.1,
      longitude: 143.5,
      situationReports: [sampleSitrep()],
    });
    expect(await findAxeViolations(fixture.nativeElement)).toEqual([]);
  });
});

describe('IncidentDetailComponent (drill-in links)', () => {
  function anchor(
    fixture: ComponentFixture<IncidentDetailComponent>,
    testid: string,
  ): HTMLAnchorElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector(`a[data-testid="${testid}"]`);
  }

  function href(fixture: ComponentFixture<IncidentDetailComponent>, testid: string): string {
    return anchor(fixture, testid)?.getAttribute('href') ?? '';
  }

  it('renders the district + region metrics as drill-ins for an elevated user', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, {});

    const district = anchor(fixture, 'district-link');
    expect(district).not.toBeNull();
    expect(district!.textContent).toContain('Otway');
    // The district drill-in carries the district id and this fire's financial year.
    expect(href(fixture, 'district-link')).toContain('districtId=12');
    expect(href(fixture, 'district-link')).toContain('fy=2026');

    const region = anchor(fixture, 'region-link');
    expect(region).not.toBeNull();
    expect(region!.textContent).toContain('Barwon South West');
    expect(href(fixture, 'region-link')).toContain('region=4');
    expect(href(fixture, 'region-link')).toContain('fy=2026');
  });

  it('shows district as plain text and omits the region metric for a viewer', async () => {
    const fixture = await setup(VIEWER);
    await seed(fixture, {});
    // The district name still reads as plain text, but neither metric is a drill-in.
    expect(anchor(fixture, 'district-link')).toBeNull();
    expect(anchor(fixture, 'region-link')).toBeNull();
    expect(text(fixture)).toContain('Otway');
    // A dead region label must not appear at all for a non-elevated viewer.
    expect(text(fixture)).not.toContain('Barwon South West');
  });

  it('links the status badge to the going group for a going fire', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, { status: FireStatus.going });
    const link = anchor(fixture, 'status-badge-link');
    expect(link).not.toBeNull();
    expect(href(fixture, 'status-badge-link')).toContain('group=going');
    expect(href(fixture, 'status-badge-link')).toContain('fy=2026');
    // The presentational badge stays wrapped, never nested inside another anchor.
    expect(link!.querySelector('app-status-badge')).not.toBeNull();
  });

  it('links the status badge to the resolved group for a terminal fire', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, { status: FireStatus.safe });
    expect(anchor(fixture, 'status-badge-link')).not.toBeNull();
    expect(href(fixture, 'status-badge-link')).toContain('group=resolved');
  });

  it('leaves the status badge a plain non-link for an intermediate status', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, { status: FireStatus.contained });
    // contained / under-control have no exact list group, so the badge must not be a drill-in.
    expect(anchor(fixture, 'status-badge-link')).toBeNull();
    const badge = (fixture.nativeElement as HTMLElement).querySelector('app-status-badge');
    expect(badge).not.toBeNull();
    expect(badge!.closest('a')).toBeNull();
  });

  it('always offers a Season FY drill-in in the hero', async () => {
    const fixture = await setup(VIEWER);
    await seed(fixture, {});
    // The Season chip is not scope-gated — it filters to a year a viewer can already see.
    expect(anchor(fixture, 'season-link')).not.toBeNull();
    expect(href(fixture, 'season-link')).toContain('fy=2026');
  });

  it('links the Major chip to the major group when the fire is major', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, { isMajor: true });
    expect(anchor(fixture, 'major-link')).not.toBeNull();
    expect(href(fixture, 'major-link')).toContain('group=major');
    expect(href(fixture, 'major-link')).toContain('fy=2026');
  });

  it('omits the Major chip when the fire is not major', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, { isMajor: false });
    expect(anchor(fixture, 'major-link')).toBeNull();
  });

  it('shows the View overdue link only when the cadence is overdue', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, {
      status: FireStatus.going,
      nextReportDue: new Date('2026-01-15T00:00:00Z'),
    });
    instance(fixture).now.set(new Date('2026-01-15T03:30:00Z')); // past due → overdue
    TestBed.tick();
    expect(anchor(fixture, 'overdue-link')).not.toBeNull();
    // The overdue drill-in spans all years (group=overdue, fy=all), unlike the other status drill-ins.
    expect(href(fixture, 'overdue-link')).toContain('group=overdue');
    expect(href(fixture, 'overdue-link')).toContain('fy=all');
  });

  it('hides the View overdue link when the cadence is not overdue', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, {
      status: FireStatus.going,
      nextReportDue: new Date('2026-01-15T07:30:00Z'),
    });
    instance(fixture).now.set(new Date('2026-01-15T03:30:00Z')); // due in 4 h → upcoming
    TestBed.tick();
    expect(anchor(fixture, 'overdue-link')).toBeNull();
  });

  it('has no structural accessibility violations with the drill-in links rendered', async () => {
    const fixture = await setup(ADMIN);
    await seed(fixture, {
      status: FireStatus.going,
      isMajor: true,
      nextReportDue: new Date('2026-01-15T00:00:00Z'),
    });
    instance(fixture).now.set(new Date('2026-01-15T03:30:00Z'));
    TestBed.tick();
    expect(await findAxeViolations(fixture.nativeElement)).toEqual([]);
  });
});
