import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
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
// When the badge is a link, add an underline affordance on hover/focus (colour is never the sole signal)
// plus a visible focus ring. Static literal so Tailwind retains the utilities.
const LINK_AFFORDANCE =
  'no-underline transition-colors hover:underline focus-visible:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary';

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
  imports: [RouterLink],
  // HAZARD: the link form renders an <a>. It MUST NOT be placed inside another anchor (no nested <a> —
  // invalid HTML and an a11y trap). Only use `link` in non-anchor contexts, e.g. the incident-list
  // desktop table Status cell. In anchor contexts (cards/rows already wrapped in a RouterLink) use the
  // plain badge (omit `link`) so the row link stays the single navigation target.
  template: `
    @if (link()) {
      <a [routerLink]="link()" [queryParams]="queryParams()" [class]="linkClasses()">{{ label() }}</a>
    } @else {
      <span [class]="classes()">{{ label() }}</span>
    }
  `,
})
export class StatusBadgeComponent {
  readonly status = input.required<FireStatus>();
  readonly link = input<string | undefined>(undefined);
  // Optional query params for the link form. RouterLink ignores an undefined value, so callers that
  // supply only `link` still navigate cleanly. Ignored entirely when `link` is absent.
  readonly queryParams = input<Record<string, string | number> | undefined>(undefined);
  protected readonly label = computed(() => FIRE_STATUS_LABELS[this.status()]);
  protected readonly classes = computed(
    () => `${BADGE_BASE} ${TONE_CLASSES[statusTone(this.status())]}`,
  );
  protected readonly linkClasses = computed(() => `${this.classes()} ${LINK_AFFORDANCE}`);
}
