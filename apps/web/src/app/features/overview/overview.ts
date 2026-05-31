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
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import {
  computeFinancialYear,
  District,
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
import { type EntityFilter, remult } from 'remult';
import { DevAuthService } from '../../core/dev-auth.service';
import { canCreateIncident, canViewDistrictRollup } from '../../shared/auth/permissions';
import type { MapPoint } from '../../shared/ui/tone-classes';

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

@Component({
  selector: 'app-overview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule, MatProgressBarModule /* + tiles/badges/map added in 3.2/3.3 */],
  templateUrl: './overview.html',
})
export class OverviewComponent {
  private readonly devAuth = inject(DevAuthService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly currentUser = this.devAuth.currentUser;
  protected readonly canCreate = computed(() => canCreateIncident(this.currentUser()));
  protected readonly showRollup = computed(() => canViewDistrictRollup(this.currentUser()));
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
    effect(() => {
      const id = this.currentUser()?.id;
      this.unsubscribeAttention?.();
      this.unsubscribeSitreps?.();
      this.unsubscribeAttention = null;
      this.unsubscribeSitreps = null;
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
        .subscribe((info) => this.attention.set(info.items));
      this.unsubscribeSitreps = remult
        .repo(SituationReport)
        .liveQuery({ orderBy: { submittedAt: 'desc' }, limit: SITREP_LIMIT })
        .subscribe((info) => this.recentSitreps.set(info.items));
    });
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
  protected isTerminal(s: FireStatus): boolean {
    return (TERMINAL_STATUSES as readonly FireStatus[]).includes(s);
  }
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
          select: { id: true, name: true, latitude: true, longitude: true, status: true },
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
        this.mapPoints.set(
          rows
            .filter(
              (r): r is typeof r & { latitude: number; longitude: number } =>
                r.latitude != null && r.longitude != null,
            )
            .map((r) => ({
              lat: r.latitude,
              lng: r.longitude,
              tone: statusTone(r.status),
              name: r.name,
            })),
        );
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
