import { BreakpointObserver } from '@angular/cdk/layout';
import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatToolbarHarness } from '@angular/material/toolbar/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { findAxeViolations } from '../testing/axe-helper';
import { App } from './app';
import { DevAuthService } from './core/dev-auth.service';

const breakpointStub = { observe: () => of({ matches: false, breakpoints: {} }) };

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

  it('has no structural accessibility violations (skip-link, nav landmark, main)', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
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
