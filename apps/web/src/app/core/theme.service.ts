import { effect, Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'fire-theme';

// Declared before `export type ThemeMode` to satisfy Biome `useExportsLast`
// (all exports must follow all non-exports). Type aliases are hoisted, so the
// forward reference to ThemeMode here is valid.
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
