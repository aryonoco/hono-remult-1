# Domain Specs

Domain specs (`libs/shared/domain/src/**/*.spec.ts`) test entities, BackendMethods, and isomorphic helpers with no
browser and no framework. They run under the lib's own `vitest.config.ts` (`environment: node`). Swap the data provider
for an in-memory one, set `remult.user`, and exercise the entity API directly.

## 1. In-Memory Data Provider + User

**Pattern:** in `beforeEach`, point `remult` at a fresh `InMemoryDataProvider` and assign `remult.user`, then seed any
reference rows the tests need (from `fire-incident.backend.spec.ts`).

```ts
import { InMemoryDataProvider, remult, repo } from 'remult';
import { DEV_USERS } from '../auth/dev-users';
import { District } from './district';
import { FireIncident } from './fire-incident';

const OFFICER = DEV_USERS[1]!; // dev-state-officer: elevated, districtId null
const DISTRICT_ID = 12;

beforeEach(async () => {
  remult.dataProvider = new InMemoryDataProvider();
  remult.user = OFFICER;
  await repo(District).insert({
    id: DISTRICT_ID,
    name: 'Otway',
    regionId: 1,
    regionName: 'Barwon South West',
    isActive: true,
  });
});
```

A fresh provider per test gives isolation — no shared state to reset.

**Avoid:** importing anything from `@angular/*` or `@angular/core/testing`. Domain code (and its specs) may only depend
on `remult` and `neverthrow`; the module boundary forbids the rest.

## 2. Exercise the Real Entity API

**Pattern:** insert through `repo(...)`, then call the BackendMethod under test and reload to assert persisted
state (from `fire-incident.backend.spec.ts`).

```ts
function seedFire(overrides: Partial<FireIncident> = {}): Promise<FireIncident> {
  return repo(FireIncident).insert({
    name: 'Test Fire',
    districtId: DISTRICT_ID,
    reportedAt: new Date(),
    ...overrides,
  });
}

it('raises the incident level and bumps statusAsAt', async () => {
  const fire = await seedFire();
  await FireIncident.escalate(fire.id, IncidentLevel.levelTwo);
  const reloaded = await repo(FireIncident).findId(fire.id);
  expect(reloaded!.incidentLevel).toBe(IncidentLevel.levelTwo);
});
```

## 3. Assert Rejections at the RPC Boundary

**Pattern:** BackendMethods throw at the RPC boundary (a `Result` cannot cross it). Assert with
`rejects.toThrow`, matching on the message fragment.

```ts
it('rejects an equal target level', async () => {
  const fire = await seedFire({ incidentLevel: IncidentLevel.levelTwo });
  await expect(FireIncident.escalate(fire.id, IncidentLevel.levelTwo)).rejects.toThrow(
    'strictly greater',
  );
});
```

**Avoid:** wrapping the call in `try/catch` and asserting in the `catch` — `rejects.toThrow` fails loudly if the
promise unexpectedly resolves.

## 4. Switch Roles by Reassigning remult.user

**Pattern:** to test authorisation or row-level rules, reassign `remult.user` within the test before the action.

```ts
remult.user = DEV_USERS[2]!; // dev-editor-otway: incidentEditor, districtId 12
```

For operations that must run with elevated/server context, use the project's `withServerInternal` helper rather than
mutating `remult.user` (from `fire-incident.backend.spec.ts`).

```ts
import { withServerInternal } from './helpers';

await withServerInternal(() => repo(FireIncident).update(fire.id, { isDeleted: true }));
```

**Note:** under a plain `InMemoryDataProvider`, reassigning `remult.user` only affects validation, business logic, and
computed fields — direct `repo()` calls run with **backend authority** and do **not** enforce `allowApi*` or
`apiPrefilter`. So this harness proves a rule's *value*, not its API *enforcement*. To prove API authorization is
actually enforced, use `TestApiDataProvider` (from `remult/server`), which routes operations through the API pipeline
so forbidden ops throw. Keep using `InMemoryDataProvider` for validation/logic tests; reach for `TestApiDataProvider`
only when the assertion is "the API rejects this".

## 5. Plain Vitest Globals

`globals: true` is set, so `describe`, `it`, `expect`, `beforeEach`, and `vi` are ambient — no imports needed. Spies are
`vi.fn()` / `vi.spyOn(...)`.

**Avoid:** Jasmine spies (`spyOn`, `jasmine.createSpy`) and any `TestBed` usage — neither exists in the node lane.
