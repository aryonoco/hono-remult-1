# Fire Incident Showcase — Domain Specification

## Purpose

Reimplement the core of the fire incident domain in the hono-remult-1 stack as a team showcase. The goal is to make the
ceremony reduction visceral: the same domain the team works with daily, rebuilt with radically less plumbing.

This is not a migration plan. It is a proof-of-concept that demonstrates what new feature development could look like.

---

## Scope

### In Scope

| Concept | Why |
|---|---|
| Four entities (`FireIncident`, `SituationReport`, `FinalReport`, `District`) | Cover the core aggregate, sitrep timeline, sign-off lifecycle, and a small Relations.toOne lookup |
| Eleven enums (FireStatus, IncidentLevel, CauseSource, ControlAgency, FuelType, Potential, CostClass, FireDetectionMethod, YesNo, InvestigationType, LegalActionStatus) | Enum-driven domains are the bread and butter |
| Role-based permissions (4 roles, 15-row matrix) | Declarative permission model is a headline feature |
| Row-level filtering (district-scoped visibility) | Users only see incidents in their district |
| Backend operations (`getNextFireNumber`, `escalate`, `softDelete`, `removeSignOff`) | Business logic on entities, not scattered across layers |
| Frontend feature (list + detail + form) | Full frontend story with entity metadata |
| Isomorphic validation | The "add a field" demo moment |

### Out of Scope

| Concept | Why |
|---|---|
| ISP (Incident Shift Plans) | Separate complex subsystem — its own showcase later |
| PDF generation | Infrastructure concern, not an architecture pattern |
| External system integrations (mapping, resources, messaging) | Not what we're demonstrating |
| Full 150+ report fields | Diminishing returns — representative fields prove the same point |
| Attachment/file handling | Platform concern, not a domain pattern |
| Dashboard aggregation | Follow-up showcase (cross-domain query story) |

---

## Modelling Decisions

Five architectural calls drive the rest of the spec. Anything not addressed here is implied by the field tables and
lifecycle hooks below.

- **Three entities, not one polymorphic Report.** EMI uses a single `Report` record with a `ReportType` discriminator on
  a `Reports` collection inside the `Fire` aggregate. We use three separate Remult entities: `FireIncident` carries the
  initial-report data on itself; `SituationReport` is one row per sitrep, immutable once inserted; `FinalReport` is at
  most one optional row per fire (1-to-1 via `fireIncidentId UNIQUE`). The `ReportType` enum is dropped.
- **`District` as a Remult entity.** Five rows, seeded via a hand-written Atlas migration immediately following the
  schema migration. Demonstrates `Relations.toOne` alongside `Relations.toMany`.
- **Sign-off lives on `FinalReport`.** While `FinalReport.isSignedOff = true`, the API rejects every write to the parent
  FireIncident and to the FinalReport itself. The `removeSignOff` BackendMethod is the only way to re-open editing.
- **Status, fire totals, and `nextReportDue` are denormalised on FireIncident, updated by the SituationReport `saved`
  hook.** EMI computes these on the fly from the latest report; we denormalise for fast list queries.
- **`districtId` and `isParentDeleted` are denormalised onto SituationReport and FinalReport.** Set in the child
  entity's `saving` hook (or by the parent's `softDelete` BackendMethod for `isParentDeleted`). Lets every entity's
  `apiPrefilter` use simple field equality.

---

## Fire Incident Lifecycle

A fire incident progresses through sequential reports:

### 1. Initial Report

Created when a fire is first reported. Captures location, name, initial status, initial resource deployment, estimated
area, land classification, cause/detection details, and initial department response. Establishes the fire number
(district-scoped, sequential per financial year).

- Sets `nextReportDue` to 30 minutes after creation
- Default status is "Going"
- Can only be edited by the original author (unless the user has elevated "edit others' initial report" permission)

### 2. Situation Reports

Ongoing updates during active fire management. Captures current fire behaviour, resources deployed (per agency totals),
control progress, weather, strategy, and community impact.

- Multiple situation reports per fire
- Each updates the fire's current status, area, and resource snapshot
- Recalculates `nextReportDue` based on status/potential transitions (see Business Rules)
- Sitreps are immutable once inserted; corrections submit another sitrep. StateOfficer/Admin may delete sitreps
- Most recent sitrep determines the fire's "current" state

### 3. Final Report

Formal closure documentation when fire reaches a safe state. Captures losses (stock, homes, infrastructure),
investigation findings, cost class, and burnt land classification breakdown.

- Can only be created when current status is a "safe" variant or "not found"
- Must be signed off by an authorised user to formally close the incident
- Sign-off locks the fire — only State Officers or Admins can remove the sign-off (via the `removeSignOff`
  BackendMethod) to re-open editing
- No further `nextReportDue` once signed off

In the data model the Initial Report is the `FireIncident` record itself; Situation Reports are rows in
`SituationReport` (immutable once inserted); the Final Report is at most one `FinalReport` row linked 1-to-1 via
`fireIncidentId UNIQUE`. There is no shared `Report` table and no `reportType` discriminator.

### 4. Soft Deletion

Incidents are never hard-deleted. A soft delete sets `isDeleted = true`, clears `nextReportDue`, and cascades
`isParentDeleted = true` to all situation reports and the final report (if any).

- Only allowed when fire is in a terminal status (Safe, SafeOverrun, SafeNotFound, SafeFalseAlarm, NotFound)
- Not allowed if already signed off — sign-off must be removed first
- Fire incidents are government records subject to audit, legal proceedings, and historical analysis — hard deletion
  would break traceability

---

## Roles & Permissions

### Role Definitions

| Identifier | String value | Label | Notes |
|---|---|---|---|
| `Roles.viewer` | `viewer` | Viewer | Read-only across all incident information. District-scoped (`apiPrefilter` matches `districtId`). |
| `Roles.incidentEditor` | `incidentEditor` | Incident Editor | Create/edit own fires (pre-sitrep), insert sitreps, create/edit FinalReport. District-scoped. |
| `Roles.stateOfficer` | `stateOfficer` | State Officer | All IncidentEditor permissions; delete sitreps; soft-delete fires; remove sign-off; edit any fire pre-sign-off; cross-district visibility. |
| `Roles.admin` | `admin` | Admin | Unrestricted access. Cross-district visibility. Sole role allowed to seed/edit `District`. |

The constant lives at `libs/shared/domain/src/auth/roles.ts`:

```typescript
export const Roles = {
  viewer: 'viewer',
  incidentEditor: 'incidentEditor',
  stateOfficer: 'stateOfficer',
  admin: 'admin',
} as const;
```

### Permission Matrix

For the showcase, implement these key permissions:

| Action | Viewer | IncidentEditor | StateOfficer | Admin |
|---|---|---|---|---|
| View incident list and summary | Yes | Yes | Yes | Yes |
| View initial report | Yes | Yes | Yes | Yes |
| View situation reports (including history) | Yes | Yes | Yes | Yes |
| View final report | No | Yes | Yes | Yes |
| Create initial report | No | Yes | Yes | Yes |
| Edit own initial report | No | Yes | Yes | Yes |
| Edit others' initial report | No | No | Yes | Yes |
| Create situation report | No | Yes | Yes | Yes |
| Edit situation report | No | No | No | No |
| Delete situation report | No | No | Yes | Yes |
| Create final report | No | Yes | Yes | Yes |
| Edit final report | No | Yes | Yes | Yes |
| Sign off final report | No | Yes | Yes | Yes |
| Remove sign-off on final report | No | No | Yes | Yes |
| Delete incident (soft) | No | No | Yes | Yes |

"Edit situation report" is "No" for every role because sitreps are immutable once inserted (see Modelling Decisions). To
correct a sitrep, insert another sitrep; StateOfficer/Admin may delete an erroneous sitrep via the delete action.

### Row-Level Filtering

- IncidentEditor and Viewer see only incidents in their assigned district
- Admins and State Officers see all incidents across all districts
- Soft-deleted incidents are filtered out of all list endpoints. Child sitreps and final reports of deleted parents are
  also filtered (via denormalised `isParentDeleted`)

---

## Dev Data

### Districts

Sourced from EMI's `WorkforceContext.cs` district list. Five rows across four regions, seeded via a hand-written Atlas
migration:

| id | name | regionId | regionName |
|---|---|---|---|
| 12 | Otway | 8 | Barwon South West |
| 14 | Far South West | 8 | Barwon South West |
| 22 | Mallee | 7 | Loddon Mallee |
| 47 | Latrobe | 4 | Gippsland |
| 53 | Yarra | 5 | Port Phillip |

`isActive` defaults to true on all five.

**Migration approach.** The seed lives in a hand-written `<T+1s>_seed_districts.sql` file alongside the auto-generated
`<T>_add_fire_entities.sql` schema migration — the +1 second offset gives clean lexicographic ordering so Atlas applies
the seed immediately after the schema:

```sql
INSERT INTO "districts" ("id", "name", "regionId", "regionName", "isActive") VALUES
  (12, 'Otway', 8, 'Barwon South West', true),
  (14, 'Far South West', 8, 'Barwon South West', true),
  (22, 'Mallee', 7, 'Loddon Mallee', true),
  (47, 'Latrobe', 4, 'Gippsland', true),
  (53, 'Yarra', 5, 'Port Phillip', true);
```

`bun run migrate:hash` registers the file in `atlas.sum`; `atlas migrate apply` executes files in timestamp order.

### Dev Users

Eight identities — three districts × {incidentEditor, viewer} plus global admin and stateOfficer:

| id | name | roles | districtId |
|---|---|---|---|
| dev-admin | Sarah Admin | `[Roles.admin]` | null |
| dev-state-officer | Priya Officer | `[Roles.stateOfficer]` | null |
| dev-editor-otway | Ali Editor | `[Roles.incidentEditor]` | 12 |
| dev-editor-latrobe | Kenji Editor | `[Roles.incidentEditor]` | 47 |
| dev-editor-mallee | Mateo Editor | `[Roles.incidentEditor]` | 22 |
| dev-viewer-otway | Saanvi Viewer | `[Roles.viewer]` | 12 |
| dev-viewer-latrobe | Lin Viewer | `[Roles.viewer]` | 47 |
| dev-viewer-mallee | Aroha Viewer | `[Roles.viewer]` | 22 |

Three of the five seeded districts (Otway 12, Latrobe 47, Mallee 22) have direct user affiliation; the other two (Far
South West 14, Yarra 53) exist as available but unstaffed districts in the dropdowns of incident-create forms — they
exercise the "StateOfficer/Admin can create in any district" path.

**`CurrentUser` type.** At `libs/shared/domain/src/auth/current-user.ts`:

```typescript
import type { UserInfo } from 'remult';
export type CurrentUser = UserInfo & { districtId: number | null };
```

`DEV_USERS` is typed `readonly CurrentUser[]`. Entity permission predicates and saving hooks cast: `(remult.user as
CurrentUser | undefined)?.districtId`. Forward-compatible with Entra ID — only the producer of `CurrentUser` (the
dev-auth interceptor in development, JWT parser when real auth lands) changes, not consumers.

---

## Entities

The decorators and field tables below specify each entity. All four — `District`, `FireIncident`, `SituationReport`,
and `FinalReport` — are implemented exactly as specified here.

### FireIncident

The core aggregate. Each fire incident is identified by a district-scoped fire number and a system-wide global incident
ID.

Decorator:

```typescript
@Entity<FireIncident>('fireIncidents', {
  allowApiRead: Allow.authenticated,
  allowApiInsert: [Roles.incidentEditor, Roles.stateOfficer, Roles.admin],
  allowApiUpdate: (fire, c) => {
    if (!c?.user) return false;
    if (c.isAllowed(Roles.admin)) return true;
    if (c.isAllowed(Roles.stateOfficer)) return true;
    if (c.isAllowed(Roles.incidentEditor)) return true;
    return false;
  },
  allowApiDelete: false,
  apiPrefilter: () => {
    const u = remult.user as CurrentUser | undefined;
    if (!u) return { id: ['__never__'] };
    const base = { isDeleted: { '!=': true } };
    if (remult.isAllowed(Roles.admin) || remult.isAllowed(Roles.stateOfficer)) return base;
    return { ...base, districtId: u.districtId ?? -1 };
  },
  saving: async (fire, e) => { /* see Lifecycle Hooks */ },
  defaultOrderBy: { createdAt: 'desc' },
})
```

#### Identity and Tracking

| Field | Type | Description |
|---|---|---|
| id | UUID, auto | Primary key (`Fields.id()`). |
| financialYear | integer, computed, `allowApiUpdate: false` | Computed at insert in the saving hook from current Melbourne time. Formula: `month > 6 ? year + 1 : year`. |
| fireNumber | integer, computed, `allowApiUpdate: false` | Per-district per-FY sequence. Computed at insert as `(count of fires where districtId = X and financialYear = currentFY, including isDeleted rows) + 1`. Display zero-padded to 3 digits. |
| globalIncidentId | integer, computed, `allowApiUpdate: false` | Computed once at insert. Formula: `parseInt("10" + (financialYear % 100).padStart(2,"0") + districtId.padStart(2,"0") + fireNumber.padStart(3,"0"), 10)`. Never re-derived after insert. Worked example: fire #42 in district 47 (Latrobe) in FY26 → `parseInt("10" + "26" + "47" + "042", 10) = 1026470042`. |
| name | string, required, 1–255 chars | Canonical fire name. Editable by IncidentEditor pre-sitrep, by StateOfficer/Admin until FinalReport sign-off. |
| createdBy | string, `allowApiUpdate: false` | Set in saving hook on insert from `remult.user.id`. |
| createdAt | datetime, auto | `Fields.createdAt()`. |
| updatedAt | datetime, auto | `Fields.updatedAt()`. |

#### Location

| Field | Type | Description |
|---|---|---|
| districtId | integer, required | FK to `District.id`. Determines row-level visibility and fire-number scoping. |
| locationDescription | string, optional, 0–500 chars | Free text. |
| latitude | number, optional, -90 to 90 | Decimal degrees. |
| longitude | number, optional, -180 to 180 | Decimal degrees. |

