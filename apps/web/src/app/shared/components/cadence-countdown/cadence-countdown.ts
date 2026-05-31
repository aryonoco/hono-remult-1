import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from '@workspace/shared-domain';

type CadenceState = 'overdue' | 'soon' | 'upcoming' | 'none';
type CadenceAppearance = 'tone' | 'inverse';
const SOON_MS: number = 60 * MS_PER_MINUTE;

function fmt(ms: number): string {
  if (ms >= MS_PER_DAY) {
    return `${Math.round(ms / MS_PER_DAY)}d`;
  }
  if (ms < MS_PER_HOUR) {
    return `${Math.round(ms / MS_PER_MINUTE)}m`;
  }
  const h = Math.floor(ms / MS_PER_HOUR);
  const m = Math.round((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  return m ? `${h}h ${m}m` : `${h}h`;
}

@Component({
  selector: 'app-cadence-countdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-state]': 'state()' },
  template: `<span
    class="font-mono tabular-nums"
    [class.text-status-going]="appearance() === 'tone' && state() === 'overdue'"
    [class.text-status-contained]="appearance() === 'tone' && state() === 'soon'"
    [attr.role]="state() === 'overdue' ? 'status' : null"
    >{{ text() }}</span
  >`,
})
export class CadenceCountdownComponent {
  readonly due = input.required<Date | null>();
  readonly now = input<Date>(new Date());
  readonly appearance = input<CadenceAppearance>('tone');
  protected readonly state = computed<CadenceState>(() => {
    const due = this.due();
    if (due == null) {
      return 'none';
    }
    const delta = due.getTime() - this.now().getTime();
    if (delta < 0) {
      return 'overdue';
    }
    if (delta <= SOON_MS) {
      return 'soon';
    }
    return 'upcoming';
  });
  protected readonly text = computed(() => {
    const due = this.due();
    if (due == null) {
      return '—';
    }
    const delta = due.getTime() - this.now().getTime();
    return delta < 0 ? `${fmt(-delta)} overdue` : `in ${fmt(delta)}`;
  });
}
