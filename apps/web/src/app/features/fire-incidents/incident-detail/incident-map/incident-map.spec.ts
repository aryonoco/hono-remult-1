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
    // jsdom has no matchMedia; ThemeService 'system' detection reads it. Stub a stable (light) response.
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

  it('renders the SVG fallback when tile loading fails', async () => {
    const fixture = await render([{ lat: 1, lng: 2, tone: 'contained', name: 'Y' }]);
    internals(fixture).tilesFailed.set(true);
    await fixture.whenStable();
    expect(host(fixture).querySelector('[data-testid=map-svg-fallback]')).not.toBeNull();
  });

  it('constructs without throwing for a single point', async () => {
    await expect(
      render([{ lat: -37.8, lng: 144.96, tone: 'safe', name: 'Melbourne' }]),
    ).resolves.toBeDefined();
  });

  it('has no structural accessibility violations (empty state)', async () => {
    expect(await findAxeViolations(host(await render([])))).toEqual([]);
  });

  it('has no structural accessibility violations (fallback)', async () => {
    const fixture = await render([{ lat: 1, lng: 2, tone: 'going', name: 'Z' }]);
    internals(fixture).tilesFailed.set(true);
    await fixture.whenStable();
    expect(await findAxeViolations(host(fixture))).toEqual([]);
  });
});
