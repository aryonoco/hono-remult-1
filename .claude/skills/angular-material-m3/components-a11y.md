# Components and Accessibility

Material v21 ships unified button directives and a set of SCSS helpers for system colour classes,
the typographic scale, and accessible focus. Icons are Material Symbols, registered as the default
icon font. Colour always comes from the theme — Material components ignore `[color]` under M3.

## Buttons

**Pattern:** one directive, `matButton`, takes a variant string; icon-only buttons use
`matIconButton`. The accepted variants are `"text" | "filled" | "elevated" | "outlined" | "tonal"`;
omitting the value defaults to `text`.

```html
<button matButton="filled" (click)="save()">Save</button>
<button matButton="tonal" (click)="cancel()">Cancel</button>
<button matButton="outlined" routerLink="/incidents">Back</button>
<button matButton>Dismiss</button>

<button matIconButton [attr.aria-label]="label()" (click)="theme.cycle()">
  <mat-icon>{{ icon() }}</mat-icon>
</button>
```

A live icon button lives in `apps/web/src/app/shared/components/theme-toggle/theme-toggle.ts`, which
imports `MatButtonModule` and `MatIconModule` and always supplies an `aria-label`. That file still
uses the legacy `mat-icon-button` selector (the unified `MatIconButton` directive matches both); new
code should prefer `matIconButton` as shown above.

**Avoid:** the legacy directive family — `mat-button`, `mat-raised-button`, `mat-flat-button`,
`mat-stroked-button`, `mat-icon-button`. Use `matButton` / `matIconButton` instead.

## Colour comes from the theme, not `[color]`

**Pattern:** to change a button's colour, override its component tokens or rely on the theme:

```scss
@include mat.button-overrides(
  (
    filled-container-color: var(--mat-sys-tertiary),
    filled-label-text-color: var(--mat-sys-on-tertiary),
  )
);
```

**Avoid:** `<button matButton="filled" color="primary">`. The `[color]` input has no effect under M3
— it is silently ignored.

## System colour classes

**Pattern:** `mat.system-classes()` emits helper classes that map straight to system tokens —
`mat-bg-*` for backgrounds and `mat-text-*` for text — so native markup can opt into theme colours
without bespoke CSS:

```scss
@include mat.system-classes();
```

```html
<header class="mat-bg-surface-container mat-text-on-surface">…</header>
```

## Typographic scale on native markup

**Pattern:** `mat.typography-hierarchy()` applies the M3 type scale (display, headline, title, body,
label) to plain HTML elements and `.mat-*` classes, so headings and copy outside Material components
match the theme's families and weights:

```scss
@include mat.typography-hierarchy();
```

## Accessible focus

**Pattern:** the repo runs one keyboard-focus ring across the whole app via `:focus-visible`, reading
the primary token. Verbatim from the `base` layer of `apps/web/src/styles.scss`:

```scss
:focus-visible {
  outline: 2px solid var(--mat-sys-primary);
  outline-offset: 2px;
}
```

For WCAG-AA visible focus on Material components specifically, add `mat.strong-focus-indicators()`,
and back it up with high-contrast and forced-colours fallbacks:

```scss
@include mat.strong-focus-indicators();

@media (prefers-contrast: more) {
  :focus-visible {
    outline-width: 3px;
  }
}

@media (forced-colors: active) {
  :focus-visible {
    outline-color: CanvasText;
  }
}
```

**Avoid:** removing outlines without replacing them, or drawing focus rings with a hard-coded colour
instead of `--mat-sys-primary`.

## Elevation

**Pattern:** use the system elevation tokens for shadows so they track the active scheme:

```scss
.app-panel {
  box-shadow: var(--mat-sys-level2);
}
```

**Avoid:** literal `box-shadow` offsets/blur values copied from a design tool.

## Reduced motion

**Pattern:** honour `prefers-reduced-motion`. The repo's router runs View Transitions
(`provideRouter(routes, withViewTransitions())` in `apps/web/src/app/app.config.ts`) and guards them
in the `utilities` layer of `styles.scss`:

```scss
@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }
}
```

## Material Symbols icons

**Pattern:** the Material Symbols Outlined font is loaded in `apps/web/src/index.html`:

```html
<link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&display=swap" rel="stylesheet">
```

and registered as the default `<mat-icon>` font in `apps/web/src/app/app.config.ts`:

```ts
provideEnvironmentInitializer(() => {
  inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
}),
```

With that default set, `<mat-icon>light_mode</mat-icon>` renders the Material Symbols ligature
directly — no per-icon font class needed.

**Avoid:** importing a separate Material Icons (filled) font or setting `fontSet` per icon; the
registry default covers the whole app.
