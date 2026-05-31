import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
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
import {
  computeFinancialYear,
  District,
  FireIncident,
  FireStatus,
  INCIDENT_LEVEL_LABELS,
  type IncidentLevel,
  type StatusTone,
  statusTone,
  TERMINAL_STATUSES,
} from '@workspace/shared-domain';
import { ResultAsync } from 'neverthrow';
import { type EntityFilter, type EntityOrderBy, remult } from 'remult';
import { map } from 'rxjs';

import { DevAuthService } from '../../../core/dev-auth.service';
import { canCreateIncident, canViewDistrictRollup } from '../../../shared/auth/permissions';

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
interface DistrictOption {
  id: number;
  name: string;
}

const DEFAULT_PAGE_SIZE = 25;
const FIRST_SEASON_FY = 2018;
const DISTRICT_FETCH_LIMIT = 50;
const TICK_INTERVAL_MS = 60_000;
const PERCENT = 100;

const toErr = (cause: unknown): Error =>
  cause instanceof Error ? cause : new Error(String(cause));

@Component({
  selector: 'app-incident-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  templateUrl: './incident-list.html',
  styleUrl: './incident-list.css',
})
export class IncidentListComponent {
  private readonly devAuth = inject(DevAuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly breakpoints = inject(BreakpointObserver);

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
  protected readonly maxArea = computed(() =>
    Math.max(1, ...this.rows().map((row) => row.fireAreaHectares ?? 0)),
  );

  private readonly whereKey = computed(() => JSON.stringify(this.filters()));
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
        .subscribe((info) => {
          this.rows.set(info.items);
          this.loading.set(false);
        });
    });
  }

  protected onSortChange(event: { active: string; direction: 'asc' | 'desc' | '' }): void {
    this.sortState.set({ active: event.active as SortKey, direction: event.direction });
    this.pageState.update((page) => ({ ...page, pageIndex: 0 }));
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

  protected tone(status: FireStatus): StatusTone {
    return statusTone(status);
  }

  protected levelLabel(level: IncidentLevel): string {
    return INCIDENT_LEVEL_LABELS[level];
  }

  protected areaPct(incident: FireIncident): number {
    return Math.min(PERCENT, ((incident.fireAreaHectares ?? 0) / this.maxArea()) * PERCENT);
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
