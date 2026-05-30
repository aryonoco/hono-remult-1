import { TestBed } from '@angular/core/testing';
import {
  FIRE_STATUS_LABELS,
  FIRE_STATUS_VALUES,
  FireStatus,
  STATUS_BADGE_BASE,
  STATUS_BADGE_CLASSES,
} from '@workspace/shared-domain';
import { StatusBadgeComponent } from './status-badge';

function renderSpan(status: FireStatus): HTMLSpanElement {
  const fixture = TestBed.createComponent(StatusBadgeComponent);
  fixture.componentRef.setInput('status', status);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).querySelector('span')!;
}

// Angular's [class] binding re-emits the tokens in its own order, so assert per-token membership
// rather than a contiguous substring.
function hasAllClasses(span: HTMLSpanElement, classes: string): boolean {
  return classes.split(' ').every((cls) => span.classList.contains(cls));
}

describe('StatusBadgeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('renders the label plus the base and status classes for a status', () => {
    const span = renderSpan(FireStatus.going);
    expect(span.textContent?.trim()).toBe(FIRE_STATUS_LABELS.going);
    expect(hasAllClasses(span, STATUS_BADGE_BASE)).toBe(true);
    expect(hasAllClasses(span, STATUS_BADGE_CLASSES.going)).toBe(true);
  });

  it('renders a non-empty label and a badge class for every FireStatus', () => {
    for (const status of FIRE_STATUS_VALUES) {
      const span = renderSpan(status);
      expect(span.textContent?.trim()).toBe(FIRE_STATUS_LABELS[status]);
      expect(hasAllClasses(span, STATUS_BADGE_CLASSES[status])).toBe(true);
    }
  });
});
