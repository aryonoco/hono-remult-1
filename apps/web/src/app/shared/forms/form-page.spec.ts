import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { FormGroup } from '@angular/forms';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { findAxeViolations } from '../../../testing/axe-helper';
import type { BuiltForm } from './form-engine.types';
import { FormPageComponent, type FormPageState } from './form-page';

const emptyBuilt: BuiltForm = { form: new FormGroup({}), groups: [] };

function render(
  state: FormPageState,
  overrides: { submitting?: boolean } = {},
): ComponentFixture<FormPageComponent> {
  const fixture = TestBed.createComponent(FormPageComponent);
  fixture.componentRef.setInput('title', 'New incident');
  fixture.componentRef.setInput('state', state);
  fixture.componentRef.setInput('built', emptyBuilt);
  fixture.componentRef.setInput('submitLabel', 'Save incident');
  fixture.componentRef.setInput('notFoundMessage', 'Incident not found.');
  if (overrides.submitting !== undefined) {
    fixture.componentRef.setInput('submitting', overrides.submitting);
  }
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<FormPageComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('FormPageComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
        provideNativeDateAdapter(),
        { provide: MAT_DATE_LOCALE, useValue: 'en-AU' },
      ],
    });
  });

  it('renders the title in an h1 heading', () => {
    expect(host(render('anonymous')).querySelector('h1')?.textContent).toContain('New incident');
  });

  it('prompts for a dev user in the anonymous state', () => {
    expect(host(render('anonymous')).textContent).toContain('Select a dev user');
  });

  it('shows the not-found message in the notFound state', () => {
    expect(host(render('notFound')).textContent).toContain('Incident not found.');
  });

  it('renders a progress bar while loading', () => {
    expect(host(render('loading')).querySelector('mat-progress-bar')).not.toBeNull();
  });

  it('renders the dynamic form and a labelled save button when ready', () => {
    const save = host(render('ready')).querySelector('[data-testid="form-save"]');
    expect(save?.textContent).toContain('Save incident');
  });

  it('emits save and cancel from the action bar', () => {
    const fixture = render('ready');
    let saved = false;
    let cancelled = false;
    fixture.componentInstance.save.subscribe(() => {
      saved = true;
    });
    fixture.componentInstance.cancel.subscribe(() => {
      cancelled = true;
    });
    host(fixture).querySelector<HTMLButtonElement>('[data-testid="form-save"]')?.click();
    host(fixture).querySelector<HTMLButtonElement>('[data-testid="form-cancel"]')?.click();
    expect(saved).toBe(true);
    expect(cancelled).toBe(true);
  });

  it('disables save while submitting', () => {
    const save = host(render('ready', { submitting: true })).querySelector<HTMLButtonElement>(
      '[data-testid="form-save"]',
    );
    expect(save?.disabled).toBe(true);
  });

  it('has no structural accessibility violations when ready', async () => {
    expect(await findAxeViolations(host(render('ready')))).toEqual([]);
  });
});
