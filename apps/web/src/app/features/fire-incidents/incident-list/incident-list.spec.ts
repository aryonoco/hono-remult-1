import { BreakpointObserver } from '@angular/cdk/layout';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MatButtonToggleGroupHarness,
  MatButtonToggleHarness,
} from '@angular/material/button-toggle/testing';
import { MatChipSetHarness } from '@angular/material/chips/testing';
import { MatPaginatorHarness } from '@angular/material/paginator/testing';
import { MatSortHarness } from '@angular/material/sort/testing';
import { MatTableHarness } from '@angular/material/table/testing';
import { provideRouter, Router } from '@angular/router';
import {
  type CurrentUser,
  computeFinancialYear,
  DEV_USERS,
  District,
  FireIncident,
  FireStatus,
  IncidentLevel,
} from '@workspace/shared-domain';
import {
  type EntityFilter,
  type EntityOrderBy,
  InMemoryDataProvider,
  type Repository,
  remult,
} from 'remult';
import { of } from 'rxjs';
import { findAxeViolations } from '../../../../testing/axe-helper';
import { DevAuthService } from '../../../core/dev-auth.service';
import { NotificationService } from '../../../core/notification.service';
import { IncidentListComponent } from './incident-list';

const ADMIN = DEV_USERS[0]!; // admin, districtId null
const VIEWER = DEV_USERS[5]!; // viewer, dev-viewer-otway
const CURRENT_FY = computeFinancialYear(new Date());
const PRIOR_FY = CURRENT_FY - 1;
// Mirrors the component's default page size (the first PAGE_SIZE_OPTIONS entry); the URL codec only
// accepts the real paginator options, so tests drive pagination with this rather than an arbitrary size.
const DEFAULT_PAGE_SIZE = 25;

const notificationStub = { success: () => undefined, error: () => undefined };

// `liveQuery` is served over the REST transport (initial load = GET, the filter encodes into the URL;
// teardown = POST). jsdom has no SSE channel, so the subscription connection is a no-op and the initial
// load GET is fulfilled by reconstructing the equivalent query from the URL and running it against the
// seeded in-memory provider. The reserved `_sort`/`_order`/`_limit`/`_page` params plus the component's
// filter vocabulary (`.ne` → `$nin`, `.in` → `$in`, bare equality) are decoded below.
const LIVE_QUERY_ACTION = '__action=liveQuery-';

function decodeOrderBy(params: URLSearchParams): EntityOrderBy<FireIncident> {
  const sort = params.get('_sort');
  if (!sort) {
    return {};
  }
  const order = params.get('_order') === 'desc' ? 'desc' : 'asc';
  return { [sort]: order } as EntityOrderBy<FireIncident>;
}

// Decode a single (non-repeated) predicate onto the where clause. Pulled out of the loop so `decodeWhere`
// only orchestrates the repeated `status.ne` accumulation, keeping each function's branching modest.
function applyPredicate(where: EntityFilter<FireIncident>, key: string, value: string): void {
  switch (key) {
    case 'status.in':
      where.status = { $in: JSON.parse(value) as FireStatus[] };
      break;
    case 'financialYear':
      where.financialYear = Number(value);
      break;
    case 'districtId.in':
      // Region expansion: `districtId: { $in: [...] }` serialises to `districtId.in=<json array>`.
      where.districtId = { $in: JSON.parse(value) as number[] };
      break;
    case 'districtId':
      where.districtId = Number(value);
      break;
    case 'isMajor':
      // The major-group equality predicate encodes as the bare boolean param `isMajor=true`.
      where.isMajor = value === 'true';
      break;
    case 'nextReportDue.lt':
      // The overdue cut-off `nextReportDue: { $lt: now }` serialises the date via `.lt` (ISO string).
      where.nextReportDue = { $lt: new Date(value) };
      break;
    case 'status':
      where.status = value as FireStatus;
      break;
    default:
      break;
  }
}

// Reconstruct the entity filter from the encoded query string. Only the component's filter vocabulary is
// handled: `status.ne` (repeated) → `$nin`, `status.in` (JSON array) → `$in`, bare equality, plus the
// `financialYear`/`districtId` scalars, the `isMajor` flag, the `nextReportDue.lt` cut-off, and the
// `districtId.in` region expansion.
function decodeWhere(params: URLSearchParams): EntityFilter<FireIncident> {
  const where: EntityFilter<FireIncident> = {};
  const neValues: FireStatus[] = [];
  for (const [key, value] of params.entries()) {
    if (key === 'status.ne') {
      neValues.push(value as FireStatus);
    } else {
      applyPredicate(where, key, value);
    }
  }
  if (neValues.length > 0) {
    where.status = { $nin: neValues };
  }
  return where;
}

async function liveQueryRows(url: string): Promise<unknown[]> {
  const params = new URLSearchParams(url.slice(url.indexOf('?') + 1));
  const repo: Repository<FireIncident> = remult.repo(FireIncident);
  const limitRaw = params.get('_limit');
  const pageRaw = params.get('_page');
  const items = await repo.find({
    where: decodeWhere(params),
    orderBy: decodeOrderBy(params),
    include: { district: true },
    ...(limitRaw ? { limit: Number(limitRaw) } : {}),
    ...(pageRaw ? { page: Number(pageRaw) } : {}),
  });
  return items.map((item) => repo.toJson(item));
}

