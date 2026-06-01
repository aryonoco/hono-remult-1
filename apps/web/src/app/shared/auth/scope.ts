import { type CurrentUser, DEV_DISTRICT_NAMES } from '@workspace/shared-domain';

import { canViewDistrictRollup } from './permissions';

export interface DataScope {
  // True when the user reads every district (admin / state officer); false when scoped to one.
  readonly statewide: boolean;
  // Human-readable scope, e.g. "Statewide" or "Otway district".
  readonly label: string;
}

// The single source of truth for a user's data scope, derived exactly the way the server's
// FireIncident apiPrefilter scopes every read: elevated roles (admin / state officer) see every
// district ("Statewide"); everyone else is limited to their own district. Returns null when there is
// no scoped data to label (no user, or a non-elevated user with no district). Used by both the scope
// indicator badge and the page/section headings so they never disagree.
export function currentScope(user: CurrentUser | undefined): DataScope | null {
  if (!user) {
    return null;
  }
  if (canViewDistrictRollup(user)) {
    return { statewide: true, label: 'Statewide' };
  }
  if (user.districtId === null) {
    return null;
  }
  const name = DEV_DISTRICT_NAMES[user.districtId] ?? `District ${user.districtId}`;
  return { statewide: false, label: `${name} district` };
}
