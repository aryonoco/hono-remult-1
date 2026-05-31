import { type FireStatus, TERMINAL_STATUSES } from '@workspace/shared-domain';

// A fire is "terminal" once it reaches a safe/not-found end state. Seeded terminal fires keep a stale past
// `nextReportDue`, so callers gate cadence countdowns/overdue markers on this (passing `null` when terminal).
export function isTerminalStatus(s: FireStatus): boolean {
  return (TERMINAL_STATUSES as readonly FireStatus[]).includes(s);
}
