import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { IncidentLevel } from '@workspace/shared-domain';
import { EscalateDialogComponent, type EscalateDialogData } from './escalate-dialog';

const dialogRefStub = { close: vi.fn() };

async function createComponent(
  currentLevel: IncidentLevel,
): Promise<ComponentFixture<EscalateDialogComponent>> {
  const data: EscalateDialogData = { currentLevel };
  TestBed.configureTestingModule({
    imports: [EscalateDialogComponent],
    providers: [
      { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
      { provide: MAT_DIALOG_DATA, useValue: data },
      { provide: MatDialogRef, useValue: dialogRefStub },
    ],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(EscalateDialogComponent);
  fixture.detectChanges();
  return fixture;
}

function radioCount(fixture: ComponentFixture<EscalateDialogComponent>): number {
  return (fixture.nativeElement as HTMLElement).querySelectorAll('mat-radio-button').length;
}

beforeEach(() => {
  dialogRefStub.close.mockClear();
});

describe('EscalateDialogComponent', () => {
  it('offers two levels above level one', async () => {
    const fixture = await createComponent(IncidentLevel.levelOne);
    expect(radioCount(fixture)).toBe(2);
  });

  it('offers one level above level two', async () => {
    const fixture = await createComponent(IncidentLevel.levelTwo);
    expect(radioCount(fixture)).toBe(1);
  });

  it('offers no levels and disables Confirm at level three', async () => {
    const fixture = await createComponent(IncidentLevel.levelThree);
    const host = fixture.nativeElement as HTMLElement;
    expect(radioCount(fixture)).toBe(0);
    expect(host.textContent).toContain('Already at the highest level.');
    const confirm = host.querySelectorAll('button')[1] as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
  });

  it('closes with the chosen level on confirm', async () => {
    const fixture = await createComponent(IncidentLevel.levelOne);
    const comp = fixture.componentInstance as unknown as {
      selected: { setValue(v: IncidentLevel): void };
      confirm(): void;
    };
    comp.selected.setValue(IncidentLevel.levelTwo);
    comp.confirm();
    expect(dialogRefStub.close).toHaveBeenCalledWith(IncidentLevel.levelTwo);
  });
});
