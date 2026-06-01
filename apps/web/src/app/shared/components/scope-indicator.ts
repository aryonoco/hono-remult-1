import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

import { DevAuthService } from '../../core/dev-auth.service';
import { currentScope } from '../auth/scope';

// A single, consistent affordance stating the data scope of the surrounding page: "Statewide" for
// elevated roles (admin / state officer, who read every district) or "<District> district" for a
// district-scoped viewer or editor. It derives the scope from the shared `currentScope` helper — the
// same source the page/section headings use — so the label always matches the data the user can
// actually see (SCOPE-1/5) and never disagrees with a heading. The label is real text (the icon is
// decorative), so scope is never conveyed by colour alone.
@Component({
  selector: 'app-scope-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatIconModule],
  template: `
    @if (scope(); as s) {
      <span class="scope" [class.scope--statewide]="s.statewide" [title]="'Data scope: ' + s.label">
        <mat-icon class="scope__icon" aria-hidden="true">{{ s.statewide ? 'public' : 'place' }}</mat-icon>
        <span class="scope__text"><span class="scope__prefix">Scope:</span> {{ s.label }}</span>
      </span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      min-inline-size: 0;
    }

    .scope {
      display: inline-flex;
      align-items: center;
      gap: 0.3125rem;
      padding-block: 0.1875rem;
      padding-inline: 0.5rem 0.6875rem;
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 999px;
      background: var(--mat-sys-surface-container-high);
      color: var(--mat-sys-on-surface-variant);
      font-family: var(--font-sans);
      font-size: 0.8125rem;
      font-weight: 600;
      line-height: 1.35;
      white-space: nowrap;
    }

    /* The statewide view carries a quiet primary tint so an elevated operator can recognise it at a
       glance; the icon + text still distinguish the two, so scope is never colour-only. */
    .scope--statewide {
      border-color: color-mix(in srgb, var(--mat-sys-primary) 40%, transparent);
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }

    .scope__icon {
      flex: none;
      inline-size: 1rem;
      block-size: 1rem;
      font-size: 1rem;
    }

    /* The "Scope:" prefix orients screen-reader users without adding visual noise. */
    .scope__prefix {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
  `,
})
export class ScopeIndicatorComponent {
  private readonly devAuth = inject(DevAuthService);

  protected readonly scope = computed(() => currentScope(this.devAuth.currentUser()));
}
