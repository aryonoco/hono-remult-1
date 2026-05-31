---
name: styling-tailwind-v4
description: "Tailwind CSS v4 CSS-first setup, @theme vs @theme inline tokens, Material interop, and class-detection
rules for this repo. Use when editing tailwind.css/styles.scss or writing utility classes."
user-invocable: false
---

# Tailwind CSS v4 (CSS-first)

Covers the Tailwind CSS v4 setup used by `apps/web`: a CSS-first configuration with no `tailwind.config.js`, design
tokens declared in `@theme` / `@theme inline`, Material M3 interop through the `--mat-sys-*` token bridge, and the
static-class-string discipline that keeps utilities from being purged.

## References

- [Setup and layers](setup-and-layers.md) — `@import`, `@source`, `.postcssrc.json`, `@theme` vs `@theme inline`,
  cascade-layer order
- [Material interop](material-interop.md) — bridging `--mat-sys-*` to `--color-*`, the honest override rule, the
  `!important` policy
- [Class detection](class-detection.md) — static class strings only, why `@source` exists, source-scanning directives

## Decision Trees

### Where does a token go

| Token kind                                     | Home                     | Example                                              |
| ---------------------------------------------- | ------------------------ | ---------------------------------------------------- |
| References a live CSS variable (`--mat-sys-*`) | `@theme inline`          | `--color-surface: var(--mat-sys-surface)`            |
| Static literal value                           | `@theme`                 | `--color-status-going: light-dark(#991b1b, #fca5a5)` |
| Font family                                    | `@theme`                 | `--font-sans: 'Public Sans', …`                      |
| Container width                                | `@theme`                 | `--container-form: 60rem`                            |
| Radius                                         | `@theme`                 | `--radius-card: 0.5rem`                              |
| Breakpoint                                     | `@theme` (never inline)  | `--breakpoint-3xl: 120rem`                           |
| Raw value for `[style]` bindings only          | `:root` in `@layer base` | `--app-grid-border: …`                               |

### Which directive for custom CSS

| Need                                          | Directive                        |
| --------------------------------------------- | -------------------------------- |
| Custom utility that takes variants            | `@utility name { … }`            |
| Custom variant (e.g. data-attribute dark)     | `@custom-variant`                |
| `@apply` inside an Angular component `styles` | `@reference 'tailwindcss'` first |
| Force-keep a class not in source              | `@source inline('…')`            |
| Exclude a path or class from scanning         | `@source not '…'`                |

### Overriding a Material style

| Situation                                      | Approach                                                        |
| ---------------------------------------------- | --------------------------------------------------------------- |
| Recolour / restyle a component theme           | Theme through `--mat-sys-*` overrides in `@layer material`      |
| Layout / spacing around a component            | Tailwind utility (utilities layer wins over the material layer) |
| Beat unlayered Material component CSS          | Token bridge, not specificity — see material-interop.md         |
| `prefers-reduced-motion` view-transition guard | The one sanctioned `!important`                                 |

## Key Principles

1. **CSS-first, no config file** — tokens live in `@theme` / `@theme inline`; there is no `tailwind.config.js`
2. **`@theme inline` for bridges** — any token that references `--mat-sys-*` must be inline so utilities follow the
   live `color-scheme` signal
3. **`@theme` for static values only** — fonts, containers, radii, and the `--color-status-*` `light-dark()` literals
4. **One layer order** — `@layer base, material, tailwind, utilities;` declared in `styles.scss`
5. **Static class strings only** — never interpolate or concatenate class names; whole literals per state
6. **Theme, do not fight specificity** — bridge through tokens; `!important` is reserved for the reduced-motion guard
