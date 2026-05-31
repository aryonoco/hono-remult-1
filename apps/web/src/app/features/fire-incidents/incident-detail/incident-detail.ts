import { LiveAnnouncer } from '@angular/cdk/a11y';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  resource,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  FIRE_STATUS_LABELS,
  FinalReport,
  FireIncident,
  INCIDENT_LEVEL_LABELS,
  type IncidentLevel,
  operatorName,
  POTENTIAL_LABELS,
  type Potential,
  type StatusTone,
  statusTone,
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
import { CadenceCountdownComponent } from '../../../shared/components/cadence-countdown/cadence-countdown';
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
import type { MapPoint } from '../../../shared/ui/tone-classes';
import { isTerminalStatus } from '../../../shared/util/fire-status';
import { toErrorMessage } from '../../../shared/util/to-error-message';
import { EscalateDialogComponent, type EscalateDialogData } from '../dialogs/escalate-dialog';
import { FinalReportPanelComponent } from './final-report-panel';
import { IncidentMapComponent } from './incident-map/incident-map';
import { IncidentTimelineComponent } from './incident-timeline/incident-timeline';

interface FireRequest {
  id: string;
  userId: string;
  includeFinal: boolean;
}

// Re-tick the cadence countdown each minute so an overdue marker on a live fire stays honest between loads.
const TICK_MS = 60_000;

