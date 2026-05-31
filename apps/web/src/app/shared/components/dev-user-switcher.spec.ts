import { TestbedHarnessEnvironment } from '@angular/cdk/testing/testbed';
import { ANIMATION_MODULE_TYPE } from '@angular/core';
import { type ComponentFixture, TestBed } from '@angular/core/testing';
import { MatSelectHarness } from '@angular/material/select/testing';
import { findAxeViolations } from '../../../testing/axe-helper';
import { DevAuthService } from '../../core/dev-auth.service';
import { DevUserSwitcherComponent } from './dev-user-switcher';

const OFFICER_OPTION = /Priya Officer/;
const ANONYMOUS_OPTION = /Anonymous/;

const devAuthStub = {
  currentUser: () => undefined,
  currentUserId: undefined as string | undefined,
  selectUser: vi.fn(async (_id: string | undefined) => undefined),
};

async function createComponent(): Promise<ComponentFixture<DevUserSwitcherComponent>> {
  TestBed.configureTestingModule({
    imports: [DevUserSwitcherComponent],
    providers: [
      { provide: ANIMATION_MODULE_TYPE, useValue: 'NoopAnimations' },
      { provide: DevAuthService, useValue: devAuthStub },
    ],
  });
  await TestBed.compileComponents();
  const fixture = TestBed.createComponent(DevUserSwitcherComponent);
  await fixture.whenStable();
  return fixture;
}

beforeEach(() => {
  devAuthStub.selectUser.mockClear();
});

// biome-ignore lint/security/noSecrets: test description, not a secret
describe('DevUserSwitcherComponent', () => {
  it('exposes the select with an accessible "Dev user" label', async () => {
    const fixture = await createComponent();
    const select = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
    const host = await select.host();
    expect(await host.getAttribute('aria-label')).toBe('Dev user');
  });

  it('calls selectUser with the chosen id when a user is picked', async () => {
    const fixture = await createComponent();
    const select = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
    await select.open();
    await select.clickOptions({ text: OFFICER_OPTION });
    await fixture.whenStable();
    expect(devAuthStub.selectUser).toHaveBeenCalledWith('dev-state-officer');
  });

  it('selects anonymous (no user) when the empty option is picked', async () => {
    const fixture = await createComponent();
    const select = await TestbedHarnessEnvironment.loader(fixture).getHarness(MatSelectHarness);
    // Move off the default (empty) selection first so picking "Anonymous" is a real change event.
    await select.open();
    await select.clickOptions({ text: OFFICER_OPTION });
    await fixture.whenStable();
    await select.open();
    await select.clickOptions({ text: ANONYMOUS_OPTION });
    await fixture.whenStable();
    expect(devAuthStub.selectUser).toHaveBeenLastCalledWith(undefined);
  });

  it('has no structural accessibility violations', async () => {
    const fixture = await createComponent();
    expect(await findAxeViolations(fixture.nativeElement)).toEqual([]);
  });
});
