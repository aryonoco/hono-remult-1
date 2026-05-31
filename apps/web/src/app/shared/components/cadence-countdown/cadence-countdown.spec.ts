import { TestBed } from '@angular/core/testing';
import { findAxeViolations } from '../../../../testing/axe-helper';
import { CadenceCountdownComponent } from './cadence-countdown';

const NOW = new Date('2026-05-31T12:00:00Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

async function render(
  due: Date | null,
  appearance?: 'tone' | 'inverse',
): Promise<{ host: HTMLElement; text: string }> {
  const fixture = TestBed.createComponent(CadenceCountdownComponent);
  fixture.componentRef.setInput('now', NOW);
  fixture.componentRef.setInput('due', due);
  if (appearance) {
    fixture.componentRef.setInput('appearance', appearance);
  }
  await fixture.whenStable();
  const host = fixture.nativeElement as HTMLElement;
  return { host, text: host.textContent?.trim() ?? '' };
}

describe('CadenceCountdownComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('shows an em dash and the none state when there is no due date', async () => {
    const { host, text } = await render(null);
    expect(text).toBe('—');
    expect(host.getAttribute('data-state')).toBe('none');
    expect(host.querySelector('[role=status]')).toBeNull();
    expect(await findAxeViolations(host)).toEqual([]);
  });

  it('marks a past due as overdue with a live status', async () => {
    const { host, text } = await render(new Date(NOW.getTime() - 6 * MIN));
    expect(text).toBe('6m overdue');
    expect(host.getAttribute('data-state')).toBe('overdue');
    expect(host.querySelector('[role=status]')).not.toBeNull();
    expect(await findAxeViolations(host)).toEqual([]);
  });

  it('marks an imminent due (within 60 min) as soon', async () => {
    const { host, text } = await render(new Date(NOW.getTime() + 14 * MIN));
    expect(text).toBe('in 14m');
    expect(host.getAttribute('data-state')).toBe('soon');
  });

  it('formats a distant due as upcoming with hours and minutes', async () => {
    const { host, text } = await render(new Date(NOW.getTime() + 100 * MIN));
    expect(text).toBe('in 1h 40m');
    expect(host.getAttribute('data-state')).toBe('upcoming');
  });

  it('formats a multi-day overdue as whole days', async () => {
    const { host, text } = await render(new Date(NOW.getTime() - 3 * DAY));
    expect(text).toBe('3d overdue');
    expect(host.getAttribute('data-state')).toBe('overdue');
    expect(host.querySelector('[role=status]')).not.toBeNull();
  });

  it('formats a multi-day upcoming as whole days', async () => {
    const { host, text } = await render(new Date(NOW.getTime() + 5 * DAY));
    expect(text).toBe('in 5d');
    expect(host.getAttribute('data-state')).toBe('upcoming');
  });

  it('does not colour the value span under the inverse appearance but keeps the live status', async () => {
    const { host } = await render(new Date(NOW.getTime() - 6 * MIN), 'inverse');
    const span = host.querySelector('span');
    expect(span).not.toBeNull();
    expect(span?.className).not.toContain('text-status-');
    expect(host.getAttribute('data-state')).toBe('overdue');
    expect(host.querySelector('[role=status]')).not.toBeNull();
    expect(await findAxeViolations(host)).toEqual([]);
  });
});
