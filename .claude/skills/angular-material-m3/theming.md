# Material v21 Theming

The whole app is themed by one `mat.theme()` call in `apps/web/src/styles.scss`. It generates the M3
system tokens (`--mat-sys-*`); everything downstream — app CSS, component styles, `[style]` bindings —
reads those tokens. Material lives in its own cascade layer so Tailwind utilities can win without
`!important`.

## The single theme call

**Pattern:** one `mat.theme()` with `color`, `typography` and `density`, then per-component
`*-overrides()`. Verbatim from `apps/web/src/styles.scss`:

```scss
@use '@angular/material' as mat;

@layer base, material, tailwind, utilities;

@layer material {
  html {
    color-scheme: light dark; // follow the OS by default; ThemeService flips data-theme to override
    @include mat.theme(
      (
        color: (
          primary: mat.$blue-palette,
          tertiary: mat.$orange-palette,
        ),
        typography: (
          plain-family: 'Public Sans',
          brand-family: 'Libre Franklin',
          bold-weight: 700,
          medium-weight: 600,
          regular-weight: 400,
        ),
        density: -1,
      )
    );

    // Console chrome: a slightly raised, tinted app bar that reads as a fixed header band.
    @include mat.toolbar-overrides(
      (
        container-background-color: var(--mat-sys-surface-container),
        container-text-color: var(--mat-sys-on-surface),
      )
    );

    // Flat, outlined cards instead of floating drop-shadows — the "panel" feel of an ops console.
    @include mat.card-overrides(
      (
        elevated-container-color: var(--mat-sys-surface),
      )
    );
  }
}
```

**Avoid:** `mat.core()` (a deprecated no-op slated for removal — never call it), `mat.define-theme` / `define-colors` /
`define-typography` / `define-density`, `mat.all-component-themes` / `all-component-colors`, and any
`mat.m2-*` API. None of these belong in a v21 M3 setup.

## Colour map

**Pattern:** name the M3 roles you actually use; supply M3 palettes from `mat.$*-palette`. This repo
uses two roles — `primary` (blue) and `tertiary` (orange):

```scss
color: (
  primary: mat.$blue-palette,
  tertiary: mat.$orange-palette,
),
```

**Avoid:** hard-coded hex inside the colour map, or expecting `secondary` to be configurable — M3
derives `secondary` from `primary`. Only `primary` and `tertiary` (and `theme-type`) are accepted
keys in the colour sub-map.

## Typography map

**Pattern:** set the two type families plus the three weights. `plain-family` drives body/UI text;
`brand-family` drives Material component headings:

```scss
typography: (
  plain-family: 'Public Sans',
  brand-family: 'Libre Franklin',
  bold-weight: 700,
  medium-weight: 600,
  regular-weight: 400,
),
```

The matching web fonts are loaded in `apps/web/src/index.html`. App-level headings reference the
display face through a custom property (`--font-display`), declared in Tailwind's `@theme` block in
`apps/web/src/tailwind.css` and consumed by the `h1`–`h4` rule in the `base` layer of `styles.scss`.

## Density

**Pattern:** a single integer; `0` is default, negatives are tighter. The repo runs `-1` for a
compact ops-console feel:

```scss
density: -1,
```

## System tokens in app CSS

**Pattern:** read `--mat-sys-*` everywhere — backgrounds, text, borders, focus rings. From the `base`
layer of `styles.scss`:

```scss
body {
  background: var(--mat-sys-surface);
  color: var(--mat-sys-on-surface);
}

:root {
  --app-grid-border: 1px solid var(--mat-sys-outline-variant);
  --app-focus-ring: 0 0 0 2px var(--mat-sys-surface), 0 0 0 4px var(--mat-sys-primary);
}
```

**Avoid:** literal hex or named CSS colours in component styles. A token automatically tracks the
active light/dark scheme; a hex does not.

## Token customisation

**Pattern:** two layers of override, both validating their token names at compile time.

`mat.theme-overrides(( ... ))` for system-level tokens:

```scss
@include mat.theme-overrides(
  (
    primary: var(--mat-sys-tertiary),
    corner-large: 12px,
  )
);
```

`mat.<component>-overrides(( ... ))` for one component's tokens (the repo uses `toolbar` and `card`):

```scss
@include mat.card-overrides(
  (
    elevated-container-color: var(--mat-sys-surface),
  )
);
```

**Avoid:** writing selectors that target Material's internal classes (`.mat-mdc-card`, `.mdc-button`,
etc.) to restyle a component. Those class names are private and change between releases — use the
component's `*-overrides()` mixin instead.

## Cascade layers

**Pattern:** declare layer order once so Material sits below Tailwind:

```scss
@layer base, material, tailwind, utilities;
```

Later layers win regardless of specificity, so Tailwind utilities and the `utilities` layer can
adjust Material output without `!important`.
