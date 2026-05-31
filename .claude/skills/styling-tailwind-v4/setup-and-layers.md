# Setup and Layers

## Entry Point

`apps/web/src/tailwind.css` is the single Tailwind entry. It begins with the v4 CSS-first import — there is no
`tailwind.config.js`, no `@tailwind base/components/utilities`, and no `content: []` array.

**Pattern:** the import plus the precautionary `@source`.

```css
@import 'tailwindcss';

/* Tailwind scans component sources automatically; this keeps any class strings that live in the
   framework-free shared lib (re-exported to the web app) from being purged in production builds. */
@source '../../../libs/shared/domain/src';
```

**Why `@source` here:** automatic content detection ignores `node_modules`, `.gitignore`d paths, and CSS files. It
does scan the app's own sources, so `@source` is only needed to reach files Tailwind would otherwise skip. The shared
domain lib currently exports no Tailwind classes, so this entry is precautionary, not load-bearing — keep it as a guard
in case class strings move there.

## PostCSS Plugin

`apps/web/.postcssrc.json` registers the PostCSS plugin **only**. This is the correct integration for the Angular build
pipeline (`@angular/build:application`) — do **not** reach for the Vite plugin here.

```json
{
  "plugins": {
    "@tailwindcss/postcss": {}
  }
}
```

## Build Wiring

Tailwind is loaded as a stylesheet, not `@import`-ed from Sass (it cannot be). `apps/web/project.json` lists it in the
`styles` array **after** `styles.scss`, so the layer order declared in `styles.scss` is established first.

```jsonc
"styles": ["apps/web/src/styles.scss", "apps/web/src/tailwind.css"]
```

## Cascade Layers

`apps/web/src/styles.scss` declares the layer order. Later layers win regardless of selector specificity, so Tailwind
utilities can override our themed Material chrome without `!important`.

```scss
@use '@angular/material' as mat;

@layer base, material, tailwind, utilities;
```

- **base** — element resets, the `:focus-visible` ring, `:root` raw custom properties
- **material** — Material M3 theme-token output (`mat.theme(...)`) and component-token overrides
- **tailwind** — Tailwind's own base/preflight
- **utilities** — Tailwind utilities; declared last, so it wins by layer order

Tailwind emits its generated utilities into the `utilities` layer. Because that layer is declared last, a utility like
`bg-surface` beats a same-specificity rule in the `material` layer. (Material *component* CSS is a separate, unlayered
case — see material-interop.md.)

## `@theme` — Static Tokens Only

`@theme` declares design tokens whose values are static literals. These generate utilities and CSS variables at build
time. Use `@theme` for fonts, container widths, radii, and the `--color-status-*` `light-dark()` pairs.

```css
@theme {
  --font-sans: 'Public Sans', ui-sans-serif, system-ui, sans-serif;
  --font-display: 'Libre Franklin', 'Public Sans', ui-sans-serif, sans-serif;
  --font-mono: 'IBM Plex Mono', ui-monospace, 'SFMono-Regular', 'Menlo', monospace;

  /* Fire-status tones — each a light/dark pair via light-dark(). Static literals. */
  --color-status-going: light-dark(#991b1b, #fca5a5);
  --color-status-going-bg: light-dark(#fee2e2, #450a0a);

  --container-form: 60rem;
  --container-detail: 76rem;
  --container-wide: 104rem;

  --radius-card: 0.5rem;
  --radius-field: 0.375rem;
}
```

**Breakpoints stay in plain `@theme`** — never inline. An inlined breakpoint would be resolved at the wrong scope and
break media-query generation.

## `@theme inline` — Live-Variable Bridges

**Pattern:** tokens that reference a runtime CSS variable (the `--mat-sys-*` to `--color-*` bridges) belong in an
`@theme inline` block. Inlining makes the generated utility reference the **live variable**, so it follows the single
`color-scheme` signal that `ThemeService` flips for light/dark/system.

```css
@theme inline {
  --color-surface: var(--mat-sys-surface);
  --color-surface-container: var(--mat-sys-surface-container);
  --color-on-surface: var(--mat-sys-on-surface);
  --color-outline: var(--mat-sys-outline);
  --color-primary: var(--mat-sys-primary);
  --color-on-primary: var(--mat-sys-on-primary);
  --color-error: var(--mat-sys-error);
  --color-muted: var(--mat-sys-on-surface-variant);
}
```

**Avoid:** putting a `var(--mat-sys-*)` bridge under plain `@theme`. Without `inline`, the utility resolves the
reference where the theme variable is *defined* rather than where it is *used*, so the value can fall back unexpectedly
(the documented `--font-sans: var(--font-inter)` trap). The bridge tokens must be `@theme inline`.

## Raw Custom Properties

Values consumed by `[style]` bindings or component CSS — not meant to generate utilities — are plain custom properties
declared on `:root` inside `@layer base` in `styles.scss`, not in `@theme`.

```scss
@layer base {
  :root {
    --app-grid-border: 1px solid var(--mat-sys-outline-variant);
    --app-focus-ring: 0 0 0 2px var(--mat-sys-surface), 0 0 0 4px var(--mat-sys-primary);
    --app-radius-card: 0.5rem;
    --app-space-section: 1.5rem;
  }
}
```
