import {
  CAUSE_SOURCE_VALUES,
  type CauseSource,
  CONTROL_AGENCY_VALUES,
  type ControlAgency,
  FIRE_DETECTION_METHOD_VALUES,
  type FireDetectionMethod,
  FUEL_TYPE_VALUES,
  type FuelType,
  type YesNo,
} from '@workspace/shared-domain';
import distributionData from './data/distributions.json';
import type { Rng, Weighted } from './prng';

// Realistic per-district distributions for the optional fields an operator fills
// in. The weight tables live in distributions.json (data, not code); this module
// loads and validates them against the entity enums — an unknown value in the
// data file fails loudly — and exposes typed pickers. Districts fall into four
// fire archetypes, each with its own fuel/cause/detection mix. spinifex and
// buttongrass never occur here, so they are absent from the natural draws; the
// coverage pass adds a token few so every enum value still appears.

type Archetype = 'remoteForest' | 'mixedFoothills' | 'grasslandAg' | 'semiAridMallee';

const ARCHETYPES: readonly Archetype[] = [
  'remoteForest',
  'mixedFoothills',
  'grasslandAg',
  'semiAridMallee',
];

interface RawWeighted {
  readonly value: string;
  readonly weight: number;
}

function toWeighted<T extends string>(
  raw: readonly RawWeighted[],
  allowed: readonly T[],
  label: string,
): Weighted<T>[] {
  const allowedSet = new Set<string>(allowed);
  return raw.map((r) => {
    if (!allowedSet.has(r.value)) {
      throw new Error(`distributions.json: unknown ${label} value "${r.value}"`);
    }
    return { value: r.value as T, weight: r.weight };
  });
}

function byArchetype<T extends string>(
  section: Readonly<Record<string, readonly RawWeighted[]>>,
  allowed: readonly T[],
  label: string,
): Record<Archetype, Weighted<T>[]> {
  const out = {} as Record<Archetype, Weighted<T>[]>;
  for (const archetype of ARCHETYPES) {
    const raw = section[archetype];
    if (raw === undefined) {
      throw new Error(`distributions.json: ${label} missing archetype "${archetype}"`);
    }
    out[archetype] = toWeighted(raw, allowed, label);
  }
  return out;
}

const FUEL = byArchetype(distributionData.fuel, FUEL_TYPE_VALUES, 'fuel');
const CAUSE = byArchetype(distributionData.cause, CAUSE_SOURCE_VALUES, 'cause');
const DETECTION = byArchetype(
  distributionData.detection,
  FIRE_DETECTION_METHOD_VALUES,
  'detection',
);
const CONTROL_AGENCY = toWeighted(
  distributionData.controlAgency,
  CONTROL_AGENCY_VALUES,
  'controlAgency',
);

const ARCHETYPE_BY_DISTRICT: ReadonlyMap<number, Archetype> = new Map(
  Object.entries(distributionData.archetypeByDistrict).map(([code, archetype]) => {
    if (!ARCHETYPES.includes(archetype as Archetype)) {
      throw new Error(`distributions.json: unknown archetype "${archetype}"`);
    }
    return [Number(code), archetype as Archetype];
  }),
);

function archetypeOf(districtCode: number): Archetype {
  return ARCHETYPE_BY_DISTRICT.get(districtCode) ?? 'mixedFoothills';
}

function pickFuel(rng: Rng, archetype: Archetype): FuelType {
  return rng.weighted(FUEL[archetype]);
}

function pickCause(rng: Rng, archetype: Archetype): CauseSource {
  return rng.weighted(CAUSE[archetype]);
}

function pickDetection(rng: Rng, archetype: Archetype): FireDetectionMethod {
  return rng.weighted(DETECTION[archetype]);
}

function pickControlAgency(rng: Rng): ControlAgency {
  return rng.weighted(CONTROL_AGENCY);
}

function pickYesNoSkew(rng: Rng, yesProbability: number): YesNo {
  return rng.bool(yesProbability) ? 'yes' : 'no';
}

interface SizeBucket {
  readonly maxHa: number;
  readonly mildWeight: number;
  readonly severeWeight: number;
}

const SIZE_BUCKETS: readonly SizeBucket[] = distributionData.sizeBuckets;
const MIN_FIRE_HA = 0.01;
const TENTHS = 10;

// Final fire size in hectares from a heavy-tailed distribution anchored to
// FFMVic's benchmark that ~80% of fires are held under 5 ha. `severity` in
// [0, 1] fattens the tail for bad seasons.
function sampleFireSizeHa(rng: Rng, severity: number): number {
  const buckets: Weighted<SizeBucket>[] = SIZE_BUCKETS.map((b) => ({
    value: b,
    weight: b.mildWeight * (1 - severity) + b.severeWeight * severity,
  }));
  const bucket = rng.weighted(buckets);
  const index = SIZE_BUCKETS.indexOf(bucket);
  const prev = index > 0 ? SIZE_BUCKETS[index - 1] : undefined;
  const min = prev ? prev.maxHa : MIN_FIRE_HA;
  // Log-uniform within the bucket so sizes spread naturally across the decade.
  const value = Math.exp(rng.float(Math.log(min), Math.log(bucket.maxHa)));
  return Math.round(value * TENTHS) / TENTHS;
}

export {
  type Archetype,
  archetypeOf,
  pickCause,
  pickControlAgency,
  pickDetection,
  pickFuel,
  pickYesNoSkew,
  sampleFireSizeHa,
};
