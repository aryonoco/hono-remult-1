import { LiveAnnouncer } from '@angular/cdk/a11y';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  resource,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FinalReport,
  FireIncident,
  INCIDENT_LEVEL_LABELS,
  type IncidentLevel,
  POTENTIAL_LABELS,
  type Potential,
} from '@workspace/shared-domain';
import { ResultAsync } from 'neverthrow';
import { remult } from 'remult';
import { firstValueFrom, map } from 'rxjs';

import { DevAuthService } from '../../../core/dev-auth.service';
import { NotificationService } from '../../../core/notification.service';
import {
  canCreateFinalReport,
  canCreateSitrep,
  canEditFire,
  canEscalate,
  canRemoveSignOff,
  canSignOff,
  canSoftDelete,
  canViewFinalReport,
} from '../../../shared/auth/permissions';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge';
import {
  ConfirmDialogComponent,
  type ConfirmDialogData,
} from '../../../shared/dialogs/confirm-dialog';
import {
  ConfirmReasonDialogComponent,
  type ConfirmReasonDialogData,
  type ConfirmReasonDialogResult,
} from '../../../shared/dialogs/confirm-reason-dialog';
import { toErrorMessage } from '../../../shared/util/to-error-message';
import { EscalateDialogComponent, type EscalateDialogData } from '../dialogs/escalate-dialog';
import { FinalReportPanelComponent } from './final-report-panel';

interface FireRequest {
  id: string;
  userId: string;
  includeFinal: boolean;
}

