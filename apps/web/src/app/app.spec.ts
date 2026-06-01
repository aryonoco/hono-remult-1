import { BreakpointObserver } from '@angular/cdk/layout';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatNavListHarness } from '@angular/material/list/testing';
import { MatToolbarHarness } from '@angular/material/toolbar/testing';
import { Title } from '@angular/platform-browser';
import { provideRouter, Router, TitleStrategy } from '@angular/router';
import { remult } from 'remult';
import { of } from 'rxjs';
import { findAxeViolations } from '../testing/axe-helper';
import { App } from './app';
import { routes } from './app.routes';
import { BreadcrumbService } from './core/breadcrumb.service';
import { DevAuthService } from './core/dev-auth.service';
import { NotificationService } from './core/notification.service';
import { AppTitleStrategy } from './core/title-strategy';

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

// A detail URL carrying the list's forwarded filters, assembled from parts (a single literal trips the
// high-entropy `noSecrets` heuristic). `INCIDENT_FILTERS` is the query string the 'Incidents' crumb must
// preserve back to the filtered list.
const INCIDENT_FILTERS = ['fy=all', 'group=overdue'].join('&');
const DETAIL_URL = `/incidents/${['fire', '7'].join('-')}?${INCIDENT_FILTERS}`;
const INCIDENT_NAME = 'Otway Ridge Fire';
// Trailing separator stripped from a crumb's text so the visible label can be compared cleanly.
const TRAILING_SEP = /\s*\/\s*$/;

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

  it('exposes the brand wordmark as a home link to the overview', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const brand = (fixture.nativeElement as HTMLElement).querySelector<HTMLAnchorElement>(
      'a.appbar__brand',
    );
    expect(brand).not.toBeNull();
    // RouterLink resolves the routerLink to an href; the accessible name names the destination.
    expect(brand?.getAttribute('href')).toBe('/overview');
    expect(brand?.getAttribute('aria-label')).toBe('Fire Incidents — go to overview');
    expect(brand?.textContent).toContain('Fire Incidents');
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

describe('App (route titles + focus management)', () => {
  beforeEach(async () => {
    localStorage.clear();
    stubBrowserApis();
    remult.apiClient.httpClient = httpStub;
    remult.apiClient.subscriptionClient = { openConnection: openConnectionSpy };
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        provideRouter(routes),
        // Mirror the app config: the AppTitleStrategy suffixes each route title with the wordmark.
        { provide: TitleStrategy, useClass: AppTitleStrategy },
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

  it('suffixes each route title with the app wordmark', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    const title = TestBed.inject(Title);

    await router.navigateByUrl('/overview');
    await fixture.whenStable();
    expect(title.getTitle()).toBe('Overview — Fire Incidents');

    await router.navigateByUrl('/incidents');
    await fixture.whenStable();
    expect(title.getTitle()).toBe('Incidents — Fire Incidents');
  });

  it('moves focus to the main content region on a non-initial navigation', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    // The first completed navigation is intentionally skipped (it stands in for the initial page
    // load), so drive one navigation before asserting that the next one moves focus.
    await router.navigateByUrl('/overview');
    await fixture.whenStable();
    await router.navigateByUrl('/incidents');
    await fixture.whenStable();
    // The incidents list has no `h1[tabindex="-1"]`, so focus lands on the `#main` landmark fallback.
    expect(document.activeElement).toBe(document.getElementById('main'));
  });

  it('focuses the view heading when navigating to a view that exposes an h1[tabindex="-1"]', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    // Skip the initial-load navigation, then move to the overview (its `h1[tabindex="-1"]` is the
    // route-change focus target, in preference to the `#main` fallback).
    await router.navigateByUrl('/incidents');
    await fixture.whenStable();
    await router.navigateByUrl('/overview');
    await fixture.whenStable();
    const heading = (fixture.nativeElement as HTMLElement).querySelector('main h1[tabindex="-1"]');
    expect(heading).not.toBeNull();
    expect(document.activeElement).toBe(heading);
  });

  it('does not move focus on a query-param-only navigation on the same path', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    // Land on the incidents list (a real path change moves focus to the `#main` fallback) ...
    await router.navigateByUrl('/overview');
    await fixture.whenStable();
    await router.navigateByUrl('/incidents');
    await fixture.whenStable();
    // ... then move focus to a control, as a list filter/sort/page interaction would.
    const probe = document.createElement('button');
    probe.id = 'focus-probe';
    document.body.appendChild(probe);
    probe.focus();
    expect(document.activeElement).toBe(probe);
    // A filter/sort/page write navigates to the SAME path with only query params, emitting NavigationEnd.
    await router.navigate(['/incidents'], { queryParams: { group: 'overdue' } });
    await fixture.whenStable();
    // The path did not change, so focus stays on the just-used control rather than jumping to #main.
    expect(document.activeElement).toBe(probe);
    probe.remove();
  });

  it('does not move focus while a role=dialog overlay is open', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/overview');
    await fixture.whenStable();
    // Stand in for an open Material dialog: a role=dialog node inside the overlay container.
    const overlay = document.createElement('div');
    overlay.className = 'cdk-overlay-container';
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    const probe = document.createElement('button');
    probe.id = 'dialog-focus-probe';
    document.body.appendChild(probe);
    probe.focus();
    // A navigation that would normally move focus must be suppressed while the dialog owns focus.
    await router.navigateByUrl('/incidents');
    await fixture.whenStable();
    expect(document.activeElement).toBe(probe);
    overlay.remove();
    probe.remove();
  });
});

