import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FinalReport, operatorName } from '@workspace/shared-domain';
import { findAxeViolations } from '../../../../testing/axe-helper';
import { FinalReportPanelComponent } from './final-report-panel';

const SIGN_OFF_OPERATOR = 'op-53-1';

function reportRow(): FinalReport {
  return Object.assign(new FinalReport(), {
    id: 'fr-1',
    fireIncidentId: 'fire-1',
    isSignedOff: false,
    stockLost: 5,
    homesLost: 2,
  });
}

function signedReportRow(): FinalReport {
  return Object.assign(new FinalReport(), {
    id: 'fr-1',
    fireIncidentId: 'fire-1',
    isSignedOff: true,
    signedOffBy: SIGN_OFF_OPERATOR,
    signedOffAt: new Date('2026-02-01T03:30:00Z'),
  });
}

interface PanelFlags {
  canSign?: boolean;
  canRemoveSign?: boolean;
  canEditFinal?: boolean;
}

async function render(
  flags: PanelFlags = {},
  report: FinalReport = reportRow(),
): Promise<ComponentFixture<FinalReportPanelComponent>> {
  const fixture = TestBed.createComponent(FinalReportPanelComponent);
  fixture.componentRef.setInput('report', report);
  fixture.componentRef.setInput('fireId', 'fire-1');
  fixture.componentRef.setInput('canSign', flags.canSign ?? false);
  fixture.componentRef.setInput('canRemoveSign', flags.canRemoveSign ?? false);
  fixture.componentRef.setInput('canEditFinal', flags.canEditFinal ?? false);
  await fixture.whenStable();
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

  it('renders the final-report panel with its loss figures', async () => {
    const el = host(await render());
    expect(el.querySelector('[data-testid="final-report-panel"]')).not.toBeNull();
    expect(el.textContent).toContain('Stock lost');
    expect(el.textContent).toContain('Final report');
  });

  it('emits signOff when the sign-off button is clicked', async () => {
    const fixture = await render({ canSign: true });
    let emitted = false;
    fixture.componentInstance.signOff.subscribe(() => {
      emitted = true;
    });
    host(fixture).querySelector<HTMLButtonElement>('[data-testid="action-signoff"]')?.click();
    expect(emitted).toBe(true);
  });

  it('emits removeSignOff when the remove-sign-off button is clicked', async () => {
    const fixture = await render({ canRemoveSign: true });
    let emitted = false;
    fixture.componentInstance.removeSignOff.subscribe(() => {
      emitted = true;
    });
    host(fixture)
      .querySelector<HTMLButtonElement>('[data-testid="action-remove-signoff"]')
      ?.click();
    expect(emitted).toBe(true);
  });

  it('links the edit button to the final-report edit route', async () => {
    const edit = host(await render({ canEditFinal: true })).querySelector(
      '[data-testid="action-edit-final"]',
    );
    expect(edit?.getAttribute('href')).toBe('/incidents/fire-1/final/edit');
  });

  it('resolves the signed-off operator id to a display name', async () => {
    const el = host(await render({}, signedReportRow()));
    const resolved = operatorName(SIGN_OFF_OPERATOR);
    expect(resolved).not.toBe(SIGN_OFF_OPERATOR);
    expect(el.textContent).toContain(`Signed off by ${resolved}`);
    expect(el.textContent).not.toContain(SIGN_OFF_OPERATOR);
  });

  it('hides every action when no permission is granted', async () => {
    const el = host(await render());
    expect(el.querySelector('[data-testid="action-signoff"]')).toBeNull();
    expect(el.querySelector('[data-testid="action-remove-signoff"]')).toBeNull();
    expect(el.querySelector('[data-testid="action-edit-final"]')).toBeNull();
  });

  it('has no structural accessibility violations', async () => {
    expect(
      await findAxeViolations(host(await render({ canSign: true, canEditFinal: true }))),
    ).toEqual([]);
  });
});
