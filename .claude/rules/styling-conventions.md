---
paths: ["apps/web/**/*.scss", "apps/web/**/*.css", "apps/web/**/*.html"]
---

# Styling Conventions

Tailwind CSS v4 (CSS-first) layered over an Angular Material M3 theme. See `.claude/skills/styling-tailwind-v4/`
and `.claude/skills/angular-material-m3/` for the worked patterns.

## Tailwind Setup

- CSS-first only — configure in `apps/web/src/tailwind.css`. Never add `tailwind.config.js`, a `content: []`
  array, or the legacy `@tailwind base/components/utilities` directives.
- Keep the `@import 'tailwindcss';` line and the `@source` directive that scans the shared domain lib.
- `.postcssrc.json` registers `@tailwindcss/postcss` only — do not switch to the Vite plugin.

## Design Tokens

- Declare runtime-variable tokens (the `--mat-sys-*` → `--color-*` bridges) in an `@theme inline` block so the
  generated utilities track the live Material theme through light/dark/system.
- Keep static values in plain `@theme`: the `--color-status-*` `light-dark()` literals, `--font-*`,
  `--container-*`, and `--radius-*`.
- Never hard-code hex in component CSS or templates — consume `--mat-sys-*` tokens (or the `--color-*` bridges).
  Colour values live only in the `@theme` token layer of `tailwind.css`.

## Cascade Layers

- Keep the declared order in `styles.scss`: `@layer base, material, tailwind, utilities;`. Tailwind emits into
  `utilities` (declared last, so it wins by layer order).
- Material ships its component CSS outside any cascade layer, so do not rely on layer order to beat it — theme through
  the token bridge.
- The only permitted `!important` is the `prefers-reduced-motion` view-transition guard in `styles.scss`. Never add
  `!important` to override Material.

## Theming and Dark Mode

- Theme via the CSS `color-scheme` property under `html[data-theme]`, toggled by `ThemeService` — not a
  `mat.theme(( color-scheme: … ))` key.
- Style Material with the `matButton` / `matIconButton` variants and `mat.<component>-overrides()`. Never use the
  `[color]` input (a no-op under M3) or override Material component CSS directly.

## Utility Classes

- Write whole static class strings — never build class names dynamically (no `bg-${tone}`). Map states to full
  literal strings, as `status-badge.ts` does with `TONE_CLASSES`.
- For custom utilities use the `@utility` directive; for the dark variant use `@custom-variant`.

## Formatting

- Format HTML templates with `bun run format:html` (Prettier). Biome formats CSS/SCSS and excludes `*.html`.
