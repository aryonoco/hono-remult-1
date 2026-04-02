import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { InMemoryDataProvider, remult } from 'remult';
import { App } from './app';
import { provideRemult } from './core/remult.provider';

describe('App', () => {
  beforeEach(async () => {
    remult.dataProvider = new InMemoryDataProvider();
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRemult(), provideHttpClientTesting()],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render title', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Tasks');
  });
});
