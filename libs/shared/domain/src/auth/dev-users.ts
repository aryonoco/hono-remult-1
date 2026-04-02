import type { UserInfo } from 'remult';

import { Roles } from './roles';

export const DEV_USERS: readonly UserInfo[] = [
  { id: 'dev-admin', name: 'Sarah Admin', roles: [Roles.admin, Roles.user] },
  { id: 'dev-user', name: 'Ali User', roles: [Roles.user] },
  { id: 'dev-viewer', name: 'Saanvi Viewer', roles: [] },
] as const;
