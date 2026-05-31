import { LiveAnnouncer } from '@angular/cdk/a11y';
import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { DatePipe, NgTemplateOutlet } from '@angular/common';
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
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, type Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import {
  computeFinancialYear,
  District,
  FireIncident,
  FireStatus,
  type StatusTone,
  statusTone,
  TERMINAL_STATUSES,
} from '@workspace/shared-domain';
import { ResultAsync } from 'neverthrow';
import { type EntityFilter, type EntityOrderBy, type LiveQueryChangeInfo, remult } from 'remult';
import { map } from 'rxjs';

import { DevAuthService } from '../../../core/dev-auth.service';
import { canCreateIncident, canViewDistrictRollup } from '../../../shared/auth/permissions';
import { CadenceCountdownComponent } from '../../../shared/components/cadence-countdown/cadence-countdown';
import { SeverityTileComponent } from '../../../shared/components/severity-tile/severity-tile';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge';
import { SPINE_TONE } from '../../../shared/ui/tone-classes';
import { isTerminalStatus } from '../../../shared/util/fire-status';
import { toErrorMessage } from '../../../shared/util/to-error-message';

type StatusGroup = 'all' | 'active' | 'going' | 'resolved';
type SortKey = 'name' | 'fireNumber' | 'statusAsAt' | 'districtId' | 'createdAt';
interface ListFilters {
  fy: number | 'all';
  group: StatusGroup;
  districtId: number | 'all';
}
interface SortState {
  active: SortKey;
  direction: 'asc' | 'desc' | '';
}
interface PageState {
  pageIndex: number;
  pageSize: number;
}
type ViewState = 'anonymous' | 'loading' | 'error' | 'empty' | 'content';
type Density = 'comfortable' | 'compact';
interface DistrictOption {
  id: number;
  name: string;
}