const openConnectionSpy = vi.fn(() =>
  Promise.resolve({ subscribe: () => Promise.resolve(() => undefined), close: () => undefined }),
);

const liveHttpClient = {
  get: async (url: string): Promise<unknown> =>
    url.includes(LIVE_QUERY_ACTION) ? liveQueryRows(url) : [],
  put: async (): Promise<unknown> => undefined,
  delete: async (): Promise<void> => undefined,
  post: async (url: string): Promise<unknown> =>
    url.includes(LIVE_QUERY_ACTION) ? liveQueryRows(url) : [],
};

interface FireSeed {
  id: string;
  name: string;
  status: FireStatus;
  financialYear: number;
  districtId?: number;
  incidentLevel?: IncidentLevel;
  isMajor?: boolean;
  fireAreaHectares?: number;
  nextReportDue?: Date | null;
}

async function seedDistrict(): Promise<void> {
  await remult.repo(District).insert({
    id: 12,
    name: 'Otway',
    regionId: 1,
    regionName: 'Barwon South West',
    isActive: true,
  });
}

// Two districts in region 1 (Otway, Far South West) and one in region 2 (Mallee) so a region filter has a
// non-trivial expansion to assert against (region 1 → districts 12 + 14, region 2 → district 22).
async function seedMultiRegionDistricts(): Promise<void> {
  const repo = remult.repo(District);
  await repo.insert({ id: 12, name: 'Otway', regionId: 1, regionName: 'Barwon South West' });
  await repo.insert({
    id: 14,
    name: 'Far South West',
    regionId: 1,
    regionName: 'Barwon South West',
  });
  await repo.insert({ id: 22, name: 'Mallee', regionId: 2, regionName: 'Loddon Mallee' });
}

// Insert via the repo (the lifecycle hook sets server-managed defaults), then patch the server-managed
// fields (`financialYear` and `nextReportDue`) the list reads to the exact test values.
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
  if (seed.isMajor) {
    insert.declaredBySource = 'Regional Controller';
    insert.declaredByTimestamp = new Date('2026-01-10T01:00:00Z');
  }
  const created = await repo.insert(insert);
  await repo.update(created.id, {
    financialYear: seed.financialYear,
    nextReportDue: seed.nextReportDue === undefined ? null : seed.nextReportDue,
  });
}

// Build the 30-fire seed descriptors (20 going + 5 safe in the current FY; 5 going in the prior FY) so
// paging and filtering are observable.
function thirtyFireSeeds(): FireSeed[] {
  const range = (n: number): number[] => Array.from({ length: n }, (_, i) => i);
  return [
    ...range(20).map((i) => ({
      id: `cur-going-${i}`,
      name: `Current Going ${String(i).padStart(2, '0')}`,
      status: FireStatus.going,
      financialYear: CURRENT_FY,
    })),
    ...range(5).map((i) => ({
      id: `cur-safe-${i}`,
      name: `Current Safe ${String(i).padStart(2, '0')}`,
      status: FireStatus.safe,
      financialYear: CURRENT_FY,
    })),
    ...range(5).map((i) => ({
      id: `prior-${i}`,
      name: `Prior Year ${String(i).padStart(2, '0')}`,
      status: FireStatus.going,
      financialYear: PRIOR_FY,
    })),
  ];
}

async function seedThirtyFires(): Promise<void> {
  await seedDistrict();
  // Insert sequentially: each insert reads the prior fire-number via the hook, so concurrency would race.
  // A reduce-chained promise keeps the ordering without an await-in-loop.
  await thirtyFireSeeds().reduce(
    (chain, seed) => chain.then(() => seedFire(seed)),
    Promise.resolve(),
  );
}

function instance(fixture: ComponentFixture<IncidentListComponent>): any {
  return fixture.componentInstance as any;
}

// `liveQuery`'s initial-load promise is kicked off by an effect and resolves on a macrotask; `whenStable`
// awaits the zoneless scheduler but not that promise. Drain the queue, then force change detection so the
// resolved rows flow into the signals. Several passes cover the effect → query → signal-set chain.
const macrotask = (): Promise<void> =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
async function pass(fixture: ComponentFixture<IncidentListComponent>): Promise<void> {
  await macrotask();
  await fixture.whenStable();
  TestBed.tick();
}
async function settle(fixture: ComponentFixture<IncidentListComponent>): Promise<void> {
  // Four passes cover the effect → query → signal-set → re-render chain (count + rows are independent).
  await pass(fixture);
  await pass(fixture);
  await pass(fixture);
  await pass(fixture);
}

