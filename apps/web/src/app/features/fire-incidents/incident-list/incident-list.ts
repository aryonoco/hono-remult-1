import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSortModule, type Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { FireIncident, INCIDENT_LEVEL_LABELS, type IncidentLevel } from '@workspace/shared-domain';
import { type EntityOrderBy, type LiveQueryChangeInfo, remult } from 'remult';
import { map } from 'rxjs';

import { DevAuthService } from '../../../core/dev-auth.service';
import { NotificationService } from '../../../core/notification.service';
import { canCreateIncident } from '../../../shared/auth/permissions';
import { StatusBadgeComponent } from '../../../shared/components/status-badge/status-badge';
import { toErrorMessage } from '../../../shared/util/to-error-message';

const DEFAULT_PAGE_SIZE = 10;

// Columns whose header re-issues the server-side `orderBy`. `district` is a relation column that the API
// cannot order by, so it is sorted client-side in `sortedIncidents`; everything else falls back to the
// entity's default `createdAt desc`.
type SortKey = 'name' | 'fireNumber' | 'statusAsAt' | 'district' | 'createdAt';
type SortDirection = 'asc' | 'desc' | '';
interface SortState {
  active: SortKey;
  direction: SortDirection;
}
interface PageState {
  pageIndex: number;
  pageSize: number;
}
type ViewState = 'anonymous' | 'loading' | 'error' | 'empty' | 'content';

