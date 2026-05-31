import type { FirePerimeter } from '@workspace/shared-domain';
import { type LatLng, type LngLat, pointInPolygon } from './geo';
import type { Rng } from './prng';

// Deterministically derive a fire's mapped extent from its ignition point and
// reported area. The result is a closed, irregular ("lobed") GeoJSON Polygon in
// WGS84 [lng, lat] order, clipped so every vertex stays inside the fire's own
// district. Pure with respect to the supplied `rng` — no Math.random, no clock
// — so a re-seed reproduces identical geometry. Returns null when there is no
// meaningful footprint to draw (no area, or a sub-hectare spot fire), leaving
// the pin (latitude/longitude) as the sole locator.

const HECTARE_SQUARE_METRES = 10_000;
const METRES_PER_DEGREE_LAT = 111_320;
const DEGREES_HALF_CIRCLE = 180;
const FULL_CIRCLE_RAD: number = Math.PI * 2;
const COORD_PRECISION = 1e5;

// Below this we treat the fire as a point, not an area worth outlining.
const MIN_AREA_HECTARES = 1;

// Vertex count of the generated ring (excluding the closing repeat). Stays well
// inside the domain's 256-vertex cap.
const MIN_LOBES = 12;
const MAX_LOBES = 20;

// Per-vertex radius multiplier: a lobed boundary that never collapses inward
// past 65% nor balloons past 135% of the nominal radius.
const LOBE_MIN_SCALE = 0.65;
const LOBE_SCALE_SPREAD = 0.7;

// Steps used to walk an out-of-district vertex back toward the centroid.
const CLIP_STEPS = 8;

function round5([lng, lat]: readonly [number, number]): [number, number] {
  return [
    Math.round(lng * COORD_PRECISION) / COORD_PRECISION,
    Math.round(lat * COORD_PRECISION) / COORD_PRECISION,
  ];
}

// Radius in metres of the equal-area circle for `areaHa` hectares.
function radiusMetres(areaHa: number): number {
  return Math.sqrt((areaHa * HECTARE_SQUARE_METRES) / Math.PI);
}

// Pull a vertex toward the centroid in fixed fractions until the rounded,
// to-be-stored position falls inside the district polygon. We test the *rounded*
// candidate (not the raw one) so the value we keep is exactly the one verified —
// rounding can otherwise nudge a borderline vertex across a nearby edge. Returns
// the centroid (always interior) when even small steps stay outside.
function clipToward(vertex: LngLat, centre: LatLng, polygon: readonly LngLat[]): [number, number] {
  const [vLng, vLat] = vertex;
  const candidate = round5([vLng, vLat]);
  if (pointInPolygon(candidate[0], candidate[1], polygon)) {
    return candidate;
  }
  for (let step = 1; step <= CLIP_STEPS; step++) {
    const t = step / (CLIP_STEPS + 1);
    const pulled = round5([vLng + (centre.lng - vLng) * t, vLat + (centre.lat - vLat) * t]);
    if (pointInPolygon(pulled[0], pulled[1], polygon)) {
      return pulled;
    }
  }
  return round5([centre.lng, centre.lat]);
}

export function buildFirePerimeter(
  ignition: LatLng,
  fireAreaHectares: number | null,
  districtPolygon: readonly LngLat[],
  rng: Rng,
): FirePerimeter | null {
  if (fireAreaHectares === null || fireAreaHectares < MIN_AREA_HECTARES) {
    return null;
  }

  const r = radiusMetres(fireAreaHectares);
  const dLat = r / METRES_PER_DEGREE_LAT;
  const dLng =
    r / (METRES_PER_DEGREE_LAT * Math.cos((ignition.lat * Math.PI) / DEGREES_HALF_CIRCLE));

  const lobes = rng.int(MIN_LOBES, MAX_LOBES);
  const ring: [number, number][] = [];
  for (let i = 0; i < lobes; i++) {
    const angle = (i / lobes) * FULL_CIRCLE_RAD;
    const scale = LOBE_MIN_SCALE + rng.next() * LOBE_SCALE_SPREAD;
    const rawLng = ignition.lng + Math.cos(angle) * dLng * scale;
    const rawLat = ignition.lat + Math.sin(angle) * dLat * scale;
    // clipToward returns an already-rounded, in-district position.
    ring.push(clipToward([rawLng, rawLat], ignition, districtPolygon));
  }

  const first = ring[0];
  if (first === undefined) {
    return null;
  }
  // Close the ring by repeating the first vertex (GeoJSON linear-ring rule).
  ring.push([first[0], first[1]]);

  return { type: 'Polygon', coordinates: [ring] };
}
