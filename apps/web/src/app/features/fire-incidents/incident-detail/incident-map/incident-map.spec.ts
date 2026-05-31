import { ANIMATION_MODULE_TYPE, type WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import type { FirePerimeter } from '@workspace/shared-domain';
import { findAxeViolations } from '../../../../../testing/axe-helper';
import type { MapPoint } from '../../../../shared/ui/tone-classes';
import { IncidentMapComponent } from './incident-map';

// Splits an SVG polygon `points` attribute into its vertex tokens (whitespace-separated "x,y" pairs).
const POINTS_SEPARATOR = /\s+/;

// A small closed GeoJSON Polygon (WGS84 [lng, lat]) centred near the given point, for the polygon path.
function square(lng: number, lat: number): FirePerimeter {
  const d = 0.05;
  return {
    type: 'Polygon',
    coordinates: [
      [
        [lng - d, lat - d],
        [lng + d, lat - d],
        [lng + d, lat + d],
        [lng - d, lat + d],
        [lng - d, lat - d],
      ],
    ],
  };
}

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

// Render directly into the tiles-failed SVG fallback: force the flag BEFORE the first stable pass so
// `initMap` finds no canvas and never mounts a real Leaflet map (jsdom cannot project an L.geoJSON
// polygon — `_clipPoints` reads undefined pixel bounds — so a mounted polygon throws). The fallback DOM
// (legend, SVG, fallback list) renders identically in both tile states, so assertions on it are valid.
async function renderFallback(
  points: readonly MapPoint[],
): Promise<ComponentFixture<IncidentMapComponent>> {
  const fixture = TestBed.createComponent(IncidentMapComponent);
  fixture.componentRef.setInput('points', points);
  internals(fixture).tilesFailed.set(true);
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

  it('renders the empty state as a status panel when there are no points', async () => {
    const el = host(await render([], 'Near the ridge'));
    const empty = el.querySelector('[data-testid=map-empty]');
    expect(empty).not.toBeNull();
    // DETAIL-4: the empty state is a polished, announced status panel with copy.
    expect(empty?.getAttribute('role')).toBe('status');
    expect(empty?.textContent).toContain('No coordinates recorded');
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
    // Both fires here are bare points, so the 3-way key shows only the pin row (FIRE-AREA-6).
    const shapes = legend?.querySelector('[data-testid=map-legend-shapes]')?.textContent ?? '';
    expect(shapes).toBe('Pin = point only');
  });

  it('keys all three extent shapes when polygon, circle and pin fires are present', async () => {
    const el = host(
      await renderFallback([
        { lat: 1, lng: 2, tone: 'going', name: 'Mapped', status: 'Going', perimeter: square(2, 1) },
        { lat: 3, lng: 4, tone: 'safe', name: 'Estimate', status: 'Safe', areaHa: 100 },
        { lat: 5, lng: 6, tone: 'neutral', name: 'Point', status: 'Resolved', areaHa: 0 },
      ]),
    );
    const shapes = el.querySelector('[data-testid=map-legend-shapes]')?.textContent?.trim() ?? '';
    // Fidelity order: polygon → circle → pin.
    expect(shapes).toBe('Filled shape = mapped extent · Circle = area estimate · Pin = point only');
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

  it('constructs without throwing for a fire with a mapped perimeter polygon', async () => {
    // The real Leaflet map cannot project an L.geoJSON polygon under jsdom (no layout), so the construction
    // is exercised via the SVG fallback; the live-map polygon path is covered by the browser verification.
    await expect(
      renderFallback([
        {
          lat: -37.5,
          lng: 148.0,
          tone: 'going',
          name: 'Ensay Spur',
          status: 'Going',
          areaHa: 4200,
          perimeter: square(148.0, -37.5),
        },
      ]),
    ).resolves.toBeDefined();
  });

  it('draws the true extent polygon (not the area circle) in the SVG fallback when a perimeter exists', async () => {
    const fixture = await renderFallback([
      {
        lat: -37.5,
        lng: 148.0,
        tone: 'going',
        name: 'Ensay Spur',
        status: 'Going',
        areaHa: 4200,
        perimeter: square(148.0, -37.5),
      },
    ]);
    const svg = host(fixture).querySelector('[data-testid=map-svg-fallback]');
    // The polygon takes precedence over the area-estimate circle (FIRE-AREA-5).
    expect(svg?.querySelector('.map-extent')).not.toBeNull();
    expect(svg?.querySelector('.map-area')).toBeNull();
    expect(svg?.querySelector('.map-dot')).not.toBeNull();
    // The projected outline carries every vertex of the outer ring.
    const points = svg?.querySelector('.map-extent')?.getAttribute('points') ?? '';
    expect(points.trim().split(POINTS_SEPARATOR).length).toBe(5);
  });

  it('labels each extent kind in the region aria-label so geometry is conveyed in text', async () => {
    const region = host(
      await renderFallback([
        {
          lat: -37.5,
          lng: 148.0,
          tone: 'going',
          name: 'Ensay Spur',
          status: 'Going',
          areaHa: 4200,
          perimeter: square(148.0, -37.5),
        },
      ]),
    ).querySelector('[role=region]');
    expect(region?.getAttribute('aria-label')).toContain('mapped extent');
  });

  it('distinguishes polygon, circle and pin fires in the SVG fallback list text', async () => {
    const fixture = await renderFallback([
      {
        lat: -37.5,
        lng: 148.0,
        tone: 'going',
        name: 'Mapped',
        status: 'Going',
        perimeter: square(148.0, -37.5),
      },
      { lat: -37.4, lng: 147.9, tone: 'safe', name: 'Estimate', status: 'Safe', areaHa: 100 },
      { lat: -37.3, lng: 147.8, tone: 'neutral', name: 'Point', status: 'Resolved', areaHa: 0 },
    ]);
    const items = [
      ...(host(fixture).querySelectorAll('[data-testid=map-fallback-list] li') ?? []),
    ].map((n) => n.textContent ?? '');
    expect(items[0]).toContain('mapped extent');
    expect(items[1]).toContain('area estimate');
    expect(items[2]).toContain('point only');
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

  it('has no structural accessibility violations (polygon fallback)', async () => {
    const fixture = await renderFallback([
      {
        lat: -37.5,
        lng: 148.0,
        tone: 'going',
        name: 'Ensay Spur',
        status: 'Going',
        areaHa: 4200,
        perimeter: square(148.0, -37.5),
      },
    ]);
    expect(await findAxeViolations(host(fixture))).toEqual([]);
  });
});