The District's `name`, `regionId`, and `regionName` are read via `@Relations.toOne(() => District, 'districtId')
district?: District` on FireIncident.

#### Status and Classification

| Field | Type | Description |
|---|---|---|
| status | FireStatus enum, required | Current status. Set on insert; subsequent changes happen via SituationReport `saved` hook. Direct entity-level updates by StateOfficer/Admin remain possible only pre-sitrep. |
| statusAsAt | datetime, `allowApiUpdate: false` | Set in saving hook to `now` whenever `status` changes (or on insert). |
| incidentLevel | IncidentLevel enum, required, default `LevelOne` | Set on insert; only updated via `escalate` BackendMethod thereafter (validated monotonically increasing). |
| isMajor | boolean, default false | One-way transition. Once true, never false. Validated in saving hook. |
| declaredBySource | string, optional, 0–200 chars | Who declared the fire major. Required and 1–200 chars when `isMajor = true`. |
| declaredByTimestamp | datetime, optional | When the major declaration was made. Required and ≤ now when `isMajor = true`. Client-provided. |

#### Timeline

| Field | Type | Description |
|---|---|---|
| reportedAt | datetime, required, ≤ now | When the fire was first reported. |
| fireStartedAt | datetime, optional | Best estimate of when the fire actually started. |
| fireDetectedAt | datetime, optional | When the fire was first detected. |
| firstCrewSentAt | datetime, optional | When the first crew was dispatched. |
| firstCrewArrivedAt | datetime, optional | When the first crew arrived on scene. |
| detectionMethod | FireDetectionMethod enum, optional | How the fire was first detected. |

The saving hook validates adjacent-pair ordering (chain, not full cross-product): each of the four pairs
`(fireStartedAt, fireDetectedAt)`, `(fireDetectedAt, reportedAt)`, `(reportedAt, firstCrewSentAt)`, `(firstCrewSentAt,
firstCrewArrivedAt)` is checked only when both values are non-null. Same rule on insert and update.

#### Cause

| Field | Type | Description |
|---|---|---|
| causeSource | CauseSource enum, optional | EMI's 26-value enum (full list in Enums). |
| causeSourceOther | string, optional, 0–500 chars | Free text when `causeSource = Other`. |
| isCauseConfirmed | boolean, default false | Whether the cause is confirmed. |

#### Initial Response

| Field | Type | Description |
|---|---|---|
| isLandManagerNotified | YesNo enum, optional | |
| isControlAgencyNotified | YesNo enum, optional | |
| isFireMapAttached | boolean, default false | |
| controlAgency | ControlAgency enum, optional | EMI's 4-value enum. |
| fuelType | FuelType enum, optional | EMI's 8-value enum. |

#### Area

| Field | Type | Description |
|---|---|---|
| fireAreaHectares | number, optional, ≥ 0 | Current area. Auto-zeroed in saving hook when `status === SafeOverrun` (on every save). |
| burntAreaHectares | number, optional, ≥ 0 | Total area burnt. Separate from current `fireAreaHectares`. |

**Resources** (denormalised totals from latest sitrep)

| Field | Type | Description |
|---|---|---|
| totalPersonnel | integer, default 0, `allowApiUpdate: false` | Updated by SituationReport `saved` hook. |
| totalVehicles | integer, default 0, `allowApiUpdate: false` | Updated by SituationReport `saved` hook. |
| totalAircraft | integer, default 0, `allowApiUpdate: false` | Updated by SituationReport `saved` hook. |

#### Lifecycle

| Field | Type | Description |
|---|---|---|
| nextReportDue | datetime, optional, `allowApiUpdate: false` | When the next sitrep is due. Set on insert to `now + 30 minutes`. Updated by SituationReport `saved` hook per cadence. Set to `null` on FinalReport sign-off and on `softDelete`. |
| isDeleted | boolean, default false, `allowApiUpdate: false` | Soft-delete flag. Mutated only by the `softDelete` BackendMethod. |
| deletionReason | string, optional, 0–500 chars, `allowApiUpdate: false` | Set by `softDelete`. Required and 1–500 chars when `isDeleted = true`. |

#### Relations

| Relation | Type | Description |
|---|---|---|
| district | `@Relations.toOne(() => District, 'districtId')` | The parent district. |
| situationReports | `@Relations.toMany(() => SituationReport, 'fireIncidentId')` | All sitreps for this fire. |
| finalReport | `@Relations.toOne(() => FinalReport, { fields: { fireIncidentId: 'id' } })` | The single optional FinalReport. |

### SituationReport

A point-in-time snapshot of fire conditions, linked to a FireIncident. Multiple sitreps per fire, ordered by report
number. **Immutable once inserted.**

Decorator:

```typescript
@Entity<SituationReport>('situationReports', {
  allowApiRead: Allow.authenticated,
  allowApiInsert: [Roles.incidentEditor, Roles.stateOfficer, Roles.admin],
  allowApiUpdate: false,
  allowApiDelete: [Roles.stateOfficer, Roles.admin],
  apiPrefilter: () => {
    const u = remult.user as CurrentUser | undefined;
    if (!u) return { id: ['__never__'] };
    const base = { isParentDeleted: false };
    if (remult.isAllowed(Roles.admin) || remult.isAllowed(Roles.stateOfficer)) return base;
    return { ...base, districtId: u.districtId ?? -1 };
  },
  saving: async (sitrep, e) => { /* see Lifecycle Hooks */ },
  saved: async (sitrep, e) => { /* see Lifecycle Hooks */ },
  defaultOrderBy: { reportNumber: 'desc' },
})
```

#### Identity

| Field | Type | Description |
|---|---|---|
| id | UUID, auto | `Fields.id()`. |
| fireIncidentId | UUID, required | FK to `FireIncident.id`. |
| reportNumber | integer, computed, `allowApiUpdate: false` | Per-fire sequence. Set on insert as `(max reportNumber where fireIncidentId = X) + 1`, or 1 if none. |
| districtId | integer, `allowApiUpdate: false` | Denormalised from parent. Set in saving hook on insert. |
| isParentDeleted | boolean, default false, `allowApiUpdate: false` | Denormalised flag set by `softDelete`. |

#### Content

| Field | Type | Description |
|---|---|---|
| fireName | string, 1–255 chars | Defaults to parent's `name` if empty. |
| status | FireStatus enum, required | Propagates to parent on `saved`. |
| fireAreaHectares | number, ≥ 0 | Auto-zeroed when `status === SafeOverrun`. |
| weatherConditions | string, optional, 0–1000 chars | |
| currentStrategy | string, optional, 0–1000 chars | |
| significantEvents | string, optional, 0–5000 chars | |
| predictedBehaviour | string, optional, 0–1000 chars | |
| controlProgress | string, optional, 0–1000 chars | |
| communityImpact | string, optional, 0–1000 chars | |
| potentialLoss | Potential enum, optional | Drives `nextReportDue` cadence. |
| potentialSpread | Potential enum, optional | Drives `nextReportDue` cadence. |

**Resources** (per-report snapshot)

| Field | Type | Description |
|---|---|---|
| personnel | integer, ≥ 0, default 0 | |
| vehicles | integer, ≥ 0, default 0 | |
| aircraft | integer, ≥ 0, default 0 | |

#### Audit

| Field | Type | Description |
|---|---|---|
| submittedBy | string, `allowApiUpdate: false` | Set in saving hook on insert. |
| submittedAt | datetime, `allowApiUpdate: false` | Set in saving hook on insert. |
| createdAt | datetime, auto | `Fields.createdAt()`. |

#### Relations

| Relation | Type | Description |
|---|---|---|
| fireIncident | `@Relations.toOne(() => FireIncident, 'fireIncidentId')` | The parent fire. |

### FinalReport

At most one per fire (1-to-1 via `fireIncidentId UNIQUE`). Created when the parent fire reaches a terminal status.
Signing it off locks both this entity and the parent FireIncident until `removeSignOff` is called.

Decorator:

```typescript
@Entity<FinalReport>('finalReports', {
  allowApiRead: [Roles.incidentEditor, Roles.stateOfficer, Roles.admin],
  allowApiInsert: [Roles.incidentEditor, Roles.stateOfficer, Roles.admin],
  allowApiUpdate: [Roles.incidentEditor, Roles.stateOfficer, Roles.admin],
  allowApiDelete: false,
  apiPrefilter: () => {
    const u = remult.user as CurrentUser | undefined;
    if (!u) return { id: ['__never__'] };
    const base = { isParentDeleted: false };
    if (remult.isAllowed(Roles.admin) || remult.isAllowed(Roles.stateOfficer)) return base;
    return { ...base, districtId: u.districtId ?? -1 };
  },
  saving: async (fr, e) => { /* see Lifecycle Hooks */ },
  saved: async (fr, e) => { /* see Lifecycle Hooks */ },
})
```

#### Identity

| Field | Type | Description |
|---|---|---|
| id | UUID, auto | |
| fireIncidentId | UUID, required, unique | FK to FireIncident. UNIQUE constraint enforces 1-to-1. |
| districtId | integer, `allowApiUpdate: false` | Denormalised. |
| isParentDeleted | boolean, default false, `allowApiUpdate: false` | Denormalised flag. |
| createdAt | datetime, auto | |
| createdBy | string, `allowApiUpdate: false` | |
| updatedAt | datetime, auto | |

#### Content — Losses

| Field | Type | Description |
|---|---|---|
| stockLost | integer, optional, ≥ 0 | Livestock count. |
| homesLost | integer, optional, ≥ 0 | |
| shedsLost | integer, optional, ≥ 0 | Sheds and outbuildings. |
| fencingLostKm | number, optional, ≥ 0 | Kilometres of fencing. |
| cropLossHectares | number, optional, ≥ 0 | Hectares of agricultural crop. |
| infrastructureLosses | string, optional, 0–500 chars | Free text. |
| otherLosses | string, optional, 0–500 chars | Free text. |

#### Content — Investigation

| Field | Type | Description |
|---|---|---|
| investigationType | InvestigationType enum, optional | |
| investigationBy | string, optional, 0–200 chars | |
| isOffenceSuspected | boolean, default false | |
| legalActionStatus | LegalActionStatus enum, optional | |

#### Content — Cost

| Field | Type | Description |
|---|---|---|
| costClass | CostClass enum, optional | |

**Content — Burnt Land** (each is hectares, ≥ 0)

| Field | Type | Description |
|---|---|---|
| burntStateForest | number, optional, ≥ 0 | |
| burntNationalPark | number, optional, ≥ 0 | |
| burntPrivateProperty | number, optional, ≥ 0 | |
| burntPlantation | number, optional, ≥ 0 | |
| burntOther | number, optional, ≥ 0 | |

#### Sign-off

| Field | Type | Description |
|---|---|---|
| isSignedOff | boolean, default false | Sign-off flag. While true, all writes to parent FireIncident and to this FinalReport are rejected. Toggle false→true via standard PATCH (any of incidentEditor/stateOfficer/admin). Toggle true→false only via `removeSignOff` BackendMethod (stateOfficer/admin). |
| signedOffAt | datetime, optional, `allowApiUpdate: false` | Set in saving hook when transitioning false→true. |
| signedOffBy | string, default '', `allowApiUpdate: false` | Set in saving hook when transitioning false→true. |
| signOffRemovedAt | datetime, optional, `allowApiUpdate: false` | Set by `removeSignOff` BackendMethod. |
| signOffRemovedBy | string, default '', `allowApiUpdate: false` | Set by `removeSignOff` BackendMethod. |
| signOffRemovedReason | string, default '', `allowApiUpdate: false` | Reason captured by `removeSignOff` (1–500 chars). Mirrors `FireIncident.deletionReason`. |

These five sign-off fields capture only the most recent event of each kind. No separate event-history entity.

#### Relations

| Relation | Type | Description |
|---|---|---|
| fireIncident | `@Relations.toOne(() => FireIncident, 'fireIncidentId')` | The parent fire. |

### District

The Victoria DEECA districts the fire showcase recognises. Five rows seeded via Atlas; admin-only writes.

Decorator:

```typescript
@Entity<District>('districts', {
  allowApiRead: Allow.authenticated,
  allowApiInsert: Roles.admin,
  allowApiUpdate: Roles.admin,
  allowApiDelete: Roles.admin,
  defaultOrderBy: { name: 'asc' },
})
```

| Field | Type | Description |
|---|---|---|
| id | integer, manual PK, 1 ≤ id ≤ 99 | Used directly in the `globalIncidentId` formula (zero-padded to 2 digits). |
| name | string, required, unique, 1–100 chars | District display name. |
| regionId | integer, required | Region this district belongs to. |
| regionName | string, required, 1–100 chars | Region display name (denormalised). |
| isActive | boolean, default true | Inactive districts cannot host new fires; existing fires remain visible. |

---

## Enums

Eleven enums in total. Display names live in `libs/shared/domain/src/fire/enum-display.ts` as one `Record<EnumValue,
string>` per enum, imported directly by Angular components. No `valueConverter` on field decorators.

Enum values in code use `as const` string-literal unions:

```typescript
// libs/shared/domain/src/fire/enums.ts (one example shape)
export const FireStatus = {
  going: 'going',
  contained: 'contained',
  underControlFirst: 'underControlFirst',
  underControlSecond: 'underControlSecond',
  safe: 'safe',
  safeOverrun: 'safeOverrun',
  safeNotFound: 'safeNotFound',
  safeFalseAlarm: 'safeFalseAlarm',
  notFound: 'notFound',
} as const;
export type FireStatus = (typeof FireStatus)[keyof typeof FireStatus];
```

### FireStatus (9 values)

Represents fire control state at a point in time. Ordered by priority (highest urgency first):

| Identifier | String value | Display Name | Meaning |
|---|---|---|---|
| Going | `going` | Going | Fire is actively burning and spreading. |
| Contained | `contained` | Contained | Spread halted within control lines; active management ongoing. |
| UnderControlFirst | `underControlFirst` | Under Control - 1 | First stage of progressive fire control. |
| UnderControlSecond | `underControlSecond` | Under Control - 2 | Second stage of progressive fire control. |
| Safe | `safe` | Safe | Fire is completely extinguished. |
| SafeOverrun | `safeOverrun` | Safe - Overrun | Fire area exceeded estimates but is now safely contained. `fireAreaHectares` auto-set to 0. |
| SafeNotFound | `safeNotFound` | Safe - Not Found | Reported fire was not located or confirmed at scene. |
| SafeFalseAlarm | `safeFalseAlarm` | Safe - False Alarm | Reported fire was a false alarm. |
| NotFound | `notFound` | Not Found | Fire could not be located during initial assessment. |

**Terminal statuses** (FinalReport-eligibility AND softDelete-eligibility): `Safe`, `SafeOverrun`, `SafeNotFound`,
`SafeFalseAlarm`, `NotFound`. Codified as `TERMINAL_STATUSES` in `helpers.ts`.

**Safe-variant statuses** (for cadence rule 3): `Safe`, `SafeOverrun`, `SafeNotFound`, `SafeFalseAlarm`. Codified as
`SAFE_VARIANT_STATUSES`. Note `NotFound` is terminal but not "safe" — cadence rule 4 handles it.

### IncidentLevel (3 values)

| Identifier | String value | Display Name |
|---|---|---|
| LevelOne | `levelOne` | Level 1 |
| LevelTwo | `levelTwo` | Level 2 |
| LevelThree | `levelThree` | Level 3 |

Numeric ordering: `LevelOne < LevelTwo < LevelThree`. The `escalate` BackendMethod uses a `LEVEL_ORDER:
Record<IncidentLevel, number>` table for the comparison. Escalation can only go up.

### CauseSource (26 values, EMI verbatim)

| Identifier | String value | Display Name |
|---|---|---|
| BurningBuilding | `burningBuilding` | Burning Building |
| BurningHouseStoveFlue | `burningHouseStoveFlue` | Burning House, Stove, Flue |
| BurningOffDepartmentalPrescribed | `burningOffDepartmentalPrescribed` | Burning Off (Departmental Prescribed) |
| BurningOffStubbleGrassScrub | `burningOffStubbleGrassScrub` | Burning Off, Stubble, Grass, Scrub |
| BurningOffWindrowHeap | `burningOffWindrowHeap` | Burning Off, Windrow, Heap |
| BurningVehicleMachine | `burningVehicleMachine` | Burning Vehicle, Machine |
| BurningVehicleMachineMalicious | `burningVehicleMachineMalicious` | Burning Vehicle, Machine - Malicious |
| CampfireBarbeque | `campfireBarbeque` | Campfire, Barbeque |
| DeliberateLightingMalicious | `deliberateLightingMalicious` | Deliberate Lighting (Malicious) |
| ExhaustChainsaw | `exhaustChainsaw` | Exhaust, Chainsaw |
| ExhaustOther | `exhaustOther` | Exhaust, Other |
| Fireworks | `fireworks` | Fireworks |
| Lightning | `lightning` | Lightning |
| NonDeliberateLightingMischievous | `nonDeliberateLightingMischievous` | Non-Deliberate Lighting (Mischievous) |
| Other | `other` | Other |
| PipeCigaretteMatch | `pipeCigaretteMatch` | Pipe, Cigarette, Match |
| PowerTransmission | `powerTransmission` | Power Transmission |
| RelightBurningOff | `relightBurningOff` | Relight - Burning Off |
| RelightPrescribedFire | `relightPrescribedFire` | Relight - Prescribed Fire |
| RelightWildfire | `relightWildfire` | Relight - Wildfire |
| SniggingHauling | `sniggingHauling` | Snigging, Hauling |
| Train | `train` | Train |
| UnattendedCampfireContainedWithinBoundary | `unattendedCampfireContainedWithinBoundary` | Unattended Campfire - Contained Within Boundary |
| Unknown | `unknown` | Unknown |
| WasteDisposalDomestic | `wasteDisposalDomestic` | Waste Disposal, Domestic |
| WasteDisposalIndustrialSawmillTip | `wasteDisposalIndustrialSawmillTip` | Waste Disposal, Industrial, Sawmill, Tip |

### ControlAgency (4 values)

| Identifier | String value | Display Name |
|---|---|---|
| Deeca | `deeca` | DEECA |
| Cfa | `cfa` | CFA |
| Frv | `frv` | FRV |
| Interstate | `interstate` | Interstate |

### FuelType (8 values)

| Identifier | String value | Display Name |
|---|---|---|
| Grassland | `grassland` | Grassland |
| Woodland | `woodland` | Woodland |
| Spinifex | `spinifex` | Spinifex |
| MalleeHeath | `malleeHeath` | Mallee-heath |
| Shrubland | `shrubland` | Shrubland |
| Buttongrass | `buttongrass` | Buttongrass |
| Forest | `forest` | Forest |
| Pine | `pine` | Pine |

### Potential (3 values)

| Identifier | String value | Display Name |
|---|---|---|
| Low | `low` | Low |
| Moderate | `moderate` | Moderate |
| High | `high` | High |

Numeric ordering for "escalation" checks: `Low < Moderate < High`. Cadence logic uses a `POTENTIAL_ORDER:
Record<Potential, number>` table.

### CostClass (7 values)

| Identifier | String value | Display Name |
|---|---|---|
| LessThanThousand | `lessThanThousand` | Less Than $1,000 |
| ThousandToFourNineNineNine | `thousandToFourNineNineNine` | $1,000 - $4,999 |
| FiveThousandToNineNineNineNine | `fiveThousandToNineNineNineNine` | $5,000 - $9,999 |
| TenThousandToNineteenNineNineNine | `tenThousandToNineteenNineNineNine` | $10,000 - $19,999 |
| TwentyThousandToFortyNineNineNineNine | `twentyThousandToFortyNineNineNineNine` | $20,000 - $49,999 |
| FiftyThousandToNinetyNineNineNineNine | `fiftyThousandToNinetyNineNineNineNine` | $50,000 - $99,999 |
| HundredThousandOrGreater | `hundredThousandOrGreater` | $100,000 Or Greater |

### FireDetectionMethod (13 values, EMI verbatim)

| Identifier | String value | Display Name |
|---|---|---|
| FireTower | `fireTower` | Fire Tower |
| Ground | `ground` | Ground |
| AircraftPatrol | `aircraftPatrol` | Aircraft Patrol |
| AircraftNonPatrol | `aircraftNonPatrol` | Aircraft (Non-Patrol) |
| ForestIndustryEmployee | `forestIndustryEmployee` | Forest Industry Employee |
| OtherIndustryEmployee | `otherIndustryEmployee` | Other Industry Employee |
| LandownerResident | `landownerResident` | Landowner / Resident |
| Traveller | `traveller` | Traveller |
| Unknown | `unknown` | Unknown |
| Other | `other` | Other |
| FireLookout | `fireLookout` | Fire Lookout |
| DepartmentPatrolAircraft | `departmentPatrolAircraft` | Department Patrol Aircraft |
| DepartmentGroundPersonnel | `departmentGroundPersonnel` | Department Ground Personnel |

### YesNo (2 values)

| Identifier | String value | Display Name |
|---|---|---|
| Yes | `yes` | Yes |
| No | `no` | No |

### InvestigationType (4 values, EMI verbatim)

| Identifier | String value | Display Name |
|---|---|---|
| AccreditedInvestigatorReportAttended | `accreditedInvestigatorReportAttended` | Accredited Investigator Report (Attended) |
| AccreditedInvestigatorReportNotAttended | `accreditedInvestigatorReportNotAttended` | Accredited Investigator Report (Not Attended) |
| FirstAttackReport | `firstAttackReport` | First Attack Report |
| NotInvestigated | `notInvestigated` | Not Investigated |

### LegalActionStatus (9 values, EMI verbatim)

| Identifier | String value | Display Name |
|---|---|---|
| NoAction | `noAction` | No Action |
| DeptInvestigationContinuing | `deptInvestigationContinuing` | Dept Investigation Continuing |
| DeptPoliceInvestigationContinuing | `deptPoliceInvestigationContinuing` | Dept/Police Investigation Continuing |
| DeptOtherAgencyInvestigation | `deptOtherAgencyInvestigation` | Dept/Other Agency Investigation |
| ReferredToPolice | `referredToPolice` | Referred To Police |
| ReferredToDeptProsecutions | `referredToDeptProsecutions` | Referred To Dept Prosecutions |
| EducationAwarenessWarningLetter | `educationAwarenessWarningLetter` | Education / Awareness / Warning Letter |
| CivilActionBeingUndertaken | `civilActionBeingUndertaken` | Civil Action Being Undertaken |
| InfringementNoticeIssued | `infringementNoticeIssued` | Infringement Notice Issued |

---

## Lifecycle Hooks

Every hook behaviour is specified explicitly. The implementation must match these exactly; no judgement calls remain.

### Shared helpers

Located in `libs/shared/domain/src/fire/helpers.ts`:

```typescript
export const TERMINAL_STATUSES: readonly FireStatus[] = [
  FireStatus.safe, FireStatus.safeOverrun, FireStatus.safeNotFound,
  FireStatus.safeFalseAlarm, FireStatus.notFound,
] as const;

