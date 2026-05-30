import { BreakpointObserver } from '@angular/cdk/layout';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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

  it('renders the toolbar title', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-toolbar')?.textContent).toContain('Fire Incidents');
  });

  it('has no structural accessibility violations (skip-link, nav landmark, main)', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
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

  it('renders the shell without a current user', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('mat-toolbar')).toBeTruthy();
    expect(compiled.textContent).toContain('Not signed in');
  });
});
