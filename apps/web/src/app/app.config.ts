import {
  type ApplicationConfig,
  inject,
  provideBrowserGlobalErrorListeners,
  provideEnvironmentInitializer,
  provideZonelessChangeDetection,
} from '@angular/core';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatIconRegistry } from '@angular/material/icon';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { provideRemult } from './core/remult.provider';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes),
    provideRemult(),
    // Angular Material 21 animates via CSS (no @angular/animations provider needed) and shares a date adapter for
    // the date/time pickers.
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: 'en-AU' },
    // Render <mat-icon> ligatures with the Material Symbols Outlined font loaded in index.html.
    provideEnvironmentInitializer(() => {
      inject(MatIconRegistry).setDefaultFontSetClass('material-symbols-outlined');
    }),
  ],
};
