import type { FormGroup } from '@angular/forms';
import type { MatDialog } from '@angular/material/dialog';
import type { CanDeactivateFn } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { ConfirmDialogComponent, type ConfirmDialogData } from '../dialogs/confirm-dialog';

// Implemented by every form component so a single route guard can prompt before discarding edits.
export interface CanComponentDeactivate {
  canDeactivate(): boolean | Promise<boolean>;
}

// Returns `true` immediately when there is nothing to lose (no form, or pristine); otherwise opens the
// shared confirm dialog and resolves to the user's choice. A successful submit marks the form pristine, so
// the post-save navigation passes straight through without a prompt.
export function confirmDiscardIfDirty(
  dialog: MatDialog,
  form?: FormGroup,
): boolean | Promise<boolean> {
  if (!form?.dirty) {
    return true;
  }
  return firstValueFrom(
    dialog
      .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
        data: {
          title: 'Discard changes?',
          message: 'You have unsaved changes. Leave without saving?',
          confirmLabel: 'Discard',
        },
      })
      .afterClosed(),
  ).then((result) => result === true);
}

export const unsavedChangesGuard: CanDeactivateFn<CanComponentDeactivate> = (
  component: CanComponentDeactivate,
) => component.canDeactivate();