export const SAFE_VARIANT_STATUSES: readonly FireStatus[] = [
  FireStatus.safe, FireStatus.safeOverrun, FireStatus.safeNotFound,
  FireStatus.safeFalseAlarm,
] as const;

export const ACTIVE_CONTAINED_STATUSES: readonly FireStatus[] = [
  FireStatus.contained, FireStatus.underControlFirst,
  FireStatus.underControlSecond,
] as const;

export const POTENTIAL_ORDER: Record<Potential, number> = {
  [Potential.low]: 1, [Potential.moderate]: 2, [Potential.high]: 3,
};

export const LEVEL_ORDER: Record<IncidentLevel, number> = {
  [IncidentLevel.levelOne]: 1, [IncidentLevel.levelTwo]: 2,
  [IncidentLevel.levelThree]: 3,
};

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;
// "1 month" in the cadence table is defined as 30 days exactly.
export const MS_PER_MONTH_NOMINAL = 30 * MS_PER_DAY;

export function computeFinancialYear(now: Date): number {
  const melbourne = new Date(
    now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' })
  );
  const year = melbourne.getFullYear();
  const month = melbourne.getMonth() + 1;
  return month > 6 ? year + 1 : year;
}

export function computeGlobalIncidentId(
  financialYear: number, districtId: number, fireNumber: number,
): number {
  const fy2 = (financialYear % 100).toString().padStart(2, '0');
  const dist2 = districtId.toString().padStart(2, '0');
  const fire3 = fireNumber.toString().padStart(3, '0');
  return parseInt(`10${fy2}${dist2}${fire3}`, 10);
}
```

### Server-internal flag

The SituationReport `saved` hook and the `softDelete` / `escalate` / `removeSignOff` BackendMethods update
`FireIncident` and `FinalReport` rows server-side without tripping the locks in those entities' `saving` hooks (the
pre-sitrep-edit restriction, the sign-off lock, the soft-delete lock). Remult's `allowApi*` predicates are synchronous
(`AllowedForInstance<T>` returns `boolean`), so all multi-row state checks live in `saving` hooks; the bypass is a
per-request flag managed by two `helpers.ts` functions:

```typescript
export async function withServerInternal<T>(fn: () => Promise<T>): Promise<T>; // set flag, run fn, clear in finally
export function isServerInternal(): boolean; // read flag
```

Each `saving` update path calls `isServerInternal()` near the top and skips the lock checks when it returns true;
server-side writes wrap their `repo.update(...)` calls in `withServerInternal(...)`.

### FireIncident — `saving` hook

If `e.isNew === true` (insert):

1. Validate `reportedAt` non-null and ≤ now; else cancel with `"reportedAt is required and must be ≤ now"`.
2. Validate `districtId` non-null; resolve `district = await remult.repo(District).findId(fire.districtId)`; if not
   found or `district.isActive === false`, cancel.
3. If user is `Roles.incidentEditor` and is not also `Roles.stateOfficer` or `Roles.admin`, validate `fire.districtId
   === (remult.user as CurrentUser).districtId`; else cancel.
4. `fire.createdBy = remult.user!.id`.
5. `fire.financialYear = computeFinancialYear(new Date())`.
6. `fire.fireNumber = (await remult.repo(FireIncident).count({ districtId: fire.districtId, financialYear:
   fire.financialYear })) + 1`. (No `isDeleted` filter — counts deleted rows, matching EMI uniqueness in audit history.)
7. `fire.globalIncidentId = computeGlobalIncidentId(fire.financialYear, fire.districtId, fire.fireNumber)`.
8. `fire.statusAsAt = new Date()`.
9. `fire.nextReportDue = new Date(Date.now() + 30 * MS_PER_MINUTE)`.
10. `fire.isDeleted = false`; `fire.deletionReason = ''`.
11. `fire.totalPersonnel = 0; fire.totalVehicles = 0; fire.totalAircraft = 0`.
12. If `fire.status === FireStatus.safeOverrun` → `fire.fireAreaHectares = 0`.
13. If `fire.isMajor === true`: validate `fire.declaredBySource` 1–200 chars AND `fire.declaredByTimestamp` non-null AND
    `fire.declaredByTimestamp ≤ new Date()`; else cancel.
14. Validate adjacent-pair timestamp ordering (each pair only if both non-null): `(fireStartedAt, fireDetectedAt)`,
    `(fireDetectedAt, reportedAt)`, `(reportedAt, firstCrewSentAt)`, `(firstCrewSentAt, firstCrewArrivedAt)`. Any
    violation → cancel with the exact pair name.

If `e.isNew === false` (update):

1. **Internal-update bypass:** if `isServerInternal()` is true (the `remult.context.serverInternal` flag), skip the
   pre-sitrep restriction (step 9 below).
2. `finalReport = await remult.repo(FinalReport).findFirst({ fireIncidentId: fire.id })`. If `finalReport &&
   finalReport.isSignedOff === true` → cancel with `"FireIncident is locked while FinalReport is signed off; call
   removeSignOff first"`.
3. If `e.fields.isDeleted.originalValue === true && fire.isDeleted === true` → cancel with `"FireIncident is
   soft-deleted; no further edits permitted"`.
4. If `e.fields.isMajor.originalValue === true && fire.isMajor === false` → cancel with `"isMajor is one-way; cannot be
   set back to false"`.
5. If `e.fields.status.originalValue !== fire.status` → `fire.statusAsAt = new Date()`.
6. If `fire.status === FireStatus.safeOverrun` → `fire.fireAreaHectares = 0`.
7. If `fire.isMajor === true`: same validation as insert step 13.
8. Same adjacent-pair timestamp ordering validation as insert step 14.
9. **Pre-sitrep edit restriction:** if the server-internal flag is not set (`!isServerInternal()`) AND user roles do
   NOT include `Roles.stateOfficer` or `Roles.admin`:
   - Validate `fire.createdBy === remult.user!.id`; else cancel with `"IncidentEditor can only edit fires they
     created"`.
   - Validate `await remult.repo(SituationReport).count({ fireIncidentId: fire.id }) === 0`; else cancel with
     `"FireIncident cannot be edited after first SituationReport"`.
   - Validate `await remult.repo(FinalReport).count({ fireIncidentId: fire.id }) === 0`; else cancel with `"FireIncident
     cannot be edited after FinalReport exists"`.

`FireIncident` has no `saved` hook.

### SituationReport — `saving` hook

If `e.isNew === false` → unreachable (`allowApiUpdate: false`).

If `e.isNew === true` (insert):

1. `parent = await remult.repo(FireIncident).findId(sitrep.fireIncidentId)`. If not found → cancel.
2. If `parent.isDeleted === true` → cancel with `"Parent fire is soft-deleted"`.
3. `finalReport = await remult.repo(FinalReport).findFirst({ fireIncidentId: sitrep.fireIncidentId })`. If `finalReport
   && finalReport.isSignedOff === true` → cancel with `"Parent fire is signed off"`.
4. If user is `Roles.incidentEditor` and not also `Roles.stateOfficer` / `Roles.admin`, validate `parent.districtId ===
   (remult.user as CurrentUser).districtId`; else cancel.
5. `sitrep.reportNumber = (await remult.repo(SituationReport).count({ fireIncidentId: sitrep.fireIncidentId })) + 1`.
6. `sitrep.submittedBy = remult.user!.id`.
7. `sitrep.submittedAt = new Date()`.
8. `sitrep.districtId = parent.districtId`.
9. `sitrep.isParentDeleted = false`.
10. If `sitrep.fireName.trim() === ''` → `sitrep.fireName = parent.name`.
11. If `sitrep.status === FireStatus.safeOverrun` → `sitrep.fireAreaHectares = 0`.

(No `nextReportDue` computation here; that lives in the `saved` hook so the sitrep row is durable in the DB first.)

### SituationReport — `saved` hook

Always (every successful insert):

1. `prev = await remult.repo(SituationReport).findFirst({ fireIncidentId: sitrep.fireIncidentId, reportNumber: { '!=':
   sitrep.reportNumber } }, { orderBy: { reportNumber: 'desc' }, limit: 1 })` — immediately previous sitrep, or
   `undefined` if first.
2. `parent = await remult.repo(FireIncident).findId(sitrep.fireIncidentId)`.
3. Compute `nextReportDue` from `(previousStatus = parent.status, newStatus = sitrep.status, prevLoss =
   prev?.potentialLoss, prevSpread = prev?.potentialSpread, newLoss = sitrep.potentialLoss, newSpread =
   sitrep.potentialSpread)` using the cadence precedence table (see Business Rules).
4. Wrap the parent update in `withServerInternal()`:

   ```typescript
   await remult.repo(FireIncident).update(parent.id, {
     status: sitrep.status,
     statusAsAt: sitrep.status !== parent.status ? new Date() : parent.statusAsAt,
     fireAreaHectares: sitrep.fireAreaHectares,
     totalPersonnel: sitrep.personnel,
     totalVehicles: sitrep.vehicles,
     totalAircraft: sitrep.aircraft,
     nextReportDue: computedNextReportDue,
   });
   ```

### FinalReport — `saving` hook

If `e.isNew === true` (insert):

1. `parent = await remult.repo(FireIncident).findId(fr.fireIncidentId)`. If not found → cancel.
2. If `parent.isDeleted === true` → cancel.
3. If `!TERMINAL_STATUSES.includes(parent.status)` → cancel with `"FinalReport requires parent fire to be in a terminal
   status (Safe*, NotFound)"`.
4. If `await remult.repo(FinalReport).count({ fireIncidentId: fr.fireIncidentId }) > 0` → cancel with `"FinalReport
   already exists for this fire"`.
5. If user is `Roles.incidentEditor` and not also `Roles.stateOfficer` / `Roles.admin`, validate `parent.districtId ===
   (remult.user as CurrentUser).districtId`; else cancel.
6. `fr.createdBy = remult.user!.id`.
7. `fr.districtId = parent.districtId`.
8. `fr.isParentDeleted = false`.
9. If `fr.isSignedOff === true`: `fr.signedOffAt = new Date()`, `fr.signedOffBy = remult.user!.id`.
10. Validate field bounds (see Validation Rules).

If `e.isNew === false` (update):

1. Internal-update bypass: same server-internal flag pattern (`isServerInternal()` / `withServerInternal()`).
2. `parent = await remult.repo(FireIncident).findId(fr.fireIncidentId)`. If `parent.isDeleted === true` → cancel.
3. Compute transition: `wasSignedOff = e.fields.isSignedOff.originalValue === true`, `isSignedOff = fr.isSignedOff ===
   true`.
4. If `wasSignedOff && isSignedOff` (still signed off, field edit attempt) AND not server-internal
   (`!isServerInternal()`) → cancel with `"FinalReport is locked while signed off; call removeSignOff first"`.
5. If `!wasSignedOff && isSignedOff` (false → true): validate `TERMINAL_STATUSES.includes(parent.status)`; else cancel.
   Set `fr.signedOffAt = new Date()`, `fr.signedOffBy = remult.user!.id`.
6. If `wasSignedOff && !isSignedOff` (true → false) AND not server-internal (`!isServerInternal()`) → cancel with
   `"removeSignOff is only available via the removeSignOff BackendMethod"`.
7. Field bounds re-validated.

### FinalReport — `saved` hook

Wrap the parent-update calls below in `withServerInternal()`.

- If `e.isNew === true && fr.isSignedOff === true`: update parent `nextReportDue = null`.
- If `e.isNew === false && !e.fields.isSignedOff.originalValue && fr.isSignedOff === true` (transition false → true via
  update): update parent `nextReportDue = null`.

The "remove sign-off" path is the `removeSignOff` BackendMethod (see Domain Operations), not the entity update; that
method itself recomputes `parent.nextReportDue`.

### District — saving / saved

No logic. Permission predicates (`Roles.admin` for writes, `Allow.authenticated` for reads) cover everything.

---

## Business Rules

### Next Report Due Calculation

Cadence rules with **explicit precedence**: the FIRST matching rule applies. Inputs (computed inside SituationReport
`saved` hook, exported as `computeNextReportDue(...)` in `helpers.ts`):

- `previousStatus`: the parent fire's `status` snapshot read BEFORE the parent is updated (i.e., the prior sitrep's
  status, or the initial-report status if this is the first sitrep).
- `newStatus`: the just-inserted sitrep's `status`.
- `prevLoss`, `prevSpread`: the immediately previous sitrep's `potentialLoss` / `potentialSpread`, or `undefined` if
  this is the first sitrep.
- `newLoss`, `newSpread`: the just-inserted sitrep's `potentialLoss` / `potentialSpread`.
- `now`: the saved-hook execution time.

Rules, evaluated top-down — first match wins:

