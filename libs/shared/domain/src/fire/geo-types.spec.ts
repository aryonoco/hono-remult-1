import { describe, expect, it } from 'vitest';

import type { FirePerimeter } from './geo-types';
import { validateFirePerimeter } from './geo-types';

// A small closed square near Melbourne, in WGS84 [lng, lat] order.
const validSquare: FirePerimeter = {
  type: 'Polygon',
  coordinates: [
    [
      [145.0, -37.8],
      [145.1, -37.8],
      [145.1, -37.7],
      [145.0, -37.7],
      [145.0, -37.8],
    ],
  ],
};

describe('validateFirePerimeter', () => {
  it('accepts a closed WGS84 polygon ring', () => {
    expect(validateFirePerimeter(validSquare)).toBe(true);
  });

  it('accepts a polygon with an interior hole ring', () => {
    const withHole: FirePerimeter = {
      type: 'Polygon',
      coordinates: [
        validSquare.coordinates[0]!,
        [
          [145.02, -37.78],
          [145.04, -37.78],
          [145.04, -37.76],
          [145.02, -37.78],
        ],
      ],
    };
    expect(validateFirePerimeter(withHole)).toBe(true);
  });

  it('rejects an unclosed interior hole ring', () => {
    const open = {
      type: 'Polygon',
      coordinates: [
        validSquare.coordinates[0]!,
        [
          [145.02, -37.78],
          [145.04, -37.78],
          [145.04, -37.76],
          [145.02, -37.76],
        ],
      ],
    };
    const result = validateFirePerimeter(open);
    expect(result).toContain('hole ring 1');
    expect(result).toContain('closed');
  });

  it('rejects an interior hole ring with fewer than four positions', () => {
    const tooShort = {
      type: 'Polygon',
      coordinates: [
        validSquare.coordinates[0]!,
        [
          [145.02, -37.78],
          [145.04, -37.78],
          [145.02, -37.78],
        ],
      ],
    };
    const result = validateFirePerimeter(tooShort);
    expect(result).toContain('hole ring 1');
    expect(result).toContain('at least 4 positions');
  });

  it.each([
    [null],
    [undefined],
    ['Polygon'],
    [42],
  ])('rejects %s as not an object', (value: unknown) => {
    expect(validateFirePerimeter(value)).toContain('GeoJSON Polygon object');
  });

  it('rejects a non-Polygon type', () => {
    expect(validateFirePerimeter({ type: 'Point', coordinates: [] })).toContain("'Polygon'");
  });

  it('rejects empty coordinates', () => {
    expect(validateFirePerimeter({ type: 'Polygon', coordinates: [] })).toContain('non-empty');
  });

  it('rejects a ring that is not an array', () => {
    expect(validateFirePerimeter({ type: 'Polygon', coordinates: ['nope'] })).toContain(
      'array of positions',
    );
  });

  it('rejects an outer ring with fewer than four positions', () => {
    const tooShort = {
      type: 'Polygon',
      coordinates: [
        [
          [145.0, -37.8],
          [145.1, -37.8],
          [145.0, -37.8],
        ],
      ],
    };
    expect(validateFirePerimeter(tooShort)).toContain('at least 4 positions');
  });

  it('rejects an unclosed outer ring', () => {
    const open = {
      type: 'Polygon',
      coordinates: [
        [
          [145.0, -37.8],
          [145.1, -37.8],
          [145.1, -37.7],
          [145.0, -37.7],
        ],
      ],
    };
    expect(validateFirePerimeter(open)).toContain('closed');
  });

  it('rejects a position that is not a finite [lng, lat] pair', () => {
    const bad = {
      type: 'Polygon',
      coordinates: [
        [
          [145.0, -37.8],
          [Number.NaN, -37.8],
          [145.1, -37.7],
          [145.0, -37.7],
          [145.0, -37.8],
        ],
      ],
    };
    expect(validateFirePerimeter(bad)).toContain('finite [lng, lat] pair');
  });

  it('rejects a longitude outside WGS84 bounds', () => {
    const bad = {
      type: 'Polygon',
      coordinates: [
        [
          [200.0, -37.8],
          [145.1, -37.8],
          [145.1, -37.7],
          [145.0, -37.7],
          [200.0, -37.8],
        ],
      ],
    };
    expect(validateFirePerimeter(bad)).toContain('WGS84 bounds');
  });

  it('rejects a latitude outside WGS84 bounds', () => {
    const bad = {
      type: 'Polygon',
      coordinates: [
        [
          [145.0, -91.0],
          [145.1, -37.8],
          [145.1, -37.7],
          [145.0, -37.7],
          [145.0, -91.0],
        ],
      ],
    };
    expect(validateFirePerimeter(bad)).toContain('WGS84 bounds');
  });

  it('rejects more than 256 total vertices', () => {
    const ring: [number, number][] = [];
    for (let i = 0; i < 260; i++) {
      ring.push([145.0 + i * 0.0001, -37.8]);
    }
    ring.push([145.0, -37.8]);
    expect(validateFirePerimeter({ type: 'Polygon', coordinates: [ring] })).toContain(
      '256 total vertices',
    );
  });
});
