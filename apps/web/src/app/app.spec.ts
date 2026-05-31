import { BreakpointObserver } from '@angular/cdk/layout';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatNavListHarness } from '@angular/material/list/testing';
import { MatToolbarHarness } from '@angular/material/toolbar/testing';
import { provideRouter, Router } from '@angular/router';
import { remult } from 'remult';
import { of } from 'rxjs';
import { findAxeViolations } from '../testing/axe-helper';
import { App } from './app';
import { routes } from './app.routes';
import { DevAuthService } from './core/dev-auth.service';
import { NotificationService } from './core/notification.service';

const breakpointStub = { observe: () => of({ matches: false, breakpoints: {} }) };

// jsdom lacks `matchMedia` (consulted by ThemeService in the lazy overview/incident-map tree) and
// `IntersectionObserver` (registered by `@defer (prefetch on idle)`). Stub both (test-only) so the lazy
// routes mount when the focus test drives a real navigation.
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

// `liveQuery` (used by the incident list mounted at `/incidents`) talks to the server over HTTP + SSE.
// Neither exists in jsdom, so the transport is neutralised: the connection is a no-op and the initial
// load never resolves — the data path stays inert while the shell's focus behaviour is asserted.
const hang = (): Promise<never> => new Promise<never>(() => undefined);
const httpStub = { get: hang, post: hang, put: hang, delete: hang };
const openConnectionSpy = vi.fn(() =>
  Promise.resolve({ subscribe: () => Promise.resolve(() => undefined), close: () => undefined }),
);
const notificationStub = { success: () => undefined, error: () => undefined };

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
        { provide: BreakpointObserver, useValue: breakpointStub },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('creates the app', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });

  it('renders the toolbar title', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const toolbar = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatToolbarHarness);
    expect((await toolbar.getRowsAsText()).join(' ')).toContain('Fire Incidents');
  });

  it('lists Overview then Incidents in the primary navigation', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const list = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatNavListHarness);
    const labels = await Promise.all((await list.getItems()).map((item) => item.getFullText()));
    expect(labels).toEqual(['Overview', 'Incidents']);
  });

  it('has no structural accessibility violations (skip-link, nav landmark, main)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    expect(await findAxeViolations(fixture.nativeElement)).toEqual([]);
  });
});

describe('App (route-change focus management)', () => {
  beforeEach(async () => {
    localStorage.clear();
    stubBrowserApis();
    remult.apiClient.httpClient = httpStub;
    remult.apiClient.subscriptionClient = { openConnection: openConnectionSpy };
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
        { provide: BreakpointObserver, useValue: breakpointStub },
        { provide: NotificationService, useValue: notificationStub },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    vi.unstubAllGlobals();
  });

  it('moves focus to the main content region after navigation', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/incidents');
    await fixture.whenStable();
    expect(document.activeElement).toBe(document.getElementById('main'));
  });
});

describe('App (anonymous user)', () => {
  const anonymousDevAuth = {
    currentUser: () => undefined,
    currentUserId: undefined,
    selectUser: async () => undefined,
  };

  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter([]),
        { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
        { provide: BreakpointObserver, useValue: breakpointStub },
        { provide: DevAuthService, useValue: anonymousDevAuth },
      ],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders the shell without a current user', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const loader = TestbedHarnessEnvironment.loader(fixture);
    expect(await loader.hasHarness(MatToolbarHarness)).toBe(true);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Not signed in');
  });
});