| # | Condition | Result |
|---|---|---|
| 1 | `ACTIVE_CONTAINED_STATUSES.includes(previousStatus) && newStatus === Going` | `now + 15 min` |
| 2 | `ACTIVE_CONTAINED_STATUSES.includes(newStatus) && (escalated(prevLoss, newLoss) \|\| escalated(prevSpread, newSpread))` where `escalated(prev, next) = next !== undefined && (prev === undefined \|\| POTENTIAL_ORDER[next] > POTENTIAL_ORDER[prev])` | `now + 15 min` |
| 3 | `SAFE_VARIANT_STATUSES.includes(newStatus)` | `now + 30 days` |
| 4 | `newStatus === NotFound` | `null` |
| 5 | `newStatus === Going && (newLoss === High \|\| newSpread === High)` | `now + 2 hours` |
| 6 | `ACTIVE_CONTAINED_STATUSES.includes(newStatus)` (catch-all for active fires that did not match 1 or 2) | `now + 24 hours` |
| 7 | `newStatus === Going` (catch-all for Going that did not match 5) | `now + 2 hours` |

Every possible `newStatus` matches exactly one rule.

**Special cases** (NOT applied via this table; applied at their own trigger points):

- FireIncident `saving` insert: `nextReportDue = now + 30 min`.
- `softDelete` BackendMethod: `nextReportDue = null`.
- FinalReport sign-off (saved hook on insert with `isSignedOff = true` OR transition false → true on update):
  `nextReportDue = null`.
- `removeSignOff` BackendMethod: `nextReportDue` recomputed from the most recent SituationReport using rules 1–7. If
  zero sitreps exist, `now + 30 min`.

### Fire Numbering

- Fire numbers are sequential integers per district per financial year.
- When creating a fire, query the count of fires for that district + financial year (including `isDeleted` rows for EMI
  parity), then assign count + 1.
- The `globalIncidentId` is constructed as: `10` (fire type code) + last 2 digits of financial year + district ID
  (zero-padded to 2 digits) + fire number (zero-padded to 3 digits).
- Worked example: fire #42 in district 47 (Latrobe) in FY26 → `parseInt("10" + "26" + "47" + "042", 10) = 1026470042`.

### Financial Year

- Runs July to June (Australian financial year).
- Determined from current date in Melbourne timezone (Australia/Melbourne).
- If month > 6 (July onwards): financial year = current calendar year + 1.
- If month ≤ 6 (January–June): financial year = current calendar year.
- Example: a fire on 15 March 2025 is in FY2025. A fire on 15 August 2025 is in FY2026.

### Status Transition Rules

- Final report can only be created when status is in `TERMINAL_STATUSES` (Safe, SafeOverrun, SafeNotFound,
  SafeFalseAlarm, NotFound).
- Soft deletion only allowed when status is in `TERMINAL_STATUSES`.
- Soft deletion not allowed if fire has a signed-off final report — must call `removeSignOff` first.
- When status is SafeOverrun, `fireAreaHectares` is automatically set to 0 (both on the sitrep and on the parent after
  the `saved` hook propagates).
- Major fire declaration (`isMajor = true`) requires `declaredBySource` non-empty (1–200 chars) and
  `declaredByTimestamp` ≤ now. Once `isMajor = true`, it cannot be set back to false.

### Incident Level Escalation

- Level can only go up: LevelOne → LevelTwo → LevelThree.
- Cannot be de-escalated.
- Only StateOfficer or Admin can call `escalate` BackendMethod.

### Timestamp Ordering Validation

These timestamps must be in chronological order when present, validated as adjacent pairs only (each pair only when both
values are non-null):

1. `fireStartedAt ≤ fireDetectedAt`
2. `fireDetectedAt ≤ reportedAt`
3. `reportedAt ≤ firstCrewSentAt`
4. `firstCrewSentAt ≤ firstCrewArrivedAt`

### Sign-Off Workflow

**Signing off a final report:**

1. All final report fields must pass validation.
2. Parent fire's status must be in `TERMINAL_STATUSES`.
3. User PATCHes `isSignedOff = true`. `saving` hook records `signedOffAt` + `signedOffBy`.
4. `saved` hook sets parent `nextReportDue = null`.
5. Parent FireIncident and this FinalReport are now write-locked via API. Only `removeSignOff` can unlock.

**Removing a sign-off** (`removeSignOff` BackendMethod; StateOfficer or Admin only):

1. Records `signOffRemovedAt` + `signOffRemovedBy` + `signOffRemovedReason` (the `reason`, 1–500 chars; mirrors
   `FireIncident.deletionReason`).
2. `isSignedOff = false`.
3. Parent `nextReportDue` recomputed from the latest SituationReport using the cadence rules, or `now + 30 min` if no
   sitreps exist.
4. FinalReport and parent FireIncident become editable again.

---

## Validation Rules

Implement via `Fields.*({ validate: ... })` for field bounds and via `saving` hooks for cross-field rules. Exhaustive
list:

### FireIncident

| Field | Rule |
|---|---|
| name | required, 1–255 chars |
| locationDescription | 0–500 chars |
| latitude | -90 ≤ x ≤ 90 (when non-null) |
| longitude | -180 ≤ x ≤ 180 (when non-null) |
| fireAreaHectares | ≥ 0 |
| burntAreaHectares | ≥ 0 |
| totalPersonnel, totalVehicles, totalAircraft | integer ≥ 0; server-managed |
| declaredBySource | 0–200 chars; required & 1–200 chars when `isMajor = true` (cross-field, saving hook) |
| declaredByTimestamp | ≤ now when `isMajor = true` (cross-field, saving hook) |
| deletionReason | 0–500 chars; required & 1–500 chars when `isDeleted = true` (cross-field, saving hook) |
| financialYear | integer (server-set) |
| fireNumber | integer ≥ 1 (server-set) |
| globalIncidentId | integer (server-set) |
| districtId | required; FK validity + `isActive` verified in saving hook on insert |
| reportedAt | required, ≤ now |
| fireStartedAt, fireDetectedAt, firstCrewSentAt, firstCrewArrivedAt | adjacent-pair ordering (saving hook) |
| isDeleted | server-managed |

### SituationReport

| Field | Rule |
|---|---|
| fireName | 1–255 chars |
| weatherConditions, currentStrategy, predictedBehaviour, controlProgress, communityImpact | each 0–1000 chars |
| significantEvents | 0–5000 chars |
| fireAreaHectares | ≥ 0 |
| personnel, vehicles, aircraft | integer ≥ 0 |
| reportNumber | integer ≥ 1 (server-set) |
| districtId, isParentDeleted, submittedAt, submittedBy | server-managed |

### FinalReport

| Field | Rule |
|---|---|
| stockLost, homesLost, shedsLost | integer ≥ 0 |
| fencingLostKm, cropLossHectares | number ≥ 0 |
| burntStateForest, burntNationalPark, burntPrivateProperty, burntPlantation, burntOther | number ≥ 0 |
| infrastructureLosses, otherLosses | 0–500 chars |
| investigationBy | 0–200 chars |
| fireIncidentId | required, unique (DB UNIQUE constraint + saving hook check on insert) |
| districtId, isParentDeleted, signedOffAt, signedOffBy, signOffRemovedAt, signOffRemovedBy, signOffRemovedReason | server-managed |

### District

| Field | Rule |
|---|---|
| id | integer, 1 ≤ id ≤ 99, manual PK |
| name | 1–100 chars, unique |
| regionId | required, integer |
| regionName | 1–100 chars |
| isActive | boolean, default true |

---

## UI Display

### Status Colour Palette

Tailwind utility classes applied to a `<span class="...">` badge, exposed as `STATUS_BADGE_CLASSES:
Readonly<Record<FireStatus, string>>` in `libs/shared/domain/src/fire/ui.ts` (with the shared `STATUS_BADGE_BASE` base
class):

| Status | Classes |
|---|---|
| Going | `bg-red-100 text-red-800 border-red-300` |
| Contained | `bg-amber-100 text-amber-800 border-amber-300` |
| UnderControlFirst, UnderControlSecond | `bg-yellow-100 text-yellow-800 border-yellow-300` |
| Safe, SafeOverrun | `bg-green-100 text-green-800 border-green-300` |
| SafeNotFound, SafeFalseAlarm | `bg-gray-100 text-gray-800 border-gray-300` |
| NotFound | `bg-orange-100 text-orange-800 border-orange-300` |

### Enum Display Location

`libs/shared/domain/src/fire/enum-display.ts` exports one `Readonly<Record<EnumValue, string>>` per enum (using the
Display Names from *Enums*), re-exported from the barrel for direct import by Angular components.

The exact `Record` literals for both `ui.ts` and `enum-display.ts` are specified in
*Frontend Architecture (Phase 4) → §3 Shared-domain UI files*.

---

## Domain Operations

Four `@BackendMethod`s on the relevant entity classes. Creating a situation report needs no dedicated method — the
standard REST `POST /api/situationReports` exercises the `SituationReport.saving` hook end-to-end.

**Implementation notes.** Each method reuses the `withServerInternal()` helper (rather than setting
`remult.context.serverInternal` inline) to bypass entity lifecycle locks for its own writes, and models expected
errors with `neverthrow` (`safeTry` with `err` / `ok`) internally — converting to a thrown `Error` only at the RPC
boundary
(`result.match(() => …, (e) => { throw e })`), because a `Result` cannot cross Remult's RPC boundary. The
`must-use-result` lint rule has no model for `safeTry`'s `yield*`, so each `yield* ResultAsync.fromPromise(...)`
carries an `// eslint-disable-next-line neverthrow/must-use-result`. `softDelete` cascades to children **before**
marking the fire deleted, because `finalReportUpdateSaving` rejects any FinalReport update once the parent is
soft-deleted.

### `FireIncident.getNextFireNumber(districtId: number): Promise<number>`

```typescript
@BackendMethod({ allowed: Allow.authenticated })
static async getNextFireNumber(districtId: number): Promise<number> {
  const fy = computeFinancialYear(new Date());
  return (await remult.repo(FireIncident).count({ districtId, financialYear: fy })) + 1;
}
```

Counts include `isDeleted` rows (EMI parity).

### `FireIncident.escalate(fireId: string, newLevel: IncidentLevel): Promise<void>`

```typescript
@BackendMethod({ allowed: [Roles.stateOfficer, Roles.admin] })
static async escalate(fireId: string, newLevel: IncidentLevel): Promise<void> {
  // must-use-result lacks yield* support; safeTry consumes each Result.
  const result = await safeTry(async function* () {
    // eslint-disable-next-line neverthrow/must-use-result
    const fire = yield* ResultAsync.fromPromise(remult.repo(FireIncident).findId(fireId), toError);
    if (!fire) {
      return err(new Error('Fire not found'));
    }
    if (fire.isDeleted) {
      return err(new Error('Fire is soft-deleted'));
    }
    // eslint-disable-next-line neverthrow/must-use-result
    const fr = yield* ResultAsync.fromPromise(
      remult.repo(FinalReport).findFirst({ fireIncidentId: fireId }),
      toError,
    );
    if (fr?.isSignedOff) {
      return err(new Error('Fire is signed off; call removeSignOff first'));
    }
    if (LEVEL_ORDER[newLevel] <= LEVEL_ORDER[fire.incidentLevel]) {
      return err(new Error('newLevel must be strictly greater than current level'));
    }
    // eslint-disable-next-line neverthrow/must-use-result
    yield* ResultAsync.fromPromise(
      withServerInternal(() =>
        remult.repo(FireIncident).update(fireId, { incidentLevel: newLevel, statusAsAt: new Date() }),
      ),
      toError,
    );
    return ok(undefined);
  });
  result.match(
    () => undefined,
    (e) => {
      throw e;
    },
  );
}
```

### `FireIncident.softDelete(fireId: string, reason: string): Promise<void>`

```typescript
@BackendMethod({ allowed: [Roles.stateOfficer, Roles.admin] })
static async softDelete(fireId: string, reason: string): Promise<void> {
  // must-use-result lacks yield* support; safeTry consumes each Result.
  const result = await safeTry(async function* () {
    if (reason.length < 1 || reason.length > LIMITS.description) {
      return err(new Error('reason must be 1-500 chars'));
    }
    // eslint-disable-next-line neverthrow/must-use-result
    const fire = yield* ResultAsync.fromPromise(remult.repo(FireIncident).findId(fireId), toError);
    if (!fire) {
      return err(new Error('Fire not found'));
    }
    if (!TERMINAL_STATUSES.includes(fire.status)) {
      return err(new Error('Fire must be in a terminal status to be soft-deleted'));
    }
    // eslint-disable-next-line neverthrow/must-use-result
    const fr = yield* ResultAsync.fromPromise(
      remult.repo(FinalReport).findFirst({ fireIncidentId: fireId }),
      toError,
    );
    if (fr?.isSignedOff) {
      return err(new Error('Fire is signed off; call removeSignOff first'));
    }
    // eslint-disable-next-line neverthrow/must-use-result
    yield* ResultAsync.fromPromise(
      withServerInternal(async () => {
        // Children FIRST (parent still not-deleted), parent LAST — finalReportUpdateSaving
        // rejects any FinalReport update once the parent is soft-deleted.
        const sitreps = await remult.repo(SituationReport).find({ where: { fireIncidentId: fireId } });
        await Promise.all(
          sitreps.map((s) => remult.repo(SituationReport).update(s.id, { isParentDeleted: true })),
        );
        if (fr) {
          await remult.repo(FinalReport).update(fr.id, { isParentDeleted: true });
        }
        await remult.repo(FireIncident).update(fireId, {
          isDeleted: true,
          deletionReason: reason,
          nextReportDue: null,
        });
      }),
      toError,
    );
    return ok(undefined);
  });
  result.match(
    () => undefined,
    (e) => {
      throw e;
    },
  );
}
```

Operation is sequential, not transactional in the showcase. The Postgres data provider commits each `update`
independently. Production code would wrap in a transaction.

### `FinalReport.removeSignOff(finalReportId: string, reason: string): Promise<void>`

```typescript
@BackendMethod({ allowed: [Roles.stateOfficer, Roles.admin] })
static async removeSignOff(finalReportId: string, reason: string): Promise<void> {
  // must-use-result lacks yield* support; safeTry consumes each Result.
  const result = await safeTry(async function* () {
    if (reason.length < 1 || reason.length > LIMITS.description) {
      return err(new Error('reason must be 1-500 chars'));
    }
    const user = remult.user as CurrentUser | undefined;
    if (!user) {
      return err(new Error('Authenticated user required'));
    }
    // eslint-disable-next-line neverthrow/must-use-result
    const fr = yield* ResultAsync.fromPromise(remult.repo(FinalReport).findId(finalReportId), toError);
    if (!fr) {
      return err(new Error('FinalReport not found'));
    }
    if (!fr.isSignedOff) {
      return err(new Error('FinalReport is not signed off'));
    }
    // eslint-disable-next-line neverthrow/must-use-result
    yield* ResultAsync.fromPromise(
      withServerInternal(() =>
        remult.repo(FinalReport).update(finalReportId, {
          isSignedOff: false,
          signOffRemovedAt: new Date(),
          signOffRemovedBy: user.id,
          signOffRemovedReason: reason,
        }),
      ),
      toError,
    );
    // eslint-disable-next-line neverthrow/must-use-result
    const recent = yield* ResultAsync.fromPromise(
      remult.repo(SituationReport).find({
        where: { fireIncidentId: fr.fireIncidentId },
        orderBy: { reportNumber: 'desc' },
        limit: 2,
      }),
      toError,
    );
    // eslint-disable-next-line neverthrow/must-use-result
    const nextReportDue = yield* resolveNextReportDue(fr.fireIncidentId, recent);
    // eslint-disable-next-line neverthrow/must-use-result
    yield* ResultAsync.fromPromise(
      withServerInternal(() =>
        remult.repo(FireIncident).update(fr.fireIncidentId, { nextReportDue }),
      ),
      toError,
    );
    return ok(undefined);
  });
  result.match(
    () => undefined,
    (e) => {
      throw e;
    },
  );
}
```

`removeSignOff` loads the two most recent situation reports with a single `find({ limit: 2 })`; `reportNumber` is
unique per fire, so `recent[0]` is the latest and `recent[1]` the previous. `resolveNextReportDue(fireId, recent)`,
extracted to keep `removeSignOff` within the 50-line lint cap, returns `new Date(Date.now() + INITIAL_REPORT_MS)` when
there are no situation reports, otherwise `computeNextReportDue({ previousStatus: recent[1]?.status ?? parent.status,
newStatus: recent[0].status, … })`.

`reason` is persisted to `signOffRemovedReason` (mirrors `FireIncident.deletionReason`); no logging facility exists
and `scope:shared` may import only `remult`/`neverthrow`.

---

