import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { LIMITS } from '@workspace/shared-domain';

export interface ConfirmReasonDialogData {
  title: string;
  message: string;
  confirmLabel: string;
}

export interface ConfirmReasonDialogResult {
  reason: string;
}

// Shared by soft-delete and remove-sign-off: a confirmation requiring a free-text reason. The caller
// supplies the copy and forwards `reason` to the matching BackendMethod.
@Component({
  selector: 'app-confirm-reason-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content class="min-w-80">
      <p class="mt-0 mb-3 text-on-surface-variant">{{ data.message }}</p>
      <mat-form-field class="w-full">
        <mat-label>Reason</mat-label>
        <textarea
          matInput
          [formControl]="reason"
          [maxlength]="maxLength"
          rows="3"
          required
        ></textarea>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="gap-2">
      <button matButton mat-dialog-close type="button">Cancel</button>
      <button
        matButton="filled"
        type="button"
        [disabled]="!canConfirm()"
        (click)="confirm()"
      >
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmReasonDialogComponent {
  protected readonly data = inject<ConfirmReasonDialogData>(MAT_DIALOG_DATA);
  private readonly dialogRef =
    inject<MatDialogRef<ConfirmReasonDialogComponent, ConfirmReasonDialogResult>>(MatDialogRef);

  protected readonly maxLength = LIMITS.description;
  protected readonly reason = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.maxLength(LIMITS.description)],
  });
  private readonly reasonValue = toSignal(this.reason.valueChanges, {
    initialValue: this.reason.value,
  });
  private readonly reasonStatus = toSignal(this.reason.statusChanges, {
    initialValue: this.reason.status,
  });
  protected readonly canConfirm = computed(
    () => this.reasonStatus() === 'VALID' && this.reasonValue().trim().length > 0,
  );

  protected confirm(): void {
    this.dialogRef.close({ reason: this.reason.value.trim() });
  }
}
