import { Component, inject, signal } from '@angular/core';
import { type CurrentUser, DEV_DISTRICT_NAMES, DEV_USERS } from '@workspace/shared-domain';

import { DevAuthService } from '../../core/dev-auth.service';

@Component({
  selector: 'app-dev-user-switcher',
  template: `
    <div
      class="fixed bottom-4 right-4 z-50 rounded-lg border border-amber-300 bg-amber-50/95 p-3 text-xs shadow-lg backdrop-blur-sm"
    >
      <div class="mb-1 font-semibold text-amber-800">Dev Auth</div>
      <select
        class="w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs"
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
        <div class="mt-1 text-amber-700">
          Roles: {{ user.roles?.join(', ') || 'none' }} · District: {{ formatDistrict(user) }}
        </div>
      } @else {
        <div class="mt-1 text-amber-700">Not authenticated</div>
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
