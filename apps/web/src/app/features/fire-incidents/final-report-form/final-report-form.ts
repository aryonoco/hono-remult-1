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
import { FinalReport } from '@workspace/shared-domain';
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
import { buildFinalReportFormConfig } from './final-report.form-config';

// Create (`:id/final`) and edit (`:id/final/edit`) of the one-per-incident final report. The route's
// `data.mode` selects the config — create exposes the Sign-off toggle, edit hides it (sign-off is a guarded
// action on the detail screen, not a free-text edit). Edit loads the existing row by its parent fire id.
@Component({
  selector: 'app-final-report-form',
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
export class FinalReportFormComponent implements CanComponentDeactivate {
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
  private readonly mode = toSignal(
    this.route.data.pipe(
      map((d): 'create' | 'edit' => ((d as { mode?: string }).mode === 'edit' ? 'edit' : 'create')),
    ),
    { initialValue: 'create' },
  );
  private readonly currentUser = this.devAuth.currentUser;
  protected readonly submitting = signal(false);
  protected readonly builtForm = signal<BuiltForm | undefined>(undefined);
  private buildKey = '';

  private readonly config = computed(() => buildFinalReportFormConfig(this.mode()));

  private readonly editResource = resource({
    params: () => {
      const user = this.currentUser();
      const fireId = this.fireId();
      return user && this.mode() === 'edit' && fireId ? { fireId } : undefined;
    },
    loader: async ({ params }: { params: { fireId: string } }): Promise<FinalReport | undefined> =>
      (await remult.repo(FinalReport).findFirst({ fireIncidentId: params.fireId })) ?? undefined,
  });

  private readonly seed = computed<Partial<FinalReport> | undefined>(() =>
    this.mode() === 'create'
      ? { fireIncidentId: this.fireId() }
      : this.editResource.hasValue()
        ? this.editResource.value()
        : undefined,
  );

  protected readonly title = computed(() =>
    this.mode() === 'create' ? 'New final report' : 'Edit final report',
  );
  protected readonly submitLabel = 'Save final report';

  protected readonly pageState = computed<FormPageState>(() => {
    if (!this.currentUser()) {
      return 'anonymous';
    }
    if (!this.fireId()) {
      return 'notFound';
    }
    if (this.mode() === 'edit') {
      if (this.editResource.isLoading()) {
        return 'loading';
      }
      if (this.editResource.error() || !this.editResource.hasValue()) {
        return 'notFound';
      }
    }
    return this.builtForm() ? 'ready' : 'loading';
  });

  constructor() {
    effect(() => {
      const user = this.currentUser();
      const seed = this.seed();
      const fireId = this.fireId();
      if (!(user && fireId)) {
        return;
      }
      if (this.mode() === 'edit' && !seed) {
        return;
      }
      const key = `${user.id}|${this.mode()}|${fireId}|${seed ? 'seed' : 'none'}`;
      if (key === this.buildKey) {
        return;
      }
      this.buildKey = key;
      untracked(() => this.builtForm.set(this.build(seed)));
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
    const result = await submitEntityForm(
      remult.repo(FinalReport),
      built.form,
      this.mode(),
      this.seed(),
    );
    this.submitting.set(false);
    result.match(
      () => {
        this.notification.success('Final report saved');
        this.announcer.announce('Final report saved', 'polite');
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

  private build(seed: Partial<FinalReport> | undefined): BuiltForm {
    return buildForm(remult.repo(FinalReport), this.config(), this.mode(), seed);
  }
}
