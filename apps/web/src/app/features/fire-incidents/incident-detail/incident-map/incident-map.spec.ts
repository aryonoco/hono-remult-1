import { ANIMATION_MODULE_TYPE, type WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { findAxeViolations } from '../../../../../testing/axe-helper';
import type { MapPoint } from '../../../../shared/ui/tone-classes';
import { IncidentMapComponent } from './incident-map';

// The map's tile-failure and point-presence state are protected (template-only) members; the spec reaches
// them through a typed view so it can force the SVG fallback without bracket-notation key access.
interface MapInternals {
  tilesFailed: WritableSignal<boolean>;
  hasPoints: () => boolean;
}

function internals(fixture: ComponentFixture<IncidentMapComponent>): MapInternals {
  return fixture.componentInstance as unknown as MapInternals;
}

function host(fixture: ComponentFixture<IncidentMapComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

async function render(
  points: readonly MapPoint[],
  locationDescription = '',
): Promise<ComponentFixture<IncidentMapComponent>> {
  const fixture = TestBed.createComponent(IncidentMapComponent);
  fixture.componentRef.setInput('points', points);
  fixture.componentRef.setInput('locationDescription', locationDescription);
  await fixture.whenStable();
  return fixture;
}

describe('IncidentMapComponent', () => {
  beforeEach(() => {
    // jsdom has no matchMedia; ThemeService 'system' detection and the reduced-motion check read it. Stub
    // a stable (light, no-reduced-motion) response.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    TestBed.configureTestingModule({
      providers: [{ provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' }],
    });
  });

  it('renders the empty state when there are no points', async () => {
    const el = host(await render([], 'Near the ridge'));
    expect(el.querySelector('[data-testid=map-empty]')).not.toBeNull();
    expect(el.querySelector('[role=region]')).toBeNull();
    expect(el.textContent).toContain('Near the ridge');
  });

  it('treats 0,0 as a valid coordinate and renders the region without throwing', async () => {
    const fixture = await render([{ lat: 0, lng: 0, tone: 'going', name: 'X' }]);
    const el = host(fixture);
    expect(internals(fixture).hasPoints()).toBe(true);
    const region = el.querySelector('[role=region]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute('aria-label')).toContain('X');
    expect(el.querySelector('[data-testid=map-empty]')).toBeNull();
  });

  it('renders a legend keying only the tones present, in severity order', async () => {
    const el = host(
      await render([
        { lat: 1, lng: 2, tone: 'safe', name: 'A', status: 'Safe' },
        { lat: 3, lng: 4, tone: 'going', name: 'B', status: 'Going' },
      ]),
    );
    const legend = el.querySelector('[data-testid=map-legend]');
    expect(legend).not.toBeNull();
    const labels = [
      ...(legend?.querySelectorAll('.incident-map__legend-item span:last-child') ?? []),
    ].map((n) => n.textContent?.trim());
    // 'going' sorts ahead of 'safe'; 'controlled' is absent so it is not keyed.
    expect(labels).toEqual(['Going', 'Safe']);
    // The shape key explains filled-area vs pin (FIRE-AREA-4 / MAP-1).
    expect(legend?.textContent).toContain('Filled area = fire extent');
    expect(legend?.textContent).toContain('Pin = point only');
  });

  it('exposes a colour-independent label (name, status, area) in the region aria-label', async () => {
    const region = host(
      await render([
        {
          lat: -37.8,
          lng: 144.96,
          tone: 'going',
          name: 'Ridge Fire',
          status: 'Going',
          areaHa: 50_000,
        },
      ]),
    ).querySelector('[role=region]');
    const label = region?.getAttribute('aria-label') ?? '';
    expect(label).toContain('Ridge Fire');
    expect(label).toContain('Going');
    expect(label).toContain('50,000 ha');
  });

  it('renders an area-sized extent ring in the SVG fallback only when area is present', async () => {
    const fixture = await render([
      { lat: -37.8, lng: 144.96, tone: 'going', name: 'Big', status: 'Going', areaHa: 50_000 },
    ]);
    internals(fixture).tilesFailed.set(true);
    await fixture.whenStable();
    const svg = host(fixture).querySelector('[data-testid=map-svg-fallback]');
    expect(svg?.querySelector('.map-area')).not.toBeNull();
    expect(svg?.querySelector('.map-dot')).not.toBeNull();
  });

  it('omits the extent ring (pin only) when a fire has no area', async () => {
    const fixture = await render([
      { lat: -37.8, lng: 144.96, tone: 'safe', name: 'Spot', status: 'Safe', areaHa: 0 },
    ]);
    internals(fixture).tilesFailed.set(true);
    await fixture.whenStable();
    const svg = host(fixture).querySelector('[data-testid=map-svg-fallback]');
    expect(svg?.querySelector('.map-area')).toBeNull();
    expect(svg?.querySelector('.map-dot')).not.toBeNull();
  });

  it('lists each fire with name, status, area and coordinates in the SVG fallback', async () => {
    const fixture = await render([
      {
        lat: -37.812,
        lng: 144.963,
        tone: 'going',
        name: 'Ridge Fire',
        status: 'Going',
        areaHa: 50_000,
      },
    ]);
    internals(fixture).tilesFailed.set(true);
    await fixture.whenStable();
    const list = host(fixture).querySelector('[data-testid=map-fallback-list]');
    expect(list).not.toBeNull();
    const text = list?.textContent ?? '';
    expect(text).toContain('Ridge Fire');
    expect(text).toContain('Going');
    expect(text).toContain('50,000 ha');
    expect(text).toContain('-37.812');
    expect(text).toContain('144.963');
  });

  it('constructs without throwing for a single area-sized point', async () => {
    await expect(
      render([
        { lat: -37.8, lng: 144.96, tone: 'safe', name: 'Melbourne', status: 'Safe', areaHa: 12.5 },
      ]),
    ).resolves.toBeDefined();
  });

  it('has no structural accessibility violations (empty state)', async () => {
    expect(await findAxeViolations(host(await render([])))).toEqual([]);
  });

  it('has no structural accessibility violations (fallback)', async () => {
    const fixture = await render([
      { lat: 1, lng: 2, tone: 'going', name: 'Z', status: 'Going', areaHa: 100 },
    ]);
    internals(fixture).tilesFailed.set(true);
    await fixture.whenStable();
    expect(await findAxeViolations(host(fixture))).toEqual([]);
  });
});
