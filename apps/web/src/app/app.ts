import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, DestroyRef, inject } from '@angular/core';
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

import { DevAuthService } from './core/dev-auth.service';
import { DevUserSwitcherComponent } from './shared/components/dev-user-switcher';
import { ThemeToggleComponent } from './shared/components/theme-toggle/theme-toggle';

// Reading-measure intent for the content column, declared on each route's `data` and resolved here.
type ContentWidth = 'form' | 'detail' | 'wide';
interface RouteData {
  width?: ContentWidth;
}

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

  constructor() {
    // SC 2.4.3 / 2.4.11: on every completed navigation move focus to the content landmark so keyboard
    // and screen-reader users land in the new view rather than at the top of the (unchanged) chrome.
    // `queueMicrotask` defers until the freshly routed component has rendered `#main`.
    this.router.events.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((event) => {
      if (event instanceof NavigationEnd) {
        queueMicrotask(() => document.getElementById('main')?.focus());
      }
    });
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
