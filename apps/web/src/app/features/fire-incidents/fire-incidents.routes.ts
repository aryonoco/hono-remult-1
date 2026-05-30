import type { Routes } from '@angular/router';

import { IncidentDetailComponent } from './incident-detail/incident-detail';
import { IncidentFormComponent } from './incident-form/incident-form';
import { IncidentListComponent } from './incident-list/incident-list';

// Static `new` is declared before the `:id` parameter so `/incidents/new` resolves to the form,
// not the detail screen. The form and detail screens are placeholders until Phases 4e and 4d.
export const fireIncidentRoutes: Routes = [
  { path: '', component: IncidentListComponent },
  { path: 'new', component: IncidentFormComponent },
  { path: ':id', component: IncidentDetailComponent },
];
