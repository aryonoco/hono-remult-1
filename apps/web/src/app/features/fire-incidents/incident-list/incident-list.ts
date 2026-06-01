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
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSortModule, type Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, type ParamMap, Router, RouterLink } from '@angular/router';
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

import { type Density, DensityService } from '../../../core/density.service';
import { DevAuthService } from '../../../core/dev-auth.service';
import { canCreateIncident, canViewDistrictRollup } from '../../../shared/auth/permissions';
import { CadenceCountdownComponent } from '../../../shared/components/cadence-countdown/cadence-countdown';
import { ScopeIndicatorComponent } from '../../../shared/components/scope-indicator';
import { SeverityTileComponent } from '../../../shared/components/severity-tile/severity-tile';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge';
import { SPINE_TONE } from '../../../shared/ui/tone-classes';
import { isTerminalStatus } from '../../../shared/util/fire-status';
import { toErrorMessage } from '../../../shared/util/to-error-message';

type StatusGroup = 'all' | 'active' | 'going' | 'major' | 'overdue' | 'resolved';
const STATUS_GROUPS: readonly StatusGroup[] = [
  'all',
  'active',
  'going',
  'major',
  'overdue',
  'resolved',
];
type SortKey = 'name' | 'fireNumber' | 'statusAsAt' | 'districtId' | 'createdAt';
const SORT_KEYS: readonly SortKey[] = [
  'name',
  'fireNumber',
  'statusAsAt',
  'districtId',
  'createdAt',
];
interface ListFilters {
  fy: number | 'all';
  group: StatusGroup;
  districtId: number | 'all';
  region: number | 'all';
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
interface DistrictOption {
  id: number;
  name: string;
  regionId: number;
  regionName: string;
}
// The deep-link query-param shape: only the non-default keys are emitted, so every field is optional.
interface ListQueryParams {
  fy?: number | 'all';
  group?: StatusGroup;
  districtId?: number;
  region?: number;
  sort?: SortKey;
  dir?: 'asc' | 'desc';
  page?: number;
  size?: number;
}

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
    ScopeIndicatorComponent,
  ],
  templateUrl: './incident-list.html',
  styleUrl: './incident-list.css',
})
export class IncidentListComponent {
  private readonly devAuth = inject(DevAuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly densityService = inject(DensityService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  // Template-facing references: the terminal-status guard (gates the cadence countdown on closed fires)
  // and the shared status-spine tone map (whole literal classes — never interpolated).
  protected readonly isTerminalStatus = isTerminalStatus;
  protected readonly spineTone = SPINE_TONE;
  protected readonly pageSizeOptions = PAGE_SIZE_OPTIONS;
  protected readonly skeletonRows = SKELETON_ROWS;
  // Row density is the app-wide, persisted preference (default compact) — the same source the form
  // pages' density toggle reads/writes, so changing it anywhere updates the whole console at once.
  protected readonly density = this.densityService.density;

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
    region: 'all',
  });
  protected readonly sortState = signal<SortState>({ active: 'createdAt', direction: 'desc' });
  protected readonly pageState = signal<PageState>({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });
  protected readonly fyOptions = computed<(number | 'all')[]>(() => {
    const current = computeFinancialYear(new Date());
    return ['all', ...Array.from({ length: current - FIRST_SEASON_FY + 1 }, (_, i) => current - i)];
  });
  protected readonly districtOptions = signal<DistrictOption[]>([]);
  // The region picker is derived from the loaded districts: one option per distinct region, sorted by
  // name. A region filter expands to the set of district IDs inside it (see `buildWhere`).
  protected readonly regionOptions = computed<{ regionId: number; regionName: string }[]>(() => {
    const seen = new Map<number, string>();
    for (const district of this.districtOptions()) {
      if (!seen.has(district.regionId)) {
        seen.set(district.regionId, district.regionName);
      }
    }
    return [...seen.entries()]
      .map(([regionId, regionName]) => ({ regionId, regionName }))
      .sort((a, b) => a.regionName.localeCompare(b.regionName));
  });

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

