import { BreakpointObserver } from '@angular/cdk/layout';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  MatButtonToggleGroupHarness,
  MatButtonToggleHarness,
} from '@angular/material/button-toggle/testing';
import { MatPaginatorHarness } from '@angular/material/paginator/testing';
import { MatSortHarness } from '@angular/material/sort/testing';
import { MatTableHarness } from '@angular/material/table/testing';
import { provideRouter } from '@angular/router';
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

// Reconstruct the entity filter from the encoded query string. Only the component's filter vocabulary is
// handled: `status.ne` (repeated) → `$nin`, `status.in` (JSON array) → `$in`, bare equality, plus the
// `financialYear`/`districtId` scalars.
function decodeWhere(params: URLSearchParams): EntityFilter<FireIncident> {
  const where: EntityFilter<FireIncident> = {};
  const neValues: FireStatus[] = [];
  for (const [key, value] of params.entries()) {
    if (key === 'status.ne') {
      neValues.push(value as FireStatus);
    } else if (key === 'status.in') {
      where.status = { $in: JSON.parse(value) as FireStatus[] };
    } else if (key === 'financialYear') {
      where.financialYear = Number(value);
    } else if (key === 'districtId') {
      where.districtId = Number(value);
    } else if (key === 'status') {
      where.status = value as FireStatus;
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
    instance(fixture).onSortChange({ active: 'name', direction: 'asc' });
    instance(fixture).onPage({ pageIndex: 0, pageSize: 10 });
    await settle(fixture);
    const firstPageIds = instance(fixture)
      .rows()
      .map((row: FireIncident) => row.id);

    instance(fixture).onPage({ pageIndex: 1, pageSize: 10 });
    await settle(fixture);
    const secondPageIds = instance(fixture)
      .rows()
      .map((row: FireIncident) => row.id);

    // Server pagination: the second page returns a distinct, non-overlapping slice.
    expect(firstPageIds.length).toBe(10);
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
    // All / Active / Going / Resolved.
    expect(toggles).toHaveLength(4);
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

  it('defaults to comfortable, switches to compact and persists the choice', async () => {
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    // Default density.
    expect(instance(fixture).density()).toBe('comfortable');
    const wrapper = host(fixture).querySelector('.table-panel');
    expect(wrapper?.getAttribute('data-density')).toBe('comfortable');

    // Selecting Compact via the toggle harness updates the wrapper and persists to localStorage.
    const loader = TestbedHarnessEnvironment.loader(fixture);
    const compact = await loader.getHarness(MatButtonToggleHarness.with({ text: 'Compact' }));
    await compact.toggle();
    await settle(fixture);

    expect(instance(fixture).density()).toBe('compact');
    expect(host(fixture).querySelector('.table-panel')?.getAttribute('data-density')).toBe(
      'compact',
    );
    expect(localStorage.getItem('fire-list-density')).toBe('compact');
  });

  it('reads the persisted density back on a fresh component', async () => {
    localStorage.setItem('fire-list-density', 'compact');
    remult.user = { ...ADMIN };
    await seedThirtyFires();
    const fixture = await createComponent({ ...ADMIN });
    await settle(fixture);

    expect(instance(fixture).density()).toBe('compact');
    expect(host(fixture).querySelector('.table-panel')?.getAttribute('data-density')).toBe(
      'compact',
    );
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
