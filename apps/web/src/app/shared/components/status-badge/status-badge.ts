import { Component, computed, input } from '@angular/core';
import {
  FIRE_STATUS_LABELS,
  type FireStatus,
  STATUS_BADGE_BASE,
  STATUS_BADGE_CLASSES,
} from '@workspace/shared-domain';

@Component({
  selector: 'app-status-badge',
  template: `<span [class]="classes()">{{ label() }}</span>`,
})
export class StatusBadgeComponent {
  readonly status = input.required<FireStatus>();
  protected readonly label = computed(() => FIRE_STATUS_LABELS[this.status()]);
  protected readonly classes = computed(
    () => `${STATUS_BADGE_BASE} ${STATUS_BADGE_CLASSES[this.status()]}`,
  );
}
