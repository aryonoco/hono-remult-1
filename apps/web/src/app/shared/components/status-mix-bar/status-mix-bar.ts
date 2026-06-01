import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  FIRE_STATUS_VALUES,
  type FireStatus,
  STATUS_TONE_LABELS,
  type StatusTone,
  statusTone,
} from '@workspace/shared-domain';
import { SPINE_TONE } from '../../ui/tone-classes';

// A resolved drill-in target for one legend segment. `commands`/`queryParams` feed RouterLink directly,
// so the component stays route-agnostic — the caller decides where each tone navigates.
interface SegmentLink {
  commands: unknown[];
  queryParams: Record<string, string | number>;
}

interface Segment {
  tone: StatusTone;
  count: number;
  pct: number;
  label: string;
  class: string;
  // Accessible name for the linked legend row, e.g. "Going: 1 incident" / "Safe: 12 incidents"
  // (count-correct singular/plural, since the bare count is not self-describing to a screen reader).
  ariaLabel: string;
  // Present only when `segmentLink` is supplied; the legend then renders a linked <ul>/<li>/<a> row.
  link: SegmentLink | undefined;
}

const TONE_ORDER: readonly StatusTone[] = [
  'going',
  'contained',
  'controlled',
  'safe',
  'missing',
  'neutral',
];
const PERCENT: number = 100;

@Component({
  selector: 'app-status-mix-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="flex h-3 overflow-hidden rounded-field" role="img" [attr.aria-label]="summary()">
      @for (s of segments(); track s.tone) {
        <span [class]="s.class" [style.width.%]="s.pct"></span>
      }
    </div>
    @if (segmentLink()) {
      <ul class="mt-2.5 grid list-none grid-cols-2 gap-x-3.5 gap-y-1 p-0 text-xs text-on-surface-variant">
        @for (s of segments(); track s.tone) {
          <li>
            <a
              [routerLink]="s.link!.commands"
              [queryParams]="s.link!.queryParams"
              [attr.aria-label]="s.ariaLabel"
              class="flex min-h-6 items-center gap-1.5 rounded-sm px-1 -mx-1 no-underline transition-colors hover:bg-surface-container-high hover:text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span class="h-3 w-3 rounded-sm" [class]="s.class" aria-hidden="true"></span>
              <span>{{ s.label }}</span>
              <span class="ms-auto font-mono text-on-surface">{{ s.count }}</span>
            </a>
          </li>
        }
      </ul>
    } @else {
      <dl class="mt-2.5 grid grid-cols-2 gap-x-3.5 gap-y-1.5 text-xs text-on-surface-variant">
        @for (s of segments(); track s.tone) {
          <div class="flex items-center gap-1.5">
            <span class="h-3 w-3 rounded-sm" [class]="s.class" aria-hidden="true"></span>
            <dt>{{ s.label }}</dt>
            <dd class="ms-auto font-mono text-on-surface">{{ s.count }}</dd>
          </div>
        }
      </dl>
    }
  `,
})
export class StatusMixBarComponent {
  readonly counts = input.required<Readonly<Record<FireStatus, number>>>();
  // Optional route-agnostic drill-in factory. When supplied, the legend becomes a list of links; the
  // factory is called once per rendered tone inside segments() (never repeatedly in the template).
  readonly segmentLink = input<((tone: StatusTone) => SegmentLink) | undefined>(undefined);
  protected readonly segments = computed<readonly Segment[]>(() => {
    const c = this.counts();
    const linkFor = this.segmentLink();
    const byTone = new Map<StatusTone, number>();
    for (const s of FIRE_STATUS_VALUES) {
      const n = c[s] ?? 0;
      if (n > 0) {
        const tone = statusTone(s);
        byTone.set(tone, (byTone.get(tone) ?? 0) + n);
      }
    }
    const total = [...byTone.values()].reduce((a, b) => a + b, 0) || 1;
    const result: Segment[] = [];
    for (const tone of TONE_ORDER) {
      const count = byTone.get(tone);
      if (count === undefined) {
        continue;
      }
      result.push({
        tone,
        count,
        pct: (count / total) * PERCENT,
        label: STATUS_TONE_LABELS[tone],
        class: SPINE_TONE[tone],
        ariaLabel: `${STATUS_TONE_LABELS[tone]}: ${count} ${count === 1 ? 'incident' : 'incidents'}`,
        link: linkFor ? linkFor(tone) : undefined,
      });
    }
    return result;
  });
  protected readonly summary = computed(
    () =>
      this.segments()
        .map((s) => `${s.count} ${s.label.toLowerCase()}`)
        .join(', ') || 'No active incidents',
  );
}
