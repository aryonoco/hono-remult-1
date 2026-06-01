import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { findAxeViolations } from '../../../../testing/axe-helper';
import { KpiTileComponent } from './kpi-tile';

// The value span gains role="status" only when `live` is set; the spine rail is the aria-hidden element.
function liveRegion(host: HTMLElement): HTMLElement | null {
  return host.querySelector('[role=status]');
}
function spine(host: HTMLElement): HTMLElement | null {
  return host.querySelector('[aria-hidden="true"]');
}

describe('KpiTileComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('renders a live value with the toned spine inside a static container', async () => {
    const fixture = TestBed.createComponent(KpiTileComponent);
    fixture.componentRef.setInput('label', 'Overdue');
    fixture.componentRef.setInput('value', 1);
    fixture.componentRef.setInput('tone', 'going');
    fixture.componentRef.setInput('emphasis', true);
    fixture.componentRef.setInput('live', true);
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const liveEl = liveRegion(host);
    expect(liveEl).not.toBeNull();
    expect(liveEl?.textContent?.trim()).toContain('1');

    expect(spine(host)?.classList.contains('bg-status-going')).toBe(true);

    expect(host.querySelector('a')).toBeNull();
    expect(host.querySelector('div')).not.toBeNull();

    expect(await findAxeViolations(host)).toEqual([]);
  });

  it('renders an anchor with the accent spine when a link is supplied', async () => {
    const fixture = TestBed.createComponent(KpiTileComponent);
    fixture.componentRef.setInput('label', 'Active');
    fixture.componentRef.setInput('value', 12);
    fixture.componentRef.setInput('link', '/incidents');
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const anchor = host.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(host.querySelector('div')).toBeNull();

    expect(spine(host)?.classList.contains('bg-primary')).toBe(true);
    expect(liveRegion(host)).toBeNull();

    // DASH-4: the link tile carries a hover affordance and a strong, token-driven focus ring.
    expect(anchor?.classList.contains('hover:bg-surface-container-high')).toBe(true);
    expect(anchor?.classList.contains('transition-colors')).toBe(true);
    expect(anchor?.classList.contains('focus-visible:outline-primary')).toBe(true);
    expect(anchor?.classList.contains('focus-visible:outline-offset-2')).toBe(true);
  });

  it('carries the supplied query params on the link tile href', async () => {
    const fixture = TestBed.createComponent(KpiTileComponent);
    fixture.componentRef.setInput('label', 'Overdue');
    fixture.componentRef.setInput('value', 3);
    fixture.componentRef.setInput('link', '/incidents');
    fixture.componentRef.setInput('queryParams', { group: 'overdue', fy: 2026 });
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const anchor = host.querySelector('a');
    expect(anchor).not.toBeNull();
    // RouterLink resolves the bound queryParams into the rendered href, so a deep-linkable tile carries
    // the full filter query string an operator can follow straight into the list.
    const href = anchor?.getAttribute('href') ?? '';
    expect(href).toContain('/incidents');
    expect(href).toContain('group=overdue');
    expect(href).toContain('fy=2026');
  });
});
