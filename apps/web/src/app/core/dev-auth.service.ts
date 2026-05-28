import { Injectable, signal } from '@angular/core';
import { type CurrentUser, DEV_USERS } from '@workspace/shared-domain';
import { remult } from 'remult';

const STORAGE_KEY = 'dev-auth-user-id';

@Injectable({ providedIn: 'root' })
export class DevAuthService {
  private readonly _currentUser = signal<CurrentUser | undefined>(undefined);
  readonly currentUser = this._currentUser.asReadonly();

  constructor() {
    const storedId: string | null = localStorage.getItem(STORAGE_KEY);
    let initialUser: CurrentUser | undefined;
    if (storedId) {
      initialUser = DEV_USERS.find((u: CurrentUser) => u.id === storedId);
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
      const user: CurrentUser | undefined = DEV_USERS.find((u: CurrentUser) => u.id === userId);
      this._currentUser.set(user);
      localStorage.setItem(STORAGE_KEY, userId);
    } else {
      this._currentUser.set(undefined);
      localStorage.removeItem(STORAGE_KEY);
    }
    await remult.initUser();
  }
}