@Component({
  selector: 'app-incident-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatExpansionModule,
    MatProgressBarModule,
    StatusBadgeComponent,
    CadenceCountdownComponent,
    FinalReportPanelComponent,
    IncidentMapComponent,
    IncidentTimelineComponent,
  ],
  templateUrl: './incident-detail.html',
  styles: `
    :host {
      display: block;
    }

    .detail {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
    }

    .panel {
      margin: 0;
      padding: 1.25rem 1.5rem;
      border: var(--app-grid-border);
      border-radius: var(--app-radius-card);
      background: var(--mat-sys-surface-container-low);
      color: var(--mat-sys-on-surface);
    }

    .panel--error {
      border-color: var(--mat-sys-error);
      color: var(--mat-sys-error);
    }

    .detail-title {
      margin: 0;
      font-family: var(--font-display);
      font-size: 1.625rem;
      font-weight: 800;
      letter-spacing: -0.01em;
      outline: none;
      scroll-margin-top: 4rem;
    }

    /* Severity hero: a status-toned banner. Background is the status foreground token; text sits on it as the
       base surface colour (the inverse of the AA-verified text-on-base pairing, so it stays legible). */
    .detail-hero {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 1rem 1.5rem;
      padding: 1rem 1.5rem;
      border-radius: var(--app-radius-card);
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface);
    }

    .detail-hero--going {
      background: var(--color-status-going);
      color: var(--mat-sys-surface);
    }

    .detail-hero--contained {
      background: var(--color-status-contained);
      color: var(--mat-sys-surface);
    }

    .detail-hero--controlled {
      background: var(--color-status-controlled);
      color: var(--mat-sys-surface);
    }

    .detail-hero--safe {
      background: var(--color-status-safe);
      color: var(--mat-sys-surface);
    }

    .detail-hero--neutral {
      background: var(--color-status-neutral);
      color: var(--mat-sys-surface);
    }

    .detail-hero--missing {
      background: var(--color-status-missing);
      color: var(--mat-sys-surface);
    }

    .detail-hero__lead {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.75rem;
      font-weight: 600;
    }

    .detail-hero__level {
      font-family: var(--font-display);
      font-weight: 700;
    }

    .detail-hero__major {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-size: 0.8125rem;
    }

    .detail-hero__major mat-icon {
      width: 1.125rem;
      height: 1.125rem;
      font-size: 1.125rem;
    }

    .detail-hero__meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(8rem, max-content));
      gap: 0.5rem 1.75rem;
      margin: 0;
    }

    .detail-hero__cell dt {
      font-size: 0.625rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      opacity: 0.85;
    }

    .detail-hero__cell dd {
      margin: 0.125rem 0 0;
      font-size: 0.9375rem;
      font-weight: 600;
    }

    .detail-info {
      display: flex;
      flex-direction: column;
    }

    /* Headline instrument tiles: bold mono readouts of the live crew/area figures. */
    .detail-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
      gap: 0.75rem;
      margin: 0;
    }

    .stat {
      padding: 0.75rem 0.875rem;
      border: var(--app-grid-border);
      border-radius: var(--app-radius-card);
      background: var(--mat-sys-surface-container);
    }

    .stat dt {
      font-size: 0.625rem;
      font-weight: 600;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);
    }

    .stat dd {
      margin: 0.25rem 0 0;
      font-size: 1.375rem;
      font-weight: 600;
      line-height: 1.1;
    }

    .stat__unit {
      font-size: 0.75rem;
      font-weight: 500;
      color: var(--mat-sys-on-surface-variant);
    }

    /* Two-up location + lifecycle; stacks under the container width. */
    .detail-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
      gap: 1.25rem;
    }

    /* Instrument readouts: muted label over a monospace value, packed into a responsive strip. */
    .metrics {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
      gap: 0.75rem 1.5rem;
      margin: 1.25rem 0 0;
      padding-top: 1rem;
      border-top: var(--app-grid-border);
    }

    .metric dt {
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);
    }

    .metric dd {
      margin: 0.125rem 0 0;
      font-size: 0.9375rem;
    }

    .mono {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
    }

    .detail-actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
      margin-top: 1.25rem;
      padding-top: 1rem;
      border-top: var(--app-grid-border);
    }

    .detail-actions__spacer {
      flex: 1 1 auto;
    }

    .danger {
      --mdc-outlined-button-label-text-color: var(--mat-sys-error);
      color: var(--mat-sys-error);
    }

    .section-title {
      margin: 0 0 0.625rem;
      font-size: 1.125rem;
      font-weight: 600;
    }

    .sitrep-desc {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .sitrep-body {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      font-size: 0.875rem;
    }

    .sitrep-body .label {
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class IncidentDetailComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly devAuth = inject(DevAuthService);
  private readonly notification = inject(NotificationService);
  private readonly dialog = inject(MatDialog);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly destroyRef = inject(DestroyRef);

  // A minute clock feeds the hero cadence countdown; cleared on destroy.
  protected readonly now = signal(new Date());

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

  // One map point for the detail view (the map component fits a single-incident view); empty when the fire
  // has no recorded coordinates, which the map renders as its empty state. `areaHa`/`status` drive the
  // area-sized extent circle and the colour-independent marker text (FIRE-AREA-4 / MAP-3).
  protected readonly detailMapPoints = computed<MapPoint[]>(() => {
    const fire = this.fire();
    return fire?.latitude != null && fire?.longitude != null
      ? [
          {
            lat: fire.latitude,
            lng: fire.longitude,
            tone: statusTone(fire.status),
            name: fire.name,
            areaHa: fire.fireAreaHectares ?? 0,
            status: FIRE_STATUS_LABELS[fire.status],
          },
        ]
      : [];
  });

  // Hero tone follows the fire's status tone (a whole literal class on the hero element).
  protected readonly heroToneClass = computed(() => {
    const fire = this.fire();
    return fire ? `detail-hero--${statusTone(fire.status)}` : '';
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
    const tick = setInterval(() => this.now.set(new Date()), TICK_MS);
    this.destroyRef.onDestroy(() => clearInterval(tick));
  }

  protected authorName(id: string): string {
    return operatorName(id);
  }

  protected cadenceDue(fire: FireIncident): Date | null {
    return isTerminalStatus(fire.status) ? null : (fire.nextReportDue ?? null);
  }

  protected statusTone(status: FireIncident['status']): StatusTone {
    return statusTone(status);
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
