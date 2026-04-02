import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { DEV_USERS } from '@workspace/shared-domain';
import { InMemoryDataProvider, remult } from 'remult';
import { App } from './app';
import { provideRemult } from './core/remult.provider';

describe('App', () => {
  beforeEach(async () => {
    remult.dataProvider = new InMemoryDataProvider();
    remult.user = DEV_USERS[0];
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
