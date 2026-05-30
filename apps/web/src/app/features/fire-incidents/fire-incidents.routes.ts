import type { Routes } from '@angular/router';

import { IncidentDetailComponent } from './incident-detail/incident-detail';
import { IncidentFormComponent } from './incident-form/incident-form';
import { IncidentListComponent } from './incident-list/incident-list';

// Static `new` is declared before the `:id` parameter so `/incidents/new` resolves to the form, not the
// detail screen, and the bare `:id` detail route stays last. The `:id/edit`, `:id/sitrep`, and
// `:id/final[/edit]` paths point at the `IncidentFormComponent` placeholder so the detail screen's action
// buttons navigate; Phase 4e swaps in the real edit / sitrep / final-report form components.
export const fireIncidentRoutes: Routes = [
  { path: '', component: IncidentListComponent },
  { path: 'new', component: IncidentFormComponent },
  { path: ':id/edit', component: IncidentFormComponent },
  { path: ':id/sitrep', component: IncidentFormComponent },
  { path: ':id/final/edit', component: IncidentFormComponent },
  { path: ':id/final', component: IncidentFormComponent },
  { path: ':id', component: IncidentDetailComponent },
];
