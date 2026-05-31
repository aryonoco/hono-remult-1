import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import {
  COST_CLASS_LABELS,
  type CostClass,
  type FinalReport,
  INVESTIGATION_TYPE_LABELS,
  type InvestigationType,
  LEGAL_ACTION_STATUS_LABELS,
  type LegalActionStatus,
  operatorName,
} from '@workspace/shared-domain';

// The incident-detail final-report subpanel, extracted so the detail screen can `@defer` it (load on
// viewport). Presentational: gating decisions arrive as boolean inputs and the two write actions surface as
// outputs the parent wires to its BackendMethod calls.
@Component({
  selector: 'app-final-report-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, RouterLink, MatButtonModule, MatCardModule, MatIconModule],
  template: `
    @let r = report();
    <mat-card
      class="rounded-card border border-outline-variant bg-surface-container-low p-4"
      data-testid="final-report-panel"
    >
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="m-0 font-display text-lg font-semibold">Final report</h2>
        @if (r.isSignedOff) {
          <span
            class="inline-flex items-center gap-1 rounded-md border border-current/25 bg-status-safe-bg px-2 py-0.5 text-xs font-semibold text-status-safe"
          >
            <mat-icon class="h-4! w-4! text-[1rem]!" aria-hidden="true">verified</mat-icon>
            Signed off by {{ signedOffByName() }} · {{ r.signedOffAt | date: 'dd/MM/yy, HH:mm' }}
          </span>
        } @else if (r.signOffRemovedBy) {
          <span
            class="inline-flex items-center gap-1 rounded-md border border-current/25 bg-status-neutral-bg px-2 py-0.5 text-xs font-semibold text-status-neutral"
          >
            <mat-icon class="h-4! w-4! text-[1rem]!" aria-hidden="true">lock_open</mat-icon>
            Sign-off removed by {{ signOffRemovedByName() }}
            @if (r.signOffRemovedAt) {
              · {{ r.signOffRemovedAt | date: 'dd/MM/yy, HH:mm' }}
            }
          </span>
        }
      </div>

      <dl class="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
        <div>
          <dt class="text-xs text-on-surface-variant">Stock lost</dt>
          <dd class="m-0 font-mono tabular-nums">{{ r.stockLost ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-on-surface-variant">Homes lost</dt>
          <dd class="m-0 font-mono tabular-nums">{{ r.homesLost ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-on-surface-variant">Sheds lost</dt>
          <dd class="m-0 font-mono tabular-nums">{{ r.shedsLost ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-on-surface-variant">Fencing lost (km)</dt>
          <dd class="m-0 font-mono tabular-nums">{{ r.fencingLostKm ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-on-surface-variant">Crop loss (ha)</dt>
          <dd class="m-0 font-mono tabular-nums">{{ r.cropLossHectares ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-on-surface-variant">Offence suspected</dt>
          <dd class="m-0">{{ r.isOffenceSuspected ? 'Yes' : 'No' }}</dd>
        </div>
        @if (r.investigationType) {
          <div>
            <dt class="text-xs text-on-surface-variant">Investigation</dt>
            <dd class="m-0">{{ investigationLabel(r.investigationType) }}</dd>
          </div>
        }
        @if (r.legalActionStatus) {
          <div>
            <dt class="text-xs text-on-surface-variant">Legal action</dt>
            <dd class="m-0">{{ legalActionLabel(r.legalActionStatus) }}</dd>
          </div>
        }
        @if (r.costClass) {
          <div>
            <dt class="text-xs text-on-surface-variant">Cost class</dt>
            <dd class="m-0">{{ costClassLabel(r.costClass) }}</dd>
          </div>
        }
        <div>
          <dt class="text-xs text-on-surface-variant">Burnt state forest (ha)</dt>
          <dd class="m-0 font-mono tabular-nums">{{ r.burntStateForest ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-on-surface-variant">Burnt national park (ha)</dt>
          <dd class="m-0 font-mono tabular-nums">{{ r.burntNationalPark ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-on-surface-variant">Burnt private property (ha)</dt>
          <dd class="m-0 font-mono tabular-nums">{{ r.burntPrivateProperty ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-on-surface-variant">Burnt plantation (ha)</dt>
          <dd class="m-0 font-mono tabular-nums">{{ r.burntPlantation ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-xs text-on-surface-variant">Burnt other (ha)</dt>
          <dd class="m-0 font-mono tabular-nums">{{ r.burntOther ?? '—' }}</dd>
        </div>
      </dl>

      @if (r.investigationBy) {
        <p class="mt-2 text-sm">
          <span class="text-on-surface-variant">Investigation by:</span> {{ r.investigationBy }}
        </p>
      }
      @if (r.infrastructureLosses) {
        <p class="mt-2 text-sm">
          <span class="text-on-surface-variant">Infrastructure losses:</span> {{ r.infrastructureLosses }}
        </p>
      }
      @if (r.otherLosses) {
        <p class="mt-1 text-sm"><span class="text-on-surface-variant">Other losses:</span> {{ r.otherLosses }}</p>
      }

      <div class="mt-4 flex flex-wrap gap-2">
        @if (canSign()) {
          <button
            matButton="outlined"
            type="button"
            data-testid="action-signoff"
            (click)="signOff.emit()"
          >
            <mat-icon>verified</mat-icon>
            Sign off
          </button>
        }
        @if (canRemoveSign()) {
          <button
            matButton="outlined"
            type="button"
            data-testid="action-remove-signoff"
            (click)="removeSignOff.emit()"
          >
            <mat-icon>lock_open</mat-icon>
            Remove sign-off
          </button>
        }
        @if (canEditFinal()) {
          <a
            matButton="outlined"
            data-testid="action-edit-final"
            [routerLink]="['/incidents', fireId(), 'final', 'edit']"
          >
            <mat-icon>edit</mat-icon>
            Edit
          </a>
        }
      </div>
    </mat-card>
  `,
})
export class FinalReportPanelComponent {
  readonly report = input.required<FinalReport>();
  readonly fireId = input.required<string>();
  readonly canSign = input(false);
  readonly canRemoveSign = input(false);
  readonly canEditFinal = input(false);
  readonly signOff = output<void>();
  readonly removeSignOff = output<void>();

  // Resolve the stored operator/user ids to display names (the seed stores ids like `op-45-3`).
  protected readonly signedOffByName = computed(() => operatorName(this.report().signedOffBy));
  protected readonly signOffRemovedByName = computed(() =>
    operatorName(this.report().signOffRemovedBy),
  );

  protected investigationLabel(type: InvestigationType): string {
    return INVESTIGATION_TYPE_LABELS[type];
  }

  protected legalActionLabel(legalAction: LegalActionStatus): string {
    return LEGAL_ACTION_STATUS_LABELS[legalAction];
  }

  protected costClassLabel(costClass: CostClass): string {
    return COST_CLASS_LABELS[costClass];
  }
}
