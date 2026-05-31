import { LIMITS } from './helpers';

// Total vertices we are willing to persist across all rings. Generous for a
// lobed boundary while bounding the jsonb payload and any client-side rendering
// cost.
const MAX_TOTAL_VERTICES = 256;

// A linear ring must repeat its first position as its last, giving at least
// four positions for a triangle (three distinct corners + the closing repeat).
const MIN_RING_POSITIONS = 4;

const POSITION_LENGTH = 2;

function isPosition(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length === POSITION_LENGTH &&
    typeof value[0] === 'number' &&
    Number.isFinite(value[0]) &&
    typeof value[1] === 'number' &&
    Number.isFinite(value[1])
  );
}

function positionInBounds([lng, lat]: readonly [number, number]): boolean {
  return (
    lng >= LIMITS.longitudeMin &&
    lng <= LIMITS.longitudeMax &&
    lat >= LIMITS.latitudeMin &&
    lat <= LIMITS.latitudeMax
  );
}

function ringIsClosed(ring: readonly [number, number][]): boolean {
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (first === undefined || last === undefined) {
    return false;
  }
  return first[0] === last[0] && first[1] === last[1];
}

// Names the role a ring plays for error messages: index 0 is the outer boundary,
// every later ring is an interior hole (RFC 7946 sec 3.1.6).
function ringLabel(index: number): string {
  return index === 0 ? 'outer ring' : `hole ring ${index}`;
}

// Validate one ring fully, returning an error message or its vertex count. RFC
// 7946 requires EVERY linear ring — outer boundary and interior holes alike — to
// be closed and to carry at least four positions, so these checks run per ring
// rather than only on the outer ring.
function validateRing(ring: unknown, index: number): { error: string } | { vertices: number } {
  if (!Array.isArray(ring)) {
    return { error: `firePerimeterGeo ${ringLabel(index)} must be an array of positions` };
  }
  for (const position of ring) {
    if (!isPosition(position)) {
      return {
        error: `firePerimeterGeo ${ringLabel(index)} has a position that is not a finite [lng, lat] pair`,
      };
    }
    if (!positionInBounds(position)) {
      return {
        error: `firePerimeterGeo ${ringLabel(index)} has a position outside the WGS84 bounds`,
      };
    }
  }
  if (ring.length < MIN_RING_POSITIONS) {
    return {
      error: `firePerimeterGeo ${ringLabel(index)} must have at least ${MIN_RING_POSITIONS} positions`,
    };
  }
  if (!ringIsClosed(ring as [number, number][])) {
    return {
      error: `firePerimeterGeo ${ringLabel(index)} must be closed (first position equals last)`,
    };
  }
  return { vertices: ring.length };
}

function validateRings(rings: readonly unknown[]): true | string {
  let totalVertices = 0;
  for (let r = 0; r < rings.length; r++) {
    const result = validateRing(rings[r], r);
    if ('error' in result) {
      return result.error;
    }
    totalVertices += result.vertices;
  }

  if (totalVertices > MAX_TOTAL_VERTICES) {
    return `firePerimeterGeo must not exceed ${MAX_TOTAL_VERTICES} total vertices`;
  }
  return true;
}

// A fire's mapped extent, stored as a GeoJSON Polygon in WGS84 [lng, lat] order
// (RFC 7946). The outer ring is `coordinates[0]`; any further rings are holes.
// The canonical pin remains FireIncident.latitude/longitude — this is the
// supplementary footprint. Kept isomorphic (no Remult/Node deps) so the same
// validation runs on the Angular client and the Hono server.
export interface FirePerimeter {
  readonly type: 'Polygon';
  readonly coordinates: [number, number][][];
}

// Pure, throw-free isomorphic validator. Returns `true` when `value` is a
// well-formed WGS84 GeoJSON Polygon for a fire perimeter, otherwise a
// human-readable error message describing the first violation found.
export function validateFirePerimeter(value: unknown): true | string {
  if (typeof value !== 'object' || value === null) {
    return 'firePerimeterGeo must be a GeoJSON Polygon object';
  }
  const candidate = value as { type?: unknown; coordinates?: unknown };
  if (candidate.type !== 'Polygon') {
    return "firePerimeterGeo type must be 'Polygon'";
  }
  const rings = candidate.coordinates;
  if (!Array.isArray(rings) || rings.length === 0) {
    return 'firePerimeterGeo coordinates must be a non-empty array of rings';
  }
  return validateRings(rings);
}
