import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'overview' },
  {
    path: 'overview',
    title: 'Overview',
    loadComponent: () => import('./features/overview/overview').then((m) => m.OverviewComponent),
    // `breadcrumb` feeds the shell's trail; `width` (preserved here) drives the content column measure.
    data: { width: 'wide', breadcrumb: 'Overview' },
  },
  {
    path: 'incidents',
    // The section-root breadcrumb sits on the parent so every route under `/incidents` (list, forms,
    // detail) inherits an 'Incidents' ancestor crumb resolving to the list; the list's own `''` child
    // therefore carries no breadcrumb of its own (it would duplicate this one).
    data: { breadcrumb: 'Incidents' },
    loadChildren: () =>
      import('./features/fire-incidents/fire-incidents.routes').then((m) => m.fireIncidentRoutes),
  },
];
