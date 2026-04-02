import { Injectable, signal } from '@angular/core';
import { DEV_USERS } from '@workspace/shared-domain';
import type { UserInfo } from 'remult';
import { remult } from 'remult';

const STORAGE_KEY = 'dev-auth-user-id';

@Injectable({ providedIn: 'root' })
export class DevAuthService {
  private readonly _currentUser = signal<UserInfo | undefined>(undefined);
  readonly currentUser = this._currentUser.asReadonly();

  constructor() {
    const storedId: string | null = localStorage.getItem(STORAGE_KEY);
    let initialUser: UserInfo | undefined;
    if (storedId) {
      initialUser = DEV_USERS.find((u: UserInfo) => u.id === storedId);
    } else {
      const [defaultUser] = DEV_USERS;
      initialUser = defaultUser;
    }
    this._currentUser.set(initialUser);
  }

  get currentUserId(): string | undefined {
    return this._currentUser()?.id;
  }

  async selectUser(userId: string | undefined): Promise<void> {
    if (userId) {
      const user: UserInfo | undefined = DEV_USERS.find((u: UserInfo) => u.id === userId);
      this._currentUser.set(user);
      localStorage.setItem(STORAGE_KEY, userId);
    } else {
      this._currentUser.set(undefined);
      localStorage.removeItem(STORAGE_KEY);
    }
    await remult.initUser();
  }
}
