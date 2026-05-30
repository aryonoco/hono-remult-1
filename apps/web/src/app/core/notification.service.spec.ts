import { TestBed } from '@angular/core/testing';
import { MatSnackBar, type MatSnackBarConfig } from '@angular/material/snack-bar';
import { NotificationService } from './notification.service';

interface OpenCall {
  message: string;
  action: string;
  config: MatSnackBarConfig;
}

describe('NotificationService', () => {
  let calls: OpenCall[];

  beforeEach(() => {
    calls = [];
    const snackBarStub = {
      open(message: string, action: string, config: MatSnackBarConfig): void {
        calls.push({ message, action, config });
      },
    };
    TestBed.configureTestingModule({
      providers: [{ provide: MatSnackBar, useValue: snackBarStub }],
    });
  });

  it('success opens a polite, success-classed snackbar with a Dismiss action', () => {
    TestBed.inject(NotificationService).success('Saved');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.message).toBe('Saved');
    expect(calls[0]!.action).toBe('Dismiss');
    expect(calls[0]!.config.politeness).toBe('polite');
    expect(calls[0]!.config.panelClass).toEqual(['app-notification-success']);
  });

  it('error opens an assertive, error-classed snackbar', () => {
    TestBed.inject(NotificationService).error('Boom');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.message).toBe('Boom');
    expect(calls[0]!.config.politeness).toBe('assertive');
    expect(calls[0]!.config.panelClass).toEqual(['app-notification-error']);
  });
});
