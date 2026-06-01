import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import {
  type ComponentFixture,
  DeferBlockBehavior,
  DeferBlockState,
  TestBed,
} from '@angular/core/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { provideRouter } from '@angular/router';
import {
  type CurrentUser,
  DEV_USERS,
  District,
  FireIncident,
  type FirePerimeter,
  FireStatus,
  IncidentLevel,
  SituationReport,
} from '@workspace/shared-domain';
import { InMemoryDataProvider, remult } from 'remult';
import { findAxeViolations } from '../../../testing/axe-helper';
import { DevAuthService } from '../../core/dev-auth.service';
import { OverviewComponent } from './overview';

const ADMIN = DEV_USERS[0]!; // admin, districtId null
const VIEWER = DEV_USERS[5]!; // viewer, dev-viewer-otway
// A fixed clock anchor so cadence countdowns and overdue ordering are deterministic.
const NOW = new Date('2026-01-15T12:00:00Z');
const SIX_MIN_MS = 6 * 60 * 1000;

// jsdom lacks `matchMedia` (the IncidentMapComponent's ThemeService consults it) and `IntersectionObserver`
// (Angular's `@defer (prefetch on idle)` registers one). Stub both (test-only).
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

function instance(fixture: ComponentFixture<OverviewComponent>): any {
  return fixture.componentInstance as any;
}

async function seedDistricts(): Promise<void> {
  await remult.repo(District).insert([
    { id: 12, name: 'Otway', regionId: 1, regionName: 'Barwon South West', isActive: true },
    { id: 18, name: 'Latrobe', regionId: 2, regionName: 'Gippsland', isActive: true },
  ]);
}

interface FireSeed {
  id: string;
  name: string;
  status: FireStatus;
  districtId?: number;
  incidentLevel?: IncidentLevel;
  isMajor?: boolean;
  fireAreaHectares?: number;
  latitude?: number;
  longitude?: number;
  nextReportDue?: Date | null;
  financialYear?: number;
  firePerimeterGeo?: FirePerimeter;
}

// A small, valid closed WGS84 ring near the Otway coast (first vertex repeated to close it).
const OTWAY_PERIMETER: FirePerimeter = {
  type: 'Polygon',
  coordinates: [
    [
      [143.5, -38.5],
      [143.55, -38.5],
      [143.55, -38.45],
      [143.5, -38.45],
      [143.5, -38.5],
    ],
  ],
};

// Insert via the repo (lifecycle hook sets server-managed defaults), then patch the few server-managed
// fields the dashboard reads (`nextReportDue`/`financialYear`/coordinates/`isMajor`) to exact test values.
// `allowApiUpdate:false` is an API-layer gate, not enforced on a direct admin repo.update in a unit test.
async function seedFire(seed: FireSeed): Promise<void> {
  const repo = remult.repo(FireIncident);
  const insert: Partial<FireIncident> = {
    id: seed.id,
    name: seed.name,
    status: seed.status,
    districtId: seed.districtId ?? 12,
    incidentLevel: seed.incidentLevel ?? IncidentLevel.levelOne,
    reportedAt: new Date('2026-01-10T00:00:00Z'),
    isMajor: seed.isMajor ?? false,
  };
  if (seed.fireAreaHectares !== undefined) {
    insert.fireAreaHectares = seed.fireAreaHectares;
  }
  if (seed.latitude !== undefined) {
    insert.latitude = seed.latitude;
  }
  if (seed.longitude !== undefined) {
    insert.longitude = seed.longitude;
  }
  if (seed.isMajor) {
    insert.declaredBySource = 'Regional Controller';
    insert.declaredByTimestamp = new Date('2026-01-10T01:00:00Z');
  }
  if (seed.firePerimeterGeo !== undefined) {
    insert.firePerimeterGeo = seed.firePerimeterGeo;
  }
  const created = await repo.insert(insert);
  await repo.update(created.id, {
    nextReportDue: seed.nextReportDue === undefined ? null : seed.nextReportDue,
    financialYear: seed.financialYear ?? 2026,
  });
}

interface SitrepSeed {
  id: string;
  fireIncidentId: string;
  fireName: string;
  reportNumber: number;
  submittedAt: Date;
}

