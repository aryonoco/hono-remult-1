import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  Injector,
  inject,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import {
  ActivatedRoute,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { type CurrentUser, DEV_DISTRICT_NAMES } from '@workspace/shared-domain';
import { filter, map, startWith } from 'rxjs';

import { BreadcrumbService } from './core/breadcrumb.service';
import { DevAuthService } from './core/dev-auth.service';
import { DevUserSwitcherComponent } from './shared/components/dev-user-switcher';
import { ThemeToggleComponent } from './shared/components/theme-toggle/theme-toggle';

// Reading-measure intent for the content column, declared on each route's `data` and resolved here.
type ContentWidth = 'form' | 'detail' | 'wide';
interface RouteData {
  width?: ContentWidth;
  breadcrumb?: string;
  // Flags the `:id` detail route so the shell swaps in the BreadcrumbService's runtime incident name.
  dynamicBreadcrumb?: boolean;
}

// One rendered breadcrumb. `commands` is an absolute router-link path to the crumb's route; `preserveFilters`
// is true only for the 'Incidents' crumb when a deeper segment is open, so its link carries the forwarded
// fy/group/districtId/region back to the originating filtered list — every other crumb is a clean link.
interface Crumb {
  label: string;
  commands: string[];
  preserveFilters: boolean;
}

// The structural crumb captured from the route tree at navigation time. `dynamic` marks the `:id` detail
// crumb whose label is resolved late against the live incident name.
interface RawCrumb extends Crumb {
  dynamic: boolean;
}

// The originating filtered list lives at the `incidents` segment, so its crumb is the only one that carries
// the forwarded filter query params (fy/group/districtId/region) back when a deeper segment is open.
const INCIDENTS_SEGMENT = 'incidents';

// The overview is the trail's implicit home: every deeper route hangs off it, so a synthesised Overview
// crumb leads any rendered trail (except the overview itself, where the route walk already supplies it).
const HOME_CRUMB: RawCrumb = {
  label: 'Overview',
  commands: ['/overview'],
  dynamic: false,
  preserveFilters: false,
};

// Single-segment routes (overview, the bare incidents list) show no trail — only routes nested one level
// deeper (a detail or a form) do. Resolved-segment count, not crumb count, is the depth signal.
const MIN_TRAIL_DEPTH = 2;

const ROLE_LABELS: Readonly<Record<string, string>> = {
  viewer: 'Viewer',
  incidentEditor: 'Incident Editor',
  stateOfficer: 'State Officer',
  admin: 'Administrator',
};

const NAME_SPLIT = /\s+/;

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatToolbarModule,
    MatSidenavModule,
    MatListModule,
    MatButtonModule,
    MatIconModule,
    DevUserSwitcherComponent,
    ThemeToggleComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  private readonly devAuth = inject(DevAuthService);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);
  private readonly breadcrumb = inject(BreadcrumbService);

  // Guards the very first NavigationEnd (initial page load) so route-change focus management never
  // hijacks the browser's own initial focus; flips true after the first completed navigation.
  private hasNavigated = false;

  protected readonly currentUser = this.devAuth.currentUser;

  protected readonly isHandset = toSignal(
    this.breakpointObserver.observe(Breakpoints.Handset).pipe(map((result) => result.matches)),
    { initialValue: false },
  );

  // Widest sensible default; each route narrows it (forms read best in a tighter column).
  protected readonly contentWidth = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.resolveWidth()),
    ),
    { initialValue: 'detail' as ContentWidth },
  );

  // The structural trail, rebuilt from the activated-route tree on every completed navigation. The
  // `:id` detail crumb keeps `dynamic: true` so its label is resolved late (against the live incident
  // name) rather than frozen at navigation time.
  private readonly routeTrail = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.buildTrail()),
    ),
    { initialValue: [] as RawCrumb[] },
  );

  // The rendered breadcrumbs: the structural trail with the dynamic crumb's label resolved against the
  // BreadcrumbService (the incident name once the detail page publishes it, else the 'Incident' fallback).
  // Both the trail signal and the dynamic-label signal are read here, so a late-arriving name re-renders
  // the last crumb. A lone crumb (overview, or the bare incidents list) yields an empty trail — the
  // template only renders the nav when there are >=2 crumbs.
  protected readonly breadcrumbs = computed<Crumb[]>(() => {
    const trail = this.routeTrail();
    if (trail.length < 2) {
      return [];
    }
    const dynamicLabel = this.breadcrumb.dynamicLabel();
    return trail.map((raw) => ({
      label: raw.dynamic ? (dynamicLabel ?? raw.label) : raw.label,
      commands: raw.commands,
      preserveFilters: raw.preserveFilters,
    }));
  });

  constructor() {
    // SC 2.4.3 / 4.1.3: on each completed (non-initial) navigation move keyboard/screen-reader focus
    // to the new view's primary heading (the `h1[tabindex="-1"]` carries scroll-margin so it clears
    // the sticky app bar), falling back to the `#main` landmark when a view has no such heading, so
    // the view change is perceivable rather than leaving focus on the unchanged chrome.
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (!(event instanceof NavigationEnd)) {
        return;
      }
      // Skip the very first navigation (initial page load) so the browser's own initial focus stands.
      if (!this.hasNavigated) {
        this.hasNavigated = true;
        return;
      }
      this.focusNewView();
    });
  }

  // Schedule the focus move for after the freshly routed view has rendered. `afterNextRender` runs
  // once post-render and is zoneless-safe; it needs an injection context, hence the explicit injector.
  private focusNewView(): void {
    afterNextRender(
      () => {
        // Skip while a Material dialog (or any role=dialog overlay) is open: focus belongs to the
        // modal, and stealing it back to the page would trap keyboard users behind the dialog.
        const dialogOpen = document.querySelector(
          '.cdk-overlay-container .mat-mdc-dialog-container, .cdk-overlay-container [role=dialog]',
        );
        if (dialogOpen) {
          return;
        }
        const target =
          document.querySelector<HTMLElement>('main h1[tabindex="-1"]') ??
          document.getElementById('main');
        target?.focus({ preventScroll: false });
      },
      { injector: this.injector },
    );
  }

  private resolveWidth(): ContentWidth {
    let node = this.route.firstChild;
    let width: ContentWidth = 'detail';
    while (node) {
      const data = node.snapshot.data as RouteData;
      if (data.width) {
        width = data.width;
      }
      node = node.firstChild;
    }
    return width;
  }

  // Walk the activated-route tree from the root, accumulating each matched segment's URL parts so every
  // crumb links to its own absolute path, and emitting a crumb for each route that declares `data.breadcrumb`
  // (the `incidents` section crumb lives on the parent route, so a detail/form inherits it as an ancestor).
  // A single-segment route (overview, the bare incidents list) returns an empty trail; deeper routes prepend
  // the Overview home crumb so the trail reads Overview / Incidents / <leaf>. The 'Incidents' crumb preserves
  // filters only while a deeper segment follows it, so a drill-back to the list restores the originating
  // fy/group/districtId/region; every other crumb is a clean link. Path resolution is structural (URL
  // segments), so it is unaffected by the late dynamic label.
  private buildTrail(): RawCrumb[] {
    const crumbs: RawCrumb[] = [];
    const segments: string[] = [];
    let node = this.route.firstChild;
    while (node) {
      segments.push(...node.snapshot.url.map((segment) => segment.path));
      const data = node.snapshot.data as RouteData;
      if (data.breadcrumb) {
        crumbs.push({
          label: data.breadcrumb,
          commands: ['/', ...segments],
          dynamic: data.dynamicBreadcrumb === true,
          preserveFilters: false,
        });
      }
      node = node.firstChild;
    }
    // Suppress the lone-section trail: overview and the bare incidents list are single-segment routes.
    if (segments.length < MIN_TRAIL_DEPTH) {
      return [];
    }
    // Prepend the Overview home crumb unless the walk already leads with it (defensive — every deeper route
    // currently hangs off a feature section, not off overview).
    const ledByHome = crumbs[0]?.commands.join('/') === HOME_CRUMB.commands.join('/');
    const withHome = ledByHome ? crumbs : [HOME_CRUMB, ...crumbs];
    const last = withHome.length - 1;
    return withHome.map((crumb, index) => ({
      ...crumb,
      // The incidents-list crumb resolves to exactly one segment (`/incidents`); preserve its filters only
      // while it is not the tail (a detail/form sits below), so the back-link restores the originating list.
      preserveFilters:
        crumb.commands.length === 2 && crumb.commands[1] === INCIDENTS_SEGMENT && index < last,
    }));
  }

  protected roleLabel(user: CurrentUser): string {
    const roles = user.roles ?? [];
    if (roles.length === 0) {
      return 'No role';
    }
    return roles.map((role) => ROLE_LABELS[role] ?? role).join(', ');
  }

  protected districtLabel(user: CurrentUser): string {
    if (user.districtId === null) {
      return 'All districts';
    }
    return DEV_DISTRICT_NAMES[user.districtId] ?? `District ${user.districtId}`;
  }

  protected initials(name: string | undefined): string {
    return (name ?? '')
      .split(NAME_SPLIT)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? '')
      .join('');
  }
}
