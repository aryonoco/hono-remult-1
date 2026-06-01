import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import {
  computeFinancialYear,
  District,
  FIRE_STATUS_LABELS,
  FIRE_STATUS_VALUES,
  FireIncident,
  type FireStatus,
  FireStatus as FS,
  INCIDENT_LEVEL_LABELS,
  type IncidentLevel,
  LEVEL_ORDER,
  operatorName,
  SituationReport,
  type StatusTone,
  statusTone,
  TERMINAL_STATUSES,
} from '@workspace/shared-domain';
import { ResultAsync } from 'neverthrow';
import { type EntityFilter, type LiveQueryChangeInfo, remult } from 'remult';
import { DevAuthService } from '../../core/dev-auth.service';
import { canCreateIncident, canViewDistrictRollup } from '../../shared/auth/permissions';
import { currentScope } from '../../shared/auth/scope';
import { CadenceCountdownComponent } from '../../shared/components/cadence-countdown/cadence-countdown';
import { KpiTileComponent } from '../../shared/components/kpi-tile/kpi-tile';
import { ScopeIndicatorComponent } from '../../shared/components/scope-indicator';
import { SeverityTileComponent } from '../../shared/components/severity-tile/severity-tile';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge';
import { StatusMixBarComponent } from '../../shared/components/status-mix-bar/status-mix-bar';
import type { MapPoint } from '../../shared/ui/tone-classes';
import { isTerminalStatus } from '../../shared/util/fire-status';
import { IncidentMapComponent } from '../fire-incidents/incident-detail/incident-map/incident-map';

const TICK_MS = 60_000; // re-run server aggregates each minute (active set is server-derived)
const MAP_CAP = 500; // bounded map fetch (peak season can be hundreds active)
const ATTENTION_LIMIT = 10; // bounded live needs-attention list
const SITREP_LIMIT = 8; // bounded live activity feed
const FIRST_SEASON_FY = 2018; // earliest seeded financial year
const DISTRICT_FETCH_LIMIT = 50; // 16 seeded districts; a generous, still-bounded cap
const ACTIVE: EntityFilter<FireIncident> = { status: { $nin: [...TERMINAL_STATUSES] } };
const toErr = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

interface RegionRow {
  regionId: number;
  regionName: string;
  count: number;
}

// Projection of the bounded map fetch (the `find` select) onto the shared MapPoint shape. Rows without
// coordinates are dropped; `perimeter` (the true mapped extent) takes precedence over the `areaHa`
// estimate circle, and `status` feeds the colour-independent label (FIRE-AREA-5 / FIRE-AREA-4 / MAP-3).
type MapRow = Pick<
  FireIncident,
  'name' | 'latitude' | 'longitude' | 'status' | 'fireAreaHectares' | 'firePerimeterGeo'
>;
function toMapPoints(rows: readonly MapRow[]): MapPoint[] {
  return rows
    .filter(
      (r): r is MapRow & { latitude: number; longitude: number } =>
        r.latitude != null && r.longitude != null,
    )
    .map((r) => ({
      lat: r.latitude,
      lng: r.longitude,
      tone: statusTone(r.status),
      name: r.name,
      areaHa: r.fireAreaHectares ?? 0,
      perimeter: r.firePerimeterGeo ?? undefined,
      status: FIRE_STATUS_LABELS[r.status],
    }));
}

