import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import {
  FIRE_STATUS_LABELS,
  FIRE_STATUS_VALUES,
  FireStatus,
  statusTone,
} from '@workspace/shared-domain';
import { StatusBadgeComponent } from './status-badge';

async function renderSpan(status: FireStatus): Promise<HTMLSpanElement> {
  const fixture = TestBed.createComponent(StatusBadgeComponent);
  fixture.componentRef.setInput('status', status);
  await fixture.whenStable();
  return (fixture.nativeElement as HTMLElement).querySelector('span')!;
}

describe('StatusBadgeComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  it('renders the label plus the tone surface/text classes for a status', async () => {
    const span = await renderSpan(FireStatus.going);
    const tone = statusTone(FireStatus.going);
    expect(span.textContent?.trim()).toBe(FIRE_STATUS_LABELS.going);
    expect(span.classList.contains(`bg-status-${tone}-bg`)).toBe(true);
    expect(span.classList.contains(`text-status-${tone}`)).toBe(true);
  });

  it('renders a non-empty label and a tone surface class for every FireStatus', async () => {
    const spans = await Promise.all(FIRE_STATUS_VALUES.map((status) => renderSpan(status)));
    FIRE_STATUS_VALUES.forEach((status, index) => {
      const span = spans[index]!;
      expect(span.textContent?.trim()).toBe(FIRE_STATUS_LABELS[status]);
      expect(span.classList.contains(`bg-status-${statusTone(status)}-bg`)).toBe(true);
    });
  });

  it('defaults to a span (no anchor) when link is omitted', async () => {
    const span = await renderSpan(FireStatus.going);
    expect(span).not.toBeNull();
    const host = span.parentElement as HTMLElement;
    expect(host.querySelector('a')).toBeNull();
  });

  it('renders an anchor with the tone classes, routerLink and queryParams when link is set', async () => {
    const fixture = TestBed.createComponent(StatusBadgeComponent);
    fixture.componentRef.setInput('status', FireStatus.going);
    fixture.componentRef.setInput('link', '/incidents');
    fixture.componentRef.setInput('queryParams', { tone: 'going' });
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('span')).toBeNull();
    const anchor = host.querySelector('a') as HTMLAnchorElement;
    expect(anchor).not.toBeNull();
    expect(anchor.textContent?.trim()).toBe(FIRE_STATUS_LABELS.going);
    expect(anchor.getAttribute('href')).toBe('/incidents?tone=going');
    const tone = statusTone(FireStatus.going);
    expect(anchor.classList.contains(`bg-status-${tone}-bg`)).toBe(true);
    expect(anchor.classList.contains(`text-status-${tone}`)).toBe(true);
  });
});