function configure(user: CurrentUser | undefined, matches: boolean): void {
  const devAuthStub = {
    currentUser: () => user,
    currentUserId: user?.id,
    selectUser: async () => undefined,
  };
  const breakpointStub = { observe: () => of({ matches, breakpoints: {} }) };
  TestBed.configureTestingModule({
    imports: [IncidentListComponent],
    providers: [
      provideRouter([]),
      { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
      { provide: BreakpointObserver, useValue: breakpointStub },
      { provide: DevAuthService, useValue: devAuthStub },
      { provide: NotificationService, useValue: notificationStub },
    ],
  });
}

async function createComponent(
  user: CurrentUser | undefined,
  matches = false,
): Promise<ComponentFixture<IncidentListComponent>> {
  configure(user, matches);
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(IncidentListComponent);
  await fixture.whenStable();
  return fixture;
}

// Seed the URL with query params BEFORE the component subscribes, so its constructor reads them on the
// first `queryParamMap` emission — the deep-link path. Navigating to the current route with `queryParams`
// is enough under `provideRouter([])`.
async function createComponentWithQuery(
  user: CurrentUser | undefined,
  queryParams: Record<string, string | number>,
  matches = false,
): Promise<ComponentFixture<IncidentListComponent>> {
  configure(user, matches);
  await TestBed.compileComponents();
  const router = TestBed.inject(Router);
  await router.navigate([], { queryParams });
  const fixture = TestBed.createComponent(IncidentListComponent);
  await fixture.whenStable();
  return fixture;
}

function text(fixture: ComponentFixture<IncidentListComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

beforeEach(() => {
  localStorage.clear();
  openConnectionSpy.mockClear();
  remult.dataProvider = new InMemoryDataProvider();
  remult.apiClient.subscriptionClient = { openConnection: openConnectionSpy };
  remult.apiClient.httpClient = liveHttpClient;
  remult.user = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  // The global DensityService effect reflects onto document.documentElement; clear it so the
  // attribute never leaks between tests.
  document.documentElement.removeAttribute('data-density');
});

describe('IncidentListComponent (anonymous)', () => {
  it('prompts for a dev user and never opens a query', async () => {
    const countSpy = vi.spyOn(remult.repo(FireIncident), 'count');
    const fixture = await createComponent(undefined);
    expect(instance(fixture).viewState()).toBe('anonymous');
    expect(text(fixture)).toContain('Select a dev user to begin');
    expect(openConnectionSpy).not.toHaveBeenCalled();
    expect(countSpy).not.toHaveBeenCalled();
  });
});

describe('IncidentListComponent (server pagination + filters)', () => {
  it('defaults to the current financial year and reports the server total', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    // Default FY filter is the current financial year — bounded, never the whole table.
    expect(instance(fixture).filters().fy).toBe(CURRENT_FY);
    // 25 fires sit in the current FY (20 going + 5 safe); prior-year fires are excluded.
    expect(instance(fixture).total()).toBe(25);
    // The first page never exceeds the page size.
    expect(instance(fixture).rows().length).toBeLessThanOrEqual(
      instance(fixture).pageState().pageSize,
    );
    expect(instance(fixture).viewState()).toBe('content');
  });

  it('narrows to the going group and resets to the first page', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);
    instance(fixture).onPage({ pageIndex: 1, pageSize: instance(fixture).pageState().pageSize });
    await settle(fixture);

    instance(fixture).setStatusGroup('going');
    await settle(fixture);

    // The page index resets and the where clause restricts to going.
    expect(instance(fixture).pageState().pageIndex).toBe(0);
    expect(instance(fixture).filters().group).toBe('going');
    // 20 going fires in the current FY (the 5 safe are dropped).
    expect(instance(fixture).total()).toBe(20);
    for (const row of instance(fixture).rows()) {
      expect(row.status).toBe(FireStatus.going);
    }
  });

  it('serves a different second page than the first', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponent({ ...ADMIN });
    // Widen to all years (30 fires) and use the default page size (25), a real paginator option, so the
    // page size survives the URL round-trip: page 1 holds 25 rows, page 2 the remaining 5.
    instance(fixture).setFy('all');
    instance(fixture).onSortChange({ active: 'name', direction: 'asc' });
    instance(fixture).onPage({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
    await settle(fixture);
    const firstPageIds = instance(fixture)
      .rows()
      .map((row: FireIncident) => row.id);

    instance(fixture).onPage({ pageIndex: 1, pageSize: DEFAULT_PAGE_SIZE });
    await settle(fixture);
    const secondPageIds = instance(fixture)
      .rows()
      .map((row: FireIncident) => row.id);

    // Server pagination: the second page returns a distinct, non-overlapping slice.
    expect(firstPageIds.length).toBe(DEFAULT_PAGE_SIZE);
    expect(secondPageIds.length).toBeGreaterThan(0);
    for (const id of secondPageIds) {
      expect(firstPageIds).not.toContain(id);
    }
  });

  it('shows the empty state when the count is zero', async () => {
    remult.user = { ...ADMIN };
    await seedDistrict();
    await seedFire({
      id: 'prior-only',
      name: 'Prior Only',
      status: FireStatus.going,
      financialYear: PRIOR_FY,
    });
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    // The default FY filter excludes the only (prior-year) fire.
    expect(instance(fixture).total()).toBe(0);
    expect(instance(fixture).viewState()).toBe('empty');
    expect(text(fixture)).toContain('No incidents match these filters');
  });
});

describe('IncidentListComponent (district filter gate)', () => {
  it('exposes the district filter for an elevated user', async () => {
    const fixture = await createComponent({ ...ADMIN });
    expect(instance(fixture).showDistrictFilter()).toBe(true);
  });

  it('hides the district filter for a viewer', async () => {
    const fixture = await createComponent({ ...VIEWER });
    expect(instance(fixture).showDistrictFilter()).toBe(false);
  });
});

