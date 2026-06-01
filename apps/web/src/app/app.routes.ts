import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  {
    path: 'overview',
    title: 'Overview',
    loadComponent: () => import('./features/overview/overview').then((m) => m.OverviewComponent),
    data: { width: 'wide' },
  },
  {
    path: 'incidents',
    loadChildren: () =>
      import('./features/fire-incidents/fire-incidents.routes').then((m) => m.fireIncidentRoutes),
  },
];
