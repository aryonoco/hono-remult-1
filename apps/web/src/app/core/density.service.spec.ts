import { TestBed } from '@angular/core/testing';
import { DensityService } from './density.service';

describe('DensityService', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-density');
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-density');
  });

  it('defaults to compact when nothing is stored', () => {
    expect(TestBed.inject(DensityService).density()).toBe('compact');
  });

  it('reads the persisted density on construction', () => {
    localStorage.setItem('fire-density', 'comfortable');
    expect(TestBed.inject(DensityService).density()).toBe('comfortable');
  });

  it('ignores an unknown stored value and falls back to compact', () => {
    localStorage.setItem('fire-density', 'spacious');
    expect(TestBed.inject(DensityService).density()).toBe('compact');
  });

  it('setDensity persists and reflects the data-density attribute', () => {
    const service = TestBed.inject(DensityService);
    service.setDensity('comfortable');
    TestBed.tick();
    expect(localStorage.getItem('fire-density')).toBe('comfortable');
    expect(document.documentElement.getAttribute('data-density')).toBe('comfortable');
  });

  it('reflects the default density to the attribute on first effect run', () => {
    TestBed.inject(DensityService);
    TestBed.tick();
    expect(document.documentElement.getAttribute('data-density')).toBe('compact');
  });

  it('toggle flips between compact and comfortable', () => {
    const service = TestBed.inject(DensityService);
    expect(service.density()).toBe('compact');
    service.toggle();
    expect(service.density()).toBe('comfortable');
    service.toggle();
    expect(service.density()).toBe('compact');
  });
});
