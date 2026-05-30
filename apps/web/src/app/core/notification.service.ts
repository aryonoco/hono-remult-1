import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

const SUCCESS_DURATION_MS = 4000;
const ERROR_DURATION_MS = 8000;
const DISMISS_ACTION = 'Dismiss';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snackBar = inject(MatSnackBar);

  success(message: string): void {
    this.snackBar.open(message, DISMISS_ACTION, {
      duration: SUCCESS_DURATION_MS,
      politeness: 'polite',
      panelClass: ['app-notification-success'],
    });
  }

  error(message: string): void {
    this.snackBar.open(message, DISMISS_ACTION, {
      duration: ERROR_DURATION_MS,
      politeness: 'assertive',
      panelClass: ['app-notification-error'],
    });
  }
}
