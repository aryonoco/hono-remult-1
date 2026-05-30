import { FormControl, FormGroup } from '@angular/forms';
import { of } from 'rxjs';
import {
  type CanComponentDeactivate,
  confirmDiscardIfDirty,
  unsavedChangesGuard,
} from './unsaved-changes';

function dialogStub(result: boolean | undefined): {
  open: ReturnType<typeof vi.fn>;
} {
  return { open: vi.fn(() => ({ afterClosed: () => of(result) })) };
}

describe('confirmDiscardIfDirty', () => {
  it('allows navigation immediately when there is no form', () => {
    const dialog = dialogStub(true);
    expect(confirmDiscardIfDirty(dialog as never)).toBe(true);
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('allows navigation immediately when the form is pristine', () => {
    const dialog = dialogStub(true);
    const form = new FormGroup({ name: new FormControl('') });
    expect(confirmDiscardIfDirty(dialog as never, form)).toBe(true);
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('opens the confirm dialog when dirty and resolves to its result', async () => {
    const dialog = dialogStub(true);
    const form = new FormGroup({ name: new FormControl('') });
    form.markAsDirty();
    const result = await confirmDiscardIfDirty(dialog as never, form);
    expect(dialog.open).toHaveBeenCalled();
    expect(result).toBe(true);
  });

  it('resolves false when the user keeps editing', async () => {
    const dialog = dialogStub(undefined);
    const form = new FormGroup({ name: new FormControl('') });
    form.markAsDirty();
    expect(await confirmDiscardIfDirty(dialog as never, form)).toBe(false);
  });
});

describe('unsavedChangesGuard', () => {
  it('delegates to the component canDeactivate hook', () => {
    const component: CanComponentDeactivate = { canDeactivate: () => false };
    expect(unsavedChangesGuard(component, null as never, null as never, null as never)).toBe(false);
  });
});