@Component({
  selector: 'app-incident-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DecimalPipe,
    RouterLink,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatSortModule,
    MatTableModule,
    StatusBadgeComponent,
  ],
  templateUrl: './incident-list.html',
  styles: `
    :host {
      display: block;
    }

    .list-head {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1.25rem;
    }

    .list-head__title {
      margin: 0;
      font-size: 1.5rem;
      font-weight: 700;
      letter-spacing: -0.01em;
    }

    .list-head__count {
      color: var(--mat-sys-on-surface-variant);
      font-size: 0.8125rem;
      font-family: var(--font-mono);
    }

    .spacer {
      flex: 1 1 auto;
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

    .table-panel {
      border: var(--app-grid-border);
      border-radius: var(--app-radius-card);
      overflow: hidden;
      background: var(--mat-sys-surface);
    }

    .table-scroll {
      overflow-x: auto;
    }

    table {
      width: 100%;
    }

    /* Sticky header sits on a solid container tint so rows scroll cleanly beneath it. */
    th.mat-mdc-header-cell {
      background: var(--mat-sys-surface-container);
      font-weight: 600;
    }

    tr.mat-mdc-row:nth-child(even) {
      background: color-mix(in srgb, var(--mat-sys-surface-container-low) 60%, transparent);
    }

    tr.mat-mdc-row:hover {
      background: var(--mat-sys-surface-container-high);
    }

    .num {
      text-align: right;
    }

    .mono {
      font-family: var(--font-mono);
      font-variant-numeric: tabular-nums;
    }

    .row-link {
      font-weight: 500;
    }

    .major-flag {
      color: var(--mat-sys-error);
      vertical-align: middle;
    }

    mat-paginator {
      border-top: var(--app-grid-border);
    }

    /* ── Handset cards ── */
    .cards {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .card {
      display: block;
      padding: 0.875rem 1rem;
      border: var(--app-grid-border);
      border-radius: var(--app-radius-card);
      background: var(--mat-sys-surface);
      color: inherit;
      text-decoration: none;
    }

    .card__top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .card__name {
      font-weight: 600;
    }

    .card__meta {
      margin-top: 0.375rem;
      font-size: 0.8125rem;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class IncidentListComponent {
  private readonly devAuth = inject(DevAuthService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly notification = inject(NotificationService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly displayedColumns: string[] = [
    'name',
    'district',
    'fireNumber',
    'status',
    'fireAreaHectares',
    'incidentLevel',
    'isMajor',
    'statusAsAt',
    'nextReportDue',
  ];

  protected readonly currentUser = this.devAuth.currentUser;
  protected readonly canCreate = computed(() => canCreateIncident(this.devAuth.currentUser()));
  protected readonly isHandset = toSignal(
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  protected readonly rawIncidents = signal<FireIncident[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly sortState = signal<SortState>({ active: 'createdAt', direction: 'desc' });
  protected readonly pageState = signal<PageState>({ pageIndex: 0, pageSize: DEFAULT_PAGE_SIZE });

  // `district` is a relation the API cannot order by, so its sort is applied here; all other active sorts
  // are already honoured by the server `orderBy`.
  protected readonly sortedIncidents = computed(() => {
    const sort = this.sortState();
    const items = this.rawIncidents();
    if (sort.active !== 'district' || sort.direction === '') {
      return items;
    }
    const factor = sort.direction === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      const byName = (a.district?.name ?? '').localeCompare(b.district?.name ?? '');
      return byName !== 0 ? byName * factor : a.fireNumber - b.fireNumber;
    });
  });

  protected readonly pagedIncidents = computed(() => {
    const { pageIndex, pageSize } = this.pageState();
    const start = pageIndex * pageSize;
    return this.sortedIncidents().slice(start, start + pageSize);
  });

  protected readonly viewState = computed<ViewState>(() => {
    if (this.currentUser() === undefined) {
      return 'anonymous';
    }
    if (this.loading()) {
      return 'loading';
    }
    if (this.error() !== null) {
      return 'error';
    }
    return this.rawIncidents().length === 0 ? 'empty' : 'content';
  });

  // The dev-user switcher does not re-scope an open live query, so the subscription is keyed on the user id
  // and re-opened whenever the user or the requested order changes.
  private readonly userKey = computed(() => this.devAuth.currentUser()?.id);
  private unsubscribe: (() => void) | null = null;

  constructor() {
    effect(() => {
      const id = this.userKey();
      const sort = this.sortState();
      this.subscribeForUser(id, sort);
    });
    this.destroyRef.onDestroy(() => this.unsubscribe?.());
  }

  protected onSortChange(event: Sort): void {
    this.sortState.set({ active: event.active as SortKey, direction: event.direction });
  }

  protected onPage(event: PageEvent): void {
    this.pageState.set({ pageIndex: event.pageIndex, pageSize: event.pageSize });
  }

  // Routed through a typed parameter because MatTable cell contexts (`let incident`) are `any`; indexing the
  // total label record with a typed `IncidentLevel` keeps the access checked.
  protected levelLabel(level: IncidentLevel): string {
    return INCIDENT_LEVEL_LABELS[level];
  }

  private subscribeForUser(id: string | undefined, sort: SortState): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pageState.update((page) => ({ ...page, pageIndex: 0 }));

    // `FireIncident.allowApiRead` is `Allow.authenticated`; an anonymous read is a 403, not an empty list,
    // so the query is skipped entirely until a dev user is selected.
    if (id === undefined) {
      this.rawIncidents.set([]);
      this.loading.set(false);
      this.error.set(null);
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.unsubscribe = remult
      .repo(FireIncident)
      .liveQuery({ include: { district: true }, orderBy: this.mapSort(sort) })
      .subscribe({
        next: (info: LiveQueryChangeInfo<FireIncident>) => {
          this.rawIncidents.set(info.items);
          this.loading.set(false);
          this.error.set(null);
        },
        error: (cause: unknown) => {
          const message = toErrorMessage(cause);
          this.error.set(message);
          this.loading.set(false);
          this.notification.error(message);
        },
      });
  }

  private mapSort(sort: SortState): EntityOrderBy<FireIncident> {
    if (sort.direction === '') {
      return { createdAt: 'desc' };
    }
    switch (sort.active) {
      case 'name':
        return { name: sort.direction };
      case 'fireNumber':
        return { fireNumber: sort.direction };
      case 'statusAsAt':
        return { statusAsAt: sort.direction };
      default:
        // `district` (relation, client-sorted) and `createdAt` fall back to the entity default order.
        return { createdAt: 'desc' };
    }
  }
}
