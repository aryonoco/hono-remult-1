import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatButtonHarness } from '@angular/material/button/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatRadioButtonHarness } from '@angular/material/radio/testing';
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
  await fixture.whenStable();
  return fixture;
}

async function radioCount(fixture: ComponentFixture<EscalateDialogComponent>): Promise<number> {
  const loader = TestbedHarnessEnvironment.loader(fixture);
  return (await loader.getAllHarnesses(MatRadioButtonHarness)).length;
}

beforeEach(() => {
  dialogRefStub.close.mockClear();
});

describe('EscalateDialogComponent', () => {
  it('offers two levels above level one', async () => {
    const fixture = await createComponent(IncidentLevel.levelOne);
    expect(await radioCount(fixture)).toBe(2);
  });

  it('offers one level above level two', async () => {
    const fixture = await createComponent(IncidentLevel.levelTwo);
    expect(await radioCount(fixture)).toBe(1);
  });

  it('offers no levels and disables Confirm at level three', async () => {
    const fixture = await createComponent(IncidentLevel.levelThree);
    const host = fixture.nativeElement as HTMLElement;
    const loader = TestbedHarnessEnvironment.loader(fixture);
    expect(await radioCount(fixture)).toBe(0);
    expect(host.textContent).toContain('Already at the highest level.');
    const buttons = await loader.getAllHarnesses(MatButtonHarness);
    expect(await buttons[1]!.isDisabled()).toBe(true);
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