describe('IncidentListComponent (filter bar, sort & paginator)', () => {
  function host(fixture: ComponentFixture<IncidentListComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }
  // Build the aria-label selector from the label so it is not a static string literal (avoids a noSecrets
  // false positive on the longer quoted attribute selectors).
  function byAriaLabel(root: HTMLElement, label: string): Element | null {
    return root.querySelector(`[aria-label="${label}"]`);
  }

  it('renders the named, sortable table with a server paginator and the total count', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    const root = host(fixture);
    // The accessible table name is preserved.
    expect(root.querySelector('table[aria-label="Fire incidents"]')).not.toBeNull();
    // Four sortable headers (name, fire number, last report, district) carry the sort affordance (§A.10).
    const sortHeaders = root.querySelectorAll('th[mat-sort-header]');
    expect(sortHeaders.length).toBe(4);
    // The live count reads the server total.
    const count = root.querySelector('[aria-live="polite"]');
    expect(count?.textContent).toContain('25 total');

    // The paginator length is the server total; its current page size is the documented default.
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const paginator = await loader.getHarness(MatPaginatorHarness);
    expect(await paginator.getPageSize()).toBe(25);
    // The range label reflects the 25-of-25 server total (the paginator length is bound to `total()`).
    expect(await paginator.getRangeLabel()).toContain('of 25');
    expect(instance(fixture).pageSizeOptions).toEqual([25, 50, 100]);
  });

  it('drives a status-group change through the toggle group', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    const loader = TestbedHarnessEnvironment.loader(fixture);
    const group = await loader.getHarness(MatButtonToggleGroupHarness);
    const toggles = await group.getToggles();
    // All / Active / Going / Major / Overdue / Resolved.
    expect(toggles).toHaveLength(6);
    const going = await loader.getHarness(MatButtonToggleGroupHarness);
    const goingToggle = (await going.getToggles({ text: 'Going' }))[0]!;
    await goingToggle.toggle();
    await settle(fixture);

    expect(instance(fixture).filters().group).toBe('going');
    expect(instance(fixture).total()).toBe(20);
  });

  it('issues the sort order and announces it on a header click', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    const loader = TestbedHarnessEnvironment.loader(fixture);
    const sort = await loader.getHarness(MatSortHarness);
    const nameHeader = (await sort.getSortHeaders({ label: 'Name' }))[0]!;
    await nameHeader.click();
    await settle(fixture);

    expect(instance(fixture).sortState().active).toBe('name');
    expect(instance(fixture).sortState().direction).toBe('asc');
  });

  it('omits the district filter for a viewer but keeps the status toggles', async () => {
    // Seed as admin (the insert hook restricts non-elevated users to their own district), then view as a
    // viewer to assert the elevated-only district filter is hidden.
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    remult.user = { ...VIEWER };
    const fixture = await createComponent({ ...VIEWER });
    await settle(fixture);

    expect(byAriaLabel(host(fixture), 'District')).toBeNull();
    expect(byAriaLabel(host(fixture), 'Financial year')).not.toBeNull();
    expect(byAriaLabel(host(fixture), 'Status')).not.toBeNull();
  });

  it('has no structural accessibility violations in the content state', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    expect(await findAxeViolations(host(fixture))).toEqual([]);
  });
});