const DENSITY_KEY = 'fire-list-density';
const readDensity = (): Density =>
  localStorage.getItem(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable';

const DEFAULT_PAGE_SIZE = 25;
const LARGE_PAGE_SIZE = 50;
const LARGEST_PAGE_SIZE = 100;
const PAGE_SIZE_OPTIONS = [DEFAULT_PAGE_SIZE, LARGE_PAGE_SIZE, LARGEST_PAGE_SIZE] as const;
const FIRST_SEASON_FY = 2018;
const DISTRICT_FETCH_LIMIT = 50;
const TICK_INTERVAL_MS = 60_000;
const PERCENT = 100;
// A short, fixed run of shimmer placeholders rendered while the first page loads (LIST-8).
const SKELETON_ROWS = Array.from({ length: 8 });

const toErr = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

// Human-readable column labels for the `LiveAnnouncer` on sort changes (§A.10).
const SORT_LABEL: Readonly<Record<string, string>> = {
  name: 'Name',
  fireNumber: 'Fire number',
  statusAsAt: 'Last report',
  district: 'District',
};

@Component({
  selector: 'app-incident-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    NgTemplateOutlet,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
    StatusBadgeComponent,
    CadenceCountdownComponent,
    SeverityTileComponent,
  ],
  templateUrl: './incident-list.html',
  styleUrl: './incident-list.css',
})
export class IncidentListComponent {
  private readonly devAuth = inject(DevAuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly announcer = inject(LiveAnnouncer);

  // Template-facing references: the terminal-status guard (gates the cadence countdown on closed fires)
  // and the shared status-spine tone map (whole literal classes — never interpolated).
  protected readonly isTerminalStatus = isTerminalStatus;
  protected readonly spineTone = SPINE_TONE;
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly skeletonRows = SKELETON_ROWS;
  // Row density persists across sessions so a controller's preferred information density is remembered.
  protected readonly density = signal<Density>(readDensity());

  protected readonly displayedColumns = [
    'name',
    'district',
    'fireNumber',
    'status',
    'fireAreaHectares',
    'incidentLevel',
    'isMajor',
    'statusAsAt',
    'nextReportDue',
  ] as const;

  protected readonly currentUser = this.devAuth.currentUser;
  protected readonly canCreate = computed(() => canCreateIncident(this.currentUser()));
  protected readonly showDistrictFilter = computed(() => canViewDistrictRollup(this.currentUser()));
  protected readonly isHandset = toSignal(
    this.breakpoints.observe(Breakpoints.Handset).pipe(map((result) => result.matches)),
    { initialValue: false },
  );
  protected readonly now = signal(new Date());

  protected readonly filters = signal<ListFilters>({
    fy: computeFinancialYear(new Date()),
    group: 'all',
    districtId: 'all',
  });
  protected readonly sortState = signal<SortState>({ active: 'createdAt', direction: 'desc' });
  protected readonly pageState = signal<PageState>({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  protected readonly fyOptions = computed<(number | 'all')[]>(() => {
    const current = computeFinancialYear(new Date());
    return ['all', ...Array.from({ length: current - FIRST_SEASON_FY + 1 }, (_, i) => current - i)];
  });
  protected readonly districtOptions = signal<DistrictOption[]>([]);

  protected readonly rows = signal<FireIncident[]>([]);
  protected readonly total = signal(0);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly viewState = computed<ViewState>(() => {
    if (!this.currentUser()) {
      return 'anonymous';
    }
    if (this.error()) {
      return 'error';
    }
    if (this.loading()) {
      return 'loading';
    }
    return this.total() === 0 ? 'empty' : 'content';
  });
  // Area-bar scale: the widest fire on the visible page maps to a full bar (relative, per-page).
  protected readonly maxArea = computed(() =>
    Math.max(1, ...this.rows().map((row) => row.fireAreaHectares ?? 0)),
  );

  private readonly whereKey = computed(() => JSON.stringify(this.filters()));
  // Bumped by `retry()` to force the count + live-query effects to re-run after a transient failure.
  private readonly reloadTrigger = signal(0);
  private unsubscribe: (() => void) | null = null;

  constructor() {
    const tick = setInterval(() => this.now.set(new Date()), TICK_INTERVAL_MS);
    this.destroyRef.onDestroy(() => clearInterval(tick));
    this.registerDistrictOptionsEffect();
    this.registerTotalEffect();
    this.registerRowsEffect();
    this.destroyRef.onDestroy(() => this.unsubscribe?.());
  }

  // District options for the elevated district filter; re-fetched when the gate or user changes.
  private registerDistrictOptionsEffect(): void {
    effect(() => {
      if (!(this.showDistrictFilter() && this.currentUser())) {
        this.districtOptions.set([]);
        return;
      }
      this.refreshDistrictOptions();
    });
  }

  private async refreshDistrictOptions(): Promise<void> {
    const result = await ResultAsync.fromPromise(
      remult.repo(District).find({ limit: DISTRICT_FETCH_LIMIT }),
      toErr,
    );
    result.match(
      (districts) => this.districtOptions.set(districts.map((d) => ({ id: d.id, name: d.name }))),
      () => this.districtOptions.set([]),
    );
  }

  // Paginator total via a server-side count; re-fetched on user + filters (scale-independent).
  private registerTotalEffect(): void {
    effect(() => {
      const id = this.currentUser()?.id;
      this.whereKey();
      this.reloadTrigger();
      if (!id) {
        this.total.set(0);
        return;
      }
      const where = untracked(() => this.buildWhere());
      this.refreshTotal(where);
    });
  }

  private async refreshTotal(where: EntityFilter<FireIncident>): Promise<void> {
    const result = await ResultAsync.fromPromise(remult.repo(FireIncident).count(where), toErr);
    result.match(
      (count) => {
        this.total.set(count);
        this.error.set(null);
      },
      (cause) => this.error.set(cause.message),
    );
  }

  // The page of rows via a server-paginated live query; re-subscribed on user + filters + sort + page.
  private registerRowsEffect(): void {
    effect(() => {
      const id = this.currentUser()?.id;
      this.whereKey();
      const sort = this.sortState();
      const page = this.pageState();
      this.reloadTrigger();
      this.unsubscribe?.();
      this.unsubscribe = null;
      if (!id) {
        this.rows.set([]);
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      const where = untracked(() => this.buildWhere());
      this.unsubscribe = remult
        .repo(FireIncident)
        .liveQuery({
          where,
          include: { district: true },
          orderBy: this.mapSort(sort),
          limit: page.pageSize,
          page: page.pageIndex + 1,
        })
        // The listener form surfaces SSE/transport failures: without an `error` handler a dropped
        // change channel would leave the list stuck loading or silently stale (LIST-6/DATA-1).
        .subscribe({
          next: (info: LiveQueryChangeInfo<FireIncident>) => {
            this.rows.set(info.items);
            this.loading.set(false);
            this.error.set(null);
          },
          error: (cause: unknown) => {
            this.error.set(toErrorMessage(cause));
            this.loading.set(false);
          },
        });
    });
  }

  protected onSortChange(event: Sort): void {
    this.sortState.set({ active: event.active as SortKey, direction: event.direction });
    this.pageState.update((page) => ({ ...page, pageIndex: 0 }));
    const label = SORT_LABEL[event.active] ?? event.active;
    const message =
      event.direction === ''
        ? `Sorting cleared on ${label}`
        : `Sorted by ${label}, ${event.direction === 'asc' ? 'ascending' : 'descending'}`;
    this.announcer.announce(message, 'polite');
  }

  protected sortActionDescription(label: string): string {
    return `Sort by ${label}`;
  }

  protected fyLabel(fy: number | 'all'): string {
    return fy === 'all' ? 'All years' : `FY${fy}`;
  }

  protected onPage(event: { pageIndex: number; pageSize: number }): void {
    this.pageState.set({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  protected setFy(fy: number | 'all'): void {
    this.filters.update((filters) => ({ ...filters, fy }));
    this.pageState.update((page) => ({ ...page, pageIndex: 0 }));
  }

  protected setStatusGroup(group: StatusGroup): void {
    this.filters.update((filters) => ({ ...filters, group }));
    this.pageState.update((page) => ({ ...page, pageIndex: 0 }));
  }

  protected setDistrict(districtId: number | 'all'): void {
    this.filters.update((filters) => ({ ...filters, districtId }));
    this.pageState.update((page) => ({ ...page, pageIndex: 0 }));
  }

  protected setDensity(density: Density): void {
    this.density.set(density);
    localStorage.setItem(DENSITY_KEY, density);
  }

  // Re-run the count + live query after a transient failure (the error-state Retry button, LIST-6/8).
  protected retry(): void {
    this.error.set(null);
    this.loading.set(true);
    this.reloadTrigger.update((n) => n + 1);
  }

  // Clear all filters back to their defaults (the empty-state "Clear filters" action, LIST-8).
  protected resetFilters(): void {
    this.filters.set({ fy: 'all', group: 'all', districtId: 'all' });
    this.pageState.update((page) => ({ ...page, pageIndex: 0 }));
  }

  protected tone(status: FireStatus): StatusTone {
    return statusTone(status);
  }

  protected areaPct(incident: FireIncident): number {
    return Math.min(PERCENT, ((incident.fireAreaHectares ?? 0) / this.maxArea()) * PERCENT);
  }

  // Accessible text equivalent for the decorative area bar (LIST-2): the figure colour-only bars hide.
  protected areaLabel(incident: FireIncident): string {
    const area = incident.fireAreaHectares;
    return area == null ? 'Area not recorded' : `${area} hectares`;
  }

  private buildWhere(): EntityFilter<FireIncident> {
    const filters = this.filters();
    const where: EntityFilter<FireIncident> = {};
    if (filters.fy !== 'all') {
      where.financialYear = filters.fy;
    }
    if (filters.group === 'active') {
      where.status = { $nin: [...TERMINAL_STATUSES] };
    } else if (filters.group === 'going') {
      where.status = FireStatus.going;
    } else if (filters.group === 'resolved') {
      where.status = { $in: [...TERMINAL_STATUSES] };
    }
    if (filters.districtId !== 'all') {
      where.districtId = filters.districtId;
    }
    return where;
  }

  private mapSort(sort: SortState): EntityOrderBy<FireIncident> {
    const dir = sort.direction === '' ? 'desc' : sort.direction;
    switch (sort.active) {
      case 'name':
        return { name: dir };
      case 'fireNumber':
        return { fireNumber: dir };
      case 'statusAsAt':
        return { statusAsAt: dir };
      case 'districtId':
        return { districtId: dir };
      default:
        return { createdAt: 'desc' };
    }
  }
}
