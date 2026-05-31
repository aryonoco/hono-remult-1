# Dark Mode

Light and dark are driven by the CSS `color-scheme` property, not by a `mat.theme()` key. The theme
emits `light-dark()` values for every colour token; the browser then resolves them against whatever
`color-scheme` is in effect. A `ThemeService` flips an `html[data-theme]` attribute to override the
OS preference at runtime.

## The theme emits both schemes

**Pattern:** leave `theme-type` out of the colour map. Its default is `color-scheme`, which makes
every generated token a `light-dark(<light>, <dark>)` value. Combined with
`html { color-scheme: light dark; }`, the app follows the OS automatically — no second theme block,
no class swap. Verbatim from `apps/web/src/styles.scss`:

```scss
@layer material {
  html {
    color-scheme: light dark; // follow the OS by default; ThemeService flips data-theme to override
    @include mat.theme(
      (
        color: (
          primary: mat.$blue-palette,
          tertiary: mat.$orange-palette,
        ),
        // ...typography, density
      )
    );
  }

  html[data-theme='light'] {
    color-scheme: light;
  }

  html[data-theme='dark'] {
    color-scheme: dark;
  }
}
```

**Avoid:** trying to set the scheme through `mat.theme(( color-scheme: ... ))` — there is no such
key. The colour sub-map accepts only `theme-type`, `primary`, `tertiary`, `use-system-variables`
and `system-variables-prefix`.

## `theme-type` selects what gets generated

**Pattern:** the `theme-type` key inside the colour sub-map decides which schemes the theme emits.
Accepted values are `light`, `dark` and `color-scheme`:

| `theme-type`             | Output                                               |
| ------------------------ | ---------------------------------------------------- |
| `color-scheme` (default) | tokens are `light-dark()` — both schemes in one pass |
| `light`                  | light-only token values                              |
| `dark`                   | dark-only token values                               |

```scss
// Dark-only theme (no light-dark(); the browser's color-scheme is ignored for colour):
color: (
  theme-type: dark,
  primary: mat.$blue-palette,
),
```

This repo omits `theme-type`, so it gets the `color-scheme` default and a single theme block covers
both modes.

## The runtime override attribute

**Pattern:** the `html[data-theme='light'|'dark']` rules only set the CSS `color-scheme` property —
they re-resolve the already-emitted `light-dark()` tokens, so no second `mat.theme()` is needed.
Removing the attribute returns control to the OS (`color-scheme: light dark`).

**Avoid:** putting a whole second `mat.theme()` under `[data-theme='dark']`. The `light-dark()` token
values already contain both schemes; you only need to change which one `color-scheme` resolves.

## ThemeService

**Pattern:** a root service holds the mode in a signal and syncs it to `html[data-theme]` via an
`effect`. Verbatim from `apps/web/src/app/core/theme.service.ts`:

```ts
import { effect, Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'fire-theme';

const NEXT_THEME: Readonly<Record<ThemeMode, ThemeMode>> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
};

export type ThemeMode = 'light' | 'dark' | 'system';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<ThemeMode>(this.readStored());
  readonly theme = this._theme.asReadonly();

  constructor() {
    effect(() => {
      const mode = this._theme();
      const root = document.documentElement;
      if (mode === 'system') {
        root.removeAttribute('data-theme');
      } else {
        root.setAttribute('data-theme', mode);
      }
    });
  }

  setTheme(mode: ThemeMode): void {
    this._theme.set(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }

  cycle(): void {
    this.setTheme(NEXT_THEME[this._theme()]);
  }

  private readStored(): ThemeMode {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
    return 'system';
  }
}
```

Three modes: `light` and `dark` set the attribute (forcing the scheme); `system` removes it (back to
the OS default). The choice persists in `localStorage`.

**Avoid:** toggling a `.dark` CSS class or rebuilding the theme at runtime. The single source of truth
is the `data-theme` attribute the service writes; the `light-dark()` tokens do the rest.
