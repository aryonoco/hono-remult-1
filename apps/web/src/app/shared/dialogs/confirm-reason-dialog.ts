import { Component, inject } from '@angular/core';
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
  imports: [
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    ReactiveFormsModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <p>{{ data.message }}</p>
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
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Cancel</button>
      <button
        mat-flat-button
        type="button"
        [disabled]="reason.invalid || reason.value.trim().length === 0"
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

  protected confirm(): void {
    this.dialogRef.close({ reason: this.reason.value.trim() });
  }
}
