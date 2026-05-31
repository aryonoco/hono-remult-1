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
  MS_PER_MINUTE,
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

// Cadence urgency thresholds + chip glyphs (DETAIL-1). `soon` mirrors the cadence-countdown's own 60-minute
// window so the hero chip's highlight matches the figure it wraps.
type CadenceState = 'overdue' | 'soon' | 'upcoming' | 'none';
const CADENCE_SOON_MS: number = 60 * MS_PER_MINUTE;
const CADENCE_ICONS: Readonly<Record<CadenceState, string>> = {
  overdue: 'warning',
  soon: 'schedule',
  upcoming: 'schedule',
  none: 'check_circle',
};

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

    /* Situation-reports empty state (DETAIL-4): a centred, low-surface panel with a glyph and a conditional
       CTA, announced as a status region. Dashed hairline marks it as an awaiting-content placeholder. */
    .panel--empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 2rem 1.5rem;
      border-style: dashed;
      background: var(--mat-sys-surface-container-low);
      color: var(--mat-sys-on-surface-variant);
      text-align: center;
    }

    .panel--empty mat-icon {
      width: 2rem;
      height: 2rem;
      font-size: 2rem;
      opacity: 0.7;
    }

    .panel--empty__text {
      margin: 0;
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

    /* The title is the route-change focus target (tabindex="-1"). Keep it ring-free on a pointer/landing
       focus, but show a clear ring when the focus is keyboard/programmatic so the move is visible (DETAIL-9). */
    .detail-title:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
      border-radius: var(--app-radius-card);
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
      flex-shrink: 0;
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
      flex: 1 1 auto;
      grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
      gap: 0.5rem 1.75rem;
      margin: 0;
    }

    /* Cadence reads first in source order; the chip self-sizes so the live-clock signal never stretches
       across the whole meta row. */
    .detail-hero__cell--cadence {
      align-self: start;
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

    /* Cadence chip (DETAIL-1): an inline status pill in the hero that makes the reporting clock the primary
       urgency signal. The chip text is the hero's surface-colour foreground (the AA-verified inverse pairing
       checked by HERO_TEXT_PAIRS), so it sits directly on the pure status tone with NO background fill — a
       translucent surface wash would lighten the tone in the light (Dawn) theme and drop the text below AA.
       The ringed border (derived from --mat-sys-surface via color-mix, so it tracks both themes) carries the
       raised-chip read; overdue/soon brighten the ring and the leading glyph carries the state. */
    .detail-hero__cadence {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      padding: 0.25rem 0.625rem;
      border-radius: var(--app-radius-card);
      border: 1px solid color-mix(in srgb, var(--mat-sys-surface) 35%, transparent);
      font-weight: 700;
      line-height: 1.2;
    }

    .detail-hero__cadence mat-icon {
      width: 1.125rem;
      height: 1.125rem;
      font-size: 1.125rem;
    }

    /* Escalate via the border + warning glyph rather than a fill: the chip text stays on the pure status
       tone (the AA-verified surface-on-tone pairing), so urgency is carried by a brighter ring and the
       leading glyph, leaving the text-vs-tone contrast untouched in both themes. */
    .detail-hero__cadence--soon {
      border-color: color-mix(in srgb, var(--mat-sys-surface) 65%, transparent);
    }

    .detail-hero__cadence--overdue {
      border-color: var(--mat-sys-surface);
    }

    .detail-info {
      display: flex;
      flex-direction: column;
    }

    /* Headline instrument tiles: bold mono readouts of the live crew/area figures. */
    .detail-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(6.5rem, 1fr));
      gap: 0.75rem;
      margin: 0;
    }

    .stat {
      padding: 0.75rem 0.875rem;
      border: var(--app-grid-border);
      border-radius: var(--app-radius-card);
      background: var(--mat-sys-surface-container);
    }

    /* A zero crew/aircraft figure is real data, not a gap: mute the tile and label it so it reads as
       "none assigned" rather than a missing value (DETAIL-2). The figure stays AA-legible. */
    .stat--zero {
      background: var(--mat-sys-surface-container-low);
    }

    .stat--zero dd {
      color: var(--mat-sys-on-surface-variant);
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

    .stat__none {
      display: block;
      margin-top: 0.25rem;
      font-size: 0.6875rem;
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

    /* Subtle elevation hierarchy (DETAIL-8): the hero sits highest, the primary instrument panel one step
       up from the secondary location/timeline panels, so the page reads as layered surfaces rather than a
       flat stack. Levels come from distinct --mat-sys-surface-container tokens (theme-aware, no shadows). */
    .detail-info.panel {
      background: var(--mat-sys-surface-container);
    }

    /* Mobile (DETAIL-6/8): stack the hero, tighten the page rhythm and section paddings so the layout is
       not desktop-first padded at handset widths. */
    @media (max-width: 640px) {
      .detail {
        gap: 1rem;
      }

      .detail-hero {
        flex-direction: column;
        align-items: stretch;
        padding: 0.875rem 1rem;
      }

      .panel {
        padding: 1rem 1.125rem;
      }

      .metrics {
        margin-top: 1rem;
      }

      .detail-grid {
        gap: 1rem;
      }
    }

    /* Handset (DETAIL-7): force a tidy two-up stat grid and trim the readout size so the tiles do not
       oversize on a narrow viewport. */
    @media (max-width: 480px) {
      .detail-stats {
        grid-template-columns: 1fr 1fr;
      }

      .stat dd {
        font-size: 1.125rem;
      }
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

  // Cadence urgency drives the hero chip's highlight + icon: overdue and soon are escalated so the
  // reporting clock is the hero's primary status signal (DETAIL-1). Mirrors the cadence-countdown's own
  // state thresholds so chip and figure stay in lock-step; a terminal fire has no live cadence.
  private readonly cadenceState = computed<CadenceState>(() => {
    const fire = this.fire();
    const due = fire ? this.cadenceDue(fire) : null;
    if (!due) {
      return 'none';
    }
    const delta = due.getTime() - this.now().getTime();
    if (delta < 0) {
      return 'overdue';
    }
    if (delta <= CADENCE_SOON_MS) {
      return 'soon';
    }
    return 'upcoming';
  });
  protected readonly cadenceChipClass = computed(
    () => `detail-hero__cadence--${this.cadenceState()}`,
  );
  protected readonly cadenceIcon = computed(() => CADENCE_ICONS[this.cadenceState()]);

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
