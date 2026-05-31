import { describe, expect, it } from 'vitest';

// AA contrast guard for the Rosé Pine design tokens. These values MUST mirror the
// `light-dark(Dawn, Moon)` pairs in apps/web/src/styles.scss (mat.theme-overrides)
// and apps/web/src/tailwind.css (--color-status-*). If a token changes, update it
// here too — this spec fails the build if any pair drops below WCAG 2.2 AA.

type Pair = readonly [dawn: string, moon: string];
const THEMES = [
  { name: 'Dawn (light)', i: 0 },
  { name: 'Moon (dark)', i: 1 },
] as const;

const SURFACE: Pair = ['hsl(32 57% 95%)', 'hsl(246 24% 17%)'];

// [token, foreground pair, background pair] — text must clear 4.5:1.
const TEXT_PAIRS: ReadonlyArray<readonly [string, Pair, Pair]> = [
  ['on-surface', ['hsl(248 19% 40%)', 'hsl(245 50% 91%)'], SURFACE],
  ['on-surface-variant', ['hsl(248 12% 48%)', 'hsl(248 15% 61%)'], SURFACE],
  ['on-primary', ['hsl(0 0% 100%)', 'hsl(246 24% 17%)'], ['hsl(268 21% 52%)', 'hsl(267 57% 78%)']],
  [
    'on-secondary',
    ['hsl(0 0% 100%)', 'hsl(246 24% 17%)'],
    ['hsl(189 30% 40%)', 'hsl(189 43% 73%)'],
  ],
  ['on-tertiary', ['hsl(0 0% 100%)', 'hsl(246 24% 17%)'], ['hsl(3 53% 53%)', 'hsl(2 66% 75%)']],
  ['on-error', ['hsl(0 0% 100%)', 'hsl(246 24% 17%)'], ['hsl(343 35% 52%)', 'hsl(343 76% 68%)']],
];

// [tone, fg pair, bg pair] — badge fg↔bg must clear 4.5:1; fg↔surface (spine) must clear 3:1.
const STATUS_PAIRS: ReadonlyArray<readonly [string, Pair, Pair]> = [
  ['going', ['hsl(343 35% 46%)', 'hsl(343 76% 71%)'], ['hsl(13 42% 91%)', 'hsl(343 30% 23%)']],
  ['contained', ['hsl(35 81% 32%)', 'hsl(35 88% 72%)'], ['hsl(35 70% 91%)', 'hsl(338 8% 26%)']],
  ['controlled', ['hsl(189 30% 36%)', 'hsl(189 43% 73%)'], ['hsl(90 8% 90%)', 'hsl(224 19% 27%)']],
  ['safe', ['hsl(197 53% 34%)', 'hsl(197 48% 57%)'], ['hsl(100 5% 88%)', 'hsl(218 31% 23%)']],
  ['neutral', ['hsl(248 12% 44%)', 'hsl(248 15% 67%)'], ['hsl(20 18% 90%)', 'hsl(248 18% 25%)']],
  ['missing', ['hsl(268 21% 46%)', 'hsl(267 57% 78%)'], ['hsl(0 18% 91%)', 'hsl(254 20% 28%)']],
];

// [tone, fg pair] — the detail-hero banner (incident-detail.ts `.detail-hero--<tone>`) paints the
// status FOREGROUND token as its background and renders text in `--mat-sys-surface`. That text-on-tone
// pairing must clear the AA text threshold (4.5:1) in both themes, not merely the 3:1 spine threshold.
const HERO_TEXT_PAIRS: ReadonlyArray<readonly [string, Pair]> = [
  ['going', ['hsl(343 35% 46%)', 'hsl(343 76% 71%)']],
  ['contained', ['hsl(35 81% 32%)', 'hsl(35 88% 72%)']],
  ['controlled', ['hsl(189 30% 36%)', 'hsl(189 43% 73%)']],
  ['safe', ['hsl(197 53% 34%)', 'hsl(197 48% 57%)']],
  ['neutral', ['hsl(248 12% 44%)', 'hsl(248 15% 67%)']],
  ['missing', ['hsl(268 21% 46%)', 'hsl(267 57% 78%)']],
];

const OUTLINE: Pair = ['hsl(248 12% 52%)', 'hsl(249 12% 47%)'];
const AA_TEXT = 4.5;
const AA_NON_TEXT = 3;

type Triple = [number, number, number];

const HSL_PATTERN = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)/;

function parseHsl(value: string): Triple {
  const m = HSL_PATTERN.exec(value);
  if (!m) throw new Error(`invalid hsl() value: ${value}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function hslToRgb([h, s, l]: Triple): Triple {
  const sn = s / 100;
  const ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - c / 2;
  const base: Triple =
    h < 60
      ? [c, x, 0]
      : h < 120
        ? [x, c, 0]
        : h < 180
          ? [0, c, x]
          : h < 240
            ? [0, x, c]
            : h < 300
              ? [x, 0, c]
              : [c, 0, x];
  const [r, g, b] = base;
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

function relativeLuminance([r, g, b]: Triple): number {
  const channel = (v: number): number => {
    const cc = v / 255;
    return cc <= 0.03928 ? cc / 12.92 : ((cc + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hslToRgb(parseHsl(a)));
  const lb = relativeLuminance(hslToRgb(parseHsl(b)));
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

describe('Rosé Pine token contrast (WCAG 2.2 AA)', () => {
  for (const theme of THEMES) {
    for (const [token, fg, bg] of TEXT_PAIRS) {
      it(`${token} clears AA text contrast — ${theme.name}`, () => {
        expect(contrastRatio(fg[theme.i], bg[theme.i])).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }

    it(`outline clears non-text contrast vs surface — ${theme.name}`, () => {
      expect(contrastRatio(OUTLINE[theme.i], SURFACE[theme.i])).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });

    for (const [tone, fg, bg] of STATUS_PAIRS) {
      it(`status-${tone} fg on bg clears AA text contrast — ${theme.name}`, () => {
        expect(contrastRatio(fg[theme.i], bg[theme.i])).toBeGreaterThanOrEqual(AA_TEXT);
      });
      it(`status-${tone} fg (spine/pin) clears non-text contrast vs surface — ${theme.name}`, () => {
        expect(contrastRatio(fg[theme.i], SURFACE[theme.i])).toBeGreaterThanOrEqual(AA_NON_TEXT);
      });
    }

    for (const [tone, fg] of HERO_TEXT_PAIRS) {
      it(`hero surface text on status-${tone} banner clears AA text contrast — ${theme.name}`, () => {
        expect(contrastRatio(SURFACE[theme.i], fg[theme.i])).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }
});
