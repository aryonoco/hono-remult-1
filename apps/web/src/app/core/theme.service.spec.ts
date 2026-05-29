import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to system when nothing is stored', () => {
    expect(TestBed.inject(ThemeService).theme()).toBe('system');
  });

  it('reads the persisted theme on construction', () => {
    localStorage.setItem('fire-theme', 'dark');
    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
  });

  it('setTheme persists and sets the data-theme attribute', () => {
    const service = TestBed.inject(ThemeService);
    service.setTheme('dark');
    TestBed.tick();
    expect(localStorage.getItem('fire-theme')).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('system mode removes the data-theme attribute', () => {
    const service = TestBed.inject(ThemeService);
    service.setTheme('dark');
    TestBed.tick();
    service.setTheme('system');
    TestBed.tick();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('cycle advances light -> dark -> system -> light', () => {
    const service = TestBed.inject(ThemeService);
    service.setTheme('light');
    service.cycle();
    expect(service.theme()).toBe('dark');
    service.cycle();
    expect(service.theme()).toBe('system');
    service.cycle();
    expect(service.theme()).toBe('light');
  });
});