describe('IncidentListComponent (severity-forward cells)', () => {
  function host(fixture: ComponentFixture<IncidentListComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function seedSeverityRows(): Promise<void> {
    await seedDistrict();
    // A going, level-3, major fire with an overdue cadence.
    await seedFire({
      id: 'going-l3',
      name: 'Otway Ridge',
      status: FireStatus.going,
      incidentLevel: IncidentLevel.levelThree,
      isMajor: true,
      fireAreaHectares: 1240,
      nextReportDue: new Date('2026-01-15T00:00:00Z'),
      financialYear: CURRENT_FY,
    });
    // A terminal (safe) fire keeps a stale past nextReportDue; the cadence must read `—`, not a countdown.
    await seedFire({
      id: 'safe-stale',
      name: 'Old Burn',
      status: FireStatus.safe,
      fireAreaHectares: 12,
      nextReportDue: new Date('2026-01-01T00:00:00Z'),
      financialYear: CURRENT_FY,
    });
  }

  it('renders the severity tile, status spine, badge and a terminal-aware cadence', async () => {
    remult.user = { ...ADMIN };
    await seedSeverityRows();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    const root = host(fixture);
    // Severity-forward primitives render in the rows.
    expect(root.querySelector('app-severity-tile')).not.toBeNull();
    expect(root.querySelector('app-status-badge')).not.toBeNull();
    expect(root.querySelector('app-cadence-countdown')).not.toBeNull();
    // The going row carries the going status spine (whole literal class, never interpolated).
    expect(root.querySelector('.status-spine.bg-status-going')).not.toBeNull();
    // The major fire shows a Major chip.
    expect(root.textContent).toContain('Major');

    // The terminal fire's cadence cell shows the em-dash (its due date was forced to null). Read the
    // name + next-due cells per row via column-scoped cell harnesses (avoids the index-signature record).
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const table = await loader.getHarness(MatTableHarness);
    const rows = await table.getRows();
    const rowReadings = await Promise.all(
      rows.map(async (row) => {
        const [nameCell] = await row.getCells({ columnName: 'name' });
        const [dueCell] = await row.getCells({ columnName: 'nextReportDue' });
        return { name: await nameCell!.getText(), due: await dueCell!.getText() };
      }),
    );
    const terminalRow = rowReadings.find((reading) => reading.name.includes('Old Burn'));
    expect(terminalRow?.due).toBe('—');

    expect(await findAxeViolations(root)).toEqual([]);
  });

  it('keeps the named table and drives sort from the Name header', async () => {
    remult.user = { ...ADMIN };
    await seedSeverityRows();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    expect(host(fixture).querySelector('table[aria-label="Fire incidents"]')).not.toBeNull();

    const loader = TestbedHarnessEnvironment.loader(fixture);
    const sort = await loader.getHarness(MatSortHarness);
    const nameHeader = (await sort.getSortHeaders({ label: 'Name' }))[0]!;
    await nameHeader.click();
    await settle(fixture);
    expect(instance(fixture).sortState().active).toBe('name');
  });
});

describe('IncidentListComponent (persisted density toggle)', () => {
  function host(fixture: ComponentFixture<IncidentListComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('defaults to compact, switches to comfortable and persists the choice', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    // Default density is the app-wide compact preference (DensityService).
    expect(instance(fixture).density()).toBe('compact');
    const wrapper = host(fixture).querySelector('.table-panel');
    expect(wrapper?.getAttribute('data-density')).toBe('compact');

    // Selecting Comfortable via the toggle harness updates the wrapper and persists to localStorage.
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const comfortable = await loader.getHarness(
      MatButtonToggleHarness.with({ text: 'Comfortable' }),
    );
    await comfortable.toggle();
    await settle(fixture);

    expect(instance(fixture).density()).toBe('comfortable');
    expect(host(fixture).querySelector('.table-panel')?.getAttribute('data-density')).toBe(
      'comfortable',
    );
    expect(localStorage.getItem('fire-density')).toBe('comfortable');
  });

  it('reads the persisted density back on a fresh component', async () => {
    localStorage.setItem('fire-density', 'comfortable');
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    expect(instance(fixture).density()).toBe('comfortable');
    expect(host(fixture).querySelector('.table-panel')?.getAttribute('data-density')).toBe(
      'comfortable',
    );
  });
});

describe('IncidentListComponent (live-query error handling)', () => {
  function host(fixture: ComponentFixture<IncidentListComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('surfaces an error and offers retry when the live query fails, then recovers', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    // Force the initial-load transport (the live query's first fetch) to reject so the subscription's
    // `error` listener fires — modelling an SSE/transport drop (LIST-6/DATA-1).
    const failQueryElseEmpty = (url: string): Promise<unknown> =>
      url.includes(LIVE_QUERY_ACTION)
        ? Promise.reject(new Error('Event Source Error'))
        : Promise.resolve([]);
    const failingClient = {
      ...liveHttpClient,
      get: failQueryElseEmpty,
      post: failQueryElseEmpty,
    };
    remult.apiClient.httpClient = failingClient;

    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    // The error is surfaced (state + a non-null message + visible alert + retry copy), not swallowed.
    // Remult wraps the transport failure before it reaches the subscription's `error` listener, so the
    // exact text is transport-defined; the contract is that some message reaches the error signal.
    expect(instance(fixture).viewState()).toBe('error');
    expect(instance(fixture).error()).toBeTruthy();
    expect(host(fixture).querySelector('[role="alert"]')).not.toBeNull();
    expect(text(fixture)).toContain('Could not load incidents');

    // Restore a healthy transport and retry: the list recovers to content.
    remult.apiClient.httpClient = liveHttpClient;
    instance(fixture).retry();
    await settle(fixture);

    expect(instance(fixture).error()).toBeNull();
    expect(instance(fixture).viewState()).toBe('content');
  });
});

describe('IncidentListComponent (empty-state filter reset)', () => {
  it('clears all filters back to their defaults from the empty state', async () => {
    remult.user = { ...ADMIN };
    await seedDistrict();
    await seedFire({
      id: 'prior-only',
      name: 'Prior Only',
      status: FireStatus.going,
      financialYear: PRIOR_FY,
    });
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    // The default current-FY filter hides the only (prior-year) fire.
    expect(instance(fixture).viewState()).toBe('empty');

    // Clearing filters drops the FY restriction so the prior-year fire becomes visible.
    instance(fixture).resetFilters();
    await settle(fixture);

    expect(instance(fixture).filters().fy).toBe('all');
    expect(instance(fixture).filters().group).toBe('all');
    expect(instance(fixture).filters().districtId).toBe('all');
    expect(instance(fixture).total()).toBe(1);
    expect(instance(fixture).viewState()).toBe('content');
  });
});

describe('IncidentListComponent (handset severity cards)', () => {
  function host(fixture: ComponentFixture<IncidentListComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders stacked severity cards instead of the table on a handset', async () => {
    remult.user = { ...ADMIN };
    await seedDistrict();
    await seedFire({
      id: 'going-l3',
      name: 'Otway Ridge',
      status: FireStatus.going,
      incidentLevel: IncidentLevel.levelThree,
      isMajor: true,
      fireAreaHectares: 1240,
      nextReportDue: new Date('2026-01-15T00:00:00Z'),
      financialYear: CURRENT_FY,
    });
    await seedFire({
      id: 'safe-stale',
      name: 'Old Burn',
      status: FireStatus.safe,
      fireAreaHectares: 12,
      nextReportDue: new Date('2026-01-01T00:00:00Z'),
      financialYear: CURRENT_FY,
    });
    // Force the handset breakpoint.
    const fixture = await createComponent({ ...ADMIN }, true);
    await settle(fixture);

    const root = host(fixture);
    // The table is replaced by cards; each card is a routerLink to the incident.
    expect(root.querySelector('table')).toBeNull();
    // The cards honour the density signal so the toggle is consistent across layouts (LIST-9).
    // Default is the app-wide compact preference (DensityService).
    expect(root.querySelector('.cards')?.getAttribute('data-density')).toBe('compact');
    const cards = root.querySelectorAll('a.card');
    expect(cards.length).toBe(2);
    expect((cards[0] as HTMLAnchorElement).getAttribute('href')).toContain('/incidents/');
    // Each card carries the severity primitives.
    expect(root.querySelector('a.card app-severity-tile')).not.toBeNull();
    expect(root.querySelector('a.card app-status-badge')).not.toBeNull();
    expect(root.querySelector('a.card app-cadence-countdown')).not.toBeNull();
    expect(root.textContent).toContain('Otway Ridge');

    // The filter bar and paginator remain above/below the cards.
    expect(root.querySelector('[aria-label="Financial year"]')).not.toBeNull();
    expect(root.querySelector('mat-paginator')).not.toBeNull();

    expect(await findAxeViolations(root)).toEqual([]);
  });
});

