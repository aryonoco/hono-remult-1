import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
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
  private readonly injector = inject(Injector);

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
