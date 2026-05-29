import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'incidents' },
  {
    path: 'incidents',
    loadChildren: () =>
      import('./features/fire-incidents/fire-incidents.routes').then((m) => m.fireIncidentRoutes),
  },
];
