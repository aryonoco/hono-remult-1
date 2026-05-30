import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { type CurrentUser, DEV_DISTRICT_NAMES, DEV_USERS } from '@workspace/shared-domain';

import { DevAuthService } from '../../core/dev-auth.service';

@Component({
  selector: 'app-dev-user-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-2 text-xs">
      <label class="sr-only" for="dev-user-select">Dev user</label>
      <select
        id="dev-user-select"
        class="rounded border px-2 py-1 text-xs"
        [value]="selectedUserId()"
        (change)="onUserChange($event)"
      >
        <option value="">Anonymous (no user)</option>
        @for (user of devUsers; track user.id) {
          <option [value]="user.id">
            {{ user.name }} ({{ formatRoles(user) }} · {{ formatDistrict(user) }})
          </option>
        }
      </select>
      @if (currentUserDisplay(); as user) {
        <span class="hidden text-muted md:inline">
          {{ user.roles?.join(', ') || 'none' }} · {{ formatDistrict(user) }}
        </span>
      } @else {
        <span class="hidden text-muted md:inline">Not authenticated</span>
      }
    </div>
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

  protected async onUserChange(event: Event): Promise<void> {
    const target = event.target as HTMLSelectElement;
    const userId: string = target.value;
    this.selectedUserId.set(userId);
    await this.devAuth.selectUser(userId || undefined);
  }
}
