import { DEV_USERS, FireStatus, IncidentLevel } from '@workspace/shared-domain';
import {
  canCreateFinalReport,
  canCreateIncident,
  canCreateSitrep,
  canEditFire,
  canEscalate,
  canRemoveSignOff,
  canSignOff,
  canSoftDelete,
  canViewFinalReport,
} from './permissions';

const ADMIN = DEV_USERS[0]!; // admin, districtId null
const STATE_OFFICER = DEV_USERS[1]!; // stateOfficer
const EDITOR = DEV_USERS[2]!; // incidentEditor, dev-editor-otway
const OTHER_EDITOR = DEV_USERS[3]!; // incidentEditor, dev-editor-latrobe
const VIEWER = DEV_USERS[5]!; // viewer

const goingFire = {
  createdBy: EDITOR.id,
  isDeleted: false,
  status: FireStatus.going,
  incidentLevel: IncidentLevel.levelOne,
};
const terminalFire = { ...goingFire, status: FireStatus.safe };
const level3Fire = { ...goingFire, incidentLevel: IncidentLevel.levelThree };
const othersFire = { ...goingFire, createdBy: OTHER_EDITOR.id };
const deletedTerminalFire = { ...terminalFire, isDeleted: true };

const signedReport = { isSignedOff: true };
const unsignedReport = { isSignedOff: false };

const noFlags = { hasSitreps: false, hasFinalReport: false, isSignedOff: false };
const withSitreps = { hasSitreps: true, hasFinalReport: false, isSignedOff: false };
const withFinalReport = { hasSitreps: false, hasFinalReport: true, isSignedOff: false };
const signedOffFlags = { hasSitreps: false, hasFinalReport: false, isSignedOff: true };

describe('canCreateIncident', () => {
  it('allows editor+, denies viewer and anonymous', () => {
    expect(canCreateIncident(ADMIN)).toBe(true);
    expect(canCreateIncident(STATE_OFFICER)).toBe(true);
    expect(canCreateIncident(EDITOR)).toBe(true);
    expect(canCreateIncident(VIEWER)).toBe(false);
    expect(canCreateIncident(undefined)).toBe(false);
  });
});

describe('canViewFinalReport', () => {
  it('allows editor+, denies viewer and anonymous', () => {
    expect(canViewFinalReport(ADMIN)).toBe(true);
    expect(canViewFinalReport(STATE_OFFICER)).toBe(true);
    expect(canViewFinalReport(EDITOR)).toBe(true);
    expect(canViewFinalReport(VIEWER)).toBe(false);
    expect(canViewFinalReport(undefined)).toBe(false);
  });
});

describe('canEditFire', () => {
  it('elevated may edit a live fire', () => {
    expect(canEditFire(goingFire, ADMIN, noFlags)).toBe(true);
    expect(canEditFire(goingFire, STATE_OFFICER, noFlags)).toBe(true);
  });

  it('editor may edit only own, pre-sitrep, pre-final fires', () => {
    expect(canEditFire(goingFire, EDITOR, noFlags)).toBe(true);
    expect(canEditFire(goingFire, EDITOR, withSitreps)).toBe(false);
    expect(canEditFire(goingFire, EDITOR, withFinalReport)).toBe(false);
    expect(canEditFire(othersFire, EDITOR, noFlags)).toBe(false);
  });

  it('sign-off and soft-delete lock editing for every role', () => {
    expect(canEditFire(goingFire, ADMIN, signedOffFlags)).toBe(false);
    expect(canEditFire(deletedTerminalFire, ADMIN, noFlags)).toBe(false);
  });

  it('denies viewer and anonymous', () => {
    expect(canEditFire(goingFire, VIEWER, noFlags)).toBe(false);
    expect(canEditFire(goingFire, undefined, noFlags)).toBe(false);
  });
});

describe('canEscalate', () => {
  it('elevated may escalate a live, un-signed-off fire below level 3', () => {
    expect(canEscalate(goingFire, ADMIN, false)).toBe(true);
    expect(canEscalate(goingFire, STATE_OFFICER, false)).toBe(true);
  });

  it('denies non-elevated roles', () => {
    expect(canEscalate(goingFire, EDITOR, false)).toBe(false);
    expect(canEscalate(goingFire, VIEWER, false)).toBe(false);
    expect(canEscalate(goingFire, undefined, false)).toBe(false);
  });

  it('blocks at level 3, when signed off, or when deleted', () => {
    expect(canEscalate(level3Fire, ADMIN, false)).toBe(false);
    expect(canEscalate(goingFire, ADMIN, true)).toBe(false);
    expect(canEscalate(deletedTerminalFire, ADMIN, false)).toBe(false);
  });
});

