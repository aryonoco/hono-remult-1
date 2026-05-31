import {
  type CurrentUser,
  type FinalReport,
  type FireIncident,
  type FireStatus,
  IncidentLevel,
  LEVEL_ORDER,
  Roles,
  TERMINAL_STATUSES,
} from '@workspace/shared-domain';

type Role = (typeof Roles)[keyof typeof Roles];
type FireGate = Pick<FireIncident, 'createdBy' | 'isDeleted' | 'status' | 'incidentLevel'>;
type FinalReportGate = Pick<FinalReport, 'isSignedOff'>;

interface FireEditFlags {
  hasSitreps: boolean;
  hasFinalReport: boolean;
  isSignedOff: boolean;
}

const hasRole = (user: CurrentUser | undefined, role: Role): boolean =>
  user?.roles?.includes(role) ?? false;

const isElevated = (user: CurrentUser | undefined): boolean =>
  hasRole(user, Roles.admin) || hasRole(user, Roles.stateOfficer);

const isEditorPlus = (user: CurrentUser | undefined): boolean =>
  hasRole(user, Roles.incidentEditor) || isElevated(user);

export function canCreateIncident(user: CurrentUser | undefined): boolean {
  return isEditorPlus(user);
}

// The cross-district / by-region rollup on the operations dashboard is a state-wide view, so it is
// restricted to elevated users (admin + state officer) — the same gate as other elevated-only actions.
export function canViewDistrictRollup(user: CurrentUser | undefined): boolean {
  return isElevated(user);
}

// Mirrors `FinalReport.allowApiRead: [incidentEditor, stateOfficer, admin]`. A viewer is excluded, so the
// detail load must not eager-include `finalReport` for them (it would 403 the whole GET) and the
// final-report subpanel stays hidden.
export function canViewFinalReport(user: CurrentUser | undefined): boolean {
  return isEditorPlus(user);
}

export function canEditFire(
  fire: FireGate,
  user: CurrentUser | undefined,
  flags: FireEditFlags,
): boolean {
  if (!user) {
    return false;
  }
  if (flags.isSignedOff || fire.isDeleted) {
    return false;
  }
  if (isElevated(user)) {
    return true;
  }
  if (hasRole(user, Roles.incidentEditor)) {
    return fire.createdBy === user.id && !flags.hasSitreps && !flags.hasFinalReport;
  }
  return false;
}

export function canEscalate(
  fire: FireGate,
  user: CurrentUser | undefined,
  isSignedOff: boolean,
): boolean {
  return (
    isElevated(user) &&
    !fire.isDeleted &&
    !isSignedOff &&
    LEVEL_ORDER[fire.incidentLevel] < LEVEL_ORDER[IncidentLevel.levelThree]
  );
}

export function canCreateSitrep(
  fire: FireGate,
  user: CurrentUser | undefined,
  hasFinalReport: boolean,
  isSignedOff: boolean,
): boolean {
  return isEditorPlus(user) && !fire.isDeleted && !isSignedOff && !hasFinalReport;
}

export function canCreateFinalReport(
  fire: FireGate,
  user: CurrentUser | undefined,
  hasFinalReport: boolean,
): boolean {
  return (
    isEditorPlus(user) &&
    TERMINAL_STATUSES.includes(fire.status) &&
    !fire.isDeleted &&
    !hasFinalReport
  );
}

export function canSoftDelete(
  fire: FireGate,
  user: CurrentUser | undefined,
  isSignedOff: boolean,
): boolean {
  return (
    isElevated(user) && TERMINAL_STATUSES.includes(fire.status) && !isSignedOff && !fire.isDeleted
  );
}

export function canSignOff(
  finalReport: FinalReportGate,
  parentStatus: FireStatus,
  user: CurrentUser | undefined,
): boolean {
  return isEditorPlus(user) && !finalReport.isSignedOff && TERMINAL_STATUSES.includes(parentStatus);
}

export function canRemoveSignOff(
  finalReport: FinalReportGate,
  user: CurrentUser | undefined,
): boolean {
  return isElevated(user) && finalReport.isSignedOff;
}
