import { BreakpointObserver } from '@angular/cdk/layout';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  type CurrentUser,
  DEV_USERS,
  FireIncident,
  FireStatus,
  IncidentLevel,
} from '@workspace/shared-domain';
import { remult } from 'remult';
import { of } from 'rxjs';
import { findAxeViolations } from '../../../../testing/axe-helper';
import { DevAuthService } from '../../../core/dev-auth.service';
import { NotificationService } from '../../../core/notification.service';
import { IncidentListComponent } from './incident-list';

const ADMIN = DEV_USERS[0]!; // admin, districtId null
const STATE_OFFICER = DEV_USERS[1]!; // stateOfficer, districtId null
const EDITOR = DEV_USERS[2]!; // incidentEditor, dev-editor-otway
const VIEWER = DEV_USERS[5]!; // viewer, dev-viewer-otway

const notificationStub = { success: () => undefined, error: () => undefined };

// `liveQuery` talks to the server over an HTTP load plus an SSE channel. Neither exists in a unit test, so
// the transport is neutralised: the subscription connection is a no-op and the initial HTTP load never
// resolves (the query stays pending, so no data/error is ever delivered). This keeps the data path inert
// while the no-network surface — gating, the anonymous skip, and responsive layout — is asserted directly.
const hang = (): Promise<never> => new Promise<never>(() => undefined);
const openConnectionSpy = vi.fn(() =>
  Promise.resolve({ subscribe: () => Promise.resolve(() => undefined), close: () => undefined }),
);
const httpStub = { get: hang, post: hang, put: hang, delete: hang };

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
  fixture.detectChanges();
  return fixture;
}

function text(fixture: ComponentFixture<IncidentListComponent>): string {
  return (fixture.nativeElement as HTMLElement).textContent ?? '';
}

function newIncidentLink(
  fixture: ComponentFixture<IncidentListComponent>,
): HTMLAnchorElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector('a[href="/incidents/new"]');
}

// Vitest isolates each test file (a fresh `remult` module), and `beforeEach` re-installs the stubs, so the
// global transport is overwritten per test rather than captured and restored — matching `form-engine.spec`.
beforeEach(() => {
  localStorage.clear();
  openConnectionSpy.mockClear();
  remult.apiClient.httpClient = httpStub;
  remult.apiClient.subscriptionClient = { openConnection: openConnectionSpy };
});

afterEach(() => {
  localStorage.clear();
});

describe('IncidentListComponent (anonymous)', () => {
  it('prompts for a dev user and never opens a query', async () => {
    const fixture = await createComponent(undefined);
    expect(text(fixture)).toContain('Select a dev user to begin');
    expect(newIncidentLink(fixture)).toBeNull();
    expect(openConnectionSpy).not.toHaveBeenCalled();
  });
});

describe('IncidentListComponent (create gating)', () => {
  it('hides New Incident for a viewer', async () => {
    const fixture = await createComponent(VIEWER);
    expect(newIncidentLink(fixture)).toBeNull();
  });

  it.each([
    ['editor', EDITOR],
    ['officer', STATE_OFFICER],
    ['admin', ADMIN],
  ] as const)('shows New Incident linking to /incidents/new for %s', async (_label, user) => {
    const fixture = await createComponent(user);
    const link = newIncidentLink(fixture);
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('New Incident');
  });
});

describe('IncidentListComponent (responsive content)', () => {
  function forceContent(fixture: ComponentFixture<IncidentListComponent>): void {
    const sample = Object.assign(new FireIncident(), {
      id: 'fire-1',
      name: 'Test Fire',
      districtId: 12,
      fireNumber: 7,
      status: FireStatus.going,
      incidentLevel: IncidentLevel.levelOne,
      isMajor: false,
      statusAsAt: new Date('2026-01-15T03:30:00Z'),
    });
    // White-box: bypass the inert transport and drive the content state directly.
    const ci = fixture.componentInstance as any;
    ci.error.set(null);
    ci.rawIncidents.set([sample]);
    ci.loading.set(false);
    fixture.detectChanges();
  }

  it('renders a table on a wide viewport', async () => {
    const fixture = await createComponent(EDITOR, false);
    forceContent(fixture);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('table')).not.toBeNull();
  });

  it('renders stacked cards instead of a table on handset', async () => {
    const fixture = await createComponent(EDITOR, true);
    forceContent(fixture);
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('table')).toBeNull();
    expect(host.querySelector('mat-card')).not.toBeNull();
    expect(host.textContent).toContain('Test Fire');
  });

  it('has no structural accessibility violations with the named table', async () => {
    const fixture = await createComponent(EDITOR, false);
    forceContent(fixture);
    expect(await findAxeViolations(fixture.nativeElement)).toEqual([]);
  });
});
