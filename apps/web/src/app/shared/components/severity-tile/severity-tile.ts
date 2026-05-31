import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  INCIDENT_LEVEL_LABELS,
  type IncidentLevel,
  type StatusTone,
} from '@workspace/shared-domain';
import { SEVERITY_TILE_TONE } from '../../ui/tone-classes';

const LEVEL_DIGIT: Readonly<Record<IncidentLevel, string>> = {
  levelOne: '1',
  levelTwo: '2',
  levelThree: '3',
};

@Component({
  selector: 'app-severity-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-grid place-items-center rounded-card font-display font-extrabold' },
  template: `<span
    [class]="toneClass()"
    class="grid h-8 w-8 place-items-center rounded-card text-base leading-none"
    role="img"
    [attr.aria-label]="label()"
    >{{ digit() }}</span
  >`,
})
export class SeverityTileComponent {
  readonly level = input.required<IncidentLevel>();
  readonly tone = input.required<StatusTone>();
  readonly major = input(false);
  protected readonly digit = computed(() => LEVEL_DIGIT[this.level()]);
  protected readonly toneClass = computed(() => SEVERITY_TILE_TONE[this.tone()]);
  protected readonly label = computed(
    () => `${INCIDENT_LEVEL_LABELS[this.level()]}${this.major() ? ', declared major' : ''}`,
  );
}
