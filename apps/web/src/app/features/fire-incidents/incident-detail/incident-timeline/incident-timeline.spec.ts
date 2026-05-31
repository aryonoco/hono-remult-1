import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import {
  FinalReport,
  FireIncident,
  FireStatus,
  IncidentLevel,
  SituationReport,
} from '@workspace/shared-domain';
import { findAxeViolations } from '../../../../../testing/axe-helper';
import { IncidentTimelineComponent } from './incident-timeline';

const NOW = new Date('2026-05-31T12:00:00Z');
const SIX_MIN_MS = 6 * 60 * 1000;
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}T/;

function fireRow(overrides: Partial<FireIncident> = {}): FireIncident {
  return Object.assign(new FireIncident(), {
    id: 'fire-1',
    name: 'Ridge Track',
    status: FireStatus.going,
    incidentLevel: IncidentLevel.levelThree,
    isMajor: true,
    declaredBySource: 'State Control Centre',
    declaredByTimestamp: new Date('2026-05-31T09:30:00Z'),
    fireStartedAt: new Date('2026-05-31T08:00:00Z'),
    fireDetectedAt: new Date('2026-05-31T08:15:00Z'),
    reportedAt: new Date('2026-05-31T08:20:00Z'),
    firstCrewSentAt: new Date('2026-05-31T08:40:00Z'),
    firstCrewArrivedAt: new Date('2026-05-31T09:10:00Z'),
    nextReportDue: new Date(NOW.getTime() - SIX_MIN_MS),
    createdBy: 'op-12-1',
    ...overrides,
  });
}

function sitrep(reportNumber: number, at: string, status: FireStatus): SituationReport {
  return Object.assign(new SituationReport(), {
    id: `sr-${reportNumber}`,
    fireIncidentId: 'fire-1',
    reportNumber,
    fireName: 'Ridge Track',
    status,
    submittedBy: 'op-12-1',
    submittedAt: new Date(at),
  });
}

function host(fixture: ComponentFixture<IncidentTimelineComponent>): HTMLElement {
  return fixture.nativeElement as HTMLElement;
}

async function render(
  fire: FireIncident,
  sitreps: readonly SituationReport[] = [],
  finalReport?: FinalReport,
): Promise<ComponentFixture<IncidentTimelineComponent>> {
  const fixture = TestBed.createComponent(IncidentTimelineComponent);
  fixture.componentRef.setInput('fire', fire);
  fixture.componentRef.setInput('sitreps', sitreps);
  fixture.componentRef.setInput('finalReport', finalReport);
  fixture.componentRef.setInput('now', NOW);
  await fixture.whenStable();
  return fixture;
}

describe('IncidentTimelineComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' }],
    });
  });

  it('renders an ordered list with one li per event in chronological order', async () => {
    const sitreps = [
      sitrep(1, '2026-05-31T10:00:00Z', FireStatus.going),
      sitrep(2, '2026-05-31T11:00:00Z', FireStatus.underControlFirst),
    ];
    const el = host(await render(fireRow(), sitreps));
    const list = el.querySelector('ol');
    expect(list).not.toBeNull();
    const items = [...el.querySelectorAll('li')];
    // started, detected, reported, crewSent, crewArrived, declaredMajor, sitrep1, sitrep2, nextDue
    expect(items).toHaveLength(9);
    const times = items.map((li) => li.querySelector('time')?.getAttribute('datetime') ?? '');
    const sorted = [...times].sort();
    expect(times).toEqual(sorted);
  });

  it('gives every event a <time datetime> in ISO form', async () => {
    const el = host(await render(fireRow()));
    const times = [...el.querySelectorAll('time')];
    expect(times.length).toBeGreaterThan(0);
    for (const t of times) {
      expect(t.getAttribute('datetime')).toMatch(ISO_DATE_PREFIX);
    }
  });

  it('renders a status badge for sitrep events', async () => {
    const sitreps = [sitrep(1, '2026-05-31T10:00:00Z', FireStatus.underControlFirst)];
    const el = host(await render(fireRow(), sitreps));
    expect(el.querySelector('app-status-badge')).not.toBeNull();
  });

  it('marks the trailing nextDue event as overdue with role=status', async () => {
    const el = host(await render(fireRow()));
    const status = el.querySelector('[role=status]');
    expect(status).not.toBeNull();
    expect(status?.textContent).toContain('overdue');
  });

  it('omits the nextDue event for a terminal fire', async () => {
    const terminal = fireRow({ status: FireStatus.safe });
    const el = host(await render(terminal));
    expect(el.querySelector('[role=status]')).toBeNull();
    expect(el.textContent).not.toContain('overdue');
  });

  it('renders the sign-off event with the resolved operator name', async () => {
    const fr = Object.assign(new FinalReport(), {
      id: 'fr-1',
      fireIncidentId: 'fire-1',
      isSignedOff: true,
      signedOffBy: 'op-12-1',
      signedOffAt: new Date('2026-05-31T11:30:00Z'),
    });
    const el = host(await render(fireRow({ status: FireStatus.safe }), [], fr));
    expect(el.textContent).toContain('Hamish Calder');
  });

  it('marks decorative dots aria-hidden', async () => {
    const el = host(await render(fireRow()));
    const dots = [...el.querySelectorAll('.incident-timeline__dot')];
    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) {
      expect(dot.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('has no structural accessibility violations', async () => {
    const sitreps = [sitrep(1, '2026-05-31T10:00:00Z', FireStatus.going)];
    expect(await findAxeViolations(host(await render(fireRow(), sitreps)))).toEqual([]);
  });
});
