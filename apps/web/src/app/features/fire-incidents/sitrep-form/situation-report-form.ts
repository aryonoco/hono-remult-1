import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  effect,
  Injector,
  inject,
  resource,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { FireIncident, SituationReport } from '@workspace/shared-domain';
import { remult } from 'remult';
import { map } from 'rxjs';

import { DevAuthService } from '../../../core/dev-auth.service';
import { NotificationService } from '../../../core/notification.service';
import { focusFirstInvalid } from '../../../shared/forms/focus-first-invalid';
import { buildForm, submitEntityForm } from '../../../shared/forms/form-engine';
import type { BuiltForm } from '../../../shared/forms/form-engine.types';
import { FormPageComponent, type FormPageState } from '../../../shared/forms/form-page';
import {
  type CanComponentDeactivate,
  confirmDiscardIfDirty,
} from '../../../shared/forms/unsaved-changes';
import { toErrorMessage } from '../../../shared/util/to-error-message';
import { situationReportFormConfig } from './situation-report.form-config';

// Create-only: a situation report is append-only (`SituationReport.allowApiUpdate` is false), so there is
// no edit path. The parent incident id comes from the `:id/sitrep` route and seeds the readonly
// `fireIncidentId` control; on save we return to the parent detail screen (sitreps have no own route).
@Component({
  selector: 'app-situation-report-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormPageComponent],
  template: `
    <app-form-page
      [title]="title()"
      [state]="pageState()"
      [built]="builtForm()"
      [submitting]="submitting()"
      [submitLabel]="submitLabel"
      (save)="onSave()"
      (cancel)="onCancel()"
    />
  `,
})
export class SituationReportFormComponent implements CanComponentDeactivate {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notification = inject(NotificationService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly devAuth = inject(DevAuthService);
  private readonly injector = inject(Injector);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  private readonly fireId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );
  private readonly currentUser = this.devAuth.currentUser;
  protected readonly submitting = signal(false);
  protected readonly builtForm = signal<BuiltForm | undefined>(undefined);
  private buildKey = '';

  // The parent is loaded only to title the page; it never gates readiness.
  private readonly parentResource = resource({
    params: () => {
      const user = this.currentUser();
      const id = this.fireId();
      return user && id ? { id } : undefined;
    },
    loader: async ({ params }: { params: { id: string } }): Promise<FireIncident | undefined> =>
      (await remult.repo(FireIncident).findId(params.id)) ?? undefined,
  });

  protected readonly title = computed(() => {
    const parent = this.parentResource.hasValue() ? this.parentResource.value() : undefined;
    return parent ? `New situation report — ${parent.name}` : 'New situation report';
  });
  protected readonly submitLabel = 'Save report';

  protected readonly pageState = computed<FormPageState>(() => {
    if (!this.currentUser()) {
      return 'anonymous';
    }
    if (!this.fireId()) {
      return 'notFound';
    }
    return this.builtForm() ? 'ready' : 'loading';
  });

  constructor() {
    effect(() => {
      const user = this.currentUser();
      const fireId = this.fireId();
      if (!(user && fireId)) {
        return;
      }
      if (fireId === this.buildKey) {
        return;
      }
      this.buildKey = fireId;
      untracked(() => this.builtForm.set(this.build(fireId)));
    });
  }

  canDeactivate(): boolean | Promise<boolean> {
    return confirmDiscardIfDirty(this.dialog, this.builtForm()?.form);
  }

  protected async onSave(): Promise<void> {
    const built = this.builtForm();
    if (!built) {
      return;
    }
    built.form.markAllAsTouched();
    built.form.updateValueAndValidity({ emitEvent: false });
    if (built.form.invalid) {
      focusFirstInvalid(this.host, this.injector);
      return;
    }
    this.submitting.set(true);
    const result = await submitEntityForm(remult.repo(SituationReport), built.form, 'create', {
      fireIncidentId: this.fireId(),
    });
    this.submitting.set(false);
    result.match(
      () => {
        this.notification.success('Situation report saved');
        this.announcer.announce('Situation report saved', 'polite');
        built.form.markAsPristine();
        this.router.navigate(['/incidents', this.fireId()]);
      },
      (cause) => {
        const message = toErrorMessage(cause);
        this.notification.error(message);
        this.announcer.announce(message, 'assertive');
        focusFirstInvalid(this.host, this.injector);
      },
    );
  }

  protected onCancel(): void {
    this.router.navigate(['/incidents', this.fireId()]);
  }

  private build(fireId: string): BuiltForm {
    return buildForm(remult.repo(SituationReport), situationReportFormConfig, 'create', {
      fireIncidentId: fireId,
    });
  }
}
