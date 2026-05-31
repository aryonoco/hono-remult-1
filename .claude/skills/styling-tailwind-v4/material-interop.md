# Material Interop

Angular Material v21 (M3) emits a system of `--mat-sys-*` design tokens from `mat.theme(...)`. The repo bridges those
tokens to Tailwind `--color-*` tokens so one theme drives both Material components and Tailwind-styled chrome, and so
light/dark/system all follow a single `color-scheme` signal.

## The Token Bridge

**Pattern:** define each Tailwind colour token as a reference to its Material counterpart, in an `@theme inline` block
in `tailwind.css`. Inlining is mandatory — see setup-and-layers.md — so the generated utility tracks the live variable.

**Avoid:** placing these `var(--mat-sys-*)` bridges under a plain `@theme` block. A plain block resolves the reference
where the token is *defined*, not where it is *used*, so a `bg-surface` utility can silently fall back instead of
following the live theme. The block below must be `@theme inline`, separate from the plain `@theme` that holds the
static tokens.

```css
@theme inline {
  --color-surface: var(--mat-sys-surface);
  --color-surface-container: var(--mat-sys-surface-container);
  --color-surface-container-high: var(--mat-sys-surface-container-high);
  --color-on-surface: var(--mat-sys-on-surface);
  --color-outline: var(--mat-sys-outline);
  --color-outline-variant: var(--mat-sys-outline-variant);
  --color-primary: var(--mat-sys-primary);
  --color-on-primary: var(--mat-sys-on-primary);
  --color-error: var(--mat-sys-error);
  --color-on-error: var(--mat-sys-on-error);
  --color-muted: var(--mat-sys-on-surface-variant);
}
```

These generate `bg-surface`, `text-on-surface`, `border-outline`, `text-muted`, etc. — utilities that stay in lock-step
with the Material theme without hard-coded greys.

## The Single Theme Signal

The theme is configured once in `styles.scss` inside `@layer material`, and `color-scheme` is the only light/dark
switch. `ThemeService` flips `data-theme` on `<html>` to override the OS default.

```scss
@layer material {
  html {
    color-scheme: light dark; // follow the OS by default; ThemeService flips data-theme to override
    @include mat.theme((
      color: (
        primary: mat.$blue-palette,
        tertiary: mat.$orange-palette,
      ),
      typography: (
        plain-family: 'Public Sans',
        brand-family: 'Libre Franklin',
      ),
      density: -1,
    ));
  }

  html[data-theme='light'] { color-scheme: light; }
  html[data-theme='dark'] { color-scheme: dark; }
}
```

Because the bridge tokens are `@theme inline`, a `bg-surface` element re-themes automatically when `color-scheme`
flips — the `--mat-sys-surface` value behind it changes, and the inlined utility points straight at it. The
`--color-status-*` tones (plain `@theme`) achieve the same with `light-dark()` literals, since Material has no
fire-status concept.

## Re-theming a Component

**Pattern:** restyle Material components through their token-override mixins in `@layer material`, fed by `--mat-sys-*`
values. This keeps a single source of truth and avoids specificity battles.

```scss
@layer material {
  html {
    @include mat.toolbar-overrides((
      container-background-color: var(--mat-sys-surface-container),
      container-text-color: var(--mat-sys-on-surface),
    ));

    @include mat.card-overrides((
      elevated-container-color: var(--mat-sys-surface),
    ));
  }
}
```

## The Honest Override Rule

**Layer order beats Material theme-token output (the `material` layer), not Material component CSS.** Material ships its
component styles **unlayered**. Unlayered CSS always wins against layered CSS, so a Tailwind utility in the `utilities`
layer does **not** universally beat a Material component's own rules purely by layer order.

**Pattern:** when you need a component to look different, theme it through the `--mat-sys-*` / `--color-*` token bridge
or the component override mixins above.

**Avoid:** escalating specificity, `::ng-deep`, or `!important` to fight a Material component's internal styles. If a
utility does not take, the component is styling that element with unlayered CSS — reach for the token bridge instead.

Utilities reliably win for **layout and spacing around** components (margins, grid, flex, gaps), which is the bulk of
day-to-day styling.

## The `!important` Policy

There is exactly one sanctioned `!important` in the app: the `prefers-reduced-motion` guard that disables the router's
View Transitions animations. It lives in `@layer utilities` in `styles.scss`.

```scss
@layer utilities {
  @media (prefers-reduced-motion: reduce) {
    ::view-transition-group(*),
    ::view-transition-old(*),
    ::view-transition-new(*) {
      animation: none !important;
    }
  }
}
```

**Avoid:** any other use of `!important`. It is reserved for this accessibility guard, where it overrides
user-agent-level view-transition pseudo-element animations that cannot be reached otherwise.
