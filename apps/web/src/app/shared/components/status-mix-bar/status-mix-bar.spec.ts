import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FIRE_STATUS_VALUES, type FireStatus, type StatusTone } from '@workspace/shared-domain';
import { findAxeViolations } from '../../../../testing/axe-helper';
import { StatusMixBarComponent } from './status-mix-bar';

function counts(partial: Partial<Record<FireStatus, number>>): Record<FireStatus, number> {
  const base = Object.fromEntries(FIRE_STATUS_VALUES.map((s) => [s, 0])) as Record<
    FireStatus,
    number
  >;
  return { ...base, ...partial };
}

describe('StatusMixBarComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('renders one segment per tone with proportional widths and a legend', async () => {
    const fixture = TestBed.createComponent(StatusMixBarComponent);
    fixture.componentRef.setInput(
      'counts',
      counts({ going: 3, contained: 1, underControlFirst: 1, safe: 1 }),
    );
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const bar = host.querySelector('[role=img]')!;
    const segments = bar.querySelectorAll('span');
    expect(segments.length).toBe(4);

    const goingSegment = segments[0] as HTMLElement;
    expect(goingSegment.style.width).toBe('50%');

    const summary = bar.getAttribute('aria-label') ?? '';
    expect(summary).toContain('3 going');

    const legend = host.querySelectorAll('dt');
    expect(legend.length).toBe(4);
    const legendText = host.querySelector('dl')?.textContent ?? '';
    expect(legendText).toContain('Going');
    expect(legendText).toContain('3');

    expect(await findAxeViolations(host)).toEqual([]);
  });

  it('summarises an empty mix as no active incidents', async () => {
    const fixture = TestBed.createComponent(StatusMixBarComponent);
    fixture.componentRef.setInput('counts', counts({}));
    await fixture.whenStable();

    const bar = (fixture.nativeElement as HTMLElement).querySelector('[role=img]')!;
    expect(bar.getAttribute('aria-label')).toBe('No active incidents');
    expect(bar.querySelectorAll('span').length).toBe(0);
  });

  it('keeps the static dl legend (no links) when segmentLink is absent', async () => {
    const fixture = TestBed.createComponent(StatusMixBarComponent);
    fixture.componentRef.setInput('counts', counts({ going: 2, safe: 1 }));
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('dl')).not.toBeNull();
    expect(host.querySelector('ul')).toBeNull();
    expect(host.querySelectorAll('a').length).toBe(0);
    expect(await findAxeViolations(host)).toEqual([]);
  });

  it('renders a linked legend with per-tone routerLink, queryParams and accessible name', async () => {
    const fixture = TestBed.createComponent(StatusMixBarComponent);
    fixture.componentRef.setInput('counts', counts({ going: 3, safe: 1 }));
    fixture.componentRef.setInput('segmentLink', (tone: StatusTone) => ({
      commands: ['/incidents'],
      queryParams: { tone },
    }));
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('dl')).toBeNull();
    const items = host.querySelectorAll('ul > li');
    expect(items.length).toBe(2);

    const anchors = host.querySelectorAll('a');
    expect(anchors.length).toBe(2);
    const going = anchors[0] as HTMLAnchorElement;
    // RouterLink resolves the commands+queryParams onto the rendered href.
    expect(going.getAttribute('href')).toBe('/incidents?tone=going');
    expect(going.getAttribute('aria-label')).toBe('Going: 3 incidents');
    expect(going.textContent).toContain('Going');
    expect(going.textContent).toContain('3');

    expect(await findAxeViolations(host)).toEqual([]);
  });
});
