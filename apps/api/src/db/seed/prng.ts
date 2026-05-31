// Deterministic pseudo-random number generator for the fixtures.
//
// The whole point of the seed is reproducibility: a rebuilt devcontainer, or a
// `just db-reset`, must produce identical data. So nothing here may touch
// `Math.random()` or the wall clock — every draw comes from `mulberry32`,
// seeded with a fixed integer and consumed in a fixed order. Given the same
// seed and call sequence, the stream is identical on every engine.

const UINT32 = 0x1_00_00_00_00;
const MULBERRY_INCREMENT = 0x6d_2b_79_f5;

// mulberry32 — a fast, well-distributed 32-bit PRNG. Its mixing is built from
// integer bitwise operations (the JS-safe way to implement it), so the
// noBitwiseOperators rule is suppressed for these lines only.
function mulberry32(seed: number): () => number {
  // biome-ignore lint/suspicious/noBitwiseOperators: 32-bit PRNG state coercion
  let a = seed >>> 0;
  return (): number => {
    // biome-ignore lint/suspicious/noBitwiseOperators: mulberry32 mixing
    a = (a + MULBERRY_INCREMENT) >>> 0;
    let t = a;
    // biome-ignore lint/suspicious/noBitwiseOperators: mulberry32 mixing
    t = Math.imul(t ^ (t >>> 15), t | 1);
    // biome-ignore lint/suspicious/noBitwiseOperators: mulberry32 mixing
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    // biome-ignore lint/suspicious/noBitwiseOperators: mulberry32 mixing
    return ((t ^ (t >>> 14)) >>> 0) / UINT32;
  };
}

const HEX_RADIX = 16;
const UUID_SEG_TIME_LOW = 8;
const UUID_SEG_TIME_MID = 4;
const UUID_SEG_TIME_HIGH_REST = 3; // after the version digit
const UUID_SEG_CLOCK_REST = 3; // after the variant digit
const UUID_SEG_NODE = 12;
const UUID_VERSION = '4';
const UUID_VARIANT_DIGITS = ['8', '9', 'a', 'b'] as const;

export interface Weighted<T> {
  readonly value: T;
  readonly weight: number;
}

export class Rng {
  private readonly nextFloat: () => number;

  constructor(seed: number) {
    this.nextFloat = mulberry32(seed);
  }

  /** Uniform float in [0, 1). */
  next(): number {
    return this.nextFloat();
  }

  /** Uniform float in [min, max). */
  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Uniform integer in [min, max] (both inclusive). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with probability p (default 0.5). */
  bool(p = 0.5): boolean {
    return this.next() < p;
  }

  /** Uniformly pick one element; throws on an empty array (a generator bug). */
  pick<T>(items: readonly T[]): T {
    const item = items[Math.floor(this.next() * items.length)];
    if (item === undefined) {
      throw new Error('Rng.pick called on an empty array');
    }
    return item;
  }

  /** Pick one element weighted by `weight`; weights need not sum to 1. */
  weighted<T>(choices: readonly Weighted<T>[]): T {
    const total = choices.reduce((sum, c) => sum + c.weight, 0);
    if (total <= 0) {
      throw new Error('Rng.weighted called with non-positive total weight');
    }
    let roll = this.next() * total;
    for (const choice of choices) {
      roll -= choice.weight;
      if (roll < 0) {
        return choice.value;
      }
    }
    // Floating-point slack can leave roll >= 0 on the last item; fall back to it.
    const last = choices[choices.length - 1];
    if (last === undefined) {
      throw new Error('Rng.weighted called with an empty array');
    }
    return last.value;
  }

  /** A Fisher-Yates shuffle returning a new array (does not mutate the input). */
  shuffle<T>(items: readonly T[]): T[] {
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const a = out[i];
      const b = out[j];
      if (a !== undefined && b !== undefined) {
        out[i] = b;
        out[j] = a;
      }
    }
    return out;
  }

  /** Standard-normal sample via the Box-Muller transform. */
  gaussian(): number {
    // Guard the log against 0 by sampling u in (0, 1].
    const u = 1 - this.next();
    const v = this.next();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  /**
   * A deterministic RFC-4122 version-4 UUID drawn from this stream. Entity ids
   * are plain varchars, so any unique string works; UUIDs simply make the
   * seeded rows look like real records in the admin panel. Built from hex
   * segments (no bitwise ops) with the version and variant digits fixed.
   */
  uuid(): string {
    const seg = (length: number): string => {
      let s = '';
      for (let i = 0; i < length; i++) {
        s += Math.floor(this.next() * HEX_RADIX).toString(HEX_RADIX);
      }
      return s;
    };
    const variant = this.pick(UUID_VARIANT_DIGITS);
    return `${seg(UUID_SEG_TIME_LOW)}-${seg(UUID_SEG_TIME_MID)}-${UUID_VERSION}${seg(UUID_SEG_TIME_HIGH_REST)}-${variant}${seg(UUID_SEG_CLOCK_REST)}-${seg(UUID_SEG_NODE)}`;
  }
}