  // The count + live-query effects key on this. For the overdue group it folds in the minute tick so the
  // list re-subscribes each minute as fires cross their `nextReportDue`; every other group omits the tick
  // (tick = 0) so they never re-subscribe on the clock. `buildWhere` reads `this.now()` directly.
  private readonly whereKey = computed(() => {
    const f = this.filters();
    const tick = f.group === 'overdue' ? this.now().getTime() : 0;
    // A region filter expands to its district IDs, resolved from the asynchronously-loaded district list
    // (see `buildWhere`). Fold that resolved set into the key so the count/live-query effects re-run once
    // the districts arrive — otherwise an early `$in: []` (districts not yet loaded) would stick at zero
    // rows. District wins over region, so only resolve when no explicit district is pinned.
    const regionDistrictIds =
      f.region !== 'all' && f.districtId === 'all'
        ? this.districtOptions()
            .filter((d) => d.regionId === f.region)
            .map((d) => d.id)
        : [];
    return JSON.stringify({ ...f, tick, regionDistrictIds });
  });
  // Bumped by `retry()` to force the count + live-query effects to re-run after a transient failure.
  private readonly reloadTrigger = signal(0);
  private unsubscribe: (() => void) | null = null;

  constructor() {
    const tick = setInterval(() => this.now.set(new Date()), TICK_INTERVAL_MS);
    this.destroyRef.onDestroy(() => clearInterval(tick));
    // The URL query string is the source of truth: every read seeds the signals (deep-link + Back/Forward),
    // every control write navigates and the subscription reconciles back (a no-op via the equality guard).
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => this.readUrl(params));
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
      (districts) =>
        this.districtOptions.set(
          districts.map((d) => ({
            id: d.id,
            name: d.name,
            regionId: d.regionId,
            regionName: d.regionName,
          })),
        ),
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
    this.writeUrl();
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
    this.writeUrl();
  }

  protected setFy(fy: number | 'all'): void {
    this.filters.update((filters) => ({ ...filters, fy }));
    this.pageState.update((page) => ({ ...page, pageIndex: 0 }));
    this.writeUrl();
  }

  protected setStatusGroup(group: StatusGroup): void {
    this.filters.update((filters) => ({ ...filters, group }));
    this.pageState.update((page) => ({ ...page, pageIndex: 0 }));
    this.writeUrl();
  }

  protected setDistrict(districtId: number | 'all'): void {
    this.filters.update((filters) => ({ ...filters, districtId }));
    this.pageState.update((page) => ({ ...page, pageIndex: 0 }));
    this.writeUrl();
  }

  protected setRegion(region: number | 'all'): void {
    this.filters.update((filters) => ({ ...filters, region }));
    this.pageState.update((page) => ({ ...page, pageIndex: 0 }));
    this.writeUrl();
  }

  protected setDensity(density: Density): void {
    this.densityService.setDensity(density);
  }

  // Re-run the count + live query after a transient failure (the error-state Retry button, LIST-6/8).
  protected retry(): void {
    this.error.set(null);
    this.loading.set(true);
    this.reloadTrigger.update((n) => n + 1);
  }

  // Clear all filters back to their defaults (the empty-state "Clear filters" action, LIST-8). This also
  // rewrites the URL so a shared/bookmarked deep link is not silently re-applied by the subscription.
  // `fy: 'all'` is a deliberate widening (not the URL-omit default, which is the current FY), so it is
  // written out via `writeUrl` rather than dropped — otherwise the param reader would re-seed the current
  // FY from the empty URL and undo the reset.
  protected resetFilters(): void {
    this.filters.set({ fy: 'all', group: 'all', districtId: 'all', region: 'all' });
    this.pageState.update((page) => ({ ...page, pageIndex: 0 }));
    this.writeUrl();
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
    // Read the tick clock for the base bound and the overdue cut-off — the same instant for both so the
    // "reported by now" and "due before now" boundaries stay coherent within a single build.
    const now = this.now();
    // Never list fires reported after now: the dataset is pre-seeded out to FY2029, so future-dated
    // seasons exist but have not happened yet — without this the "All years" filter would surface them.
    const where: EntityFilter<FireIncident> = { reportedAt: { $lte: now } };
    if (filters.fy !== 'all') {
      where.financialYear = filters.fy;
    }
    if (filters.group === 'active') {
      where.status = { $nin: [...TERMINAL_STATUSES] };
    } else if (filters.group === 'going') {
      where.status = FireStatus.going;
    } else if (filters.group === 'major') {
      where.status = { $nin: [...TERMINAL_STATUSES] };
      where.isMajor = true;
    } else if (filters.group === 'overdue') {
      where.status = { $nin: [...TERMINAL_STATUSES] };
      where.nextReportDue = { $lt: now };
    } else if (filters.group === 'resolved') {
      where.status = { $in: [...TERMINAL_STATUSES] };
    }
    // District wins over region: an explicit district pins the scope, otherwise a region expands to the
    // set of district IDs it contains. Both are elevated-only (the URL reader clamps them away otherwise).
    if (filters.districtId !== 'all') {
      where.districtId = filters.districtId;
    } else if (filters.region !== 'all') {
      const districtIds = this.districtOptions()
        .filter((d) => d.regionId === filters.region)
        .map((d) => d.id);
      where.districtId = { $in: districtIds };
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

  // READ: parse the query string into the next signal values and apply each ONLY when it differs from the
  // current value. The equality guard is what lets `writeUrl` navigate freely — the re-emitted params land
  // here, parse back to the same objects, and short-circuit, so the data effects never double-fire.
  private readUrl(params: ParamMap): void {
    const filters = this.parseFilters(params);
    const sort = this.parseSort(params);
    const page = this.parsePage(params);
    if (JSON.stringify(filters) !== JSON.stringify(this.filters())) {
      this.filters.set(filters);
    }
    if (JSON.stringify(sort) !== JSON.stringify(this.sortState())) {
      this.sortState.set(sort);
    }
    if (JSON.stringify(page) !== JSON.stringify(this.pageState())) {
      this.pageState.set(page);
    }
  }

  private parseFilters(params: ParamMap): ListFilters {
    return {
      fy: this.parseFy(params.get('fy')),
      group: this.parseGroup(params.get('group')),
      districtId: this.parseScopeId(params.get('districtId')),
      region: this.parseScopeId(params.get('region')),
    };
  }

  // Absent or invalid → the current financial year (today's default). `all` is the only literal allowed.
  private parseFy(raw: string | null): number | 'all' {
    if (raw === 'all') {
      return 'all';
    }
    const current = computeFinancialYear(new Date());
    if (raw === null) {
      return current;
    }
    const value = Number(raw);
    if (Number.isInteger(value) && value >= FIRST_SEASON_FY && value <= current) {
      return value;
    }
    return current;
  }

  private parseGroup(raw: string | null): StatusGroup {
    return STATUS_GROUPS.find((group) => group === raw) ?? 'all';
  }

  // District/region are elevated-only scope widening: ignore them for non-elevated users so a hand-edited
  // URL cannot widen scope past the server's own row-level guard. Invalid values clamp to 'all'.
  private parseScopeId(raw: string | null): number | 'all' {
    if (!this.showDistrictFilter() || raw === null) {
      return 'all';
    }
    const value = Number(raw);
    return Number.isInteger(value) ? value : 'all';
  }

  private parseSort(params: ParamMap): SortState {
    const active = SORT_KEYS.find((key) => key === params.get('sort')) ?? 'createdAt';
    const dir = params.get('dir');
    const direction = dir === 'asc' || dir === 'desc' ? dir : 'desc';
    return { active, direction };
  }

  private parsePage(params: ParamMap): PageState {
    const pageRaw = Number(params.get('page'));
    const pageIndex = Number.isInteger(pageRaw) && pageRaw >= 0 ? pageRaw : 0;
    const sizeRaw = Number(params.get('size'));
    const pageSize = (PAGE_SIZE_OPTIONS as readonly number[]).includes(sizeRaw)
      ? sizeRaw
      : DEFAULT_PAGE_SIZE;
    return { pageIndex, pageSize };
  }

  // WRITE: navigate with ONLY the non-default keys (no `queryParamsHandling`, so cleared defaults drop out
  // of the URL). The subscription then reconciles the signals — a no-op via the `readUrl` equality guard.
  // A precise (non-index-signature) shape so the keys are real properties, not bracket-indexed lookups.
  private writeUrl(): void {
    const filters = this.filters();
    const sort = this.sortState();
    const page = this.pageState();
    const current = computeFinancialYear(new Date());
    const queryParams: ListQueryParams = {};
    if (filters.fy !== current) {
      queryParams.fy = filters.fy;
    }
    if (filters.group !== 'all') {
      queryParams.group = filters.group;
    }
    if (filters.districtId !== 'all') {
      queryParams.districtId = filters.districtId;
    }
    if (filters.region !== 'all') {
      queryParams.region = filters.region;
    }
    if (sort.active !== 'createdAt') {
      queryParams.sort = sort.active;
    }
    if (sort.direction !== '' && sort.direction !== 'desc') {
      queryParams.dir = sort.direction;
    }
    if (page.pageIndex !== 0) {
      queryParams.page = page.pageIndex;
    }
    if (page.pageSize !== DEFAULT_PAGE_SIZE) {
      queryParams.size = page.pageSize;
    }
    this.router.navigate([], { relativeTo: this.route, queryParams });
  }
}
