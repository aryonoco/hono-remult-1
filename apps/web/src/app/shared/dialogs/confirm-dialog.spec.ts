import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { ConfirmDialogComponent, type ConfirmDialogData } from './confirm-dialog';

const data: ConfirmDialogData = {
  title: 'Sign off final report',
  message: 'Signing off locks the report.',
  confirmLabel: 'Sign off',
};

const dialogRefStub = { close: vi.fn() };

async function createComponent(): Promise<ComponentFixture<ConfirmDialogComponent>> {
  TestBed.configureTestingModule({
    imports: [ConfirmDialogComponent],
    providers: [
      { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: dialogRefStub },
    ],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(ConfirmDialogComponent);
  fixture.detectChanges();
  return fixture;
}

beforeEach(() => {
  dialogRefStub.close.mockClear();
});

describe('ConfirmDialogComponent', () => {
  it('renders the supplied title and message', async () => {
    const fixture = await createComponent();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Sign off final report');
    expect(host.textContent).toContain('Signing off locks the report.');
  });

  it('closes with true on confirm', async () => {
    const fixture = await createComponent();
    const host = fixture.nativeElement as HTMLElement;
    (host.querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(dialogRefStub.close).toHaveBeenCalledWith(true);
  });
});