## Frontend Architecture (Phase 4)

This section specifies the Angular frontend in enough detail that Phase 4 is mechanical: every screen, component,
provider, form, dialog, and the Task teardown is pinned. The backend sections above remain the source of truth for
data, permissions, and business rules; the frontend only *surfaces* them. The goal is an exemplar of modern Angular
(v21, standalone, signals, zoneless), Angular Material M3, Tailwind v4, and full accessibility.

**Stack decisions (locked).** Angular Material (M3, default azure palette) for all interactive components; Tailwind v4
for layout/spacing utilities only; **Typed Reactive Forms** driven by a metadata-driven engine; a reusable
`<app-datetime-field>` composing Material's date + time pickers; light/dark theming following the OS with a persisted
manual toggle. The `.claude/rules/angular-conventions.md` rules apply throughout (signals, `inject()`, built-in control
flow, `resource()`/`liveQuery`, `ResultAsync` wrapping, `DestroyRef` cleanup, `protected`/`readonly`).

### 1. Workspace tooling, dependencies & setup

> **Status: implemented.** The build tooling and Material setup in this section are done and verified — `@nx/angular`
> adopted, `nx.json` generator defaults, Material theme/providers/fonts, and biome `tailwindDirectives`. The
> `check:ci`, `nx build web`, and `nx test` gates all pass. Each subsection below carries its own status: §2 (app
> shell), §3 (shared-domain UI files), §12 (Task teardown), §4 (forms engine), §5 (`<app-datetime-field>`), §6
> (permission gating), §7 (incident list), §8 (incident detail), §9 (dialogs), and the §10 cross-cutting patterns are
> implemented, including the §4.7 create/edit form **components** (sub-phase 4e) — the incident, situation-report,
> and final-report screens render their configs through `<app-dynamic-form>` in a shared `<app-form-page>` shell,
> guarded by a `CanDeactivate` unsaved-edits prompt. Phase 4 is complete: every component is `OnPush`, the
> incident-detail final-report subpanel is `@defer`-loaded, the router uses `withViewTransitions()`, and the app is
> verified to WCAG AA. The only remaining frontend work is the Phase 5 "add one field" demo.

#### 1.1 Adopt `@nx/angular`

This is an NX workspace, so Angular tooling is added the idiomatic NX way — the **`@nx/angular`** plugin — rather than
the bare Angular CLI. (The plain `ng add @angular/material` no-ops here: with no `angular.json`, its schematic cannot
resolve the project. `@nx/angular` provides the bridge that fixes that, plus first-class generators.) The plugin is
installed at the version matching NX (22.6) and initialised; it registers the plugin, works purely with the existing
`project.json` files (no `angular.json`), and leaves the build targets untouched. The commands that reproduce this:

```bash
bun add -D @nx/angular@~22.6     # @nx/angular major MUST track the nx major on every upgrade
bunx nx g @nx/angular:init       # registers the plugin + generators; no angular.json created
```

(`nx add @nx/angular` also works and auto-selects the matching version, but it may shell out to npm; installing with
`bun` then running `init` keeps the package manager consistent with `bun.lock`.)