describe('canCreateSitrep', () => {
  it('editor+ may add a sitrep to a live fire with no final report', () => {
    expect(canCreateSitrep(goingFire, EDITOR, false, false)).toBe(true);
    expect(canCreateSitrep(goingFire, ADMIN, false, false)).toBe(true);
  });

  it('blocks when a final report exists, when signed off, or when deleted', () => {
    expect(canCreateSitrep(goingFire, EDITOR, true, false)).toBe(false);
    expect(canCreateSitrep(goingFire, EDITOR, false, true)).toBe(false);
    expect(canCreateSitrep(deletedTerminalFire, EDITOR, false, false)).toBe(false);
  });

  it('denies viewer and anonymous', () => {
    expect(canCreateSitrep(goingFire, VIEWER, false, false)).toBe(false);
    expect(canCreateSitrep(goingFire, undefined, false, false)).toBe(false);
  });
});

describe('canCreateFinalReport', () => {
  it('editor+ may file once on a terminal fire with no existing report', () => {
    expect(canCreateFinalReport(terminalFire, EDITOR, false)).toBe(true);
    expect(canCreateFinalReport(terminalFire, ADMIN, false)).toBe(true);
  });

  it('blocks on non-terminal status, an existing report, or a deleted fire', () => {
    expect(canCreateFinalReport(goingFire, EDITOR, false)).toBe(false);
    expect(canCreateFinalReport(terminalFire, EDITOR, true)).toBe(false);
    expect(canCreateFinalReport(deletedTerminalFire, EDITOR, false)).toBe(false);
  });

  it('denies viewer and anonymous', () => {
    expect(canCreateFinalReport(terminalFire, VIEWER, false)).toBe(false);
    expect(canCreateFinalReport(terminalFire, undefined, false)).toBe(false);
  });
});

describe('canSoftDelete', () => {
  it('elevated may soft-delete a terminal, un-signed-off, live fire', () => {
    expect(canSoftDelete(terminalFire, ADMIN, false)).toBe(true);
    expect(canSoftDelete(terminalFire, STATE_OFFICER, false)).toBe(true);
  });

  it('blocks non-elevated, non-terminal, signed-off, or already-deleted', () => {
    expect(canSoftDelete(terminalFire, EDITOR, false)).toBe(false);
    expect(canSoftDelete(goingFire, ADMIN, false)).toBe(false);
    expect(canSoftDelete(terminalFire, ADMIN, true)).toBe(false);
    expect(canSoftDelete(deletedTerminalFire, ADMIN, false)).toBe(false);
  });
});

describe('canSignOff', () => {
  it('editor+ may sign off an unsigned report on a terminal parent', () => {
    expect(canSignOff(unsignedReport, FireStatus.safe, EDITOR)).toBe(true);
    expect(canSignOff(unsignedReport, FireStatus.safe, ADMIN)).toBe(true);
  });

  it('blocks an already-signed report or a non-terminal parent', () => {
    expect(canSignOff(signedReport, FireStatus.safe, EDITOR)).toBe(false);
    expect(canSignOff(unsignedReport, FireStatus.going, EDITOR)).toBe(false);
  });

  it('denies viewer and anonymous', () => {
    expect(canSignOff(unsignedReport, FireStatus.safe, VIEWER)).toBe(false);
    expect(canSignOff(unsignedReport, FireStatus.safe, undefined)).toBe(false);
  });
});

// biome-ignore lint/security/noSecrets: test description, not a secret
describe('canRemoveSignOff', () => {
  it('elevated may remove sign-off from a signed report', () => {
    expect(canRemoveSignOff(signedReport, ADMIN)).toBe(true);
    expect(canRemoveSignOff(signedReport, STATE_OFFICER)).toBe(true);
  });

  it('blocks non-elevated roles and unsigned reports', () => {
    expect(canRemoveSignOff(signedReport, EDITOR)).toBe(false);
    expect(canRemoveSignOff(unsignedReport, ADMIN)).toBe(false);
    expect(canRemoveSignOff(signedReport, VIEWER)).toBe(false);
    expect(canRemoveSignOff(signedReport, undefined)).toBe(false);
  });
});