// A far-future cadence so an active fire is NOT overdue (nextReportDue must be >= now to stay current).
const FUTURE_DUE = new Date('2099-01-01T00:00:00Z');
// A past cadence (before the real test clock) so an active fire IS overdue.
const PAST_DUE = new Date('2026-01-15T00:00:00Z');

describe('IncidentListComponent (major + overdue groups)', () => {
  async function seedGroupFires(): Promise<void> {
    await seedDistrict();
    // Active major fire (counts for both Major and, as not overdue, not Overdue).
    await seedFire({
      id: 'major-active',
      name: 'Major Active',
      status: FireStatus.going,
      isMajor: true,
      nextReportDue: FUTURE_DUE,
      financialYear: CURRENT_FY,
    });
    // Active, non-major, overdue fire (counts for Overdue, not Major).
    await seedFire({
      id: 'overdue-active',
      name: 'Overdue Active',
      status: FireStatus.going,
      nextReportDue: PAST_DUE,
      financialYear: CURRENT_FY,
    });
    // Active, non-major, on-time fire (neither Major nor Overdue).
    await seedFire({
      id: 'on-time-active',
      name: 'On Time Active',
      status: FireStatus.going,
      nextReportDue: FUTURE_DUE,
      financialYear: CURRENT_FY,
    });
    // Terminal fire that was once major and is past due — excluded from both active-only groups.
    await seedFire({
      id: 'terminal-major',
      name: 'Terminal Major',
      status: FireStatus.safe,
      isMajor: true,
      nextReportDue: PAST_DUE,
      financialYear: CURRENT_FY,
    });
  }

  it('filters to active major fires for the major group', async () => {
    remult.user = { ...ADMIN };
    await seedGroupFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    instance(fixture).setStatusGroup('major');
    await settle(fixture);

    expect(instance(fixture).filters().group).toBe('major');
    expect(instance(fixture).total()).toBe(1);
    const rows = instance(fixture).rows() as FireIncident[];
    expect(rows.map((row) => row.id)).toEqual(['major-active']);
    for (const row of rows) {
      expect(row.isMajor).toBe(true);
      expect(row.status).toBe(FireStatus.going);
    }
  });

  it('filters to active fires past their next report for the overdue group', async () => {
    remult.user = { ...ADMIN };
    await seedGroupFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    instance(fixture).setStatusGroup('overdue');
    await settle(fixture);

    expect(instance(fixture).filters().group).toBe('overdue');
    expect(instance(fixture).total()).toBe(1);
    const rows = instance(fixture).rows() as FireIncident[];
    expect(rows.map((row) => row.id)).toEqual(['overdue-active']);
  });
});

