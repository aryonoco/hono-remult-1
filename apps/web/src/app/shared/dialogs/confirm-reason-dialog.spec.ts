import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import {
  ConfirmReasonDialogComponent,
  type ConfirmReasonDialogData,
} from './confirm-reason-dialog';

const data: ConfirmReasonDialogData = {
  title: 'Delete incident',
  message: 'Provide a reason.',
  confirmLabel: 'Delete',
};

const dialogRefStub = { close: vi.fn() };

async function createComponent(): Promise<ComponentFixture<ConfirmReasonDialogComponent>> {
  TestBed.configureTestingModule({
    imports: [ConfirmReasonDialogComponent],
    providers: [
      { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: dialogRefStub },
    ],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(ConfirmReasonDialogComponent);
  await fixture.whenStable();
  return fixture;
}

beforeEach(() => {
  dialogRefStub.close.mockClear();
});

describe('ConfirmReasonDialogComponent', () => {
  it('renders the supplied title and caps the textarea at LIMITS.description', async () => {
    const fixture = await createComponent();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.textContent).toContain('Delete incident');
    const textarea = host.querySelector('textarea');
    expect(textarea?.getAttribute('maxlength')).toBe('500');
  });

  it('disables Confirm until a non-blank reason is entered', async () => {
    const fixture = await createComponent();
    const comp = fixture.componentInstance as unknown as { reason: { setValue(v: string): void } };
    const buttons =
      await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatButtonHarness);
    const confirm = buttons[1]!;
    expect(await confirm.isDisabled()).toBe(true);

    comp.reason.setValue('   ');
    TestBed.tick();
    expect(await confirm.isDisabled()).toBe(true);

    comp.reason.setValue('  cleanup  ');
    TestBed.tick();
    expect(await confirm.isDisabled()).toBe(false);
  });

  it('closes with a trimmed reason on confirm', async () => {
    const fixture = await createComponent();
    const comp = fixture.componentInstance as unknown as { reason: { setValue(v: string): void } };
    comp.reason.setValue('  cleanup  ');
    TestBed.tick();
    const buttons =
      await TestbedHarnessEnvironment.loader(fixture).getAllHarnesses(MatButtonHarness);
    await buttons[1]!.click();
    expect(dialogRefStub.close).toHaveBeenCalledWith({ reason: 'cleanup' });
  });
});
