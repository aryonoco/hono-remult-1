import {
  type ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideEnvironmentInitializer,
  provideZonelessChangeDetection,
} from '@angular/core';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter, TitleStrategy, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';
import { DensityService } from './core/density.service';
import { provideRemult } from './core/remult.provider';
import { AppTitleStrategy } from './core/title-strategy';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    // Cross-route View Transitions API animations — feature-detected by Angular, so a no-op where the
    // browser (or jsdom in tests) lacks support. A reduced-motion guard in styles.scss disables the
    // animation for users who ask for it.
    provideRouter(routes, withViewTransitions()),
    // Suffix each route's `title` with the app wordmark ('Incidents — Fire Incidents'); the detail
    // screen overrides the title with the incident name once the fire loads.
    { provide: TitleStrategy, useClass: AppTitleStrategy },
    provideRemult(),
    // Angular Material 21 animates via CSS (no @angular/animations provider needed) and shares a date adapter for
    // the date/time pickers.
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: 'en-AU' },
    // Render <mat-icon> ligatures with the Material Symbols Outlined font loaded in index.html.
    provideEnvironmentInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
    }),
    // Instantiate the app-wide density preference eagerly so `html[data-density]` is reflected from the
    // first paint (default compact), before any density-aware view renders — the same role ThemeService
    // fills for `data-theme`.
    provideEnvironmentInitializer(() => {
      inject(DensityService);
    }),
  ],
};
