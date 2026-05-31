import districtData from './data/districts.json';
import { type BoundingBox, type LatLng, type LngLat, sampleClusteredPoint } from './geo';
import type { Rng } from './prng';

// The 16 DEECA fire districts the showcase recognises, joined to their official
// boundary geometry. Loaded from the committed reference JSON and lightly
// validated so a malformed data file fails loudly at startup rather than
// silently skewing the fixtures.

interface DistrictGeo {
  readonly code: number;
  readonly name: string;
  readonly regionId: number;
  readonly regionName: string;
  readonly bbox: BoundingBox;
  readonly polygon: readonly LngLat[];
  readonly localities: readonly (LatLng & { readonly name: string })[];
}

const EXPECTED_DISTRICT_COUNT = 16;
const MIN_POLYGON_VERTICES = 3;
const CLUSTER_JITTER_DEG = 0.06;

// Major urban centres that appear as district "localities" but make poor
// public-land fire neighbourhoods/names — fires cluster and are named around
// the bush and rural towns, not the CBD.
const NAMING_EXCLUDE = new Set(['Melbourne', 'Geelong', 'Frankston', 'Werribee']);

function loadDistricts(): readonly DistrictGeo[] {
  const districts = districtData.districts.map(
    (d): DistrictGeo => ({
      code: d.code,
      name: d.name,
      regionId: d.regionId,
      regionName: d.regionName,
      bbox: d.bbox,
      polygon: d.polygon.map((p): LngLat => {
        const lng = p[0];
        const lat = p[1];
        if (lng === undefined || lat === undefined) {
          throw new Error(`District ${d.name} has a malformed polygon vertex`);
        }
        return [lng, lat];
      }),
      localities: d.localities.map((l) => ({ name: l.name, lat: l.lat, lng: l.lng })),
    }),
  );
  if (districts.length !== EXPECTED_DISTRICT_COUNT) {
    throw new Error(`Expected ${EXPECTED_DISTRICT_COUNT} districts, got ${districts.length}`);
  }
  const codes = new Set(districts.map((d) => d.code));
  if (codes.size !== districts.length) {
    throw new Error('District reference data contains duplicate codes');
  }
  for (const d of districts) {
    if (d.polygon.length < MIN_POLYGON_VERTICES) {
      throw new Error(`District ${d.name} has a degenerate polygon`);
    }
  }
  return districts;
}

const ALL_DISTRICTS: readonly DistrictGeo[] = loadDistricts();
const BY_CODE: ReadonlyMap<number, DistrictGeo> = new Map(ALL_DISTRICTS.map((d) => [d.code, d]));

function districtByCode(code: number): DistrictGeo {
  const d = BY_CODE.get(code);
  if (d === undefined) {
    throw new Error(`Unknown district code ${code}`);
  }
  return d;
}

/** Localities suitable for clustering/naming fires (rural/bush towns, not the CBD). */
function namingLocalities(district: DistrictGeo): readonly (LatLng & { name: string })[] {
  const usable = district.localities.filter((l) => !NAMING_EXCLUDE.has(l.name));
  return usable.length > 0 ? usable : district.localities;
}

/** A point inside the district, clustered near a real bush/rural locality. */
function sampleDistrictPoint(rng: Rng, district: DistrictGeo): LatLng {
  return sampleClusteredPoint(rng, {
    polygon: district.polygon,
    bbox: district.bbox,
    centres: namingLocalities(district),
    jitterDeg: CLUSTER_JITTER_DEG,
  });
}

export { ALL_DISTRICTS, type DistrictGeo, districtByCode, namingLocalities, sampleDistrictPoint };
