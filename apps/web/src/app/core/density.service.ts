import { effect, Injectable, signal } from '@angular/core';

const STORAGE_KEY = 'fire-density';

// App-wide UI density. Mirrors ThemeService: a signal reflected onto `html[data-density]` via an
// effect so global CSS (the list table, the dynamic-form controls) can key Material density off the
// attribute with no `.mat-mdc-*` overrides. Defaults to `compact` — the ops console favours a denser
// information layout unless an operator opts into the airier `comfortable` mode.
export type Density = 'comfortable' | 'compact';

@Injectable({ providedIn: 'root' })
export class DensityService {
  private readonly _density = signal<Density>(this.readStored());
  readonly density = this._density.asReadonly();

  constructor() {
    effect(() => {
      document.documentElement.setAttribute('data-density', this._density());
    });
  }

  setDensity(density: Density): void {
    this._density.set(density);
    localStorage.setItem(STORAGE_KEY, density);
  }

  toggle(): void {
    this.setDensity(this._density() === 'compact' ? 'comfortable' : 'compact');
  }

  private readStored(): Density {
    return localStorage.getItem(STORAGE_KEY) === 'comfortable' ? 'comfortable' : 'compact';
  }
}
