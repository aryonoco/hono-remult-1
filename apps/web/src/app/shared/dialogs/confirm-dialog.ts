import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';

export interface ConfirmDialogData {
  title: string;
  message: string;
  confirmLabel: string;
}

// A plain yes/no confirmation. Cancel closes with `undefined`; Confirm closes with `true`.
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content class="min-w-72">
      <p class="m-0 text-on-surface-variant">{{ data.message }}</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end" class="gap-2">
      <button matButton mat-dialog-close type="button">Cancel</button>
      <!-- This dialog has no input content, so the focus trap would otherwise land on Cancel (first
           tabbable). cdkFocusInitial puts initial focus on the primary action instead (FORM-2). -->
      <button matButton="filled" type="button" cdkFocusInitial (click)="dialogRef.close(true)">
        {{ data.confirmLabel }}
      </button>
    </mat-dialog-actions>
  `,
})
export class ConfirmDialogComponent {
  protected readonly data = inject<ConfirmDialogData>(MAT_DIALOG_DATA);
  protected readonly dialogRef =
    inject<MatDialogRef<ConfirmDialogComponent, boolean>>(MatDialogRef);
}