describe('IncidentListComponent (region filter)', () => {
  async function seedRegionFires(): Promise<void> {
    await seedMultiRegionDistricts();
    // Region 1 holds two districts; seed one fire in each plus a region-2 fire to prove the narrowing.
    await seedFire({
      id: 'r1-otway',
      name: 'Region One Otway',
      status: FireStatus.going,
      districtId: 12,
      nextReportDue: FUTURE_DUE,
      financialYear: CURRENT_FY,
    });
    await seedFire({
      id: 'r1-fsw',
      name: 'Region One Far South West',
      status: FireStatus.going,
      districtId: 14,
      nextReportDue: FUTURE_DUE,
      financialYear: CURRENT_FY,
    });
    await seedFire({
      id: 'r2-mallee',
      name: 'Region Two Mallee',
      status: FireStatus.going,
      districtId: 22,
      nextReportDue: FUTURE_DUE,
      financialYear: CURRENT_FY,
    });
  }

  it('narrows to the districts inside the chosen region for an elevated user', async () => {
    remult.user = { ...ADMIN };
    await seedRegionFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    // Region 1 expands to districts 12 + 14, so only those two fires remain (region 2 drops out).
    instance(fixture).setRegion(1);
    await settle(fixture);

    expect(instance(fixture).filters().region).toBe(1);
    expect(instance(fixture).total()).toBe(2);
    const ids = (instance(fixture).rows() as FireIncident[]).map((row) => row.id).sort();
    expect(ids).toEqual(['r1-fsw', 'r1-otway']);
  });

  it('lets an explicit district override the region', async () => {
    remult.user = { ...ADMIN };
    await seedRegionFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    instance(fixture).setRegion(1);
    instance(fixture).setDistrict(12);
    await settle(fixture);

    // District wins: only the Otway (12) fire shows, even though region 1 also contains district 14.
    expect(instance(fixture).total()).toBe(1);
    const ids = (instance(fixture).rows() as FireIncident[]).map((row) => row.id);
    expect(ids).toEqual(['r1-otway']);
  });

  it('seeds the region filter from a deep-link URL and expands it to the in-region districts', async () => {
    // The end-to-end deep-link path for an elevated user: `region=1` in the URL seeds filters().region
    // AND must expand to the right districtId `$in` set once the districts load — not just via the
    // programmatic setRegion above (TEST-2).
    remult.user = { ...ADMIN };
    await seedRegionFires();
    const fixture = await createComponentWithQuery({ ...ADMIN }, { region: 1 });
    await settle(fixture);

    // The signal seeds straight from the URL ...
    expect(instance(fixture).filters().region).toBe(1);
    // ... and region 1 expands to districts 12 + 14, so only those two fires remain (region 2 drops out).
    expect(instance(fixture).total()).toBe(2);
    const ids = (instance(fixture).rows() as FireIncident[]).map((row) => row.id).sort();
    expect(ids).toEqual(['r1-fsw', 'r1-otway']);
  });
});

describe('IncidentListComponent (deep-linkable URL filters)', () => {
  it('seeds the controls and where clause from the query params on load', async () => {
    remult.user = { ...ADMIN };
    await seedDistrict();
    await seedFire({
      id: 'major-active',
      name: 'Major Active',
      status: FireStatus.going,
      isMajor: true,
      nextReportDue: FUTURE_DUE,
      financialYear: CURRENT_FY,
    });
    await seedFire({
      id: 'on-time-active',
      name: 'On Time Active',
      status: FireStatus.going,
      nextReportDue: FUTURE_DUE,
      financialYear: CURRENT_FY,
    });

    // Deep link straight into the major group at the current FY.
    const fixture = await createComponentWithQuery(
      { ...ADMIN },
      { group: 'major', fy: CURRENT_FY },
    );
    await settle(fixture);

    // The signal seeds from the URL and the where clause filters to the single active major fire.
    expect(instance(fixture).filters().group).toBe('major');
    expect(instance(fixture).filters().fy).toBe(CURRENT_FY);
    expect(instance(fixture).total()).toBe(1);
    expect((instance(fixture).rows() as FireIncident[]).map((row) => row.id)).toEqual([
      'major-active',
    ]);
  });

  it('ignores district and region query params for a non-elevated viewer', async () => {
    // Seed as admin (the insert hook pins non-elevated users to their own district), then load as a
    // viewer with a hand-edited URL trying to widen scope — the reader must clamp both away.
    remult.user = { ...ADMIN };
    await seedMultiRegionDistricts();
    await seedFire({
      id: 'r2-mallee',
      name: 'Region Two Mallee',
      status: FireStatus.going,
      districtId: 22,
      nextReportDue: FUTURE_DUE,
      financialYear: CURRENT_FY,
    });
    remult.user = { ...VIEWER };

    const fixture = await createComponentWithQuery({ ...VIEWER }, { region: 2, districtId: 22 });
    await settle(fixture);

    // A viewer cannot widen scope from the URL: both scope params clamp back to 'all'.
    expect(instance(fixture).filters().region).toBe('all');
    expect(instance(fixture).filters().districtId).toBe('all');
  });
});

