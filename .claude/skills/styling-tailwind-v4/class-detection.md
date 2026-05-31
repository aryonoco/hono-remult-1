# Class Detection

Tailwind v4 scans source files as **plain text**. It does not parse or execute code, so it cannot understand string
concatenation or template interpolation. Only complete, static class strings that appear verbatim in a file are
detected and generated; everything else is purged from the production build.

## Static Class Strings Only

**Pattern:** write whole, static class strings — one literal per state. Map a discriminant to complete strings.

The status badge maps each tone to a full literal (`apps/web/src/app/shared/components/status-badge/status-badge.ts`):

```ts
const BADGE_BASE =
  'inline-flex items-center gap-1.5 rounded-md border border-current/25 px-2 py-0.5 text-xs font-semibold leading-5';

const TONE_CLASSES: Readonly<Record<StatusTone, string>> = {
  going: 'text-status-going bg-status-going-bg',
  contained: 'text-status-contained bg-status-contained-bg',
  controlled: 'text-status-controlled bg-status-controlled-bg',
  safe: 'text-status-safe bg-status-safe-bg',
  neutral: 'text-status-neutral bg-status-neutral-bg',
  missing: 'text-status-missing bg-status-missing-bg',
};
```

Every class (`text-status-going`, `bg-status-going-bg`, …) exists as a complete token in the file, so Tailwind keeps
it. The component composes the final string by selecting whole literals, never by building them.

**Avoid:** interpolating or concatenating class names. None of the strings below exist verbatim, so Tailwind generates
nothing and the styles vanish in production.

```ts
// Wrong — the token `text-status-going` is never present as a whole string
const cls = `text-status-${tone} bg-status-${tone}-bg`;

// Wrong — fragments only
const bg = 'bg-status-' + tone + '-bg';
```

## Why `@source` Exists

Automatic content detection scans the app's own sources but **ignores** `node_modules`, `.gitignore`d paths, binary
files, CSS files, and lock files. Use `@source` to point Tailwind at files it would otherwise skip — typically an
external package or a sibling lib.

```css
@source '../../../libs/shared/domain/src';
```

This guards class strings that might live in the framework-free shared lib. The lib currently exports no Tailwind
classes, so the entry is precautionary, not load-bearing.

## Source-Scanning Directives

**`@source inline(...)`** — force-generate classes that may not appear in any source file (the v4 safelist
replacement). Supports variant prefixes and brace ranges.

```css
@source inline('underline');
@source inline('{hover:,focus:,}underline');
@source inline('{hover:,}bg-red-{50,{100..900..100},950}');
```

**`@source not '...'`** — exclude a path from scanning (legacy or non-Tailwind directories). `@source not inline(...)`
excludes specific classes from being generated.

```css
@source not '../legacy';
@source not inline('{hover:,focus:,}bg-red-{50,{100..900..100},950}');
```

## Custom Utilities and Variants

**`@utility`** — define a custom utility that works with variants (`hover:`, `lg:`, …). Prefer this over writing into
`@layer utilities { … }` by hand.

```css
@utility tab-4 {
  tab-size: 4;
}
```

**`@custom-variant`** — define a custom variant. The data-attribute dark strategy fits this repo's `data-theme` switch.

```css
@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));
```

## `@apply` in Angular Component Styles

**Pattern:** to use `@apply` (or `@variant`) inside an Angular component's `styles`, first pull in the theme for
reference with `@reference`. This makes tokens, custom utilities, and variants available **without duplicating any CSS**
in the output. Prefer composing utilities in the template; reach for `@apply` only for genuinely reusable selectors.

```css
@reference 'tailwindcss';

.panel {
  @apply rounded-card border border-outline bg-surface-container p-4;
}
```

**Avoid:** `@apply` sprawl. Most styling is whole utility classes in the template, as the status badge demonstrates.

## Helper Functions

**`--alpha()`** — adjust a colour's opacity.

```css
.tile {
  color: --alpha(var(--color-on-surface) / 70%);
}
```

**`--spacing()`** — generate a spacing value from the theme scale, useful inside `calc()`.

```css
.inset {
  margin: --spacing(4);
  padding-block: calc(--spacing(4) - 1px);
}
```
