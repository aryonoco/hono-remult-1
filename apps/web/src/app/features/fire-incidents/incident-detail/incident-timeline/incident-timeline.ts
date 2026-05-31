import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  FIRE_DETECTION_METHOD_LABELS,
  type FinalReport,
  type FireIncident,
  operatorName,
  type StatusTone,
} from '@workspace/shared-domain';
import { isTerminalStatus } from '../../../../shared/util/fire-status';

type EventTone = StatusTone | 'event' | 'overdue';

interface TimelineEvent {
  kind:
    | 'started'
    | 'detected'
    | 'reported'
    | 'crewSent'
    | 'crewArrived'
    | 'declaredMajor'
    | 'signOff'
    | 'nextDue';
  at: Date;
  label: string;
  tone: EventTone;
  detail?: string;
  future?: boolean;
  overdue?: boolean;
}

const SPINE_EVENT_TONE: Readonly<Record<EventTone, string>> = {
  going: 'bg-status-going',
  contained: 'bg-status-contained',
  controlled: 'bg-status-controlled',
  safe: 'bg-status-safe',
  neutral: 'bg-status-neutral',
  missing: 'bg-status-missing',
  event: 'bg-status-event',
  overdue: 'bg-status-going',
};

// Real timestamp fields rendered as fixed lifecycle markers, in chronological field order. `at` reads the
// source timestamp; the optional `detail` resolves from a sibling field (detection method) when present.
interface TimestampEventDef {
  at: (fire: FireIncident) => Date | undefined;
  kind: TimelineEvent['kind'];
  label: string;
  tone: EventTone;
  detail?: (fire: FireIncident) => string | undefined;
}
const TIMESTAMP_EVENT_DEFS: readonly TimestampEventDef[] = [
  {
    at: (f: FireIncident) => f.fireStartedAt,
    kind: 'started',
    label: 'Fire started',
    tone: 'event',
  },
  {
    at: (f: FireIncident) => f.fireDetectedAt,
    kind: 'detected',
    label: 'Detected',
    tone: 'event',
    detail: (f: FireIncident) =>
      f.detectionMethod ? FIRE_DETECTION_METHOD_LABELS[f.detectionMethod] : undefined,
  },
  { at: (f: FireIncident) => f.reportedAt, kind: 'reported', label: 'Reported', tone: 'event' },
  {
    at: (f: FireIncident) => f.firstCrewSentAt,
    kind: 'crewSent',
    label: 'First crew sent',
    tone: 'event',
  },
  {
    at: (f: FireIncident) => f.firstCrewArrivedAt,
    kind: 'crewArrived',
    label: 'First crew arrived',
    tone: 'event',
  },
];

function lifecycleEvents(fire: FireIncident): TimelineEvent[] {
  const out: TimelineEvent[] = [];
  for (const def of TIMESTAMP_EVENT_DEFS) {
    const at = def.at(fire);
    if (at instanceof Date) {
      const detail = def.detail?.(fire);
      out.push(
        detail === undefined
          ? { at, kind: def.kind, label: def.label, tone: def.tone }
          : { at, kind: def.kind, label: def.label, tone: def.tone, detail },
      );
    }
  }
  if (fire.isMajor && fire.declaredByTimestamp) {
    const detail = fire.declaredBySource || undefined;
    out.push(
      detail === undefined
        ? {
            at: fire.declaredByTimestamp,
            kind: 'declaredMajor',
            label: 'Declared major',
            tone: 'going',
          }
        : {
            at: fire.declaredByTimestamp,
            kind: 'declaredMajor',
            label: 'Declared major',
            tone: 'going',
            detail,
          },
    );
  }
  return out;
}

function signOffEvent(finalReport: FinalReport | undefined): TimelineEvent | null {
  if (finalReport?.isSignedOff && finalReport.signedOffAt) {
    return {
      at: finalReport.signedOffAt,
      kind: 'signOff',
      label: `Final report signed off by ${operatorName(finalReport.signedOffBy)}`,
      tone: 'safe',
    };
  }
  return null;
}

function nextDueEvent(fire: FireIncident, now: Date): TimelineEvent | null {
  const due = fire.nextReportDue;
  if (!due || isTerminalStatus(fire.status)) {
    return null;
  }
  const overdue = due.getTime() < now.getTime();
  return {
    at: due,
    kind: 'nextDue',
    label: overdue ? 'Report overdue' : 'Next report due',
    tone: overdue ? 'overdue' : 'event',
    future: !overdue,
    overdue,
  };
}

@Component({
  selector: 'app-incident-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  template: `
    <ol role="list" class="incident-timeline">
      @for (e of events(); track $index) {
        <li [class.is-overdue]="e.overdue">
          <span class="incident-timeline__dot" [class]="dotClass(e)" aria-hidden="true"></span>
          <div class="incident-timeline__body" [attr.role]="e.overdue ? 'status' : null">
            <span class="incident-timeline__label">{{ e.label }}@if (e.overdue) { <span class="sr-only"> (overdue)</span> }</span>
            @if (e.detail) { <span class="incident-timeline__detail">{{ e.detail }}</span> }
          </div>
          <time class="incident-timeline__time font-mono tabular-nums" [attr.datetime]="e.at.toISOString()">{{ e.at | date: 'dd/MM/yy, HH:mm' }}</time>
        </li>
      }
    </ol>
  `,
  styles: [
    `
    .incident-timeline { list-style: none; margin: 0; padding: 0; }
    .incident-timeline li { display: grid; grid-template-columns: auto 1fr auto; gap: .75rem; padding: .55rem 0; position: relative; }
    .incident-timeline li:not(:last-child)::before { content: ''; position: absolute; left: 6px; top: 1.4rem; bottom: -.55rem; width: 2px; background: var(--mat-sys-outline-variant); }
    .incident-timeline__dot { width: 14px; height: 14px; margin-top: .2rem; border-radius: 9999px; border: 2px solid var(--mat-sys-surface); z-index: 1; }
    .incident-timeline__label { font-weight: 600; display: inline-flex; align-items: center; gap: .5rem; }
    .incident-timeline__detail { display: block; font-size: .8125rem; color: var(--mat-sys-on-surface-variant); }
    .incident-timeline__time { font-size: .8125rem; color: var(--mat-sys-on-surface-variant); white-space: nowrap; }
    .is-overdue .incident-timeline__time { color: var(--color-status-going); }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  `,
  ],
})
export class IncidentTimelineComponent {
  readonly fire = input.required<FireIncident>();
  readonly finalReport = input<FinalReport | undefined>(undefined);
  readonly now = input<Date>(new Date());
  protected dotClass(e: TimelineEvent): string {
    return `incident-timeline__dot ${SPINE_EVENT_TONE[e.tone]}`;
  }
  protected readonly events = computed<readonly TimelineEvent[]>(() => {
    const f = this.fire();
    const signOff = signOffEvent(this.finalReport());
    const out = [...lifecycleEvents(f)];
    if (signOff) {
      out.push(signOff);
    }
    out.sort((a, b) => a.at.getTime() - b.at.getTime());
    // The next-report-due marker always trails the chronological history.
    const nextDue = nextDueEvent(f, this.now());
    if (nextDue) {
      out.push(nextDue);
    }
    return out;
  });
}
