import type { DistrictGeo } from './districts';
import { namingLocalities } from './districts';
import type { Rng } from './prng';

// Operational fire naming. Victorian public-land fires are named after the
// nearest road/track/locality/landmark to the point of origin, occasionally
// numbered when several start in one area. We recombine each district's real
// localities with generic bush-feature words to mint plausible working names.

const FEATURE_SUFFIX: readonly string[] = [
  'Track',
  'Track',
  'Road',
  'Road',
  'Creek Track',
  'Spur',
  'Ridge Road',
  'Gap Road',
  'Lane',
  'Plains Track',
  'School Road',
  'Mill Road',
];

const GENERIC_FEATURE: readonly string[] = [
  'Boundary',
  'Spring Creek',
  'Sandy',
  'Stony Creek',
  'Rocky',
  'Long Gully',
  'Sawmill',
  'Quarry',
  'Bullock',
  'Reservoir',
  'Junction',
  'Saddle',
];

// Cumulative probability thresholds for the naming patterns, plus the chance a
// fire is numbered and the range of that number.
const SUFFIXED_THRESHOLD = 0.4;
const LOCALITY_THRESHOLD = 0.62;
const COMPOUND_THRESHOLD = 0.82;
const NUMBERED_PROBABILITY = 0.08;
const NUMBER_MIN = 2;
const NUMBER_MAX = 4;

interface NamedLocation {
  readonly locality: { readonly name: string; readonly lat: number; readonly lng: number };
  readonly fireName: string;
}

function pickNamedLocation(rng: Rng, district: DistrictGeo): NamedLocation {
  const localities = namingLocalities(district);
  const locality = rng.pick(localities);
  return { locality, fireName: buildFireName(rng, locality.name, localities) };
}

function buildFireName(
  rng: Rng,
  localityName: string,
  localities: readonly { name: string }[],
): string {
  const roll = rng.next();
  let base: string;
  if (roll < SUFFIXED_THRESHOLD) {
    base = `${localityName} ${rng.pick(FEATURE_SUFFIX)}`;
  } else if (roll < LOCALITY_THRESHOLD) {
    base = localityName;
  } else if (roll < COMPOUND_THRESHOLD) {
    const other = rng.pick(localities).name;
    base =
      other === localityName
        ? `${localityName} ${rng.pick(FEATURE_SUFFIX)}`
        : `${localityName}–${other} Road`;
  } else {
    base = `${rng.pick(GENERIC_FEATURE)} ${rng.pick(FEATURE_SUFFIX)}`;
  }
  // Occasionally number the fire, as happens when several start in one area.
  if (rng.bool(NUMBERED_PROBABILITY)) {
    base = `${base} ${rng.int(NUMBER_MIN, NUMBER_MAX)}`;
  }
  return base;
}

export { type NamedLocation, pickNamedLocation };
