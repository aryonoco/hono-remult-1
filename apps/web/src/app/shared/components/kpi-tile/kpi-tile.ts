import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { StatusTone } from '@workspace/shared-domain';
import { SPINE_TONE } from '../../ui/tone-classes';

@Component({
  selector: 'app-kpi-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NgTemplateOutlet],
  host: { class: 'block' },
  template: `
    @if (link()) {
      <a
        [routerLink]="link()"
        class="relative block overflow-hidden rounded-card border border-outline-variant bg-surface-container-low p-3.5 no-underline transition-colors hover:bg-surface-container-high focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <ng-container [ngTemplateOutlet]="content" />
      </a>
    } @else {
      <div
        class="relative overflow-hidden rounded-card border border-outline-variant bg-surface-container-low p-3.5"
      >
        <ng-container [ngTemplateOutlet]="content" />
      </div>
    }
    <ng-template #content>
      <span class="absolute inset-y-0 left-0 w-0.75" [class]="spineClass()" aria-hidden="true"></span>
      <span class="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-on-surface-variant">{{
        label()
      }}</span>
      <span
        class="mt-1 block font-mono text-2xl leading-none tabular-nums text-on-surface"
        [attr.role]="live() ? 'status' : null"
        >{{ value()
        }}<span class="text-xs text-on-surface-variant">{{ unit() ? ' ' + unit() : '' }}</span></span
      >
    </ng-template>
  `,
})
export class KpiTileComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly unit = input('');
  readonly tone = input<'accent' | StatusTone>('accent');
  readonly emphasis = input(false);
  readonly link = input<string | undefined>(undefined);
  readonly live = input(false);
  protected readonly spineClass = computed(() => {
    const t = this.tone();
    return t === 'accent' ? 'bg-primary' : SPINE_TONE[t];
  });
}
