import type { CurrentUser } from './current-user';
import { Roles } from './roles';

export const DEV_USERS: readonly CurrentUser[] = [
  { id: 'dev-admin', name: 'Sarah Admin', roles: [Roles.admin], districtId: null },
  { id: 'dev-state-officer', name: 'Priya Officer', roles: [Roles.stateOfficer], districtId: null },
  { id: 'dev-editor-otway', name: 'Ali Editor', roles: [Roles.incidentEditor], districtId: 12 },
  { id: 'dev-editor-latrobe', name: 'Kenji Editor', roles: [Roles.incidentEditor], districtId: 47 },
  { id: 'dev-editor-mallee', name: 'Mateo Editor', roles: [Roles.incidentEditor], districtId: 22 },
  { id: 'dev-viewer-otway', name: 'Saanvi Viewer', roles: [Roles.viewer], districtId: 12 },
  { id: 'dev-viewer-latrobe', name: 'Lin Viewer', roles: [Roles.viewer], districtId: 47 },
  { id: 'dev-viewer-mallee', name: 'Aroha Viewer', roles: [Roles.viewer], districtId: 22 },
] as const;

export const DEV_DISTRICT_NAMES: Readonly<Record<number, string>> = {
  12: 'Otway',
  14: 'Far South West',
  22: 'Mallee',
  47: 'Latrobe',
  53: 'Yarra',
};
