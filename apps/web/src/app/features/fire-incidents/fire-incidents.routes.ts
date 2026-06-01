import type { Routes } from '@angular/router';

import { unsavedChangesGuard } from '../../shared/forms/unsaved-changes';
import { FinalReportFormComponent } from './final-report-form/final-report-form';
import { IncidentDetailComponent } from './incident-detail/incident-detail';
import { IncidentFormComponent } from './incident-form/incident-form';
import { IncidentListComponent } from './incident-list/incident-list';
import { SituationReportFormComponent } from './sitrep-form/situation-report-form';

// Static `new` is declared before the `:id` parameter so `/incidents/new` resolves to the form, not the
// detail screen, and the bare `:id` detail route stays last. `:id/final/edit` precedes `:id/final` so the
// longer path wins. Every form route carries the unsaved-changes guard; the two final-report routes pass
// their `mode` through route data.
export const fireIncidentRoutes: Routes = [
  { path: '', title: 'Incidents', component: IncidentListComponent },
  {
    path: 'new',
    title: 'New incident',
    component: IncidentFormComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: ':id/edit',
    title: 'Edit incident',
    component: IncidentFormComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: ':id/sitrep',
    title: 'Situation report',
    component: SituationReportFormComponent,
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: ':id/final/edit',
    title: 'Edit final report',
    component: FinalReportFormComponent,
    data: { mode: 'edit' },
    canDeactivate: [unsavedChangesGuard],
  },
  {
    path: ':id/final',
    title: 'Final report',
    component: FinalReportFormComponent,
    data: { mode: 'create' },
    canDeactivate: [unsavedChangesGuard],
  },
  // `:id` resolves the 'Incident' fallback title; IncidentDetailComponent overrides it with the
  // incident name once the fire loads.
  { path: ':id', title: 'Incident', component: IncidentDetailComponent },
];
