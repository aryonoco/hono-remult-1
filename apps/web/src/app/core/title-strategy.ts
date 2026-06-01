import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { type RouterStateSnapshot, TitleStrategy } from '@angular/router';

// Per-route document title strategy. Each route declares a short `title` (e.g. 'Incidents'); this
// suffixes the app wordmark so the browser tab / history reads 'Incidents — Fire Incidents'. A route
// with no resolved title (a defensive fallback — every route currently sets one) keeps the static
// index.html title so the tab never goes bare. The detail screen overrides the title imperatively
// once the incident name is known: that write wins over the route's 'Incident' fallback because
// Angular only applies the route title on navigation, not after the view's data has loaded.
const SUFFIX = ' — Fire Incidents';
const DEFAULT_TITLE = 'Fire Incidents — Operations Console';

@Injectable({ providedIn: 'root' })
export class AppTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const resolved = this.buildTitle(snapshot);
    this.title.setTitle(resolved === undefined ? DEFAULT_TITLE : `${resolved}${SUFFIX}`);
  }
}
