import { ANIMATION_MODULE_TYPE, type WritableSignal } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { FirePerimeter } from '@workspace/shared-domain';
import { findAxeViolations } from '../../../../../testing/axe-helper';
import type { MapPoint } from '../../../../shared/ui/tone-classes';
import { IncidentMapComponent } from './incident-map';
import { markerClassName, markerHtml, pulseTargets } from './marker-symbology';

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
      providers: [
        { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
        provideRouter([]),
      ],
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

  it('states incident level and Major in the colour-independent label so they are never colour-only', async () => {
    const region = host(
      await render([
        {
          lat: -37.8,
          lng: 144.96,
          tone: 'going',
          name: 'Ridge Fire',
          status: 'Going',
          level: 3,
          major: true,
          areaHa: 4200,
        },
      ]),
    ).querySelector('[role=region]');
    const label = region?.getAttribute('aria-label') ?? '';
    expect(label).toContain('Level 3');
    expect(label).toContain('Major');
  });

  it('renders each marker as a named link and navigates on Enter (not Space)', async () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const el = host(
      await render([
        { id: 'fire-42', lat: 0, lng: 0, tone: 'going', name: 'Ridge', status: 'Going' },
      ]),
    );
    const markerEl = el.querySelector('.fire-marker');
    expect(markerEl).not.toBeNull();
    expect(markerEl?.getAttribute('role')).toBe('link');
    // Accessible name comes from aria-label (a divIcon is a <div>, so Leaflet's alt option does nothing).
    expect(markerEl?.getAttribute('aria-label')).toContain('Ridge');
    // Space must NOT activate a link (link semantics — Space scrolls); Enter does.
    markerEl?.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(navSpy).not.toHaveBeenCalled();
    markerEl?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(navSpy).toHaveBeenCalledWith(['/incidents', 'fire-42']);
  });

  it('does not link the marker when linkable is false (the detail page)', async () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(IncidentMapComponent);
    fixture.componentRef.setInput('points', [
      { id: 'fire-1', lat: 0, lng: 0, tone: 'going', name: 'X', status: 'Going' },
    ]);
    fixture.componentRef.setInput('linkable', false);
    await fixture.whenStable();
    const markerEl = host(fixture).querySelector('.fire-marker');
    expect(markerEl?.getAttribute('role')).not.toBe('link');
    markerEl?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('pulses only the loud markers on the live map — going/major, not calm ones', async () => {
    const el = host(
      await render([
        { id: 'a', lat: 0, lng: 0, tone: 'going', name: 'G', status: 'Going' },
        { id: 'b', lat: 1, lng: 1, tone: 'contained', name: 'C', status: 'Contained' },
      ]),
    );
    expect(el.querySelector('.fire-marker--going')?.classList.contains('fire-marker--pulse')).toBe(
      true,
    );
    expect(
      el.querySelector('.fire-marker--contained')?.classList.contains('fire-marker--pulse'),
    ).toBe(false);
  });

  it('lists incident level and Major in the SVG fallback list text', async () => {
    const fixture = await renderFallback([
      {
        lat: -37.8,
        lng: 144.96,
        tone: 'going',
        name: 'Ridge Fire',
        status: 'Going',
        level: 2,
        major: true,
      },
    ]);
    const text = host(fixture).querySelector('[data-testid=map-fallback-list]')?.textContent ?? '';
    expect(text).toContain('Level 2');
    expect(text).toContain('Major');
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

describe('planted marker symbology', () => {
  it('builds the whole marker class string: base + tone + graduated level, plus major and pulse', () => {
    expect(
      markerClassName({ lat: 0, lng: 0, tone: 'going', name: 'A', level: 3, major: true }, true),
    ).toBe(
      'fire-marker fire-marker--going fire-marker--lvl3 fire-marker--major fire-marker--pulse',
    );
  });

  it('defaults to the level-1 chip size and omits major/pulse when absent', () => {
    expect(markerClassName({ lat: 0, lng: 0, tone: 'safe', name: 'B' }, false)).toBe(
      'fire-marker fire-marker--safe fire-marker--lvl1',
    );
  });

  it('renders a single cohesive SVG pin: a glyph nested in a tone-filled shape', () => {
    const html = markerHtml({ lat: 0, lng: 0, tone: 'going', name: 'A' }, true);
    expect(html).toContain('<svg class="fire-marker__pin"');
    expect(html).toContain('fire-marker__pin-shape');
    expect(html).toContain('<svg class="fire-marker__pin-glyph"');
    expect(html).toContain('viewBox="0 -960 960 960"');
    // The pin is one element — no detached chip/stem/ground from the earlier design.
    expect(html).not.toContain('fire-marker__stem');
    expect(html).not.toContain('fire-marker__ground');
  });

  it('places the pin tip at the bottom of its viewBox so the bottom anchor is exact at every level', () => {
    // The box is bottom-anchored on the coordinate (MARKER_BOX_ANCHOR = box bottom), so the pin's tip must
    // reach the viewBox bottom edge (y = 42 of "0 0 34 42") at the centre x (17) for the tip to land on it.
    const html = markerHtml({ lat: 0, lng: 0, tone: 'going', name: 'A' }, false);
    expect(html).toContain('viewBox="0 0 34 42"');
    expect(html).toContain('L17 42');
  });

  it('includes the beacon-pulse ring only for the loud set', () => {
    expect(markerHtml({ lat: 0, lng: 0, tone: 'going', name: 'A' }, true)).toContain(
      'fire-marker__pulse',
    );
    expect(markerHtml({ lat: 0, lng: 0, tone: 'safe', name: 'B' }, false)).not.toContain(
      'fire-marker__pulse',
    );
  });

  it('reserves the pulse for going OR major fires and never for calm ones', () => {
    expect(pulseTargets([{ lat: 1, lng: 1, tone: 'contained', name: 'C' }]).size).toBe(0);
    expect(pulseTargets([{ lat: 1, lng: 1, tone: 'going', name: 'G' }]).size).toBe(1);
    expect(pulseTargets([{ lat: 1, lng: 1, tone: 'safe', name: 'M', major: true }]).size).toBe(1);
  });

  it('caps the animated loud set so the overview never pulses hundreds of markers', () => {
    const going = Array.from({ length: 20 }, (_, i) => ({
      lat: 0,
      lng: i,
      tone: 'going' as const,
      name: `G${i}`,
    }));
    expect(pulseTargets(going).size).toBe(16);
  });

  it('ranks Major fires ahead of merely-going ones when the cap bites', () => {
    const going = Array.from({ length: 16 }, (_, i) => ({
      lat: 0,
      lng: i,
      tone: 'going' as const,
      name: `G${i}`,
      level: 1,
    }));
    const major = { lat: 9, lng: 9, tone: 'safe' as const, name: 'Major', major: true };
    const targets = pulseTargets([...going, major]);
    expect(targets.size).toBe(16);
    // The Major fire displaces a going one at the cap boundary.
    expect(targets.has(major)).toBe(true);
  });
});
