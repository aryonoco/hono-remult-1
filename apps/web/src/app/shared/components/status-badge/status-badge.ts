import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  FIRE_STATUS_LABELS,
  type FireStatus,
  type StatusTone,
  statusTone,
} from '@workspace/shared-domain';

// Instrument-style status chip. Foreground (text + hairline border) and a tinted surface come from the
// theme-aware `--color-status-*` tokens (tailwind.css), so the same markup is AA-legible in light, dark
// and system modes. Class strings are static literals per tone so Tailwind keeps them in the build.
const BADGE_BASE =
  'inline-flex items-center gap-1.5 rounded-md border border-current/25 px-2 py-0.5 text-xs font-semibold leading-5';

const TONE_CLASSES: Readonly<Record<StatusTone, string>> = {
  going: 'text-status-going bg-status-going-bg',
  contained: 'text-status-contained bg-status-contained-bg',
  controlled: 'text-status-controlled bg-status-controlled-bg',
  safe: 'text-status-safe bg-status-safe-bg',
  neutral: 'text-status-neutral bg-status-neutral-bg',
  missing: 'text-status-missing bg-status-missing-bg',
};

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span [class]="classes()">{{ label() }}</span>`,
})
export class StatusBadgeComponent {
  readonly status = input.required<FireStatus>();
  protected readonly label = computed(() => FIRE_STATUS_LABELS[this.status()]);
  protected readonly classes = computed(
    () => `${BADGE_BASE} ${TONE_CLASSES[statusTone(this.status())]}`,
  );
}
