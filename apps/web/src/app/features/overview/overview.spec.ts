import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { type CurrentUser, DEV_USERS, District, FireIncident } from '@workspace/shared-domain';
import { InMemoryDataProvider, remult } from 'remult';
import { findAxeViolations } from '../../../testing/axe-helper';
import { DevAuthService } from '../../core/dev-auth.service';
import { OverviewComponent } from './overview';

const ADMIN = DEV_USERS[0]!; // admin, districtId null

// matchMedia is absent in jsdom; the IncidentMapComponent's ThemeService consults it. Stub it (test-only).
function stubMatchMedia(): void {
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

async function setup(user: CurrentUser | undefined): Promise<ComponentFixture<OverviewComponent>> {
  const devAuthStub = {
    currentUser: () => user,
    currentUserId: user?.id,
    selectUser: async () => undefined,
  };
  TestBed.configureTestingModule({
    imports: [OverviewComponent],
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
}

// `liveQuery` (needs-attention + recent sitreps) opens an SSE channel for change push. jsdom has no
// `EventSource`, so the subscription connection is neutralised to a no-op; the initial items still flow
// from the in-memory provider's load. (Mirrors `incident-list.spec.ts`.)
const openConnectionSpy = vi.fn(() =>
  Promise.resolve({ subscribe: () => Promise.resolve(() => undefined), close: () => undefined }),
);

beforeEach(() => {
  localStorage.clear();
  stubMatchMedia();
  openConnectionSpy.mockClear();
  remult.dataProvider = new InMemoryDataProvider();
  remult.apiClient.subscriptionClient = { openConnection: openConnectionSpy };
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