@Component({
  selector: 'app-incident-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatExpansionModule,
    MatProgressBarModule,
    StatusBadgeComponent,
    FinalReportPanelComponent,
  ],
  templateUrl: './incident-detail.html',
})
export class IncidentDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly devAuth = inject(DevAuthService);
  private readonly notification = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly announcer = inject(LiveAnnouncer);

  private readonly incidentId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );
  private readonly currentUser = this.devAuth.currentUser;

  // Anonymous (or a missing id) yields no request, so the resource stays `idle` and the loader is skipped —
  // an anonymous read of `FireIncident` is a 403, not a row. Including `finalReport` is gated on read
  // permission so a viewer's GET is not rejected. The request recomputes (and reloads) on a user switch.
  private readonly fireResource = resource({
    params: (): FireRequest | undefined => {
      const user = this.currentUser();
      const id = this.incidentId();
      if (!(user && id)) {
        return;
      }
      return { id, userId: user.id, includeFinal: canViewFinalReport(user) };
    },
    // The loader does not wrap-and-consume with neverthrow: `resource()` IS the error channel here (a
    // rejection lands in `status() === 'error'` / `error()`, surfaced via `errorMessage`), the same way
    // LiveQuery errors use Remult's built-in handling. Wrapping only to re-throw would be empty ceremony.
    loader: async ({ params }: { params: FireRequest }): Promise<FireIncident | undefined> => {
      const fire = await remult.repo(FireIncident).findId(params.id, {
        include: {
          district: true,
          situationReports: true,
          finalReport: params.includeFinal,
        },
      });
      return fire ?? undefined;
    },
  });

  protected readonly status = this.fireResource.status;
  protected readonly isLoading = this.fireResource.isLoading;
  protected readonly errorMessage = computed(() => {
    const cause = this.fireResource.error();
    return cause ? toErrorMessage(cause) : '';
  });

  protected readonly fire = computed(() =>
    this.fireResource.hasValue() ? this.fireResource.value() : undefined,
  );
  protected readonly sitreps = computed(() => {
    const list = this.fire()?.situationReports ?? [];
    return [...list].sort((a, b) => b.reportNumber - a.reportNumber);
  });
  protected readonly finalReport = computed(() => this.fire()?.finalReport);
  private readonly hasSitreps = computed(() => this.sitreps().length > 0);
  protected readonly hasFinalReport = computed(() => this.finalReport() !== undefined);
  private readonly isSignedOff = computed(() => this.finalReport()?.isSignedOff ?? false);

  protected readonly canEdit = computed(() => {
    const fire = this.fire();
    return fire
      ? canEditFire(fire, this.currentUser(), {
          hasSitreps: this.hasSitreps(),
          hasFinalReport: this.hasFinalReport(),
          isSignedOff: this.isSignedOff(),
        })
      : false;
  });
  protected readonly canEscalateFire = computed(() => {
    const fire = this.fire();
    return fire ? canEscalate(fire, this.currentUser(), this.isSignedOff()) : false;
  });
  protected readonly canNewSitrep = computed(() => {
    const fire = this.fire();
    return fire
      ? canCreateSitrep(fire, this.currentUser(), this.hasFinalReport(), this.isSignedOff())
      : false;
  });
  protected readonly canNewFinal = computed(() => {
    const fire = this.fire();
    return fire ? canCreateFinalReport(fire, this.currentUser(), this.hasFinalReport()) : false;
  });
  protected readonly canDelete = computed(() => {
    const fire = this.fire();
    return fire ? canSoftDelete(fire, this.currentUser(), this.isSignedOff()) : false;
  });
  protected readonly canViewFinal = computed(() => canViewFinalReport(this.currentUser()));
  protected readonly canSign = computed(() => {
    const fire = this.fire();
    const report = this.finalReport();
    return fire && report ? canSignOff(report, fire.status, this.currentUser()) : false;
  });
  protected readonly canRemoveSign = computed(() => {
    const report = this.finalReport();
    return report ? canRemoveSignOff(report, this.currentUser()) : false;
  });
  protected readonly canEditFinal = computed(() => {
    const report = this.finalReport();
    return this.canViewFinal() && report !== undefined && !report.isSignedOff;
  });

  private announcedId: string | null = null;

  constructor() {
    effect(() => {
      const fire = this.fire();
      if (fire && this.announcedId !== fire.id) {
        this.announcer.announce(`Incident ${fire.name} opened`, 'polite');
        this.announcedId = fire.id;
      }
    });
  }

  protected levelLabel(level: IncidentLevel): string {
    return INCIDENT_LEVEL_LABELS[level];
  }

  protected potentialLabel(potential: Potential): string {
    return POTENTIAL_LABELS[potential];
  }

  protected async onEscalate(): Promise<void> {
    const fire = this.fire();
    if (!fire) {
      return;
    }
    const level = await firstValueFrom(
      this.dialog
        .open<EscalateDialogComponent, EscalateDialogData, IncidentLevel>(EscalateDialogComponent, {
          data: { currentLevel: fire.incidentLevel },
        })
        .afterClosed(),
    );
    if (!level) {
      return;
    }
    await this.invoke(
      FireIncident.escalate(fire.id, level),
      `Incident escalated to ${INCIDENT_LEVEL_LABELS[level]}`,
      () => this.fireResource.reload(),
    );
  }

  protected async onDelete(): Promise<void> {
    const fire = this.fire();
    if (!fire) {
      return;
    }
    const result = await this.openReasonDialog({
      title: 'Delete incident',
      message:
        'Soft-delete this incident? Provide a reason. This hides it and its reports from the list.',
      confirmLabel: 'Delete',
    });
    if (!result) {
      return;
    }
    await this.invoke(FireIncident.softDelete(fire.id, result.reason), 'Incident deleted', () => {
      this.router.navigate(['/incidents']);
    });
  }

  protected async onSignOff(): Promise<void> {
    const report = this.finalReport();
    if (!report) {
      return;
    }
    const confirmed = await firstValueFrom(
      this.dialog
        .open<ConfirmDialogComponent, ConfirmDialogData, boolean>(ConfirmDialogComponent, {
          data: {
            title: 'Sign off final report',
            message:
              'Signing off locks the final report. Only a state officer or admin can remove sign-off afterwards.',
            confirmLabel: 'Sign off',
          },
        })
        .afterClosed(),
    );
    if (!confirmed) {
      return;
    }
    await this.invoke(
      remult.repo(FinalReport).update(report.id, { isSignedOff: true }),
      'Final report signed off',
      () => this.fireResource.reload(),
    );
  }

  protected async onRemoveSignOff(): Promise<void> {
    const report = this.finalReport();
    if (!report) {
      return;
    }
    const result = await this.openReasonDialog({
      title: 'Remove sign-off',
      message: 'Removing sign-off unlocks the final report for editing. Provide a reason.',
      confirmLabel: 'Remove sign-off',
    });
    if (!result) {
      return;
    }
    await this.invoke(FinalReport.removeSignOff(report.id, result.reason), 'Sign-off removed', () =>
      this.fireResource.reload(),
    );
  }

  private openReasonDialog(
    data: ConfirmReasonDialogData,
  ): Promise<ConfirmReasonDialogResult | undefined> {
    return firstValueFrom(
      this.dialog
        .open<ConfirmReasonDialogComponent, ConfirmReasonDialogData, ConfirmReasonDialogResult>(
          ConfirmReasonDialogComponent,
          { data },
        )
        .afterClosed(),
    );
  }

  private async invoke(
    operation: Promise<unknown>,
    successMessage: string,
    onSuccess: () => void,
  ): Promise<void> {
    await ResultAsync.fromPromise(operation, (cause) =>
      cause instanceof Error ? cause : new Error(toErrorMessage(cause)),
    ).match(
      () => {
        this.notification.success(successMessage);
        this.announcer.announce(successMessage, 'polite');
        onSuccess();
      },
      (cause) => {
        const message = toErrorMessage(cause);
        this.notification.error(message);
        this.announcer.announce(message, 'assertive');
      },
    );
  }
}
