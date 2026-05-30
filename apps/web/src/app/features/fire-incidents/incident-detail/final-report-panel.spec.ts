import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FinalReport } from '@workspace/shared-domain';
import { findAxeViolations } from '../../../../testing/axe-helper';
import { FinalReportPanelComponent } from './final-report-panel';

function reportRow(): FinalReport {
  return Object.assign(new FinalReport(), {
    id: 'fr-1',
    fireIncidentId: 'fire-1',
    isSignedOff: false,
    stockLost: 5,
    homesLost: 2,
  });
}

interface PanelFlags {
  canSign?: boolean;
  canRemoveSign?: boolean;
  canEditFinal?: boolean;
}

function render(flags: PanelFlags = {}): ComponentFixture<FinalReportPanelComponent> {
  const fixture = TestBed.createComponent(FinalReportPanelComponent);
  fixture.componentRef.setInput('report', reportRow());
  fixture.componentRef.setInput('fireId', 'fire-1');
  fixture.componentRef.setInput('canSign', flags.canSign ?? false);
  fixture.componentRef.setInput('canRemoveSign', flags.canRemoveSign ?? false);
  fixture.componentRef.setInput('canEditFinal', flags.canEditFinal ?? false);
  fixture.detectChanges();
  return fixture;
}

function host(fixture: ComponentFixture<FinalReportPanelComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

describe('FinalReportPanelComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
      ],
    });
  });

  it('renders the final-report panel with its loss figures', () => {
    const el = host(render());
    expect(el.querySelector('[data-testid="final-report-panel"]')).not.toBeNull();
    expect(el.textContent).toContain('Stock lost');
    expect(el.textContent).toContain('Final report');
  });

  it('emits signOff when the sign-off button is clicked', () => {
    const fixture = render({ canSign: true });
    let emitted = false;
    fixture.componentInstance.signOff.subscribe(() => {
      emitted = true;
    });
    host(fixture).querySelector<HTMLButtonElement>('[data-testid="action-signoff"]')?.click();
    expect(emitted).toBe(true);
  });

  it('emits removeSignOff when the remove-sign-off button is clicked', () => {
    const fixture = render({ canRemoveSign: true });
    let emitted = false;
    fixture.componentInstance.removeSignOff.subscribe(() => {
      emitted = true;
    });
    host(fixture)
      .querySelector<HTMLButtonElement>('[data-testid="action-remove-signoff"]')
      ?.click();
    expect(emitted).toBe(true);
  });

  it('links the edit button to the final-report edit route', () => {
    const edit = host(render({ canEditFinal: true })).querySelector(
      '[data-testid="action-edit-final"]',
    );
    expect(edit?.getAttribute('href')).toBe('/incidents/fire-1/final/edit');
  });

  it('hides every action when no permission is granted', () => {
    const el = host(render());
    expect(el.querySelector('[data-testid="action-signoff"]')).toBeNull();
    expect(el.querySelector('[data-testid="action-remove-signoff"]')).toBeNull();
    expect(el.querySelector('[data-testid="action-edit-final"]')).toBeNull();
  });

  it('has no structural accessibility violations', async () => {
    expect(await findAxeViolations(host(render({ canSign: true, canEditFinal: true })))).toEqual(
      [],
    );
  });
});
