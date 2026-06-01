import { Injectable, signal } from '@angular/core';

// Carries a runtime-resolved crumb label for the routes whose final segment is a record id rather than
// a static word (the incident-detail `:id`). The detail screen publishes the loaded incident's name once
// the fire resolves, so the breadcrumb trail shows that name instead of the raw id; it clears back to null
// on destroy, so a stale name never leaks onto the next incident before its fire has loaded.
@Injectable({ providedIn: 'root' })
export class BreadcrumbService {
  private readonly _dynamicLabel = signal<string | null>(null);
  readonly dynamicLabel = this._dynamicLabel.asReadonly();

  set(label: string | null): void {
    this._dynamicLabel.set(label);
  }
}