describe('IncidentListComponent (active-filter chips)', () => {
  function host(fixture: ComponentFixture<IncidentListComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('renders no chip row when only the default filters are active', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    // Defaults (current FY, all statuses, no district/region) produce zero chips, so the row is hidden.
    expect(instance(fixture).activeFilterChips()).toEqual([]);
    expect(host(fixture).querySelector('.filter-chips')).toBeNull();
  });

  it('renders one removable chip per non-default filter', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponentWithQuery(
      { ...ADMIN },
      { group: 'going', fy: 'all', districtId: 12 },
    );
    await settle(fixture);

    // FY (≠ current), status group, and district each surface a chip; region stays default → no chip.
    const chips = instance(fixture).activeFilterChips() as { kind: string; label: string }[];
    expect(chips.map((chip) => chip.kind)).toEqual(['fy', 'group', 'district']);
    expect(chips.map((chip) => chip.label)).toEqual(['All years', 'Going', 'District: Otway']);

    // The chips render as a Material chip set (buttons, never anchors → no nested-anchor risk).
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const chipSet = await loader.getHarness(MatChipSetHarness);
    const chipHarnesses = await chipSet.getChips();
    expect(chipHarnesses).toHaveLength(3);
  });

  it('removes a single filter when its chip is removed, and rewrites the URL', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponentWithQuery({ ...ADMIN }, { group: 'going', fy: 'all' });
    await settle(fixture);

    const router = TestBed.inject(Router);
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const chipSet = await loader.getHarness(MatChipSetHarness);
    // Remove just the status-group chip (the second one) via the harness's accessible remove path.
    const [, groupChip] = await chipSet.getChips();
    await groupChip!.remove();
    await settle(fixture);

    // Only the group resets to its default; the widened FY chip survives.
    expect(instance(fixture).filters().group).toBe('all');
    expect(instance(fixture).filters().fy).toBe('all');
    // The setter rewrote the URL: group dropped out, fy=all remains.
    expect(router.url).not.toContain('group=going');
    expect(router.url).toContain('fy=all');
    const remaining = instance(fixture).activeFilterChips() as { kind: string }[];
    expect(remaining.map((chip) => chip.kind)).toEqual(['fy']);
  });

  it('removing the FY chip resets to the current financial year, not all years', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponentWithQuery({ ...ADMIN }, { fy: PRIOR_FY });
    await settle(fixture);

    const loader = TestbedHarnessEnvironment.loader(fixture);
    const chipSet = await loader.getHarness(MatChipSetHarness);
    const [fyChip] = await chipSet.getChips();
    await fyChip!.remove();
    await settle(fixture);

    // The FY default is the current financial year — removing the chip lands there, not on 'all'.
    expect(instance(fixture).filters().fy).toBe(CURRENT_FY);
    expect(instance(fixture).activeFilterChips()).toEqual([]);
  });

  it('clears the status and scope filters from the chip row Clear all action', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponentWithQuery(
      { ...ADMIN },
      { group: 'going', fy: PRIOR_FY, districtId: 12 },
    );
    await settle(fixture);

    // The trailing Clear all reuses resetFilters(): status + scope reset, and FY is deliberately
    // widened to 'all' (a documented widening, not the current-FY default), so an "All years" chip
    // remains — the row stays visible with just that one chip.
    instance(fixture).resetFilters();
    await settle(fixture);

    expect(instance(fixture).filters().group).toBe('all');
    expect(instance(fixture).filters().districtId).toBe('all');
    expect(instance(fixture).filters().region).toBe('all');
    expect(instance(fixture).filters().fy).toBe('all');
    const remaining = instance(fixture).activeFilterChips() as { kind: string; label: string }[];
    expect(remaining.map((chip) => chip.kind)).toEqual(['fy']);
    expect(remaining[0]!.label).toBe('All years');
  });
});

describe('IncidentListComponent (filter-preserving row links)', () => {
  function host(fixture: ComponentFixture<IncidentListComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('forwards the active filters as query params on the desktop row link', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponentWithQuery({ ...ADMIN }, { group: 'going', fy: 'all' });
    await settle(fixture);

    // filterParams() mirrors the list's own non-default URL params.
    expect(instance(fixture).filterParams()).toEqual({ group: 'going', fy: 'all' });
    // The single row anchor carries them, so list → detail → Back round-trips the view state.
    const rowLink = host(fixture).querySelector('a.row-link') as HTMLAnchorElement | null;
    expect(rowLink).not.toBeNull();
    const href = rowLink!.getAttribute('href') ?? '';
    expect(href).toContain('group=going');
    expect(href).toContain('fy=all');
  });

  it('forwards the active filters as query params on the handset card link', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    // Force the handset breakpoint (matches=true) so the cards render instead of the table.
    const fixture = await createComponentWithQuery({ ...ADMIN }, { group: 'going' }, true);
    await settle(fixture);

    expect(instance(fixture).filterParams()).toEqual({ group: 'going' });
    // The single card anchor carries the filters; the table (and its row link) is absent on handset.
    expect(host(fixture).querySelector('table')).toBeNull();
    const card = host(fixture).querySelector('a.card') as HTMLAnchorElement | null;
    expect(card).not.toBeNull();
    expect(card!.getAttribute('href')).toContain('group=going');
  });
});

describe('IncidentListComponent (district drill-in cell)', () => {
  function host(fixture: ComponentFixture<IncidentListComponent>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  async function seedDistrictRow(): Promise<void> {
    await seedDistrict();
    await seedFire({
      id: 'otway-going',
      name: 'Otway Going',
      status: FireStatus.going,
      districtId: 12,
      nextReportDue: FUTURE_DUE,
      financialYear: CURRENT_FY,
    });
  }

  it('renders the district cell as a drill-in link for an elevated user', async () => {
    remult.user = { ...ADMIN };
    await seedDistrictRow();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    const link = host(fixture).querySelector('a.district-link') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link!.textContent).toContain('Otway');
    // The drill-in carries the district id and the current FY filter.
    const href = link!.getAttribute('href') ?? '';
    expect(href).toContain('districtId=12');

    expect(await findAxeViolations(host(fixture))).toEqual([]);
  });

  it('renders plain district text (no link) for a viewer', async () => {
    // Seed as admin, then view as a viewer — the drill-in is elevated-only.
    remult.user = { ...ADMIN };
    await seedDistrictRow();
    remult.user = { ...VIEWER };
    const fixture = await createComponent({ ...VIEWER });
    await settle(fixture);

    expect(host(fixture).querySelector('a.district-link')).toBeNull();
    // The viewer's own-district row still shows the district name as plain text.
    expect(text(fixture)).toContain('Otway');
  });
});
