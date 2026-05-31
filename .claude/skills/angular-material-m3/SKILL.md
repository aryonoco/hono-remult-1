---
name: angular-material-m3
description: "Angular Material v21 M3 theming, dark mode, and accessible component usage for this repo. Use when theming Material, adding Material components, or editing styles.scss."
user-invocable: false
---

# Angular Material v21 (M3)

Covers Angular Material v21's Material 3 theming model as used in this repo: the single `mat.theme()`
call, the `--mat-sys-*` system tokens that flow into app CSS, OS-aware light/dark via
`color-scheme` plus a `ThemeService`, token customisation through `*-overrides()`, the unified
`matButton` / `matIconButton` directives, and the accessibility primitives. The Remult entity stays
the source of truth for data; Material stays the source of truth for presentation tokens.

## References

- [Theming](theming.md) — `mat.theme()` colour/typography/density, `--mat-sys-*` tokens, `*-overrides()`
- [Dark mode](dark-mode.md) — `color-scheme: light dark`, `light-dark()`, `html[data-theme]` + `ThemeService`, `theme-type`
- [Components and accessibility](components-a11y.md) — `matButton` variants, system classes, focus, reduced
  motion, Material Symbols

## Decision Trees

### Where does a colour come from?

| Need                          | Source                                                 |
| ----------------------------- | ------------------------------------------------------ |
| App background / text         | `var(--mat-sys-surface)` / `var(--mat-sys-on-surface)` |
| Brand accent                  | `var(--mat-sys-primary)` / `var(--mat-sys-tertiary)`   |
| A Material component's colour | the theme, or `mat.<component>-overrides()`            |
| A literal hex                 | never — always a `--mat-sys-*` token                   |

### Customising tokens

| Scope                               | Mixin                                                |
| ----------------------------------- | ---------------------------------------------------- |
| Whole theme (validated names)       | `mat.theme-overrides(( ... ))`                       |
| One component's tokens              | `mat.<component>-overrides(( ... ))`                 |
| Build the base palette/type/density | `mat.theme(( color: …, typography: …, density: … ))` |

### Picking a button

| Intent                   | Directive + variant                                    |
| ------------------------ | ------------------------------------------------------ |
| Primary action           | `<button matButton="filled">`                          |
| Secondary action         | `<button matButton="tonal">` or `matButton="outlined"` |
| Low-emphasis / inline    | `<button matButton>` (defaults to `text`)              |
| Raised on a busy surface | `<button matButton="elevated">`                        |
| Icon-only                | `<button matIconButton>` with `aria-label`             |

### Light vs dark

| Need                  | Mechanism                                                                    |
| --------------------- | ---------------------------------------------------------------------------- |
| Follow the OS         | `html { color-scheme: light dark; }` (default)                               |
| Force light/dark      | `html[data-theme='light']` / `[data-theme='dark']` sets `color-scheme`       |
| Toggle at runtime     | `ThemeService` sets/removes `data-theme`                                     |
| Generate both schemes | omit `theme-type` (defaults to `color-scheme`) so tokens emit `light-dark()` |

## Key Principles

1. **One `mat.theme()` call** — colour, typography and density in a single map; no per-component theme mixins
2. **Tokens, never hex** — app CSS reads `--mat-sys-*`; components read their own `--mat-<component>-*`
3. **`color-scheme` switches light/dark** — not a `mat.theme()` key; `ThemeService` flips `html[data-theme]`
4. **`light-dark()` comes free** — emitted because `theme-type` defaults to `color-scheme`
5. **Customise via `*-overrides()`** — `theme-overrides` for system tokens, `<component>-overrides` for component
   tokens; never override Material's compiled CSS
6. **Unified button directives** — `matButton="variant"` and `matIconButton`; `[color]` has no effect under M3
7. **Accessibility is built in** — `mat.strong-focus-indicators()`, reduced-motion guard, Material Symbols as the
   default icon font