describe('App (breadcrumb trail)', () => {
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

  function crumbs(fixture: ReturnType<typeof TestBed.createComponent<App>>): HTMLElement[] {
    const nav = (fixture.nativeElement as HTMLElement).querySelector('nav.breadcrumb');
    return nav ? [...nav.querySelectorAll<HTMLElement>('li.breadcrumb__item')] : [];
  }

  it('shows no breadcrumb on the single-crumb overview page', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/overview');
    await fixture.whenStable();
    // A lone 'Overview' crumb is suppressed — the trail renders only at depth >= 2.
    expect((fixture.nativeElement as HTMLElement).querySelector('nav.breadcrumb')).toBeNull();
  });

  it('renders an Overview / Incidents / name trail on an incident detail URL', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    // The mounted detail's `resource()` never resolves under the stubbed transport, so the app is never
    // "stable"; await the navigation (the lazy route + the breadcrumb's NavigationEnd) then flush a
    // synchronous render pass with `TestBed.tick()` rather than hanging on `whenStable()`.
    await router.navigateByUrl(DETAIL_URL);
    TestBed.tick();
    // Publish the name AFTER mount: the detail clears the crumb to null while its own fire is still
    // loading (so a prior incident never bleeds through), then publishes the name once the fire resolves.
    TestBed.inject(BreadcrumbService).set(INCIDENT_NAME);
    TestBed.tick();
    const items = crumbs(fixture);
    const labels = items.map((li) => (li.textContent ?? '').replace(TRAILING_SEP, '').trim());
    expect(labels).toEqual(['Overview', 'Incidents', INCIDENT_NAME]);
  });

  it('marks the last crumb aria-current and renders it as plain text, not a link', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    await router.navigateByUrl(DETAIL_URL);
    TestBed.tick();
    // The detail clears the crumb while loading, then publishes the name once its fire resolves.
    TestBed.inject(BreadcrumbService).set(INCIDENT_NAME);
    TestBed.tick();
    const current = (fixture.nativeElement as HTMLElement).querySelector(
      'nav.breadcrumb [aria-current="page"]',
    );
    expect(current?.textContent?.trim()).toBe(INCIDENT_NAME);
    expect(current?.tagName).toBe('SPAN');
    // The final crumb is not a link.
    expect(crumbs(fixture).at(-1)?.querySelector('a')).toBeNull();
  });

  it('preserves the forwarded list filters on the Incidents back-link only', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    await router.navigateByUrl(DETAIL_URL);
    TestBed.tick();
    const links = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>(
        'nav.breadcrumb a.breadcrumb__link',
      ),
    ];
    const incidents = links.find((a) => a.textContent?.trim() === 'Incidents');
    const overview = links.find((a) => a.textContent?.trim() === 'Overview');
    // queryParamsHandling="preserve" carries the forwarded fy/group back to the filtered list.
    expect(incidents?.getAttribute('href')).toBe(`/incidents?${INCIDENT_FILTERS}`);
    // Every other crumb is a clean link with no forwarded query params.
    expect(overview?.getAttribute('href')).toBe('/overview');
  });

  it('has no structural accessibility violations with the breadcrumb rendered', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    const router = TestBed.inject(Router);
    await router.navigateByUrl(DETAIL_URL);
    TestBed.tick();
    // The detail clears the crumb while loading, then publishes the name once its fire resolves.
    TestBed.inject(BreadcrumbService).set(INCIDENT_NAME);
    TestBed.tick();
    expect(await findAxeViolations(fixture.nativeElement)).toEqual([]);
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
