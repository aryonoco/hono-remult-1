import { TestBed } from '@angular/core/testing';
import { findAxeViolations } from '../../../../testing/axe-helper';
import { CadenceCountdownComponent } from './cadence-countdown';

const NOW = new Date('2026-05-31T12:00:00Z');
const MIN = 60_000;

async function render(due: Date | null): Promise<{ host: HTMLElement; text: string }> {
  const fixture = TestBed.createComponent(CadenceCountdownComponent);
  fixture.componentRef.setInput('now', NOW);
  fixture.componentRef.setInput('due', due);
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
    expect(text).toBe('−6m');
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
});
