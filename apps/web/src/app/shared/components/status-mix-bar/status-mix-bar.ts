import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  FIRE_STATUS_VALUES,
  type FireStatus,
  type StatusTone,
  statusTone,
} from '@workspace/shared-domain';
import { SPINE_TONE } from '../../ui/tone-classes';

interface Segment {
  tone: StatusTone;
  count: number;
  pct: number;
  label: string;
  class: string;
}

const TONE_LABEL: Readonly<Record<StatusTone, string>> = {
  going: 'Going',
  contained: 'Contained',
  controlled: 'Under control',
  safe: 'Safe',
  neutral: 'Resolved',
  missing: 'Not found',
};
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
  template: `
    <div class="flex h-3 overflow-hidden rounded-field" role="img" [attr.aria-label]="summary()">
      @for (s of segments(); track s.tone) {
        <span [class]="s.class" [style.width.%]="s.pct"></span>
      }
    </div>
    <dl class="mt-2.5 grid grid-cols-2 gap-x-3.5 gap-y-1.5 text-xs text-on-surface-variant">
      @for (s of segments(); track s.tone) {
        <div class="flex items-center gap-1.5">
          <span class="h-3 w-3 rounded-sm" [class]="s.class" aria-hidden="true"></span>
          <dt>{{ s.label }}</dt>
          <dd class="ms-auto font-mono text-on-surface">{{ s.count }}</dd>
        </div>
      }
    </dl>
  `,
})
export class StatusMixBarComponent {
  readonly counts = input.required<Readonly<Record<FireStatus, number>>>();
  protected readonly segments = computed<readonly Segment[]>(() => {
    const c = this.counts();
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
        label: TONE_LABEL[tone],
        class: SPINE_TONE[tone],
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
