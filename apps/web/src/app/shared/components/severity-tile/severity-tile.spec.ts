import { TestBed } from '@angular/core/testing';
import { findAxeViolations } from '../../../../testing/axe-helper';
import { SeverityTileComponent } from './severity-tile';

function glyphOf(host: HTMLElement): HTMLElement {
  // The tile renders a single <span> glyph that carries role="img".
  const el = host.querySelector('span');
  return el as HTMLElement;
}

describe('SeverityTileComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('renders the level digit, tone fill and a descriptive label for a major incident', async () => {
    const fixture = TestBed.createComponent(SeverityTileComponent);
    fixture.componentRef.setInput('level', 'levelThree');
    fixture.componentRef.setInput('tone', 'going');
    fixture.componentRef.setInput('major', true);
    await fixture.whenStable();

    const host = fixture.nativeElement as HTMLElement;
    const glyph = glyphOf(host);
    expect(glyph.getAttribute('role')).toBe('img');
    expect(glyph.textContent?.trim()).toBe('3');
    expect(glyph.classList.contains('bg-status-going')).toBe(true);
    const label = glyph.getAttribute('aria-label') ?? '';
    expect(label).toContain('Level 3');
    expect(label.toLowerCase()).toContain('major');

    expect(await findAxeViolations(host)).toEqual([]);
  });

  it('omits the major qualifier when not declared major', async () => {
    const fixture = TestBed.createComponent(SeverityTileComponent);
    fixture.componentRef.setInput('level', 'levelOne');
    fixture.componentRef.setInput('tone', 'safe');
    await fixture.whenStable();

    const glyph = glyphOf(fixture.nativeElement as HTMLElement);
    expect(glyph.textContent?.trim()).toBe('1');
    expect(glyph.getAttribute('aria-label')).toBe('Level 1');
  });
});
