import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { type MatSelectChange, MatSelectModule } from '@angular/material/select';
import { type CurrentUser, DEV_DISTRICT_NAMES, DEV_USERS } from '@workspace/shared-domain';

import { DevAuthService } from '../../core/dev-auth.service';

// Dev-only identity switcher: a Material select that lets a developer impersonate any of the seeded
// `DEV_USERS` (or run anonymous). Mirrors the active id into a local signal and drives the real
// `DevAuthService.selectUser` contract on every change — the rest of the app reacts to `remult.user`.
@Component({
  selector: 'app-dev-user-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatFormFieldModule, MatSelectModule],
  template: `
    <div class="flex items-center gap-2 text-xs">
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="switcher">
        <mat-select
          aria-label="Dev user"
          [value]="selectedUserId()"
          (selectionChange)="onUserChange($event)"
        >
          <mat-option value="">Anonymous (no user)</mat-option>
          @for (user of devUsers; track user.id) {
            <mat-option [value]="user.id">
              {{ user.name }} ({{ formatRoles(user) }} · {{ formatDistrict(user) }})
            </mat-option>
          }
        </mat-select>
      </mat-form-field>
      @if (currentUserDisplay(); as user) {
        <span class="hidden text-muted md:inline">
          {{ user.roles?.join(', ') || 'none' }} · {{ formatDistrict(user) }}
        </span>
      } @else {
        <span class="hidden text-muted md:inline">Not authenticated</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: inline-flex;
    }

    /* Keep the field compact enough to sit in the app bar without dominating it. */
    .switcher {
      width: 14rem;
      max-width: 50vw;
      font-size: 0.75rem;
    }

    /* On handset widths shrink the switcher so it and the theme toggle both fit the app bar at ~390px
       without truncating. 40rem is Tailwind's sm breakpoint (640px at the default 16px root); using rem
       lets the guard scale with the user's root font size. */
    @media (max-width: 40rem) {
      .switcher {
        width: 10rem;
        max-width: 40vw;
        font-size: 0.7rem;
      }
    }
  `,
})
export class DevUserSwitcherComponent {
  private readonly devAuth = inject(DevAuthService);

  protected readonly devUsers: readonly CurrentUser[] = DEV_USERS;
  protected readonly selectedUserId = signal<string>(this.devAuth.currentUserId ?? '');
  protected readonly currentUserDisplay = this.devAuth.currentUser;

  protected formatRoles(user: CurrentUser): string {
    return user.roles?.join(', ') || 'no roles';
  }

  protected formatDistrict(user: CurrentUser): string {
    if (user.districtId === null) {
      return 'all districts';
    }
    return DEV_DISTRICT_NAMES[user.districtId] ?? `district ${user.districtId}`;
  }

  protected async onUserChange(event: MatSelectChange<string>): Promise<void> {
    const userId: string = event.value || '';
    this.selectedUserId.set(userId);
    await this.devAuth.selectUser(userId || undefined);
  }
}