function seedSitrep(seed: SitrepSeed): void {
  const provider = remult.dataProvider as InMemoryDataProvider;
  // Sitrep insert recomputes the parent fire's cadence and author; for the activity-feed assertions we only
  // need rows that read back, so write the row directly into the in-memory store (bypassing the hook).
  const store = provider.rows as { situationReports?: Record<string, unknown>[] };
  store.situationReports ??= [];
  store.situationReports.push({
    id: seed.id,
    fireIncidentId: seed.fireIncidentId,
    fireName: seed.fireName,
    reportNumber: seed.reportNumber,
    status: FireStatus.going,
    submittedBy: 'op-12-1',
    submittedAt: seed.submittedAt.toISOString(),
    districtId: 12,
    isParentDeleted: false,
    personnel: 0,
    vehicles: 0,
    aircraft: 0,
  });
}

async function setup(user: CurrentUser | undefined): Promise<ComponentFixture<OverviewComponent>> {
  const devAuthStub = {
    currentUser: () => user,
    currentUserId: user?.id,
    selectUser: async () => undefined,
  };
  TestBed.configureTestingModule({
    imports: [OverviewComponent],
    // The overview map is wrapped in `@defer (on viewport)`; jsdom has no IntersectionObserver, so defer
    // blocks are driven manually and rendered to Complete in `settle` when the content state is reached.
    deferBlockBehavior: DeferBlockBehavior.Manual,
    providers: [
      provideRouter([]),
      { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
      { provide: DevAuthService, useValue: devAuthStub },
    ],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(OverviewComponent);
  await fixture.whenStable();
  TestBed.tick();
  return fixture;
}

// Pin the component's ticking clock so cadence countdowns and overdue ordering are deterministic.
function setNow(fixture: ComponentFixture<OverviewComponent>, when: Date): void {
  instance(fixture).now.set(when);
}

function html(fixture: ComponentFixture<OverviewComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

// The operational/season aggregates run as floating promises kicked off by effects. `whenStable()` awaits
// the zoneless scheduler but not those promises, so drain the microtask/macrotask queue (the in-memory
// provider settles synchronously), then force change-detection so the resolved signals flow into the
// template. Two passes cover the effect → query → signal-set → re-render chain.
const macrotask = (): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
async function settle(fixture: ComponentFixture<OverviewComponent>): Promise<void> {
  await macrotask();
  await fixture.whenStable();
  TestBed.tick();
  await macrotask();
  await fixture.whenStable();
  TestBed.tick();
  await macrotask();
  await fixture.whenStable();
  TestBed.tick();
  await macrotask();
  await fixture.whenStable();
  TestBed.tick();
}

// Render any `@defer` blocks (the overview map) to their Complete state so the deferred component mounts.
async function renderDeferBlocks(fixture: ComponentFixture<OverviewComponent>): Promise<void> {
  const blocks = await fixture.getDeferBlocks();
  await Promise.all(blocks.map((block) => block.render(DeferBlockState.Complete)));
  TestBed.tick();
}

// `liveQuery` (needs-attention + recent sitreps) is served over the REST transport, not the local data
// provider — its initial load is a POST to `…?__action=liveQuery-…` and change push uses an SSE channel.
// jsdom has neither, so the SSE connection is a no-op and the initial-load POST is fulfilled by running the
// equivalent query against the seeded in-memory provider, returning JSON rows (what `setAllItems` expects).
const openConnectionSpy = vi.fn(() =>
  Promise.resolve({ subscribe: () => Promise.resolve(() => undefined), close: () => undefined }),
);

const LIVE_QUERY_ACTION = '__action=liveQuery-';

async function liveQueryRows(url: string): Promise<unknown[]> {
  if (url.includes('situationReports')) {
    const repo = remult.repo(SituationReport);
    const items = await repo.find({ orderBy: { submittedAt: 'desc' }, limit: 8 });
    return items.map((item) => repo.toJson(item));
  }
  const repo = remult.repo(FireIncident);
  const items = await repo.find({
    where: { status: { $nin: [FireStatus.safe] } },
    orderBy: { nextReportDue: 'asc' },
    limit: 10,
    include: { district: true },
  });
  return items.map((item) => repo.toJson(item));
}

// The liveQuery initial load is a GET (the filter encodes into the URL); change-push/teardown use POST. Both
// carry `__action=liveQuery-…`, so serve either from the in-memory provider.
const liveHttpClient = {
  get: async (url: string): Promise<any> =>
    url.includes(LIVE_QUERY_ACTION) ? liveQueryRows(url) : [],
  put: async (_url: string, _data: any): Promise<any> => undefined,
  delete: async (_url: string): Promise<void> => undefined,
  post: async (url: string, _data: any): Promise<any> =>
    url.includes(LIVE_QUERY_ACTION) ? liveQueryRows(url) : [],
};

beforeEach(() => {
  localStorage.clear();
  stubBrowserApis();
  openConnectionSpy.mockClear();
  remult.dataProvider = new InMemoryDataProvider();
  remult.apiClient.subscriptionClient = { openConnection: openConnectionSpy };
  remult.apiClient.httpClient = liveHttpClient;
  remult.user = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('OverviewComponent — states (Task 3.1)', () => {
  it('renders the anonymous prompt and issues no query when there is no user', async () => {
    const countSpy = vi.spyOn(remult.repo(FireIncident), 'count');
    const groupBySpy = vi.spyOn(remult.repo(FireIncident), 'groupBy');
    const fixture = await setup(undefined);

    expect(instance(fixture).viewState()).toBe('anonymous');
    expect(html(fixture).textContent).toContain('Select a dev user');
    expect(countSpy).not.toHaveBeenCalled();
    expect(groupBySpy).not.toHaveBeenCalled();

    expect(await findAxeViolations(html(fixture))).toEqual([]);
  });

  it('reaches content with zero active incidents and still renders the season panel', async () => {
    await seedDistricts();
    remult.user = { ...ADMIN };
    const fixture = await setup({ ...ADMIN });
    await settle(fixture);

    expect(instance(fixture).viewState()).toBe('content');
    expect(instance(fixture).activeCount()).toBe(0);
    expect(html(fixture).textContent).toContain('No active incidents');
    // Season panel always renders in content state.
    expect(html(fixture).querySelector('[aria-labelledby="season-h"]')).not.toBeNull();

    expect(await findAxeViolations(html(fixture))).toEqual([]);
  });
});

async function seedOperational(): Promise<void> {
  await seedDistricts();
  // A — going, level 3, major, overdue by 6 min, with coordinates (most urgent).
  await seedFire({
    id: 'fire-a',
    name: 'Otway Ridge',
    status: FireStatus.going,
    incidentLevel: IncidentLevel.levelThree,
    isMajor: true,
    fireAreaHectares: 1240,
    latitude: -38.5,
    longitude: 143.5,
    nextReportDue: new Date(NOW.getTime() - SIX_MIN_MS),
  });
  // B — contained, level 2, with coordinates, not overdue.
  await seedFire({
    id: 'fire-b',
    name: 'Latrobe Gully',
    status: FireStatus.contained,
    incidentLevel: IncidentLevel.levelTwo,
    districtId: 18,
    fireAreaHectares: 380,
    latitude: -38.2,
    longitude: 146.4,
    nextReportDue: new Date(NOW.getTime() + 4 * 60 * 60 * 1000),
  });
  // C — safe (terminal): excluded from the active set.
  await seedFire({
    id: 'fire-c',
    name: 'Old Burn',
    status: FireStatus.safe,
    fireAreaHectares: 12,
    nextReportDue: null,
  });
  seedSitrep({
    id: 'sr-1',
    fireIncidentId: 'fire-a',
    fireName: 'Otway Ridge',
    reportNumber: 3,
    submittedAt: new Date('2026-01-15T11:30:00Z'),
  });
}

describe('OverviewComponent — operational surface (Task 3.2)', () => {
  it('renders KPIs, status-mix, ordered needs-attention, activity and the map', async () => {
    remult.user = { ...ADMIN };
    await seedOperational();
    const fixture = await setup({ ...ADMIN });
    setNow(fixture, NOW);
    await settle(fixture);
    await renderDeferBlocks(fixture);
    setNow(fixture, NOW);
    TestBed.tick();

    const root = html(fixture);
    // Five KPI tiles in the operational strip (scope to the ops section; the season panel adds its own).
    const opsSection = root.querySelector('[aria-labelledby="ops-h"]');
    expect(opsSection?.querySelectorAll('app-kpi-tile')).toHaveLength(5);
    // Active count excludes the terminal fire.
    expect(instance(fixture).activeCount()).toBe(2);
    expect(instance(fixture).overdueCount()).toBe(1);
    // DASH-2: the live push flipped the honest LIVE flag, so the Overdue tile exposes its polite live
    // region (role=status appears only while liveConnected() is true).
    expect(instance(fixture).liveConnected()).toBe(true);
    const overdueTile = root.querySelector('[data-testid="kpi-overdue"]');
    expect(overdueTile?.querySelector('[role=status]')).not.toBeNull();
    // The visible section-header pill reads "Live" and carries no offline marker while connected.
    const livePill = root.querySelector('[data-testid="overview-live"]');
    expect(livePill?.getAttribute('data-live-state')).toBeNull();
    expect(livePill?.textContent).toContain('Live');

    // Status-mix bar present.
    expect(root.querySelector('app-status-mix-bar')).not.toBeNull();

    // Needs-attention: most-overdue fire (A) is first.
    const firstRow = root.querySelector('[data-testid="attention-list"] a');
    expect(firstRow?.getAttribute('href')).toBe('/incidents/fire-a');
    expect(firstRow?.textContent).toContain('Otway Ridge');

    // Recent-activity feed renders the sitrep author by name (never the raw id).
    const activity = root.querySelector('[data-testid="activity-feed"]');
    expect(activity).not.toBeNull();
    expect(activity?.textContent).not.toContain('op-12-1');

    // The deferred map mounted.
    expect(root.querySelector('app-incident-map')).not.toBeNull();

    expect(await findAxeViolations(root)).toEqual([]);
  });

  it('keeps LIVE honest: no role=status while the live stream errors (DASH-2)', async () => {
    remult.user = { ...ADMIN };
    await seedOperational();
    // Simulate a downed SSE/liveQuery transport: the initial load rejects, firing the `error` callback.
    remult.apiClient.httpClient = {
      get: async (url: string): Promise<any> =>
        url.includes(LIVE_QUERY_ACTION) ? Promise.reject(new Error('stream down')) : [],
      put: async (): Promise<any> => undefined,
      delete: async (): Promise<void> => undefined,
      post: async (url: string): Promise<any> =>
        url.includes(LIVE_QUERY_ACTION) ? Promise.reject(new Error('stream down')) : [],
    };
    const fixture = await setup({ ...ADMIN });
    setNow(fixture, NOW);
    await settle(fixture);

    // The flag stays false and the Overdue tile drops its live region — no dishonest "LIVE".
    expect(instance(fixture).liveConnected()).toBe(false);
    const overdueTile = html(fixture).querySelector('[data-testid="kpi-overdue"]');
    expect(overdueTile?.querySelector('[role=status]')).toBeNull();

    // The VISIBLE section-header pill must move in lock-step with the ARIA signal: no "Live", a
    // muted reconnecting state instead, so a sighted user is never told the stream is up.
    const livePill = html(fixture).querySelector('[data-testid="overview-live"]');
    expect(livePill?.getAttribute('data-live-state')).toBe('offline');
    expect(livePill?.textContent).not.toContain('Live');
    expect(livePill?.textContent).toContain('Reconnecting');

    expect(await findAxeViolations(html(fixture))).toEqual([]);
  });

  it('overlays the largest recent fire extents on the map, scope-aware (FIRE-AREA-7)', async () => {
    remult.user = { ...ADMIN };
    await seedDistricts();
    // A large, terminal (historical) fire carrying a mapped perimeter — the kind FIRE-AREA-7 surfaces so
    // the showcase's extents are visible on the landing map even when the live active set is small.
    await seedFire({
      id: 'big-historical',
      name: 'Otway Megafire',
      status: FireStatus.safe,
      fireAreaHectares: 5000,
      latitude: -38.47,
      longitude: 143.52,
      firePerimeterGeo: OTWAY_PERIMETER,
    });
    // A sub-threshold fire with no perimeter must NOT appear in the extent overlay.
    await seedFire({
      id: 'tiny',
      name: 'Spot Fire',
      status: FireStatus.safe,
      fireAreaHectares: 3,
      latitude: -38.4,
      longitude: 143.4,
    });
    const fixture = await setup({ ...ADMIN });
    setNow(fixture, NOW);
    await settle(fixture);

    // The perimeter fire is surfaced as a significant extent even though it is terminal (not active).
    expect(instance(fixture).significantCount()).toBe(1);
    expect(instance(fixture).activeCount()).toBe(0);
    // The map is fed active points + the extent overlay (here: 0 active + 1 extent).
    expect(instance(fixture).mapAllPoints()).toHaveLength(1);
    // The caption states the overlay honestly, and the heading is no longer "Active"-only.
    const note = html(fixture).querySelector('.overview__map-note');
    expect(note?.textContent).toContain('largest recent fire extents');
    expect(html(fixture).querySelector('#map-h')?.textContent).toContain('Incident map');

    expect(await findAxeViolations(html(fixture))).toEqual([]);
  });

  it('promotes the map-overflow note to a warning chip with an info icon (DASH-5)', async () => {
    remult.user = { ...ADMIN };
    await seedOperational();
    const fixture = await setup({ ...ADMIN });
    setNow(fixture, NOW);
    await settle(fixture);
    // Force the truncated-set condition (the bounded fetch normally plots everything in this seed).
    instance(fixture).mapOverflow.set(7);
    await fixture.whenStable();
    TestBed.tick();

    const chip = html(fixture).querySelector('.overview__note--warning');
    expect(chip).not.toBeNull();
    expect(chip?.textContent).toContain('+7 more active not plotted');
    expect(chip?.querySelector('mat-icon')?.textContent?.trim()).toBe('info');

    expect(await findAxeViolations(html(fixture))).toEqual([]);
  });
});

async function seedSeason(): Promise<void> {
  await seedDistricts();
  // FY2026: three fires (one terminal) across two districts in different regions.
  await seedFire({
    id: 's26-a',
    name: 'Apollo Bay',
    status: FireStatus.going,
    districtId: 12,
    fireAreaHectares: 200,
    financialYear: 2026,
  });
  await seedFire({
    id: 's26-b',
    name: 'Moe Spur',
    status: FireStatus.contained,
    districtId: 18,
    fireAreaHectares: 80,
    financialYear: 2026,
  });
  await seedFire({
    id: 's26-c',
    name: 'Lorne Closed',
    status: FireStatus.safe,
    districtId: 12,
    fireAreaHectares: 5,
    financialYear: 2026,
  });
  // FY2025: two fires.
  await seedFire({
    id: 's25-a',
    name: 'Past One',
    status: FireStatus.safe,
    districtId: 12,
    fireAreaHectares: 30,
    financialYear: 2025,
  });
  await seedFire({
    id: 's25-b',
    name: 'Past Two',
    status: FireStatus.safe,
    districtId: 18,
    fireAreaHectares: 40,
    financialYear: 2025,
  });
}

describe('OverviewComponent — season panel + region rollup (Task 3.3)', () => {
  it('renders the season figures, status-mix, region rollup and switches FY', async () => {
    remult.user = { ...ADMIN };
    await seedSeason();
    const fixture = await setup({ ...ADMIN });
    await settle(fixture);

    const root = html(fixture);
    const season = root.querySelector('[aria-labelledby="season-h"]');
    expect(season).not.toBeNull();
    // Default FY is the current financial year (2026); season total counts all three FY2026 fires.
    expect(instance(fixture).selectedFy()).toBe(2026);
    expect(instance(fixture).seasonCount()).toBe(3);
    // Season status-mix is its own bar (distinct from the operational one).
    expect(season?.querySelector('app-status-mix-bar')).not.toBeNull();

    // Region rollup lists the two regions (elevated user).
    const rollup = root.querySelector('[aria-labelledby="region-h"]');
    expect(rollup).not.toBeNull();
    expect(rollup?.textContent).toContain('Barwon South West');
    expect(rollup?.textContent).toContain('Gippsland');

    // Switch the FY selector to 2025 via the Material harness; the season total updates to two.
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const select = await loader.getHarness(MatSelectHarness);
    await select.open();
    await select.clickOptions({ text: '2025' });
    await settle(fixture);
    expect(instance(fixture).selectedFy()).toBe(2025);
    expect(instance(fixture).seasonCount()).toBe(2);

    expect(await findAxeViolations(root)).toEqual([]);
  });

  it('hides the region rollup for a viewer', async () => {
    // Seed as admin (the insert hook restricts non-elevated users to their own district), then view as a
    // viewer to assert the elevated-only rollup is hidden.
    remult.user = { ...ADMIN };
    await seedSeason();
    remult.user = { ...VIEWER };
    const fixture = await setup({ ...VIEWER });
    await settle(fixture);

    const root = html(fixture);
    expect(root.querySelector('[aria-labelledby="season-h"]')).not.toBeNull();
    expect(root.querySelector('[aria-labelledby="region-h"]')).toBeNull();

    expect(await findAxeViolations(root)).toEqual([]);
  });
});