@Component({
  selector: 'app-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    MatIconModule,
    MatProgressBarModule,
    MatFormFieldModule,
    MatSelectModule,
    KpiTileComponent,
    StatusMixBarComponent,
    SeverityTileComponent,
    CadenceCountdownComponent,
    StatusBadgeComponent,
    IncidentMapComponent,
    ScopeIndicatorComponent,
  ],
  templateUrl: './overview.html',
  styles: `
    :host {
      display: block;
    }

    /* Heading row: title on the start edge, the data-scope badge alongside it (wraps on narrow widths)
       so it is immediately clear whether the dashboard below is statewide or a single district. */
    .overview__head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem 1rem;
      margin-block-end: 1.25rem;
    }

    .overview__title {
      margin: 0;
      font-family: var(--font-display);
      font-size: 1.75rem;
      font-weight: 800;
      letter-spacing: -0.01em;
      scroll-margin-top: 5rem;
    }

    .overview__section {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      container-type: inline-size;
    }

    .overview__section + .overview__section {
      margin-top: 1.5rem;
    }

    .overview__section-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1rem;
    }

    .overview__heading {
      margin: 0;
      font-family: var(--font-display);
      font-size: 1.125rem;
      font-weight: 700;
    }

    .overview__live {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.6875rem;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);
    }

    .overview__live-dot {
      width: 0.5rem;
      height: 0.5rem;
      border-radius: 9999px;
      background: var(--color-status-going);
    }

    /* Offline/reconnecting: the visible pill must never imply a live stream. Use a muted token and
       drop the pulse so the header is honest in lock-step with the Overdue tile's [live] region. */
    .overview__live-dot--offline {
      background: var(--mat-sys-on-surface-variant);
    }

    @media (prefers-reduced-motion: no-preference) {
      .overview__live-dot:not(.overview__live-dot--offline) {
        animation: overview-pulse 2s ease-in-out infinite;
      }
    }

    @keyframes overview-pulse {
      0%,
      100% {
        opacity: 1;
      }
      50% {
        opacity: 0.35;
      }
    }

    .overview__kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(8.5rem, 1fr));
      gap: 0.75rem;
    }

    .overview__panels {
      display: grid;
      grid-template-columns: 1fr;
      gap: 1.25rem;
    }

    @container (min-width: 48rem) {
      .overview__panels {
        /* align-items:start so the short status-mix column sizes to its content instead of
           stretching to the taller needs-attention column (which left a tall void). */
        align-items: start;
        grid-template-columns: minmax(0, 18rem) 1fr;
      }
    }

    .overview__panel {
      padding: 1rem 1.25rem;
      border: var(--app-grid-border);
      border-radius: var(--app-radius-card);
      background: var(--mat-sys-surface-container-low);
      color: var(--mat-sys-on-surface);
    }

    .overview__panel-heading {
      margin: 0 0 0.75rem;
      font-size: 0.8125rem;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--mat-sys-on-surface-variant);
    }

    /* A quiet scope suffix on each section heading, so every panel states whether its figures are
       statewide or for the viewer's district without competing with the heading itself. */
    .overview__scope {
      color: var(--mat-sys-on-surface-variant);
      font-weight: 500;
    }

    .overview__heading .overview__scope {
      font-size: 0.875rem;
    }

    .overview__list {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .overview__row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem 0.625rem;
      border-radius: var(--app-radius-card);
      color: inherit;
      text-decoration: none;
    }

    .overview__row:hover {
      background: var(--mat-sys-surface-container-high);
    }

    .overview__row:focus-visible {
      outline: 2px solid var(--mat-sys-primary);
      outline-offset: 2px;
    }

    .overview__row-main {
      display: flex;
      flex-direction: column;
      min-width: 0;
      margin-right: auto;
    }

    .overview__row-name {
      font-weight: 600;
    }

    .overview__row-sub {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
    }

    .overview__row-time {
      font-size: 0.75rem;
      color: var(--mat-sys-on-surface-variant);
      white-space: nowrap;
    }

    .overview__note {
      margin: 0;
      font-size: 0.875rem;
      color: var(--mat-sys-on-surface-variant);
    }

    /* DASH-5: the map-overflow note is an at-a-glance signal that the plotted set is truncated.
       Promote it to a contained-tone warning chip so it reads as advisory, not body copy. */
    .overview__note--warning {
      display: inline-flex;
      align-items: center;
      gap: 0.375rem;
      margin-top: 0.75rem;
      padding: 0.375rem 0.625rem;
      border-radius: var(--app-radius-card);
      background: var(--color-status-contained-bg);
      color: var(--color-status-contained);
      font-weight: 500;
    }

    /* Element-qualified (specificity 0,1,1) to reliably beat Material's icon size rule (specificity
       0,1,0), which ships outside any cascade layer, without relying on stylesheet source order or
       !important; see styling-conventions.md. */
    mat-icon.overview__note-icon {
      flex: none;
      width: 1.125rem;
      height: 1.125rem;
      font-size: 1.125rem;
      line-height: 1;
    }

    .overview__map-placeholder {
      display: grid;
      place-items: center;
      height: 14rem;
      border-radius: var(--app-radius-card);
      border: 1px dashed var(--mat-sys-outline-variant);
      color: var(--mat-sys-on-surface-variant);
    }

    .overview__fy {
      width: 9rem;
    }

    .overview__rollup {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      margin: 0;
    }

    .overview__rollup-row {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 1rem;
      padding: 0.25rem 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }

    .overview__rollup-row:last-child {
      border-bottom: none;
    }

    .overview__rollup dt {
      font-weight: 500;
    }
  `,
})
export class OverviewComponent {
  private readonly devAuth = inject(DevAuthService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly currentUser = this.devAuth.currentUser;
  protected readonly canCreate = computed(() => canCreateIncident(this.currentUser()));
  protected readonly showRollup = computed(() => canViewDistrictRollup(this.currentUser()));
  // The data scope shown as a suffix on every section heading so each panel states whether its figures
  // are statewide or for the viewer's district (matches the apiPrefilter + the header scope badge).
  protected readonly scopeSuffix = computed(() => {
    const scope = currentScope(this.currentUser());
    return scope ? ` · ${scope.label}` : '';
  });
  protected readonly now = signal(new Date());

  // Operational (active) — SERVER-derived (count/aggregate/groupBy); never a wholesale load.
  protected readonly activeCount = signal(0);
  protected readonly goingCount = signal(0);
  protected readonly majorCount = signal(0);
  protected readonly overdueCount = signal(0);
  protected readonly totalActiveAreaHa = signal(0);
  protected readonly statusCounts = signal<Readonly<Record<FireStatus, number>>>(this.zeroCounts());
  protected readonly mapPoints = signal<readonly MapPoint[]>([]);
  protected readonly mapOverflow = signal(0);
  protected readonly opsLoaded = signal(false);

  // Bounded LIVE sets.
  protected readonly attention = signal<FireIncident[]>([]);
  protected readonly recentSitreps = signal<SituationReport[]>([]);
  // Honest LIVE indicator (DASH-2): each bounded liveQuery owns its own connection flag — `next` (a push
  // arrived) sets it true, `error` (the SSE channel dropped) sets it false. The badge is only honest when
  // BOTH channels are delivering, so `liveConnected` is the conjunction; a single dead stream flips it off.
  // A single shared boolean would be order-dependent under a partial outage (last callback wins), which is
  // the exact dishonesty this change removes.
  private readonly attentionLive = signal(false);
  private readonly sitrepsLive = signal(false);
  protected readonly liveConnected = computed(() => this.attentionLive() && this.sitrepsLive());

  // Season (selected FY) — SERVER-derived.
  protected readonly selectedFy = signal<number>(computeFinancialYear(new Date()));
  protected readonly fyOptions = computed(() => {
    const cur = computeFinancialYear(new Date());
    return Array.from({ length: cur - FIRST_SEASON_FY + 1 }, (_, i) => cur - i);
  });
  protected readonly seasonCount = signal(0);
  protected readonly seasonAreaHa = signal(0);
  protected readonly seasonStatus = signal<Readonly<Record<FireStatus, number>>>(this.zeroCounts());
  protected readonly regionRollup = signal<readonly RegionRow[]>([]);
  protected readonly errorMsg = signal<string | null>(null);

  protected readonly viewState = computed<'anonymous' | 'loading' | 'content'>(() => {
    if (!this.currentUser()) {
      return 'anonymous';
    }
    return this.opsLoaded() ? 'content' : 'loading';
  });

  // Re-sort the bounded live list by urgency against the ticking clock.
  protected readonly needsAttention = computed(() => {
    const t = this.now().getTime();
    const overdueBy = (i: FireIncident): number =>
      i.nextReportDue ? t - i.nextReportDue.getTime() : Number.NEGATIVE_INFINITY;
    const goingRank = (i: FireIncident): number => (i.status === FS.going ? 1 : 0);
    return [...this.attention()].sort((a, b) => {
      if (overdueBy(a) !== overdueBy(b)) {
        return overdueBy(b) - overdueBy(a);
      }
      if (goingRank(a) !== goingRank(b)) {
        return goingRank(b) - goingRank(a);
      }
      if (LEVEL_ORDER[a.incidentLevel] !== LEVEL_ORDER[b.incidentLevel]) {
        return LEVEL_ORDER[b.incidentLevel] - LEVEL_ORDER[a.incidentLevel];
      }
      return (b.isMajor ? 1 : 0) - (a.isMajor ? 1 : 0);
    });
  });

  private unsubscribeAttention: (() => void) | null = null;
  private unsubscribeSitreps: (() => void) | null = null;

  constructor() {
    const tick = setInterval(() => this.now.set(new Date()), TICK_MS);
    this.destroyRef.onDestroy(() => clearInterval(tick));
    // Live bounded subscriptions — re-subscribe on user change only.
    effect(() => this.subscribeLive(this.currentUser()?.id));
    this.destroyRef.onDestroy(() => {
      this.unsubscribeAttention?.();
      this.unsubscribeSitreps?.();
    });
    // Operational aggregates — refresh on user change + tick.
    effect(() => {
      const u = this.currentUser();
      this.now();
      if (u) {
        this.refreshOps();
      } else {
        this.opsLoaded.set(false);
      }
    });
    // Season aggregates — refresh on user change + FY change.
    effect(() => {
      const u = this.currentUser();
      this.selectedFy();
      if (u) {
        this.refreshSeason();
      }
    });
  }

  // Tear down any prior subscriptions, reset both live flags, then (when signed in) open the two bounded
  // liveQuery streams. Each stream owns its own connection flag so `liveConnected` stays honest under a
  // partial outage — see the `attentionLive`/`sitrepsLive` declaration above.
  private subscribeLive(id: string | undefined): void {
    this.unsubscribeAttention?.();
    this.unsubscribeSitreps?.();
    this.unsubscribeAttention = null;
    this.unsubscribeSitreps = null;
    this.attentionLive.set(false);
    this.sitrepsLive.set(false);
    if (!id) {
      this.attention.set([]);
      this.recentSitreps.set([]);
      return;
    }
    this.unsubscribeAttention = remult
      .repo(FireIncident)
      .liveQuery({
        where: ACTIVE,
        orderBy: { nextReportDue: 'asc' },
        limit: ATTENTION_LIMIT,
        include: { district: true },
      })
      .subscribe({
        next: (info: LiveQueryChangeInfo<FireIncident>) => {
          this.attention.set(info.items);
          this.attentionLive.set(true);
        },
        error: () => this.attentionLive.set(false),
      });
    this.unsubscribeSitreps = remult
      .repo(SituationReport)
      .liveQuery({ orderBy: { submittedAt: 'desc' }, limit: SITREP_LIMIT })
      .subscribe({
        next: (info: LiveQueryChangeInfo<SituationReport>) => {
          this.recentSitreps.set(info.items);
          this.sitrepsLive.set(true);
        },
        error: () => this.sitrepsLive.set(false),
      });
  }

  protected setFy(fy: number): void {
    this.selectedFy.set(fy);
  }
  protected authorName(id: string): string {
    return operatorName(id);
  }
  protected tone(s: FireStatus): StatusTone {
    return statusTone(s);
  }
  protected levelLabel(l: IncidentLevel): string {
    return INCIDENT_LEVEL_LABELS[l];
  }
  protected readonly isTerminalStatus = isTerminalStatus;
  private zeroCounts(): Record<FireStatus, number> {
    return Object.fromEntries(FIRE_STATUS_VALUES.map((s) => [s, 0])) as Record<FireStatus, number>;
  }

  private async refreshOps(): Promise<void> {
    const repo = remult.repo(FireIncident);
    const now = untracked(() => this.now());
    const result = await ResultAsync.fromPromise(
      Promise.all([
        repo.groupBy({ group: ['status'], where: ACTIVE }),
        repo.aggregate({ sum: ['fireAreaHectares'], where: ACTIVE }),
        repo.count({ ...ACTIVE, isMajor: true }),
        repo.count({ ...ACTIVE, nextReportDue: { $lt: now } }),
        repo.count(ACTIVE),
        repo.find({
          where: ACTIVE,
          orderBy: { statusAsAt: 'desc' },
          limit: MAP_CAP,
          select: {
            id: true,
            name: true,
            latitude: true,
            longitude: true,
            status: true,
            fireAreaHectares: true,
            firePerimeterGeo: true,
          },
        }),
      ]),
      toErr,
    );
    result.match(
      ([statusRows, areaAgg, major, overdue, active, rows]) => {
        const counts = this.zeroCounts();
        let going = 0;
        for (const r of statusRows) {
          counts[r.status] = r.$count;
          if (r.status === FS.going) {
            going = r.$count;
          }
        }
        this.statusCounts.set(counts);
        this.goingCount.set(going);
        this.activeCount.set(active);
        this.majorCount.set(major);
        this.overdueCount.set(overdue);
        this.totalActiveAreaHa.set(areaAgg.fireAreaHectares.sum ?? 0);
        this.mapPoints.set(toMapPoints(rows));
        this.mapOverflow.set(Math.max(0, active - rows.length));
        this.errorMsg.set(null);
        this.opsLoaded.set(true);
      },
      (e) => {
        this.errorMsg.set(e.message);
        this.opsLoaded.set(true);
      },
    );
  }

  private async refreshSeason(): Promise<void> {
    const repo = remult.repo(FireIncident);
    const where: EntityFilter<FireIncident> = { financialYear: this.selectedFy() };
    const elevated = untracked(() => this.showRollup());
    const districtRowsP = elevated
      ? repo.groupBy({ group: ['districtId'], where, orderBy: { $count: 'desc' } })
      : Promise.resolve([] as { districtId: number; $count: number }[]);
    const districtsP = elevated
      ? remult.repo(District).find({ limit: DISTRICT_FETCH_LIMIT })
      : Promise.resolve([] as District[]);
    const result = await ResultAsync.fromPromise(
      Promise.all([
        repo.aggregate({ sum: ['fireAreaHectares'], where }),
        repo.groupBy({ group: ['status'], where }),
        districtRowsP,
        districtsP,
      ]),
      toErr,
    );
    result.match(
      ([areaAgg, statusRows, districtRows, districts]) => {
        this.seasonCount.set(areaAgg.$count);
        this.seasonAreaHa.set(areaAgg.fireAreaHectares.sum ?? 0);
        const counts = this.zeroCounts();
        for (const r of statusRows) {
          counts[r.status] = r.$count;
        }
        this.seasonStatus.set(counts);
        const districtMap = new Map(districts.map((d) => [d.id, d]));
        const byRegion = new Map<number, RegionRow>();
        for (const r of districtRows) {
          const d = districtMap.get(r.districtId);
          if (!d) {
            continue;
          }
          const row = byRegion.get(d.regionId) ?? {
            regionId: d.regionId,
            regionName: d.regionName,
            count: 0,
          };
          row.count += r.$count;
          byRegion.set(d.regionId, row);
        }
        this.regionRollup.set([...byRegion.values()].sort((a, b) => b.count - a.count));
      },
      (e) => this.errorMsg.set(e.message),
    );
  }
}
