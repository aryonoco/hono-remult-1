import type { Rng } from './prng';

// Geometry helpers so every generated fire sits on real land inside its real
// district. Coordinates are WGS84 [lng, lat]; the polygon is a district's
// official outer ring (Landfolio "Land and Fire District" boundary).

const CLUSTER_ATTEMPTS = 24;
const BBOX_ATTEMPTS = 200;
const DEGREES_HALF_CIRCLE = 180;
const COORD_PRECISION = 1e5;

function round5(n: number): number {
  return Math.round(n * COORD_PRECISION) / COORD_PRECISION;
}

export type LngLat = readonly [number, number];

export interface BoundingBox {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

export interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

export interface SampleArea {
  readonly polygon: readonly LngLat[];
  readonly bbox: BoundingBox;
  readonly centres: readonly LatLng[];
  readonly jitterDeg: number;
}

// Standard even-odd ray-casting test. Good enough for our simplified single-ring
// polygons; we sample points rather than test boundary-exact membership.
export function pointInPolygon(lng: number, lat: number, polygon: readonly LngLat[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) {
      continue;
    }
    const [xi, yi] = a;
    const [xj, yj] = b;
    const straddles = yi > lat !== yj > lat;
    if (straddles && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Pick a point inside the polygon, preferring the neighbourhood of a real
// locality so fires read as "near a town/road" rather than scattered at random.
// Falls back to uniform bbox rejection sampling, then to a locality centre, so
// it always returns an in-district point.
export function sampleClusteredPoint(rng: Rng, area: SampleArea): LatLng {
  const { polygon, bbox, centres, jitterDeg } = area;
  if (centres.length > 0) {
    for (let attempt = 0; attempt < CLUSTER_ATTEMPTS; attempt++) {
      const centre = centres[Math.floor(rng.next() * centres.length)];
      if (centre === undefined) {
        continue;
      }
      const lat = centre.lat + rng.gaussian() * jitterDeg;
      // Longitude degrees shrink with latitude; widen jitter to keep clusters round.
      const lng =
        centre.lng + (rng.gaussian() * jitterDeg) / Math.cos((lat * Math.PI) / DEGREES_HALF_CIRCLE);
      if (pointInPolygon(lng, lat, polygon)) {
        return { lat: round5(lat), lng: round5(lng) };
      }
    }
  }
  for (let attempt = 0; attempt < BBOX_ATTEMPTS; attempt++) {
    const lat = rng.float(bbox.minLat, bbox.maxLat);
    const lng = rng.float(bbox.minLng, bbox.maxLng);
    if (pointInPolygon(lng, lat, polygon)) {
      return { lat: round5(lat), lng: round5(lng) };
    }
  }
  const fallback = centres[0];
  if (fallback === undefined) {
    return {
      lat: round5((bbox.minLat + bbox.maxLat) / 2),
      lng: round5((bbox.minLng + bbox.maxLng) / 2),
    };
  }
  return { lat: fallback.lat, lng: fallback.lng };
}