**Executors — `@angular/build` retained.** The web app's `build` / `serve` / `test` targets stay on the
`@angular/build:application` / `:dev-server` / `:unit-test` executors; `@nx/angular` is adopted for its **generators and
the Angular-schematic bridge only**. `build` stays on `@angular/build:application` rather than
`@nx/angular:application` because Angular's
`@angular/build:unit-test` runner (NX's recommended Angular Vitest runner) only supports an `@angular/build:application`
build target and prints `buildTarget … @nx/angular:application … is not supported … failures may occur` on every
`nx test` when the build is on the wrapper. Keeping `@angular/build` avoids that warning entirely, **still gets NX task
caching** (the `build` entry in `nx.json` `targetDefaults` applies by target name, regardless of executor), and forgoes
only the `@nx/angular:application` extras (esbuild-plugin hooks, `indexHtmlTransformer`, module federation) — none of
which this app needs. If those are ever required, migrate `build` **and** `serve` together (the dev-server falls back to
webpack otherwise) **and** move the test target to `@nx/vite:test` to keep it warning-free.

**Generator defaults.** `nx.json` carries a `generators` block so `nx g` always emits conformant code:

```json
"generators": {
  "@nx/angular:component": {
    "standalone": true,
    "changeDetection": "OnPush",
    "style": "css",
    "inlineStyle": false,
    "inlineTemplate": false,
    "skipTests": false,
    "prefix": "app"
  },
  "@nx/angular:service": { "skipTests": false },
  "@nx/angular:directive": { "standalone": true, "skipTests": false },
  "@nx/angular:pipe": { "standalone": true, "skipTests": false }
}
```

**Caveat — signal inputs.** As of 2026 the `@nx/angular:component` generator still scaffolds `@Input()`/`@Output()`
decorators, but this project's conventions require `input()`/`output()`/`model()`. So the workflow is: scaffold the
file skeleton with `nx g`, then hand-convert any inputs/outputs to the signal forms and use `inject()`. Generated
`.spec.ts` files are compatible with the existing `@angular/build:unit-test` (Vitest) runner — no test-framework change.
Scaffold feature components into the app's `features/` folder via the `--path` flag, e.g. `nx g @nx/angular:component
--path=apps/web/src/app/features/fire-incidents/incident-list/incident-list`. (For a small app, keeping the feature in
`apps/web` is fine; splitting into `@nx/angular:library` feature libs is an optional later scaling step.)

#### 1.2 Material setup (theme, providers, fonts)

Dependencies — `@angular/material` + `@angular/cdk`. Angular Material 21 animates via CSS, so the app wires **no
animations provider**; `@angular/animations` is present in `package.json` (21.2.15) but nothing under `apps/web/src`
imports an animations provider or module:

```bash
bun add @angular/material@^21 @angular/cdk@^21
```

With `@nx/angular` installed, `nx g @angular/material:ng-add --project=web` resolves the workspace, but its output (a
prebuilt-style theme, fonts, and a possibly Zone-based animations provider) would be overwritten by the end state
below, so this project configures Material **directly**:

1. **Styles — two files (Material in SCSS, Tailwind in CSS).** Material M3 theming needs Sass
   (`@use '@angular/material'`), but Tailwind v4's `@import 'tailwindcss'` **cannot** be imported from a Sass file
   (dart-sass tries to resolve it as a Sass import and fails). The global styles are split into two entries, both listed
   in `apps/web/project.json` `build.options.styles` (order matters — the cascade-layer declaration comes first).

   `apps/web/src/styles.scss` (Material theme + cascade-layer order):

   ```scss
   @use '@angular/material' as mat;

   /* later layers win regardless of specificity; Material sits below tailwind/utilities */
   @layer base, material, tailwind, utilities;

   @layer material {
     html {
       color-scheme: light dark; // follow the OS; ThemeService flips data-theme to override
       @include mat.theme((color: mat.$azure-palette, typography: Roboto, density: 0));
     }
     html[data-theme='light'] { color-scheme: light; }
     html[data-theme='dark'] { color-scheme: dark; }
   }
   ```

   `apps/web/src/tailwind.css`:

   ```css
   @import 'tailwindcss';
   /* Tailwind must also scan libs holding class strings — STATUS_BADGE_CLASSES lives in
      libs/shared/domain/src/fire/ui.ts — or those classes are purged from the production build. */
   @source '../../../libs/shared/domain/src';
   ```

   `build.options.styles` is `["apps/web/src/styles.scss", "apps/web/src/tailwind.css"]`. `@angular/build` compiles SCSS
   with no extra config; the `anyComponentStyle` budget (4 kB warn / 8 kB error) applies. Because `@source` is
   Tailwind-specific syntax, `biome.json` carries `"css": { "parser": { "tailwindDirectives": true } }` so `biome ci`
   parses the file. `mat.theme()` with one palette emits both light and dark token values keyed off `color-scheme`, so
   the toggle only flips `data-theme`. **Tailwind is layout-only; all controls are Material.**

2. **Providers (zoneless).** `apps/web/src/app/app.config.ts` provides `provideZonelessChangeDetection()`,
   `provideNativeDateAdapter()` (shared by `MatDatepicker` + `MatTimepicker`), and
   `{ provide: MAT_DATE_LOCALE, useValue: 'en-AU' }`. Angular Material 21 animates via CSS, so no animations provider is
   wired.

3. **Fonts.** `apps/web/src/index.html` links the Roboto and Material Symbols Outlined fonts.

4. **Palette.** The theme uses the default `mat.$azure-palette`.

### 2. App shell

> **Status: implemented.**

The root `App` is a routed Material shell:

- **Layout:** a skip link (`<a href="#main">`) → `MatToolbar` (app title "Fire Incidents", `ThemeToggleComponent`, and
  the toolbar-embedded `<app-dev-user-switcher>`) → `MatSidenavContainer`; the sidenav holds a nav link (`Incidents`)
  and a "Signed in as …" / "Not signed in" line, and `<router-outlet>` sits in `<mat-sidenav-content>` wrapped in
  `<main id="main">`. Sidenav mode is `side` on desktop, `over` on handset (driven by `BreakpointObserver`, see §10).
- **Component:** standalone; imports `RouterOutlet`, `RouterLink`, `MatToolbarModule`, `MatSidenavModule`,
  `MatListModule`, `MatButtonModule`, `MatIconModule`, `DevUserSwitcherComponent`, and `ThemeToggleComponent` — and no
  `FormsModule` or `Task`. It injects `DevAuthService` and `BreakpointObserver`, exposing `protected readonly
  currentUser` and `isHandset` signals.
- **Material Symbols:** `app.config.ts` registers `material-symbols-outlined` as the default `<mat-icon>` font set
  (`provideEnvironmentInitializer` + `MatIconRegistry.setDefaultFontSetClass`), so icon ligatures render against the
  font linked in `index.html`.
- **`apps/web/src/app/app.routes.ts`:**

  ```ts
  export const routes: Routes = [
    { path: '', pathMatch: 'full', redirectTo: 'incidents' },
    {
      path: 'incidents',
      loadChildren: () =>
        import('./features/fire-incidents/fire-incidents.routes').then((m) => m.fireIncidentRoutes),
    },
  ];
  ```

- **Anonymous/empty-user state:** the dev-user switcher's "Anonymous" option leaves `remult.user` undefined, so every
  `apiPrefilter` returns `{ id: ['__never__'] }` and all lists are empty. The shell renders without error when
  `currentUser()` is `undefined` (the sidenav shows "Not signed in"); the **list screen** owns the richer
  empty-state message ("Select a dev user to begin").
- **`ThemeService`** (`core/theme.service.ts`, `providedIn: 'root'`) holds a `signal<'light' | 'dark' | 'system'>`
  persisted to `localStorage` (key `fire-theme`), plus an `effect()` that sets/removes `data-theme` on
  `document.documentElement` (`'system'` removes the attribute → falls back to `color-scheme: light dark`). It mirrors
  the `DevAuthService` localStorage+signal idiom. **`ThemeToggleComponent`** is a `mat-icon-button` that cycles the
  signal `light → dark → system`.

### 3. Shared-domain UI files (`scope:shared`)

> **Status: implemented.**

Two files in `libs/shared/domain/src/fire/`, both re-exported from `libs/shared/domain/src/index.ts` (named exports,
matching the file's style). They import only TypeScript/`remult` types — **no `@angular/*`** (the NX boundary forbids
it). Both use exhaustive `Readonly<Record<Enum, string>>` so the compiler guarantees every enum value is covered.

**`ui.ts`** (status badge classes — Tailwind utilities consumed by the `StatusBadgeComponent`):

```ts
import type { FireStatus } from './enums';

export const STATUS_BADGE_BASE = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium';

export const STATUS_BADGE_CLASSES: Readonly<Record<FireStatus, string>> = {
  going: 'bg-red-100 text-red-800 border-red-300',
  contained: 'bg-amber-100 text-amber-800 border-amber-300',
  underControlFirst: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  underControlSecond: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  safe: 'bg-green-100 text-green-800 border-green-300',
  safeOverrun: 'bg-green-100 text-green-800 border-green-300',
  safeNotFound: 'bg-gray-100 text-gray-800 border-gray-300',
  safeFalseAlarm: 'bg-gray-100 text-gray-800 border-gray-300',
  notFound: 'bg-orange-100 text-orange-800 border-orange-300',
};
```

**`enum-display.ts`** (human-readable labels; one `Record` per enum, labels verbatim from the *Enums* section):

```ts
import type {
  CauseSource, ControlAgency, CostClass, FireDetectionMethod, FireStatus, FuelType,
  IncidentLevel, InvestigationType, LegalActionStatus, Potential, YesNo,
} from './enums';

export const FIRE_STATUS_LABELS: Readonly<Record<FireStatus, string>> = {
  going: 'Going',
  contained: 'Contained',
  underControlFirst: 'Under Control - 1',
  underControlSecond: 'Under Control - 2',
  safe: 'Safe',
  safeOverrun: 'Safe - Overrun',
  safeNotFound: 'Safe - Not Found',
  safeFalseAlarm: 'Safe - False Alarm',
  notFound: 'Not Found',
};

export const INCIDENT_LEVEL_LABELS: Readonly<Record<IncidentLevel, string>> = {
  levelOne: 'Level 1',
  levelTwo: 'Level 2',
  levelThree: 'Level 3',
};

export const CAUSE_SOURCE_LABELS: Readonly<Record<CauseSource, string>> = {
  burningBuilding: 'Burning Building',
  burningHouseStoveFlue: 'Burning House, Stove, Flue',
  burningOffDepartmentalPrescribed: 'Burning Off (Departmental Prescribed)',
  burningOffStubbleGrassScrub: 'Burning Off, Stubble, Grass, Scrub',
  burningOffWindrowHeap: 'Burning Off, Windrow, Heap',
  burningVehicleMachine: 'Burning Vehicle, Machine',
  burningVehicleMachineMalicious: 'Burning Vehicle, Machine - Malicious',
  campfireBarbeque: 'Campfire, Barbeque',
  deliberateLightingMalicious: 'Deliberate Lighting (Malicious)',
  exhaustChainsaw: 'Exhaust, Chainsaw',
  exhaustOther: 'Exhaust, Other',
  fireworks: 'Fireworks',
  lightning: 'Lightning',
  nonDeliberateLightingMischievous: 'Non-Deliberate Lighting (Mischievous)',
  other: 'Other',
  pipeCigaretteMatch: 'Pipe, Cigarette, Match',
  powerTransmission: 'Power Transmission',
  relightBurningOff: 'Relight - Burning Off',
  relightPrescribedFire: 'Relight - Prescribed Fire',
  relightWildfire: 'Relight - Wildfire',
  sniggingHauling: 'Snigging, Hauling',
  train: 'Train',
  unattendedCampfireContainedWithinBoundary: 'Unattended Campfire - Contained Within Boundary',
  unknown: 'Unknown',
  wasteDisposalDomestic: 'Waste Disposal, Domestic',
  wasteDisposalIndustrialSawmillTip: 'Waste Disposal, Industrial, Sawmill, Tip',
};

export const CONTROL_AGENCY_LABELS: Readonly<Record<ControlAgency, string>> = {
  deeca: 'DEECA',
  cfa: 'CFA',
  frv: 'FRV',
  interstate: 'Interstate',
};

export const FUEL_TYPE_LABELS: Readonly<Record<FuelType, string>> = {
  grassland: 'Grassland',
  woodland: 'Woodland',
  spinifex: 'Spinifex',
  malleeHeath: 'Mallee-heath',
  shrubland: 'Shrubland',
  buttongrass: 'Buttongrass',
  forest: 'Forest',
  pine: 'Pine',
};

export const POTENTIAL_LABELS: Readonly<Record<Potential, string>> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
};

export const COST_CLASS_LABELS: Readonly<Record<CostClass, string>> = {
  lessThanThousand: 'Less Than $1,000',
  thousandToFourNineNineNine: '$1,000 - $4,999',
  fiveThousandToNineNineNineNine: '$5,000 - $9,999',
  tenThousandToNineteenNineNineNine: '$10,000 - $19,999',
  twentyThousandToFortyNineNineNineNine: '$20,000 - $49,999',
  fiftyThousandToNinetyNineNineNineNine: '$50,000 - $99,999',
  hundredThousandOrGreater: '$100,000 Or Greater',
};

export const FIRE_DETECTION_METHOD_LABELS: Readonly<Record<FireDetectionMethod, string>> = {
  fireTower: 'Fire Tower',
  ground: 'Ground',
  aircraftPatrol: 'Aircraft Patrol',
  aircraftNonPatrol: 'Aircraft (Non-Patrol)',
  forestIndustryEmployee: 'Forest Industry Employee',
  otherIndustryEmployee: 'Other Industry Employee',
  landownerResident: 'Landowner / Resident',
  traveller: 'Traveller',
  unknown: 'Unknown',
  other: 'Other',
  fireLookout: 'Fire Lookout',
  departmentPatrolAircraft: 'Department Patrol Aircraft',
  departmentGroundPersonnel: 'Department Ground Personnel',
};

export const YES_NO_LABELS: Readonly<Record<YesNo, string>> = {
  yes: 'Yes',
  no: 'No',
};

export const INVESTIGATION_TYPE_LABELS: Readonly<Record<InvestigationType, string>> = {
  accreditedInvestigatorReportAttended: 'Accredited Investigator Report (Attended)',
  accreditedInvestigatorReportNotAttended: 'Accredited Investigator Report (Not Attended)',
  firstAttackReport: 'First Attack Report',
  notInvestigated: 'Not Investigated',
};

export const LEGAL_ACTION_STATUS_LABELS: Readonly<Record<LegalActionStatus, string>> = {
  noAction: 'No Action',
  deptInvestigationContinuing: 'Dept Investigation Continuing',
  deptPoliceInvestigationContinuing: 'Dept/Police Investigation Continuing',
  deptOtherAgencyInvestigation: 'Dept/Other Agency Investigation',
  referredToPolice: 'Referred To Police',
  referredToDeptProsecutions: 'Referred To Dept Prosecutions',
  educationAwarenessWarningLetter: 'Education / Awareness / Warning Letter',
  civilActionBeingUndertaken: 'Civil Action Being Undertaken',
  infringementNoticeIssued: 'Infringement Notice Issued',
};
```

**Shared with the backend:** `TIMESTAMP_PAIRS` (and its `TimestampField` type) is exported from
`libs/shared/domain/src/fire/helpers.ts` and re-exported from the barrel, so the form's cross-field validator and the
server's `validateAdjacentTimestamps` share one list. `LIMITS`, `TERMINAL_STATUSES`, `SAFE_VARIANT_STATUSES`,
`LEVEL_ORDER`, and `POTENTIAL_ORDER` are exported alongside it.

### 4. Metadata-driven forms engine (`apps/web/src/app/shared/forms/`)

> **Status: implemented.** `apps/web/src/app/shared/forms/` holds `form-engine.ts`, `form-engine.types.ts`,
> `cross-field-validators.ts`, `dynamic-form.ts` (`<app-dynamic-form>`), `form-page.ts` (`<app-form-page>` chrome),
> `unsaved-changes.ts` (the `CanDeactivate` guard), and `focus-first-invalid.ts` (focus-on-error helper) — each with a
> spec where it carries logic.

A small, typed, signal-friendly engine that builds a Typed Reactive `FormGroup` from a Remult repository plus a
per-entity config. Adding a field to an entity surfaces it automatically (this is what keeps the Phase 5 demo at
~2 files).

#### 4.1 Contract (`form-engine.types.ts`)

```ts
export type WidgetKind =
  | 'text' | 'textarea' | 'number' | 'integer'
  | 'checkbox' | 'slideToggle' | 'select' | 'datetime';

export interface SelectOption { value: string | number; label: string; }

export interface FieldHint<TEntity> {
  field: keyof TEntity & string;
  widget?: WidgetKind;                         // force a widget
  enumValues?: readonly string[];              // REQUIRED for enum fields (see 4.3 caveat)
  enumLabels?: Readonly<Record<string, string>>;
  optionsSignal?: Signal<readonly SelectOption[]>; // data-driven select (e.g. districts)
  label?: string;                              // overrides metadata caption
  hint?: string;                               // mat-hint text
  rows?: number;                               // textarea rows
  readonly?: boolean;                          // render disabled (prefilled identity)
  min?: number; max?: number; step?: number;
  maxNow?: boolean;                            // datetime: clamp max to "now"
  exclude?: true;                              // drop a field the engine would include
}

export interface FieldGroup<TEntity> { title: string; fields: readonly (keyof TEntity & string)[]; }

export interface EntityFormConfig<TEntity> {
  groups: readonly FieldGroup<TEntity>[];      // ordering + section headers
  hints?: readonly FieldHint<TEntity>[];       // sparse overrides keyed by field
  groupValidators?: readonly ValidatorFn[];    // cross-field rules (4.5)
}
```

#### 4.2 `buildForm(repo, config, mode, seed?)`

1. Iterate `repo.metadata.fields`. **Exclude** a field when `field.options.allowApiUpdate === false`, OR it is
   `id`/`createdAt`/`updatedAt` (auto read-only), OR a relation field, OR `exclude` is set in hints. The same
   exclusion applies in both `'create'` and `'edit'` (server-managed stays server-managed).
2. For each included field, resolve the widget (4.3) and create a typed `FormControl` seeded from `seed` (edit) or
   `repo.create()` defaults (create).
3. Attach Angular validators (4.4).
4. Partition controls into nested `FormGroup`s by `config.groups`; a dev-time unit test asserts **every** included
   field appears in exactly one group (no implicit "Other" bucket).
5. Apply `config.groupValidators` to the root group (4.5).

A `<app-dynamic-form>` component renders the built form: `@for` over groups → section header (`<h2>` / `mat-card`) →
`@for` over fields → `@switch (widget)` rendering the matching Material control inside a `<mat-form-field>` (with
`<mat-label>`, `<mat-hint>`, `<mat-error>`).

#### 4.3 Widget resolution (first match wins)

| # | Condition | Widget | Control |
|---|---|---|---|
| 1 | `hint.widget` present | that kind | per kind |
| 2 | `hint.optionsSignal` present | `select` (data-driven) | `FormControl<number \| string \| null>` |
| 3 | `hint.enumValues` present | `select` (`mat-select`) | `FormControl<string \| null>` |
| 4 | `field.valueType === Date` | `datetime` (`<app-datetime-field>`) | `FormControl<Date \| null>` |
| 5 | `field.valueType === Boolean` | `checkbox` (or `slideToggle` if hinted) | `FormControl<boolean>` |
| 6 | `field.valueType === Number` + integer hint | `integer` (number input, `step=1`) | `FormControl<number \| null>` |
| 7 | `field.valueType === Number` | `number` | `FormControl<number \| null>` |
| 8 | `field.valueType === String` + `maxLength ≥ TEXTAREA_THRESHOLD` | `textarea` | `FormControl<string>` |
| 9 | `field.valueType === String` (fallback) | `text` | `FormControl<string>` |

**Critical caveat (state in doc):** `Fields.literal(() => VALUES)` reports `valueType: String`, so an enum field is
**not** auto-detectable from metadata. Therefore **every enum field MUST carry an `enumValues` + `enumLabels` hint**
(rule 3); without it the field falls through to a plain text input. `TEXTAREA_THRESHOLD` is a named constant
(`= LIMITS.paragraph`, i.e. 1000) — not a magic number.

#### 4.4 Validator mapping

The engine adds Angular validators from metadata best-effort, for instant UX only:

- `required` ← the explicit `required` hint on the field (the form configs set it on every mandatory field). The
  engine does not introspect entity metadata to infer which fields are required.
- `maxLength` / `min` / `max` ← from the field `hint` (the engine does **not** introspect Remult's `validate` array —
  that is version-fragile).
- Everything else (custom + cross-field) is **not** duplicated client-side. The authoritative isomorphic pass is
  `repo.validate()` at submit (4.6). The doc states plainly: the entity validators are the contract; the client mapping
  is sugar, never a second source of truth.

#### 4.5 Cross-field group validators (`cross-field-validators.ts`)

Mirror the server saving-hook rules so users see errors pre-submit (advisory; the server re-enforces):

- **isMajor conditional:** if `isMajor === true`, require `declaredBySource` (1–200 chars) and `declaredByTimestamp`
  (non-null, ≤ now); set the error on the respective control.
- **Adjacent timestamps:** import the shared `TIMESTAMP_PAIRS`; for each pair, when both are non-null, require
  `earlier ≤ later` and set the error on the **later** control (matches `validateAdjacentTimestamps`).
- **safeOverrun:** when `status === safeOverrun`, disable the `fireAreaHectares` control and show it as 0 (the server
  zeroes it authoritatively).

#### 4.6 Submit flow

1. Map the `FormGroup` value onto a `repo.create()` (create) or the loaded instance (edit).
2. `const errors = await repo.validate(instance)` — push each field error onto the matching `FormControl`
   (`setErrors({ server: msg })`) → surfaced via `<mat-error>`. This is the same validator code the server runs.
3. If clean, wrap the actual `repo.insert/update` (or BackendMethod) in `ResultAsync.fromPromise` (per conventions).
   On `isErr`, surface the message: field-attributable → the control's `<mat-error>`; otherwise an inline form-level
   alert **and** a `MatSnackBar`. Server-only failures (DB-backed hook checks, lock cancels, thrown BackendMethod
   `Error`s) arrive here as thrown errors — **show the message text as-is** (the entities author precise messages).

#### 4.7 The three form configs and their components

> **Status: implemented.** `incident-form/fire-incident.form-config.ts`,
> `sitrep-form/situation-report.form-config.ts`, and `final-report-form/final-report.form-config.ts` (each with a spec)
> live under `features/fire-incidents/`, and the components that render them through `<app-dynamic-form>` are in place:
> `incident-form.ts` (create + edit), `situation-report-form.ts` (create-only), and `final-report-form.ts` (create +
> edit, mode from route `data`). All three share the `<app-form-page>` shell and the `confirmDiscardIfDirty`
> `CanDeactivate` guard, build their forms in a side-effect-safe `effect` (never inside a `computed`), and on a clean
> save mark the form pristine and navigate to the relevant detail screen.

Field lists are the entity fields minus the auto-excluded server-managed/relation fields. Excluded from **all** forms:
`id`, `createdAt`, `updatedAt`, and every `allowApiUpdate:false` field (FireIncident: `financialYear`, `fireNumber`,
`globalIncidentId`, `createdBy`, `statusAsAt`, `totalPersonnel`, `totalVehicles`, `totalAircraft`, `nextReportDue`,
`isDeleted`, `deletionReason`; SituationReport: `reportNumber`, `districtId`, `isParentDeleted`, `submittedBy`,
`submittedAt`; FinalReport: `districtId`, `isParentDeleted`, all `signedOff*`/`signOffRemoved*` audit fields).

**FireIncident — create & edit, grouped sections** (decision: grouped sections). `incidentLevel` is **excluded** by
config (escalate-only; defaults to `levelOne` on create):

| Group | Fields (widget) |
|---|---|
| Identity & Location | `name` (text, required) · `districtId` (select, `optionsSignal` from District repo) · `locationDescription` (textarea ≤500) · `latitude` (number, −90..90) · `longitude` (number, −180..180) |
| Status & Classification | `status` (select FireStatus, required) · `isMajor` (slideToggle) · `declaredBySource` (text ≤200) · `declaredByTimestamp` (datetime, `maxNow`) |
| Timeline | `reportedAt` (datetime, required, `maxNow`) · `fireStartedAt` · `fireDetectedAt` · `firstCrewSentAt` · `firstCrewArrivedAt` (all datetime) · `detectionMethod` (select FireDetectionMethod) |
| Cause | `causeSource` (select CauseSource) · `causeSourceOther` (textarea ≤500) · `isCauseConfirmed` (checkbox) |
| Initial Response | `isLandManagerNotified` (select YesNo) · `isControlAgencyNotified` (select YesNo) · `isFireMapAttached` (checkbox) · `controlAgency` (select ControlAgency) · `fuelType` (select FuelType) |
| Area | `fireAreaHectares` (number ≥0) · `burntAreaHectares` (number ≥0) |

The `districtId` `optionsSignal` is fed from `remult.repo(District).find()` (active districts) loaded via `resource()`.
For an IncidentEditor the create form locks `districtId` to the user's own district (matches the server insert rule).
Enum hints required (rule 3): `status`, `detectionMethod`, `causeSource`, `isLandManagerNotified`,
`isControlAgencyNotified`, `controlAgency`, `fuelType`.

**SituationReport — single grouped form** (no datetime fields):

| Group | Fields (widget) |
|---|---|
| Identity (read-only) | `fireIncidentId` (prefilled from route, `readonly`) · `fireName` (text ≤255; placeholder = parent name) |
| Status & Area | `status` (select FireStatus, required) · `fireAreaHectares` (number ≥0) |
| Narrative | `weatherConditions` · `currentStrategy` · `predictedBehaviour` · `controlProgress` · `communityImpact` (textarea ≤1000 each) · `significantEvents` (textarea ≤5000) |
| Potential | `potentialLoss` (select Potential) · `potentialSpread` (select Potential) |
| Resources | `personnel` · `vehicles` · `aircraft` (integer ≥0) |

Enum hints: `status`, `potentialLoss`, `potentialSpread`.

**FinalReport — single grouped form** (no datetime fields):

| Group | Fields (widget) |
|---|---|
| Losses | `stockLost` · `homesLost` · `shedsLost` (integer ≥0) · `fencingLostKm` · `cropLossHectares` (number ≥0) · `infrastructureLosses` · `otherLosses` (text ≤500) |
| Investigation | `investigationType` (select) · `investigationBy` (text ≤200) · `isOffenceSuspected` (checkbox) · `legalActionStatus` (select) |
| Cost | `costClass` (select) |
| Burnt Land | `burntStateForest` · `burntNationalPark` · `burntPrivateProperty` · `burntPlantation` · `burntOther` (number ≥0) |
| Sign-off | `isSignedOff` (slideToggle) — **create form only**; hidden on edit (sign-off toggled via the detail button) |

`fireIncidentId` is prefilled (read-only) from the route. Enum hints: `investigationType`, `legalActionStatus`,
`costClass`.

### 5. `<app-datetime-field>` component (`shared/components/datetime-field/`)

> **Status: implemented.** `shared/components/datetime-field/datetime-field.ts` (with a spec).

Standalone, signal-based, implements `ControlValueAccessor` so it slots into reactive forms like any control.

- **Inputs:** `value = model<Date | null>(null)` · `label = input<string>('')` · `min = input<Date | null>(null)` ·
  `max = input<Date | null>(null)` · `required = input(false)` · `disabled = input(false)` ·
  `hint = input<string>('')` · `errorId = input<string | null>(null)` · `invalid = input(false)`
  (the renderer wires the last two for a11y).
- **Composition:** one `<mat-form-field>` containing a `matDatepicker` date input and an official `matTimepicker` time
  input, each bound to internal signals (`datePart`, `timePart`) and recombined into a single `Date` via `computed()`.
  Both share the app `DateAdapter` (native, provided in `app.config.ts`).
- **Semantics:** emits `null` until a date is chosen; when only the date is set, time defaults to `00:00`. `[min]`/`[max]`
  forward to the date input; `maxNow` callers pass `max = new Date()`.
- **a11y:** the field is a `role="group"` labelled by its `<mat-label>`; a `describedBy` `computed` points the group at
  its hint and, when `invalid`, the parent form's error message (`errorId`), and `aria-invalid` reflects validity. These
  sit on the group wrapper, not the inner Material inputs — the `matInput` directive owns those inputs'
  `aria-describedby`/`aria-invalid`. Both pickers are keyboard-navigable (Material default) and participate in the host
  form's focus order.
- **Display:** native adapter + `MAT_DATE_LOCALE='en-AU'` → dd/mm/yyyy; time in 24-hour format. The model is always a
  JS `Date`; serialisation to the API is Remult's concern.

### 6. Permission gating (`shared/auth/permissions.ts`)

> **Status: implemented.** `shared/auth/permissions.ts` (with a spec).

A single source of truth for UI affordances. Pure functions take the entity (and helper flags) plus the
`CurrentUser`, and reconcile the **coarse** entity `allowApi*` predicates with the **fine** saving-hook rules (which do
not run client-side). They import `Roles`, `TERMINAL_STATUSES`, and `LEVEL_ORDER` from `@workspace/shared-domain` so
they cannot drift from the server. Client gating is advisory — the server re-enforces everything.

```ts
canCreateIncident(user)                       // incidentEditor | stateOfficer | admin
canViewFinalReport(user)                      // incidentEditor | stateOfficer | admin (mirrors FinalReport.allowApiRead)
canEditFire(fire, user, flags)                // flags = { hasSitreps, hasFinalReport, isSignedOff }
canEscalate(fire, user, isSignedOff)          // SO/admin; !isDeleted && !isSignedOff && level<3
canCreateSitrep(fire, user, hasFinalReport, isSignedOff) // editor+; !isDeleted && !isSignedOff && !hasFinalReport
canCreateFinalReport(fire, user, hasFinalReport)         // editor+; terminal status && !isDeleted && !hasFinalReport
canSoftDelete(fire, user, isSignedOff)        // SO/admin; terminal && !isSignedOff && !isDeleted
canSignOff(finalReport, parentStatus, user)   // editor+; !isSignedOff && terminal(parentStatus)
canRemoveSignOff(finalReport, user)           // SO/admin; isSignedOff
```

`canEditFire` encodes the editor restriction: for `incidentEditor` (not SO/admin) it is true only when
`fire.createdBy === user.id` AND `!flags.hasSitreps` AND `!flags.hasFinalReport` AND `!flags.isSignedOff` AND
`!fire.isDeleted`; SO/admin may
edit unless signed-off or deleted. The doc includes the hook-line → helper mapping so the gating provably matches
`fire-incident.ts`/`final-report.ts`.

### 7. Incident List (`features/fire-incidents/incident-list/`)

> **Status: implemented.** `incident-list/incident-list.ts` + `incident-list.html` (no component CSS — Tailwind
> utilities and Material only) render the live, district-scoped list, with `incident-list.spec.ts` covering the
> anonymous, gating, and responsive surfaces.

- **Data:** `remult.repo(FireIncident).liveQuery({ include: { district: true }, orderBy })` is opened inside a single
  `effect()` keyed on the current dev user's id and torn down/reopened on every user or sort change (no
  `remult.subscribeAuth` is wired, so the open query is re-scoped explicitly); the latest emission feeds a
  `signal<FireIncident[]>`, with teardown via `DestroyRef.onDestroy`. LiveQuery (not `resource()`) because sitrep saves
  mutate parent rows server-side and the list reflects that live. District scoping is server-side via `apiPrefilter` —
  the client sends no district filter. Because `FireIncident.allowApiRead` is `Allow.authenticated`, an anonymous read
  is a 403 (not an empty list), so the component skips the query entirely until a dev user is selected.
- **Table:** `MatTable` + `MatSort` + `MatPaginator`. Columns: `name` (a `routerLink` to `/incidents/:id`),
  `district.name`, `fireNumber` (zero-padded to 3 via `DecimalPipe '3.0-0'`), `status` (via `StatusBadgeComponent`),
  `fireAreaHectares`, `incidentLevel` (label, resolved through a typed helper because MatTable cell contexts are `any`),
  `isMajor` (a `local_fire_department` icon when true), `statusAsAt` (the "last report date" column), `nextReportDue`.
  Dates render through explicit `DatePipe` format strings (`dd/MM/yy, HH:mm`) since no `LOCALE_ID` is registered.
  Sortable headers name, fireNumber, and statusAsAt re-issue the server `orderBy`; `district` is a relation the API
  cannot order by, so that column is sorted client-side. Default order `createdAt desc` (entity default); pagination is
  client-side over the emitted rows.
- **Actions:** a "New Incident" button (`routerLink="/incidents/new"`) shown only when
  `canCreateIncident(currentUser())`.
- **Responsive:** injects `BreakpointObserver` as a signal (`toSignal(observe(Breakpoints.Handset))`); on handset it
  renders a stacked `MatCard` list instead of the table (same signal data; the cards keep the current order).
- **States:** a `viewState` computed drives a `@switch` — `anonymous` ("Select a dev user to begin") → `loading`
  (`MatProgressBar`) → `error` (inline `role="alert"` + snackbar) → `empty` (`MatCard`: "No incidents in your district"
  for district-scoped users, "No incidents found" for cross-district) → `content`.
- **Navigation:** the row name links to `/incidents/:id` (the incident-detail screen, §8) and "New Incident" to
  `/incidents/new` (the incident create form, §4.7).

### 8. Incident Detail (`features/fire-incidents/incident-detail/`)

> **Status: implemented.** `incident-detail/incident-detail.ts` + `incident-detail.html` (no component CSS — Tailwind
> utilities and Material only) render the screen, with `incident-detail.spec.ts` covering the action-button gating
> matrix and the action wiring.

- **Data:** the route `:id` and the current dev user feed a `resource()` whose request is `undefined` when anonymous
  (the resource stays `idle` and the loader is skipped — an anonymous read is a 403, not a row) and otherwise loads the
  fire via `repo.findId(id, { include: { district: true, situationReports: true, finalReport } })`. The `finalReport`
  relation is included **only when the user may read it** (`canViewFinalReport`, mirroring `FinalReport.allowApiRead`),
  so a viewer's GET is not rejected. The request recomputes — and the resource reloads — on a dev-user switch; each
  successful action calls `resource.reload()` (soft-delete instead navigates back to the list, since the row is now
  hidden by `apiPrefilter`). The loader lets a rejection flow into the resource's own error state rather than wrapping
  in `neverthrow` only to re-throw.
- **States:** a `@switch` over `resource.status()` renders a `MatProgressBar` while loading, an inline `role="alert"`
  card on error (`toErrorMessage(resource.error())`), a "Select a dev user to begin" card when `idle` (anonymous), the
  content when resolved, and an "Incident not found" card when the fire resolves empty (missing /
  `apiPrefilter`-filtered / soft-deleted).
- **Layout:** header `MatCard` (name, status badge, `isMajor` icon, then a responsive `<dl>` of `globalIncidentId`,
  `fireNumber`, level, district, `reportedAt`, `statusAsAt`, `nextReportDue`, `fireAreaHectares`) + an action bar; a
  **sitrep timeline** as a `mat-accordion` of `MatExpansionPanel`s newest-first (client-sorted `reportNumber desc`,
  first expanded) each showing the sitrep's status / submitted-at / resources / area / potentials / narrative; a
  **final-report subpanel** — an extracted `app-final-report-panel` component, loaded with
  `@defer (on viewport; prefetch on idle)` and shown only when a FinalReport exists AND the user may read it
  (`canViewFinal`) — displaying the loss / investigation / cost / burnt-land fields plus a "Signed off" line when
  applicable, and emitting its sign-off / remove-sign-off actions back to the detail screen.
- **Action-button matrix.** Each button is **rendered only when it is fully actionable** — its `permissions.ts`
  predicate (role **and** state) is true; a button that would otherwise be disabled is simply absent. Routed actions
  are `<a routerLink>`; mutations open a dialog (§9) then call the BackendMethod through a shared `ResultAsync` helper
  that surfaces success via `NotificationService` + CDK `LiveAnnouncer` and reloads.

  | Button | Shown when (predicate) | Action |
  |---|---|---|
  | Edit | `canEditFire` (own/pre-sitrep for editor; SO/admin unless signed-off/deleted) | route → `:id/edit` |
  | Escalate | `canEscalate` (SO/admin; `!isDeleted && !isSignedOff && level < 3`) | `EscalateDialog` → `FireIncident.escalate` |
  | New Situation Report | `canCreateSitrep` (editor+; `!isDeleted && !isSignedOff && !hasFinalReport`) | route → `:id/sitrep` |
  | Create Final Report | `canCreateFinalReport` (editor+; terminal && `!isDeleted` && no FinalReport) | route → `:id/final` |
  | Delete (soft) | `canSoftDelete` (SO/admin; terminal && `!isSignedOff` && `!isDeleted`) | `ConfirmReasonDialog` → `FireIncident.softDelete` → list |
  | Sign off (subpanel) | `canSignOff` (editor+; `!isSignedOff` && terminal parent) | `ConfirmDialog` → `repo(FinalReport).update({ isSignedOff: true })` |
  | Remove sign-off (subpanel) | `canRemoveSignOff` (SO/admin; `isSignedOff`) | `ConfirmReasonDialog` → `FinalReport.removeSignOff` |
  | Edit final (subpanel) | `canViewFinal && !isSignedOff` | route → `:id/final/edit` |

  The incident / situation-report / final-report **create & edit pages are routed** (`/incidents/new`,
  `/incidents/:id/edit`, `/incidents/:id/sitrep`, `/incidents/:id/final`, `/incidents/:id/final/edit`); those routes
  resolve to the real form components (§4.7), each carrying the `unsavedChangesGuard`.

### 9. Dialogs (`shared/dialogs/`, `features/fire-incidents/dialogs/`)

> **Status: implemented.** Three standalone `MatDialog` components, each with a spec:
> `shared/dialogs/confirm-reason-dialog.ts`, `shared/dialogs/confirm-dialog.ts`, and
> `features/fire-incidents/dialogs/escalate-dialog.ts`.

- **`ConfirmReasonDialogComponent`** (`shared/dialogs/`): data `{ title, message, confirmLabel }`; a required textarea
  with `maxLength = LIMITS.description` (500), Confirm disabled until a non-blank reason is entered. Returns
  `{ reason } | undefined`. Used by **soft-delete** and **remove-sign-off**; the caller invokes
  `FireIncident.softDelete(id, reason)` / `FinalReport.removeSignOff(frId, reason)`.
- **`ConfirmDialogComponent`** (`shared/dialogs/`): a plain yes/no confirm — data `{ title, message, confirmLabel }`,
  returns `true | undefined`. Used by **sign-off** (which carries no reason in the domain) before the
  `repo(FinalReport).update({ isSignedOff: true })` PATCH.
- **`EscalateDialogComponent`** (`features/fire-incidents/dialogs/`): a `mat-radio-group` of the `IncidentLevel` values
  **above** the current level (via `LEVEL_ORDER`); returns the chosen level (Confirm disabled until one is picked, and
  the option list is empty — with an "already at the highest level" message — at `levelThree`). The caller invokes
  `FireIncident.escalate(id, newLevel)`.
- All dialogs carry a labelled `mat-dialog-title`; `MatDialog` provides focus trap + restore. The opener is injected
  directly (`MatDialog` is `providedIn: 'root'`, so the detail component does not import `MatDialogModule`). On success
  → snackbar + `LiveAnnouncer` + detail reload (or navigation for soft-delete).

### 10. Cross-cutting patterns

> **Status: implemented.** `NotificationService` (`core/notification.service.ts`, with
> `app-notification-success`/`-error` snackbar accents in `styles.scss`) and the `toErrorMessage` helper
> (`shared/util/to-error-message.ts`) are built; the incident list (§7) exercises the LiveQuery loading/empty/error
> pattern, the structural table↔cards responsive shift, and permission gating; and the incident detail (§8) and dialogs
> (§9) exercise the `resource()` status handling, the `MatDialog` focus trap and CDK `LiveAnnouncer` announcements, and
> Tailwind-only responsiveness (the detail has no structural layout shift, so it wires no `BreakpointObserver`).

- **Notifications:** `NotificationService` (`core/notification.service.ts`) wrapping `MatSnackBar` (`success`, `error`).
  All `ResultAsync` error branches call it. Add a `toErrorMessage` helper at `shared/util/to-error-message.ts`.
- **Loading/empty/error:** `resource()` screens use `@switch (resource.status())` → spinner / content / error panel;
  empty handled inside the resolved branch (`@if (items().length === 0)`). LiveQuery screens use an explicit `loading`
  signal set false on first emission.
- **Accessibility checklist (must all hold):**
  1. Every input has a `<mat-label>`; selects/checkboxes/toggles have accessible names.
  2. Validation errors via `<mat-error>` (Material wires `aria-describedby` when inside `<mat-form-field>`).
  3. Dialogs: focus trap + restore (MatDialog default), titled with `mat-dialog-title`.
  4. CDK `LiveAnnouncer` announces async outcomes (save success/failure) and route changes (incident opened).
  5. Status-badge colours meet WCAG AA contrast — verify the Tailwind 100/800 pairs.
  6. Keyboard nav: sort headers, paginator, buttons, sidenav toggle all reachable and operable.
  7. A skip link targets `#main`.
  8. Respect `prefers-reduced-motion` (Material's CSS animations honour it; add no animations that bypass it).
- **Responsive ("dynamic viewports"):** Tailwind responsive utilities for layout/spacing by default; CDK
  `BreakpointObserver` (as a signal) only for **structural** shifts — list table↔cards (`Breakpoints.Handset`), and
  sidenav `side`↔`over` mode.

### 11. Component/file tree & testing

```text
apps/web/src/
  styles.scss                                   (built: Material theme + cascade layers + notification accents)
  index.html                                    (built: + Roboto + Material Symbols <link>)
  app/
    app.ts / app.html                           (built: routed shell — toolbar + sidenav)
    app.config.ts                               (built: zoneless CD, native date adapter, en-AU locale, icon font; Material CSS animations)
    app.routes.ts                               (built: lazy → features/fire-incidents)
    core/
      remult.provider.ts / dev-auth.*           (built)
      theme.service.ts                          (built)
      notification.service.ts                   (built)
    shared/
      components/
        dev-user-switcher.ts                    (built: embedded in toolbar)
        theme-toggle/theme-toggle.ts            (built)
        datetime-field/datetime-field.ts        (built: app-datetime-field, CVA)
        status-badge/status-badge.ts            (built: ui.ts + enum-display)
      forms/
        form-engine.ts / form-engine.types.ts   (built)
        cross-field-validators.ts               (built)
        dynamic-form.ts                          (built: OnPush + markForCheck bridge)
        form-page.ts                             (built: shared form chrome)
        unsaved-changes.ts                       (built: CanDeactivate guard)
      auth/permissions.ts                       (built)
      util/to-error-message.ts                  (built)
      dialogs/confirm-reason-dialog.ts · confirm-dialog.ts   (built)
    features/fire-incidents/
      fire-incidents.routes.ts                  (built: '' → list, ':id' → detail; 'new', :id/edit, :id/sitrep, :id/final[/edit] → form components + unsavedChangesGuard)
      incident-list/ (built: list.ts + .html + .spec) · incident-detail/ (built: incident-detail.ts + .html + .spec + final-report-panel.ts @defer)
      incident-form/ (built: incident-form.ts + .spec; create + edit)
      sitrep-form/ (built: situation-report-form.ts + .spec; create-only)
      final-report-form/ (built: final-report-form.ts + .spec; create + edit)
      dialogs/escalate-dialog.ts                (built)
    testing/axe-helper.ts                        (built: structural a11y assertion)
libs/shared/domain/src/fire/
  enum-display.ts · ui.ts                        (built, scope:shared)
```

**Testing.** Shared-domain Vitest includes exhaustiveness tests for `enum-display.ts` (every enum value has a label)
and `ui.ts` (every `FireStatus` has a badge class); the web suite covers the shell (`app.spec.ts`, which stubs
`BreakpointObserver`/`DevAuthService` and needs no Remult) and `ThemeService` (`theme.service.spec.ts`). The web suite also
covers the forms engine (`form-engine.spec.ts` — excluded fields absent, enums→select, dates→datetime, validators
attached, create/edit submit), the cross-field validators, `<app-datetime-field>` (combine/clear), `<app-dynamic-form>`,
the three form configs, `permissions.ts` (each role × state), `StatusBadgeComponent` (every `FireStatus`), the incident
list (`incident-list.spec.ts` — the anonymous skip with no query opened, "New Incident" gating per role, and the
table↔cards responsive shift; the live-query transport is stubbed so renders resolve without a server), the incident
detail (`incident-detail.spec.ts` — the role×state action-button gating matrix plus the action wiring and cancel
paths, driving the resolved state white-box over an inert transport), the three dialogs (`confirm-reason-dialog`,
`confirm-dialog`, `escalate-dialog` specs), `NotificationService`, and `toErrorMessage` — using `InMemoryDataProvider`
and a set `remult.user` for data-bound specs. The 4e screens add `incident-form`, `situation-report-form`, and
`final-report-form` specs (page-state transitions, the district lock, create-insert vs edit-update routing, required-field
blocking, and server-error surfacing — `repo.validate`/`insert`/`update` spied on the shared repo), plus `form-page`,
`unsaved-changes`, and `final-report-panel` specs and a `<app-dynamic-form>` OnPush regression that proves a
parent-pushed server error renders. The incident-detail spec drives the `@defer` final-report block via
`DeferBlockBehavior.Manual` + `getDeferBlocks().render(Complete)`. Structural accessibility is asserted with axe-core
(`testing/axe-helper.ts`, colour-contrast/region disabled as they need real layout) across the shell, list, detail, and
every form. Web tests do **not** re-test server rules — those are covered by the
existing shared-domain backend suites; the detail and list data-dependent behaviour (district scoping, sort,
pagination, live updates, and the actual `resource()` load) is verified via the §13 end-to-end recipe.

### 12. Task teardown

> **Status: complete.**

The codebase carries no `Task` example: there is no `tasks/task.ts` entity and no `export { Task }` in the barrel; no
`Task` in the `apps/api/src/config.ts` import or `entities` array; and no references anywhere (`bun run check:ci` is
green). The `apps/api/src/migrations/20260529112903_drop_tasks.sql` migration (`DROP TABLE "tasks";`) — derived from the
`entities` array and recorded in `atlas.sum` — keeps the database free of the `tasks` table. `App` is the routed shell
(§2), and `app.spec.ts` asserts the shell renders with the toolbar title "Fire Incidents".

### 13. Composition, acceptance, and end-to-end verification

**Composition.** The frontend is assembled in layers, each independently unit-tested:

- **Tooling & shell** — `@nx/angular` (generators + the Angular-schematic bridge; `@angular/build` executors
  retained), Angular Material M3 (azure palette, two-file Sass/Tailwind styles, biome `tailwindDirectives`), the
  light/dark/system `ThemeService` + toggle, and the routed Material shell. The workspace carries no `Task` example
  (§12).
- **Shared-domain UI + forms engine** — `enum-display.ts` + `ui.ts` (barrel-exported), the metadata-driven forms
  engine (`form-engine*`, `cross-field-validators`, `dynamic-form`), the three form configs, `<app-datetime-field>`,
  `StatusBadgeComponent`, `permissions.ts`, `NotificationService`, and `toErrorMessage`.
- **Incident list** — district-scoped LiveQuery, status badges, zero-padded fire numbers, responsive table↔cards,
  `canCreateIncident` "New Incident" gating, and the anonymous/loading/empty/error states.
- **Incident detail + dialogs** — the `resource()`-loaded detail screen (header, situation-report timeline, and the
  `@defer`-loaded final-report panel), the role×state action-button matrix wired to the four BackendMethods through
  the escalate / confirm / confirm-reason dialogs, and the `canViewFinalReport` predicate.
- **Form screens (§4.7)** — the incident / situation-report / final-report components render their configs through
  `<app-dynamic-form>` in the `<app-form-page>` shell, behind the `unsavedChangesGuard`, with the editor district
  lock, `repo.validate()` server-error surfacing, and post-save pristine navigation.
- **App-wide conformance** — `OnPush` on every component (with the `AbstractControl.events → markForCheck` bridge on
  `<app-dynamic-form>` and signal-backed dialog buttons), the `@defer` final-report panel, router
  `withViewTransitions()` behind a `prefers-reduced-motion` guard, and the WCAG-AA pass (the
  `text-muted`/`--mat-sys-on-surface-variant` token, the `<nav>` landmark, the table `aria-label`, and the datetime
  `aria-describedby`/`aria-invalid`), guarded by axe-core structural assertions.

**Per-screen acceptance.** *List:* `dev-editor-otway` sees only Otway incidents, `dev-admin` sees all, "New Incident"
hidden for viewers, sort + responsive cards work, badges colour-correct, list updates live when a sitrep changes a
fire. *Detail:* viewer sees no final-report panel and no edit/escalate/delete; editor sees Edit only on own pre-sitrep
fires; SO/admin see Escalate (absent at level 3), Delete (absent unless terminal & not signed-off), Remove
sign-off (only when signed-off); New Sitrep hidden once a final report exists. *Forms:* required errors block submit;
enum dropdowns show display labels; datetime composes correctly; toggling `isMajor` requires
`declaredBySource`/`declaredByTimestamp`; a timestamp-order violation shows on the later field; a server-rejected case
(e.g. an editor editing another's fire) surfaces the exact hook message in a snackbar.

**End-to-end recipe.** `just dev` (api + web, Postgres up, `just migrate-apply`); click through all 8 dev users plus
"Anonymous", verifying list scoping and button gating; exercise each BackendMethod from the UI (create → sitrep → move
to terminal status → create + sign off final report → remove sign-off → soft delete); confirm `just ci` is green
(watch the 8 kB `anyComponentStyle` budget on Material-themed components).

### 14. Resolved defaults (change here if needed)

**`@nx/angular` adopted** (init + generators + Angular-schematic bridge; `nx.json` generator defaults) with
`build`/`serve`/`test` **kept on `@angular/build:*`** — migrating `build` to `@nx/angular:application` makes the
`@angular/build:unit-test` runner emit an unsupported-buildTarget warning; Material is set up directly
(two-file `styles.scss` + `tailwind.css`, biome `tailwindDirectives`) · Azure default palette · forms engine
derives `required` from the explicit `required` hint and `min`/`max`/`maxLength`/`maxNow` from hints (no metadata
`allowNull` or `validate`-array introspection); authoritative pass is `repo.validate()` ·
`incidentLevel` excluded from the incident
form (escalate-only) · `TIMESTAMP_PAIRS` exported from `helpers.ts` and shared · district select via `optionsSignal` ·
`isSignedOff` on FinalReport **create** only · datetime defaults time to 00:00 · 24-hour time, `en-AU` · list "last
report date" = `statusAsAt` · list uses `liveQuery`, detail uses `resource()` (its loader lets a rejection flow into
the resource error state rather than wrapping in `neverthrow` only to re-throw) · detail action buttons are **hidden
when not actionable** (one role-and-state predicate per button, not visible-but-disabled) · the detail eager-includes
`finalReport` and shows its subpanel only when `canViewFinalReport` (mirrors `FinalReport.allowApiRead`, which excludes
`viewer`) · sitrep/final-report create/edit are routed pages; the three dialogs are confirm-reason (soft-delete /
remove-sign-off), the yes/no confirm (sign-off), and escalate. **Datetime input** uses native `MatDatepicker` +
`MatTimepicker` wrapped in `<app-datetime-field>` rather than a third-party combined picker: the only
signals/zoneless-native option is not Material-styled and immature, and the mature, Material-styled ones are not
signals/zoneless-native and would undercut the modern-Angular showcase.

---

## Resource Tracking Model

The full resource tracking system (not in scope for this showcase) tracks resources per agency and per type across many
categories. For the showcase, flatten to totals on `FireIncident` (`totalPersonnel`, `totalVehicles`, `totalAircraft`)
and snapshots on `SituationReport` (`personnel`, `vehicles`, `aircraft`). The full per-agency breakdown is a future
enhancement.

---

## User Workflows

> **Status: implemented.** These describe the frontend feature (*Frontend Architecture* §7–§9). The incident list, the
> incident detail, the action dialogs, and the create / edit / situation-report / final-report form screens are all
> built and wired end-to-end against the complete backend.

### Incident List

Displays all fire incidents visible to the current user (district-filtered for IncidentEditor/Viewer; cross-district for
StateOfficer/Admin). Shows: fire name, district, fire number, status (colour-coded via `STATUS_BADGE_CLASSES`), fire
area, incident level, whether it's a major fire, last report date, next report due.

Sortable by name, district, number, last report date. "New Incident" action visible only to users with create
permission.

### Incident Detail

Shows full incident information and a timeline of situation reports (newest first). Each action button is shown only
when it is fully actionable (role and state):

- "Edit" — when the user may update this incident (own/pre-sitrep for an editor; StateOfficer/Admin unless signed-off
  or deleted)
- "Escalate" — StateOfficer/Admin, while not deleted/signed-off and below level 3
- "New Situation Report" — IncidentEditor+, while not deleted/signed-off and no final report exists
- "Create Final Report" — IncidentEditor+, on a terminal fire with no final report yet
- "Delete" — StateOfficer/Admin, on a terminal, not-signed-off fire
- "Sign off" / "Remove sign-off" / "Edit" — on the final-report subpanel (shown only to users who may read the final
  report); "Remove sign-off" is StateOfficer/Admin only

### Incident Form (Create / Edit)

Form for creating or editing a fire incident. Fields driven by entity metadata where possible. Enum fields render as
dropdowns. Validation runs on the client before submit (same rules as server). Required fields: name, districtId,
status, reportedAt.

### Situation Report Form

Form for submitting a new sitrep against a fire. Pre-populates fire identity fields (district, fire number) as
read-only. Captures status, area, weather, strategy, significant events, predicted behaviour, control progress,
community impact, potentials, and resource snapshot. After submission the sitrep cannot be edited.

---

## Implementation Phases

The sections above (*Entities*, *Enums*, *Lifecycle Hooks*, *Business Rules*, *Validation Rules*, *UI Display*,
*Domain Operations*) specify the showcase in full. The phases below carve it into deliverables and record current
status — what is built and what remains.

### Phase 1: Infrastructure

**Status: Complete.**

`libs/shared/domain/src/auth/roles.ts` defines the four showcase roles (`viewer`, `incidentEditor`, `stateOfficer`,
`admin`). `current-user.ts` exports `CurrentUser` (`UserInfo & { districtId: number | null }`). `dev-users.ts` carries
the eight `CurrentUser` identities from *Dev Users* and the `DEV_DISTRICT_NAMES` lookup.
`apps/web/src/app/shared/components/dev-user-switcher.ts` renders each user's role and district inline in both the
dropdown options and the active-user detail line. `apps/web/src/app/core/dev-auth.service.ts` and
`apps/api/src/main.ts`'s `getUser` callback both work in `CurrentUser` terms.

The four fire tables and the district seed data live in Postgres, owned by Atlas migrations:
`apps/api/src/migrations/20260528125801_add_fire_entities.sql` creates the `districts`, `fireIncidents`,
`situationReports`, and `finalReports` tables (with their UNIQUE constraints inlined), and
`20260528125802_seed_districts.sql` inserts the five Victorian districts from *Districts*.

The per-entity `SchemaExtras` convention is established: each entity that needs DB-level DDL beyond `CREATE TABLE`
columns + `PRIMARY KEY` exports a sibling `readonly string[]` of raw SQL fragments (`districtSchemaExtras`,
`fireIncidentSchemaExtras`, `finalReportSchemaExtras`). `apps/api/src/config.ts` registers the entities and collates the
extras into a single `schemaExtras` export; `apps/api/src/db/sync-to-desired.ts` runs them against the Atlas scratch DB
after `ensureSchema`, so Atlas inspects the constraints and emits them in each diff.

### Phase 2: Domain Entities

**Status: Complete.**

The three fire entities carry their full field schemas from *Entities*, with role-based permissions per the *Permission
Matrix*, district-scoped `apiPrefilter`, `saving` / `saved` lifecycle hooks per *Lifecycle Hooks* (using the
server-internal flag for server-side parent updates), cross-field validators from *Validation Rules* that field-level
decorators cannot express, and `Relations.toOne` / `Relations.toMany` decorators. The eleven enums are string-literal
unions in `libs/shared/domain/src/fire/enums.ts`. `helpers.ts` holds `TERMINAL_STATUSES`, `SAFE_VARIANT_STATUSES`,
`ACTIVE_CONTAINED_STATUSES`, `POTENTIAL_ORDER`, `LEVEL_ORDER`, the time constants, and the three computations
(`computeFinancialYear`, `computeGlobalIncidentId`, `computeNextReportDue`). The
`20260528143632_widen_fire_entities.sql` and `20260528145650_make_optional_fields_nullable.sql` migrations add the
columns; every column carries a Remult default (`NOT NULL DEFAULT '' / 0 / false` for non-nullable types, `NULL` for
`Date | undefined`), so Atlas's `data_depend` MF103 check does not trigger.

**Demo moment: four entity files produce a full API with auth, district-scoped row filtering, and business rules. No
controllers written.**

### Phase 3: Domain Operations

**Status: Complete.**

The four BackendMethods from *Domain Operations* live on their entities — `getNextFireNumber`, `escalate`, and
`softDelete` on `FireIncident`, `removeSignOff` on `FinalReport`. Each models expected errors with `neverthrow`
internally and throws only at the RPC boundary. `FinalReport.signOffRemovedReason`, added by
`20260529022315_add_signoff_removed_reason.sql`, records the reason supplied to `removeSignOff`. A shared-domain Vitest
suite (`bunx nx test shared-domain`) covers the `helpers.ts` cadence math and all four BackendMethods.

**Demo moment: business logic on the entity, callable from frontend with type safety.**

### Phase 4: Frontend Feature

**Status: Complete.**

The complete Angular frontend ships, specified in full under *Frontend Architecture (Phase 4) §1–§14*: the
`@nx/angular` + Material M3 tooling and the routed shell (toolbar, responsive sidenav, dev-user switcher, theme
toggle); the `scope:shared` UI maps (`enum-display.ts`, `ui.ts`) and the metadata-driven forms engine
(`form-engine*`, `cross-field-validators`, `dynamic-form`, the three configs, `<app-datetime-field>`,
`StatusBadgeComponent`, `permissions.ts`, `NotificationService`, `toErrorMessage`); the district-scoped incident
list; the `resource()`-loaded incident detail with its `@defer` final-report panel and the role×state action bar
wired to `escalate` / `softDelete` / sign-off / `removeSignOff` through the escalate / confirm / confirm-reason
dialogs; and the incident / situation-report / final-report form screens rendered through `<app-dynamic-form>` in the
`<app-form-page>` shell behind the `unsavedChangesGuard`. Every component is `OnPush`, the router uses
`withViewTransitions()` behind a `prefers-reduced-motion` guard, and the app is verified to WCAG AA with axe-core
structural assertions in CI. The workspace carries no `Task` example.

**Demo moment: define a field once, drive list, detail, and a validated form everywhere — no codegen, no per-screen
wiring.**

### Phase 5: The Demo Moment

**Status: Pending.**

Add a new field to `FireIncident` — e.g. `estimatedContainmentDate` with a date validator. Show it working: field
appears in API response, validates on both client and server, and renders in the form. Because the forms engine
(*Frontend Architecture §4*) reads entity metadata, the field surfaces as an `<app-datetime-field>` automatically — the
only frontend touch is one line adding it to a group in `fire-incident.form-config.ts`. Two files touched. Zero codegen.

**This is the mic drop. The team has lived the 13-step version. Seeing it in 2 steps lands differently.**

---

## What the Team Sees in the Demo

| What you're showing | Current stack | Showcase |
|---|---|---|
| Add a field | 10-13 files, 2 languages, codegen | 2 files, 1 language |
| Define permissions | Permission enum + customiser + role attributes + controller attributes + middleware | Decorators on the entity |
| Row-level security | Permission customiser + database query filter + service layer check | Pre-filter on entity — 3 lines |
| Create an API endpoint | Controller + service interface + service impl + DI registration + codegen | Entity exists, endpoint exists |
| Business operation | Controller action → service method → repository call → mapping | Method on the entity |
| Validation | Backend validation + separate frontend form config (can drift) | Entity field definition (runs identically both sides) |
| Type safety across boundary | Generated TypeScript client (can be stale) | Direct import — same object |
| New domain from scratch | ~6 new projects, generators, codegen setup | 1 entity file, register in array |

---

## Risks and Mitigations

**"This is just a demo, production will be harder."** Acknowledge it. The showcase deliberately omits complex
integrations, PDF generation, and background processing. Frame it as: the 80% of work that is CRUD, forms, permissions,
and validation gets radically simpler. The 20% that is infrastructure integration is a separate conversation.

**"What about our complex queries?"** The `getNextFireNumber` operation proves you can drop to raw queries when needed.
The framework doesn't lock you in.

**"What about our existing auth library?"** The role model is simplified. The point is that wherever roles come from,
the permission enforcement is declarative on the entity. Swapping the auth source is middleware — entity permissions
stay unchanged.

**"We'd need to rewrite everything."** No. The showcase demonstrates what new features could look like. Migration is
incremental and optional. One domain at a time, if at all.

---

## Showcase-Specific Out of Scope

The high-level Scope table above lists what's out for the showcase as a whole. This section makes explicit what we
deliberately do NOT carry over from EMI:

- Full edit-history audit log (EMI's `EditHistory` per-row table). We record only `createdBy` / `createdAt` /
  `updatedAt` / last sign-off event.
- File attachments and attachment URLs.
- Geo geometry (GeoJSON `Point`). Only decimal `latitude` / `longitude` number fields.
- Charge codes (`DeecaChargeCode`, `PvChargeCode`, `VfsChargeCode`, `DedjtrChargeCode`).
- Wildfire prediction integration (`WildFireId`).
- Resource breakdown by agency (EMI's working/resting resources across DEECA/PV/CFA/SES/FRV). Showcase uses three simple
  totals per sitrep.
- Region as a separate entity. `District.regionId` and `District.regionName` are denormalised columns.
- Real Entra ID auth. Dev users persist via `DEV_USERS` array; swap-in is a future task per `docs/00-plan.md`.

---

## Follow-Up Showcases

Once the fire core is built, natural next steps:

- **ISP (Incident Shift Plans)** — complex nested structures, demonstrates handling non-trivial aggregates
- **Dashboard aggregation** — cross-domain queries, demonstrates collapsing multiple APIs into shared entity queries
- **Real auth (Entra ID)** — swap dev auth middleware, entity permissions untouched, proves the abstraction holds
