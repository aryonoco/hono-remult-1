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
import { type CurrentUser, District, FireIncident, Roles } from '@workspace/shared-domain';
import { remult } from 'remult';
import { map } from 'rxjs';

import { DevAuthService } from '../../../core/dev-auth.service';
import { NotificationService } from '../../../core/notification.service';
import { focusFirstInvalid } from '../../../shared/forms/focus-first-invalid';
import { buildForm, submitEntityForm } from '../../../shared/forms/form-engine';
import type { BuiltForm, SelectOption } from '../../../shared/forms/form-engine.types';
import { FormPageComponent, type FormPageState } from '../../../shared/forms/form-page';
import {
  type CanComponentDeactivate,
  confirmDiscardIfDirty,
} from '../../../shared/forms/unsaved-changes';
import { toErrorMessage } from '../../../shared/util/to-error-message';
import { buildFireIncidentFormConfig } from './fire-incident.form-config';

// Drives both `/incidents/new` (create) and `/incidents/:id/edit` (edit) off one metadata config. The
// district select is locked to the editor's own district for a non-elevated incidentEditor — mirroring the
// entity's create-time rule — while admins and state officers choose freely.
@Component({
  selector: 'app-incident-form',
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
export class IncidentFormComponent implements CanComponentDeactivate {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly notification = inject(NotificationService);
  private readonly announcer = inject(LiveAnnouncer);
  private readonly devAuth = inject(DevAuthService);
  private readonly injector = inject(Injector);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);

  private readonly routeId = toSignal(
    this.route.paramMap.pipe(map((params) => params.get('id') ?? '')),
    { initialValue: '' },
  );
  private readonly currentUser = this.devAuth.currentUser;
  protected readonly submitting = signal(false);
  protected readonly builtForm = signal<BuiltForm | undefined>(undefined);
  private buildKey = '';

  protected readonly mode = computed<'create' | 'edit'>(() => (this.routeId() ? 'edit' : 'create'));

  // The district select repopulates reactively as this resource resolves, so the config is built once.
  // Gated on a current user: an anonymous visitor fires no query.
  private readonly districtsResource = resource({
    params: () => this.currentUser()?.id,
    loader: async (): Promise<readonly District[]> =>
      remult.repo(District).find({ where: { isActive: true }, orderBy: { name: 'asc' } }),
  });
  private readonly districtOptions = computed<readonly SelectOption[]>(() =>
    (this.districtsResource.value() ?? []).map((d) => ({ value: d.id, label: d.name })),
  );
  private readonly config = buildFireIncidentFormConfig(this.districtOptions);

  private readonly editResource = resource({
    params: () => {
      const user = this.currentUser();
      const id = this.routeId();
      return user && id ? { id } : undefined;
    },
    loader: async ({ params }: { params: { id: string } }): Promise<FireIncident | undefined> =>
      (await remult.repo(FireIncident).findId(params.id)) ?? undefined,
  });

  private readonly seed = computed<Partial<FireIncident> | undefined>(() =>
    this.mode() === 'create'
      ? this.createSeed()
      : this.editResource.hasValue()
        ? this.editResource.value()
        : undefined,
  );

  protected readonly title = computed(() =>
    this.mode() === 'create' ? 'New incident' : `Edit incident — ${this.seed()?.name ?? ''}`,
  );
  protected readonly submitLabel = 'Save incident';

  protected readonly pageState = computed<FormPageState>(() => {
    if (!this.currentUser()) {
      return 'anonymous';
    }
    if (this.mode() === 'edit') {
      if (this.editResource.isLoading()) {
        return 'loading';
      }
      if (this.editResource.error() || !this.editResource.hasValue()) {
        return 'notFound';
      }
    }
    // Hold the form in `loading` until the district options resolve, so the District select is never
    // briefly empty/half-populated on first paint (FU-9/FORM-5).
    if (this.districtsResource.isLoading()) {
      return 'loading';
    }
    return this.builtForm() ? 'ready' : 'loading';
  });

  constructor() {
    // buildForm is side-effecting (it wires cross-field validators), so it must not run inside a computed.
    // A string key collapses redundant rebuilds when unrelated signals tick.
    effect(() => {
      const user = this.currentUser();
      const seed = this.seed();
      if (!user) {
        return;
      }
      if (this.mode() === 'edit' && !seed) {
        return;
      }
      const key = `${user.id}|${this.mode()}|${this.routeId()}|${seed ? 'seed' : 'none'}`;
      if (key === this.buildKey) {
        return;
      }
      this.buildKey = key;
      untracked(() => this.builtForm.set(this.build(user, seed)));
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
      remult.repo(FireIncident),
      built.form,
      this.mode(),
      this.seed(),
    );
    this.submitting.set(false);
    result.match(
      (saved) => {
        this.notification.success('Incident saved');
        this.announcer.announce('Incident saved', 'polite');
        built.form.markAsPristine();
        const target = this.mode() === 'create' ? saved.id : this.routeId();
        this.router.navigate(['/incidents', target]);
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
    const id = this.routeId();
    this.router.navigate(id ? ['/incidents', id] : ['/incidents']);
  }

  private createSeed(): Partial<FireIncident> {
    const user = this.currentUser();
    if (user && this.isLockedEditor(user) && user.districtId !== null) {
      return { districtId: user.districtId };
    }
    return {};
  }

  private build(user: CurrentUser, seed: Partial<FireIncident> | undefined): BuiltForm {
    const built = buildForm(remult.repo(FireIncident), this.config, this.mode(), seed);
    if (this.mode() === 'create' && this.isLockedEditor(user)) {
      built.form.get('districtId')?.disable({ emitEvent: false });
    }
    return built;
  }

  private isLockedEditor(user: CurrentUser): boolean {
    const roles = user.roles ?? [];
    return (
      roles.includes(Roles.incidentEditor) &&
      !(roles.includes(Roles.admin) || roles.includes(Roles.stateOfficer))
    );
  }
}
