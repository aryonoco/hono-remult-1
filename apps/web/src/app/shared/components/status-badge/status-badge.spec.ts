import { TestBed } from '@angular/core/testing';
import {
  FIRE_STATUS_LABELS,
  FIRE_STATUS_VALUES,
  FireStatus,
  statusTone,
} from '@workspace/shared-domain';
import { StatusBadgeComponent } from './status-badge';

function renderSpan(status: FireStatus): HTMLSpanElement {
  const fixture = TestBed.createComponent(StatusBadgeComponent);
  fixture.componentRef.setInput('status', status);
  fixture.detectChanges();
  return (fixture.nativeElement as HTMLElement).querySelector('span')!;
}

describe('StatusBadgeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('renders the label plus the tone surface/text classes for a status', () => {
    const span = renderSpan(FireStatus.going);
    const tone = statusTone(FireStatus.going);
    expect(span.textContent?.trim()).toBe(FIRE_STATUS_LABELS.going);
    expect(span.classList.contains(`bg-status-${tone}-bg`)).toBe(true);
    expect(span.classList.contains(`text-status-${tone}`)).toBe(true);
  });

  it('renders a non-empty label and a tone surface class for every FireStatus', () => {
    for (const status of FIRE_STATUS_VALUES) {
      const span = renderSpan(status);
      expect(span.textContent?.trim()).toBe(FIRE_STATUS_LABELS[status]);
      expect(span.classList.contains(`bg-status-${statusTone(status)}-bg`)).toBe(true);
    }
  });
});
