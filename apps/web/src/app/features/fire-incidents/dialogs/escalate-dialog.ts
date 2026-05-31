import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatRadioModule } from '@angular/material/radio';
import {
  INCIDENT_LEVEL_LABELS,
  INCIDENT_LEVEL_VALUES,
  type IncidentLevel,
  LEVEL_ORDER,
} from '@workspace/shared-domain';

export interface EscalateDialogData {
  currentLevel: IncidentLevel;
}

// Offers only the incident levels strictly above the current one; closes with the chosen level (or
// `undefined` on cancel). At the highest level the option list is empty and Confirm stays disabled.
@Component({
  selector: 'app-escalate-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule, MatRadioModule, ReactiveFormsModule],
  template: `
    <h2 mat-dialog-title>Escalate incident</h2>
    <mat-dialog-content>
      @if (levels.length === 0) {
        <p>Already at the highest level.</p>
      } @else {
        <mat-radio-group [formControl]="selected" class="flex flex-col gap-2">
          @for (level of levels; track level) {
            <mat-radio-button [value]="level">{{ labels[level] }}</mat-radio-button>
          }
        </mat-radio-group>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton mat-dialog-close type="button">Cancel</button>
      <button
        matButton="filled"
        type="button"
        [disabled]="!canConfirm()"
        (click)="confirm()"
      >
        Escalate
      </button>
    </mat-dialog-actions>
  `,
})
export class EscalateDialogComponent {
  protected readonly data = inject<EscalateDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<EscalateDialogComponent, IncidentLevel>>(MatDialogRef);

  protected readonly labels = INCIDENT_LEVEL_LABELS;
  protected readonly levels: readonly IncidentLevel[] = INCIDENT_LEVEL_VALUES.filter(
    (level) => LEVEL_ORDER[level] > LEVEL_ORDER[this.data.currentLevel],
  );
  protected readonly selected = new FormControl<IncidentLevel | null>(null);
  private readonly selectedValue = toSignal(this.selected.valueChanges, {
    initialValue: this.selected.value,
  });
  protected readonly canConfirm = computed(() => this.selectedValue() !== null);

  protected confirm(): void {
    const level = this.selected.value;
    if (level) {
      this.dialogRef.close(level);
    }
  }
}
