# Fire Incident Showcase — Domain Specification

## Purpose

Reimplement the core of the fire incident domain in the hono-remult-1 stack as a team showcase. The goal is to make the ceremony reduction visceral: the same domain the team works with daily, rebuilt with radically less plumbing.

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

Five architectural calls drive the rest of the spec. Anything not addressed here is implied by the field tables and lifecycle hooks below.

- **Three entities, not one polymorphic Report.** EMI uses a single `Report` record with a `ReportType` discriminator on a `Reports` collection inside the `Fire` aggregate. We use three separate Remult entities: `FireIncident` carries the initial-report data on itself; `SituationReport` is one row per sitrep, immutable once inserted; `FinalReport` is at most one optional row per fire (1-to-1 via `fireIncidentId UNIQUE`). The `ReportType` enum is dropped.
- **`District` as a Remult entity.** Five rows, seeded via a hand-written Atlas migration immediately following the schema migration. Demonstrates `Relations.toOne` alongside `Relations.toMany`.
- **Sign-off lives on `FinalReport`.** While `FinalReport.isSignedOff = true`, the API rejects every write to the parent FireIncident and to the FinalReport itself. The `removeSignOff` BackendMethod is the only way to re-open editing.
- **Status, fire totals, and `nextReportDue` are denormalised on FireIncident, updated by the SituationReport `saved` hook.** EMI computes these on the fly from the latest report; we denormalise for fast list queries.
- **`districtId` and `isParentDeleted` are denormalised onto SituationReport and FinalReport.** Set in the child entity's `saving` hook (or by the parent's `softDelete` BackendMethod for `isParentDeleted`). Lets every entity's `apiPrefilter` use simple field equality.

---

## Fire Incident Lifecycle

A fire incident progresses through sequential reports:

### 1. Initial Report

Created when a fire is first reported. Captures location, name, initial status, initial resource deployment, estimated area, land classification, cause/detection details, and initial department response. Establishes the fire number (district-scoped, sequential per financial year).

- Sets `nextReportDue` to 30 minutes after creation
- Default status is "Going"
- Can only be edited by the original author (unless the user has elevated "edit others' initial report" permission)

### 2. Situation Reports

Ongoing updates during active fire management. Captures current fire behaviour, resources deployed (per agency totals), control progress, weather, strategy, and community impact.

- Multiple situation reports per fire
- Each updates the fire's current status, area, and resource snapshot
- Recalculates `nextReportDue` based on status/potential transitions (see Business Rules)
- Sitreps are immutable once inserted; corrections submit another sitrep. StateOfficer/Admin may delete sitreps
- Most recent sitrep determines the fire's "current" state

### 3. Final Report

Formal closure documentation when fire reaches a safe state. Captures losses (stock, homes, infrastructure), investigation findings, cost class, and burnt land classification breakdown.

- Can only be created when current status is a "safe" variant or "not found"
- Must be signed off by an authorised user to formally close the incident
- Sign-off locks the fire — only State Officers or Admins can remove the sign-off (via the `removeSignOff` BackendMethod) to re-open editing
- No further `nextReportDue` once signed off

In the data model the Initial Report is the `FireIncident` record itself; Situation Reports are rows in `SituationReport` (immutable once inserted); the Final Report is at most one `FinalReport` row linked 1-to-1 via `fireIncidentId UNIQUE`. There is no shared `Report` table and no `reportType` discriminator.

### 4. Soft Deletion

Incidents are never hard-deleted. A soft delete sets `isDeleted = true`, clears `nextReportDue`, and cascades `isParentDeleted = true` to all situation reports and the final report (if any).

- Only allowed when fire is in a terminal status (Safe, SafeOverrun, SafeNotFound, SafeFalseAlarm, NotFound)
- Not allowed if already signed off — sign-off must be removed first
- Fire incidents are government records subject to audit, legal proceedings, and historical analysis — hard deletion would break traceability

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

"Edit situation report" is "No" for every role because sitreps are immutable once inserted (see Modelling Decisions). To correct a sitrep, insert another sitrep; StateOfficer/Admin may delete an erroneous sitrep via the delete action.

### Row-Level Filtering

- IncidentEditor and Viewer see only incidents in their assigned district
- Admins and State Officers see all incidents across all districts
- Soft-deleted incidents are filtered out of all list endpoints. Child sitreps and final reports of deleted parents are also filtered (via denormalised `isParentDeleted`)

---

## Dev Data

### Districts

Sourced from EMI's `WorkforceContext.cs` district list. Five rows across four regions, seeded via a hand-written Atlas migration:

| id | name | regionId | regionName |
|---|---|---|---|
| 12 | Otway | 8 | Barwon South West |
| 14 | Far South West | 8 | Barwon South West |
| 22 | Mallee | 7 | Loddon Mallee |
| 47 | Latrobe | 4 | Gippsland |
| 53 | Yarra | 5 | Port Phillip |

`isActive` defaults to true on all five.

**Migration approach.** After the schema migration generated by `bun run migrate:generate add_fire_entities`, commit a hand-written sibling SQL file `<timestamp + 1s>_seed_districts.sql`:

```sql
INSERT INTO "districts" ("id", "name", "regionId", "regionName", "isActive") VALUES
  (12, 'Otway', 8, 'Barwon South West', true),
  (14, 'Far South West', 8, 'Barwon South West', true),
  (22, 'Mallee', 7, 'Loddon Mallee', true),
  (47, 'Latrobe', 4, 'Gippsland', true),
  (53, 'Yarra', 5, 'Port Phillip', true);
```

Then run `bun run migrate:hash` to register the new file in `atlas.sum`. `atlas migrate apply` executes files in timestamp order.

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

Three of the five seeded districts (Otway 12, Latrobe 47, Mallee 22) have direct user affiliation; the other two (Far South West 14, Yarra 53) exist as available but unstaffed districts in the dropdowns of incident-create forms — they exercise the "StateOfficer/Admin can create in any district" path.

**`CurrentUser` type.** Define at `libs/shared/domain/src/auth/current-user.ts`:

```typescript
import type { UserInfo } from 'remult';
export type CurrentUser = UserInfo & { districtId: number | null };
```

`DEV_USERS` is re-typed `readonly CurrentUser[]`. Entity permission predicates and saving hooks cast: `(remult.user as CurrentUser | undefined)?.districtId`. Forward-compatible with Entra ID — only the producer of `CurrentUser` (the dev-auth interceptor today, JWT parser tomorrow) changes, not consumers.

---

## Entities

### FireIncident

The core aggregate. Each fire incident is identified by a district-scoped fire number and a system-wide global incident ID.

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

**Identity and Tracking**

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

**Location**

| Field | Type | Description |
|---|---|---|
| districtId | integer, required | FK to `District.id`. Determines row-level visibility and fire-number scoping. |
| locationDescription | string, optional, 0–500 chars | Free text. |
| latitude | number, optional, -90 to 90 | Decimal degrees. |
| longitude | number, optional, -180 to 180 | Decimal degrees. |

The District's `name`, `regionId`, and `regionName` are read via `@Relations.toOne(() => District, 'districtId') district?: District` on FireIncident.

**Status and Classification**

| Field | Type | Description |
|---|---|---|
| status | FireStatus enum, required | Current status. Set on insert; subsequent changes happen via SituationReport `saved` hook. Direct entity-level updates by StateOfficer/Admin remain possible only pre-sitrep. |
| statusAsAt | datetime, `allowApiUpdate: false` | Set in saving hook to `now` whenever `status` changes (or on insert). |
| incidentLevel | IncidentLevel enum, required, default `LevelOne` | Set on insert; only updated via `escalate` BackendMethod thereafter (validated monotonically increasing). |
| isMajor | boolean, default false | One-way transition. Once true, never false. Validated in saving hook. |
| declaredBySource | string, optional, 0–200 chars | Who declared the fire major. Required and 1–200 chars when `isMajor = true`. |
| declaredByTimestamp | datetime, optional | When the major declaration was made. Required and ≤ now when `isMajor = true`. Client-provided. |

**Timeline**

| Field | Type | Description |
|---|---|---|
| reportedAt | datetime, required, ≤ now | When the fire was first reported. |
| fireStartedAt | datetime, optional | Best estimate of when the fire actually started. |
| fireDetectedAt | datetime, optional | When the fire was first detected. |
| firstCrewSentAt | datetime, optional | When the first crew was dispatched. |
| firstCrewArrivedAt | datetime, optional | When the first crew arrived on scene. |
| detectionMethod | FireDetectionMethod enum, optional | How the fire was first detected. |

The saving hook validates adjacent-pair ordering (chain, not full cross-product): each of the four pairs `(fireStartedAt, fireDetectedAt)`, `(fireDetectedAt, reportedAt)`, `(reportedAt, firstCrewSentAt)`, `(firstCrewSentAt, firstCrewArrivedAt)` is checked only when both values are non-null. Same rule on insert and update.

**Cause**

| Field | Type | Description |
|---|---|---|
| causeSource | CauseSource enum, optional | EMI's 26-value enum (full list in Enums). |
| causeSourceOther | string, optional, 0–500 chars | Free text when `causeSource = Other`. |
| isCauseConfirmed | boolean, default false | Whether the cause is confirmed. |

**Initial Response**

| Field | Type | Description |
|---|---|---|
| isLandManagerNotified | YesNo enum, optional | |
| isControlAgencyNotified | YesNo enum, optional | |
| isFireMapAttached | boolean, default false | |
| controlAgency | ControlAgency enum, optional | EMI's 4-value enum. |
| fuelType | FuelType enum, optional | EMI's 8-value enum. |

**Area**

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

**Lifecycle**

| Field | Type | Description |
|---|---|---|
| nextReportDue | datetime, optional, `allowApiUpdate: false` | When the next sitrep is due. Set on insert to `now + 30 minutes`. Updated by SituationReport `saved` hook per cadence. Set to `null` on FinalReport sign-off and on `softDelete`. |
| isDeleted | boolean, default false, `allowApiUpdate: false` | Soft-delete flag. Mutated only by the `softDelete` BackendMethod. |
| deletionReason | string, optional, 0–500 chars, `allowApiUpdate: false` | Set by `softDelete`. Required and 1–500 chars when `isDeleted = true`. |

**Relations**

| Relation | Type | Description |
|---|---|---|
| district | `@Relations.toOne(() => District, 'districtId')` | The parent district. |
| situationReports | `@Relations.toMany(() => SituationReport, 'fireIncidentId')` | All sitreps for this fire. |
| finalReport | `@Relations.toOne(() => FinalReport, { field: 'fireIncidentId' })` | The single optional FinalReport. |

### SituationReport

A point-in-time snapshot of fire conditions, linked to a FireIncident. Multiple sitreps per fire, ordered by report number. **Immutable once inserted.**

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

**Identity**

| Field | Type | Description |
|---|---|---|
| id | UUID, auto | `Fields.id()`. |
| fireIncidentId | UUID, required | FK to `FireIncident.id`. |
| reportNumber | integer, computed, `allowApiUpdate: false` | Per-fire sequence. Set on insert as `(max reportNumber where fireIncidentId = X) + 1`, or 1 if none. |
| districtId | integer, `allowApiUpdate: false` | Denormalised from parent. Set in saving hook on insert. |
| isParentDeleted | boolean, default false, `allowApiUpdate: false` | Denormalised flag set by `softDelete`. |

**Content**

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

**Audit**

| Field | Type | Description |
|---|---|---|
| submittedBy | string, `allowApiUpdate: false` | Set in saving hook on insert. |
| submittedAt | datetime, `allowApiUpdate: false` | Set in saving hook on insert. |
| createdAt | datetime, auto | `Fields.createdAt()`. |

**Relations**

| Relation | Type | Description |
|---|---|---|
| fireIncident | `@Relations.toOne(() => FireIncident, 'fireIncidentId')` | The parent fire. |

### FinalReport

At most one per fire (1-to-1 via `fireIncidentId UNIQUE`). Created when the parent fire reaches a terminal status. Signing it off locks both this entity and the parent FireIncident until `removeSignOff` is called.

Decorator:

```typescript
@Entity<FinalReport>('finalReports', {
  allowApiRead: Allow.authenticated,
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

**Identity**

| Field | Type | Description |
|---|---|---|
| id | UUID, auto | |
| fireIncidentId | UUID, required, unique | FK to FireIncident. UNIQUE constraint enforces 1-to-1. |
| districtId | integer, `allowApiUpdate: false` | Denormalised. |
| isParentDeleted | boolean, default false, `allowApiUpdate: false` | Denormalised flag. |
| createdAt | datetime, auto | |
| createdBy | string, `allowApiUpdate: false` | |
| updatedAt | datetime, auto | |

**Content — Losses**

| Field | Type | Description |
|---|---|---|
| stockLost | integer, optional, ≥ 0 | Livestock count. |
| homesLost | integer, optional, ≥ 0 | |
| shedsLost | integer, optional, ≥ 0 | Sheds and outbuildings. |
| fencingLostKm | number, optional, ≥ 0 | Kilometres of fencing. |
| cropLossHectares | number, optional, ≥ 0 | Hectares of agricultural crop. |
| infrastructureLosses | string, optional, 0–500 chars | Free text. |
| otherLosses | string, optional, 0–500 chars | Free text. |

**Content — Investigation**

| Field | Type | Description |
|---|---|---|
| investigationType | InvestigationType enum, optional | |
| investigationBy | string, optional, 0–200 chars | |
| isOffenceSuspected | boolean, default false | |
| legalActionStatus | LegalActionStatus enum, optional | |

**Content — Cost**

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

**Sign-off**

| Field | Type | Description |
|---|---|---|
| isSignedOff | boolean, default false | Sign-off flag. While true, all writes to parent FireIncident and to this FinalReport are rejected. Toggle false→true via standard PATCH (any of incidentEditor/stateOfficer/admin). Toggle true→false only via `removeSignOff` BackendMethod (stateOfficer/admin). |
| signedOffAt | datetime, optional, `allowApiUpdate: false` | Set in saving hook when transitioning false→true. |
| signedOffBy | string, optional, `allowApiUpdate: false` | Set in saving hook when transitioning false→true. |
| signOffRemovedAt | datetime, optional, `allowApiUpdate: false` | Set by `removeSignOff` BackendMethod. |
| signOffRemovedBy | string, optional, `allowApiUpdate: false` | Set by `removeSignOff` BackendMethod. |

These five sign-off fields capture only the most recent event of each kind. No separate event-history entity.

**Relations**

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

Eleven enums in total. Display names live in `libs/shared/domain/src/fire/enum-display.ts` as one `Record<EnumValue, string>` per enum, imported directly by Angular components. No `valueConverter` on field decorators.

Enum values in code use `as const` string-literal unions:

```typescript
// libs/shared/domain/src/fire/enums.ts (one example shape)
export const FireStatus = {
  Going: 'going',
  Contained: 'contained',
  UnderControlFirst: 'underControlFirst',
  UnderControlSecond: 'underControlSecond',
  Safe: 'safe',
  SafeOverrun: 'safeOverrun',
  SafeNotFound: 'safeNotFound',
  SafeFalseAlarm: 'safeFalseAlarm',
  NotFound: 'notFound',
} as const;
export type FireStatus = typeof FireStatus[keyof typeof FireStatus];
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

**Terminal statuses** (FinalReport-eligibility AND softDelete-eligibility): `Safe`, `SafeOverrun`, `SafeNotFound`, `SafeFalseAlarm`, `NotFound`. Codified as `TERMINAL_STATUSES` in `helpers.ts`.

**Safe-variant statuses** (for cadence rule 3): `Safe`, `SafeOverrun`, `SafeNotFound`, `SafeFalseAlarm`. Codified as `SAFE_VARIANT_STATUSES`. Note `NotFound` is terminal but not "safe" — cadence rule 4 handles it.

### IncidentLevel (3 values)

| Identifier | String value | Display Name |
|---|---|---|
| LevelOne | `levelOne` | Level 1 |
| LevelTwo | `levelTwo` | Level 2 |
| LevelThree | `levelThree` | Level 3 |

Numeric ordering: `LevelOne < LevelTwo < LevelThree`. The `escalate` BackendMethod uses a `LEVEL_ORDER: Record<IncidentLevel, number>` table for the comparison. Escalation can only go up.

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

Numeric ordering for "escalation" checks: `Low < Moderate < High`. Cadence logic uses a `POTENTIAL_ORDER: Record<Potential, number>` table.

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
  FireStatus.Safe, FireStatus.SafeOverrun, FireStatus.SafeNotFound,
  FireStatus.SafeFalseAlarm, FireStatus.NotFound,
] as const;

export const SAFE_VARIANT_STATUSES: readonly FireStatus[] = [
  FireStatus.Safe, FireStatus.SafeOverrun, FireStatus.SafeNotFound,
  FireStatus.SafeFalseAlarm,
] as const;

export const ACTIVE_CONTAINED_STATUSES: readonly FireStatus[] = [
  FireStatus.Contained, FireStatus.UnderControlFirst,
  FireStatus.UnderControlSecond,
] as const;

export const POTENTIAL_ORDER: Record<Potential, number> = {
  [Potential.Low]: 1, [Potential.Moderate]: 2, [Potential.High]: 3,
};

export const LEVEL_ORDER: Record<IncidentLevel, number> = {
  [IncidentLevel.LevelOne]: 1, [IncidentLevel.LevelTwo]: 2,
  [IncidentLevel.LevelThree]: 3,
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

The SituationReport `saved` hook and the `softDelete` / `escalate` / `removeSignOff` BackendMethods need to update `FireIncident` rows server-side without triggering the pre-sitrep-edit restriction in `FireIncident.saving`. Remult's `allowApi*` predicates are synchronous (`AllowedForInstance<T>` returns `boolean`), so all multi-row state checks live in `saving` hooks; the bypass is a per-request flag:

```typescript
(remult as { __serverInternal?: boolean }).__serverInternal = true;
try { /* repo.update(...) */ } finally {
  (remult as { __serverInternal?: boolean }).__serverInternal = false;
}
```

`FireIncident.saving` (update path) reads this flag at the top and skips the pre-sitrep restriction when it is set.

### FireIncident — `saving` hook

If `e.isNew === true` (insert):

1. Validate `reportedAt` non-null and ≤ now; else cancel with `"reportedAt is required and must be ≤ now"`.
2. Validate `districtId` non-null; resolve `district = await remult.repo(District).findId(fire.districtId)`; if not found or `district.isActive === false`, cancel.
3. If user is `Roles.incidentEditor` and is not also `Roles.stateOfficer` or `Roles.admin`, validate `fire.districtId === (remult.user as CurrentUser).districtId`; else cancel.
4. `fire.createdBy = remult.user!.id`.
5. `fire.financialYear = computeFinancialYear(new Date())`.
6. `fire.fireNumber = (await remult.repo(FireIncident).count({ districtId: fire.districtId, financialYear: fire.financialYear })) + 1`. (No `isDeleted` filter — counts deleted rows, matching EMI uniqueness in audit history.)
7. `fire.globalIncidentId = computeGlobalIncidentId(fire.financialYear, fire.districtId, fire.fireNumber)`.
8. `fire.statusAsAt = new Date()`.
9. `fire.nextReportDue = new Date(Date.now() + 30 * MS_PER_MINUTE)`.
10. `fire.isDeleted = false`; `fire.deletionReason = ''`.
11. `fire.totalPersonnel = 0; fire.totalVehicles = 0; fire.totalAircraft = 0`.
12. If `fire.status === FireStatus.SafeOverrun` → `fire.fireAreaHectares = 0`.
13. If `fire.isMajor === true`: validate `fire.declaredBySource` 1–200 chars AND `fire.declaredByTimestamp` non-null AND `fire.declaredByTimestamp ≤ new Date()`; else cancel.
14. Validate adjacent-pair timestamp ordering (each pair only if both non-null): `(fireStartedAt, fireDetectedAt)`, `(fireDetectedAt, reportedAt)`, `(reportedAt, firstCrewSentAt)`, `(firstCrewSentAt, firstCrewArrivedAt)`. Any violation → cancel with the exact pair name.

If `e.isNew === false` (update):

1. **Internal-update bypass:** if `__serverInternal === true`, skip the pre-sitrep restriction (step 9 below).
2. `finalReport = await remult.repo(FinalReport).findFirst({ fireIncidentId: fire.id })`. If `finalReport && finalReport.isSignedOff === true` → cancel with `"FireIncident is locked while FinalReport is signed off; call removeSignOff first"`.
3. If `e.fields.isDeleted.originalValue === true && fire.isDeleted === true` → cancel with `"FireIncident is soft-deleted; no further edits permitted"`.
4. If `e.fields.isMajor.originalValue === true && fire.isMajor === false` → cancel with `"isMajor is one-way; cannot be set back to false"`.
5. If `e.fields.status.originalValue !== fire.status` → `fire.statusAsAt = new Date()`.
6. If `fire.status === FireStatus.SafeOverrun` → `fire.fireAreaHectares = 0`.
7. If `fire.isMajor === true`: same validation as insert step 13.
8. Same adjacent-pair timestamp ordering validation as insert step 14.
9. **Pre-sitrep edit restriction:** if `__serverInternal` flag is not set AND user roles do NOT include `Roles.stateOfficer` or `Roles.admin`:
   - Validate `fire.createdBy === remult.user!.id`; else cancel with `"IncidentEditor can only edit fires they created"`.
   - Validate `await remult.repo(SituationReport).count({ fireIncidentId: fire.id }) === 0`; else cancel with `"FireIncident cannot be edited after first SituationReport"`.
   - Validate `await remult.repo(FinalReport).count({ fireIncidentId: fire.id }) === 0`; else cancel with `"FireIncident cannot be edited after FinalReport exists"`.

`FireIncident` has no `saved` hook.

### SituationReport — `saving` hook

If `e.isNew === false` → unreachable (`allowApiUpdate: false`).

If `e.isNew === true` (insert):

1. `parent = await remult.repo(FireIncident).findId(sitrep.fireIncidentId)`. If not found → cancel.
2. If `parent.isDeleted === true` → cancel with `"Parent fire is soft-deleted"`.
3. `finalReport = await remult.repo(FinalReport).findFirst({ fireIncidentId: sitrep.fireIncidentId })`. If `finalReport && finalReport.isSignedOff === true` → cancel with `"Parent fire is signed off"`.
4. If user is `Roles.incidentEditor` and not also `Roles.stateOfficer` / `Roles.admin`, validate `parent.districtId === (remult.user as CurrentUser).districtId`; else cancel.
5. `sitrep.reportNumber = (await remult.repo(SituationReport).count({ fireIncidentId: sitrep.fireIncidentId })) + 1`.
6. `sitrep.submittedBy = remult.user!.id`.
7. `sitrep.submittedAt = new Date()`.
8. `sitrep.districtId = parent.districtId`.
9. `sitrep.isParentDeleted = false`.
10. If `sitrep.fireName.trim() === ''` → `sitrep.fireName = parent.name`.
11. If `sitrep.status === FireStatus.SafeOverrun` → `sitrep.fireAreaHectares = 0`.

(No `nextReportDue` computation here; that lives in the `saved` hook so the sitrep row is durable in the DB first.)

### SituationReport — `saved` hook

Always (every successful insert):

1. `prev = await remult.repo(SituationReport).findFirst({ fireIncidentId: sitrep.fireIncidentId, reportNumber: { '!=': sitrep.reportNumber } }, { orderBy: { reportNumber: 'desc' }, limit: 1 })` — immediately previous sitrep, or `undefined` if first.
2. `parent = await remult.repo(FireIncident).findId(sitrep.fireIncidentId)`.
3. Compute `nextReportDue` from `(previousStatus = parent.status, newStatus = sitrep.status, prevLoss = prev?.potentialLoss, prevSpread = prev?.potentialSpread, newLoss = sitrep.potentialLoss, newSpread = sitrep.potentialSpread)` using the cadence precedence table (see Business Rules).
4. Set the `__serverInternal` flag and update parent:
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
3. If `!TERMINAL_STATUSES.includes(parent.status)` → cancel with `"FinalReport requires parent fire to be in a terminal status (Safe*, NotFound)"`.
4. If `await remult.repo(FinalReport).count({ fireIncidentId: fr.fireIncidentId }) > 0` → cancel with `"FinalReport already exists for this fire"`.
5. If user is `Roles.incidentEditor` and not also `Roles.stateOfficer` / `Roles.admin`, validate `parent.districtId === (remult.user as CurrentUser).districtId`; else cancel.
6. `fr.createdBy = remult.user!.id`.
7. `fr.districtId = parent.districtId`.
8. `fr.isParentDeleted = false`.
9. If `fr.isSignedOff === true`: `fr.signedOffAt = new Date()`, `fr.signedOffBy = remult.user!.id`.
10. Validate field bounds (see Validation Rules).

If `e.isNew === false` (update):

1. Internal-update bypass: same `__serverInternal` flag pattern.
2. `parent = await remult.repo(FireIncident).findId(fr.fireIncidentId)`. If `parent.isDeleted === true` → cancel.
3. Compute transition: `wasSignedOff = e.fields.isSignedOff.originalValue === true`, `isSignedOff = fr.isSignedOff === true`.
4. If `wasSignedOff && isSignedOff` (still signed off, field edit attempt) AND `__serverInternal` not set → cancel with `"FinalReport is locked while signed off; call removeSignOff first"`.
5. If `!wasSignedOff && isSignedOff` (false → true): validate `TERMINAL_STATUSES.includes(parent.status)`; else cancel. Set `fr.signedOffAt = new Date()`, `fr.signedOffBy = remult.user!.id`.
6. If `wasSignedOff && !isSignedOff` (true → false) AND `__serverInternal` not set → cancel with `"removeSignOff is only available via the removeSignOff BackendMethod"`.
7. Field bounds re-validated.

### FinalReport — `saved` hook

Wrap the parent-update calls below in the `__serverInternal` flag.

- If `e.isNew === true && fr.isSignedOff === true`: update parent `nextReportDue = null`.
- If `e.isNew === false && !e.fields.isSignedOff.originalValue && fr.isSignedOff === true` (transition false → true via update): update parent `nextReportDue = null`.

The "remove sign-off" path is the `removeSignOff` BackendMethod (see Domain Operations), not the entity update; that method itself recomputes `parent.nextReportDue`.

### District — saving / saved

No logic. Permission predicates (`Roles.admin` for writes, `Allow.authenticated` for reads) cover everything.

---

## Business Rules

### Next Report Due Calculation

Cadence rules with **explicit precedence**: the FIRST matching rule applies. Inputs (computed inside SituationReport `saved` hook, exported as `computeNextReportDue(...)` in `helpers.ts`):

- `previousStatus`: the parent fire's `status` snapshot read BEFORE the parent is updated (i.e., the prior sitrep's status, or the initial-report status if this is the first sitrep).
- `newStatus`: the just-inserted sitrep's `status`.
- `prevLoss`, `prevSpread`: the immediately previous sitrep's `potentialLoss` / `potentialSpread`, or `undefined` if this is the first sitrep.
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
- FinalReport sign-off (saved hook on insert with `isSignedOff = true` OR transition false → true on update): `nextReportDue = null`.
- `removeSignOff` BackendMethod: `nextReportDue` recomputed from the most recent SituationReport using rules 1–7. If zero sitreps exist, `now + 30 min`.

### Fire Numbering

- Fire numbers are sequential integers per district per financial year.
- When creating a fire, query the count of fires for that district + financial year (including `isDeleted` rows for EMI parity), then assign count + 1.
- The `globalIncidentId` is constructed as: `10` (fire type code) + last 2 digits of financial year + district ID (zero-padded to 2 digits) + fire number (zero-padded to 3 digits).
- Worked example: fire #42 in district 47 (Latrobe) in FY26 → `parseInt("10" + "26" + "47" + "042", 10) = 1026470042`.

### Financial Year

- Runs July to June (Australian financial year).
- Determined from current date in Melbourne timezone (Australia/Melbourne).
- If month > 6 (July onwards): financial year = current calendar year + 1.
- If month ≤ 6 (January–June): financial year = current calendar year.
- Example: a fire on 15 March 2025 is in FY2025. A fire on 15 August 2025 is in FY2026.

### Status Transition Rules

- Final report can only be created when status is in `TERMINAL_STATUSES` (Safe, SafeOverrun, SafeNotFound, SafeFalseAlarm, NotFound).
- Soft deletion only allowed when status is in `TERMINAL_STATUSES`.
- Soft deletion not allowed if fire has a signed-off final report — must call `removeSignOff` first.
- When status is SafeOverrun, `fireAreaHectares` is automatically set to 0 (both on the sitrep and on the parent after the `saved` hook propagates).
- Major fire declaration (`isMajor = true`) requires `declaredBySource` non-empty (1–200 chars) and `declaredByTimestamp` ≤ now. Once `isMajor = true`, it cannot be set back to false.

### Incident Level Escalation

- Level can only go up: LevelOne → LevelTwo → LevelThree.
- Cannot be de-escalated.
- Only StateOfficer or Admin can call `escalate` BackendMethod.

### Timestamp Ordering Validation

These timestamps must be in chronological order when present, validated as adjacent pairs only (each pair only when both values are non-null):

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

1. Records `signOffRemovedAt` + `signOffRemovedBy`. `reason` is validated for length but emitted only to logs (no audit-history entity in this showcase).
2. `isSignedOff = false`.
3. Parent `nextReportDue` recomputed from the latest SituationReport using the cadence rules, or `now + 30 min` if no sitreps exist.
4. FinalReport and parent FireIncident become editable again.

---

## Validation Rules

Implement via `Fields.*({ validate: ... })` for field bounds and via `saving` hooks for cross-field rules. Exhaustive list:

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
| districtId, isParentDeleted, signedOffAt, signedOffBy, signOffRemovedAt, signOffRemovedBy | server-managed |

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

Tailwind utility classes applied to a `<span class="...">` badge. Implemented as `STATUS_BADGE_CLASSES: Record<FireStatus, string>` in `libs/shared/domain/src/fire/ui.ts`:

| Status | Classes |
|---|---|
| Going | `bg-red-100 text-red-800 border-red-300` |
| Contained | `bg-amber-100 text-amber-800 border-amber-300` |
| UnderControlFirst, UnderControlSecond | `bg-yellow-100 text-yellow-800 border-yellow-300` |
| Safe, SafeOverrun | `bg-green-100 text-green-800 border-green-300` |
| SafeNotFound, SafeFalseAlarm | `bg-gray-100 text-gray-800 border-gray-300` |
| NotFound | `bg-orange-100 text-orange-800 border-orange-300` |

### Enum Display Location

`libs/shared/domain/src/fire/enum-display.ts` exports one `Record<EnumValue, string>` per enum (using the Display Names from Enums), imported directly by Angular components.

---

## Domain Operations

Four `@BackendMethod`s on the relevant entity classes. The previous spec's `submitForFire` is removed — the standard REST `POST /api/situationReports` already exercises the `SituationReport.saving` hook end-to-end.

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
  const fire = await remult.repo(FireIncident).findId(fireId);
  if (!fire) throw new Error('Fire not found');
  if (fire.isDeleted) throw new Error('Fire is soft-deleted');
  const fr = await remult.repo(FinalReport).findFirst({ fireIncidentId: fireId });
  if (fr?.isSignedOff) throw new Error('Fire is signed off; call removeSignOff first');
  if (LEVEL_ORDER[newLevel] <= LEVEL_ORDER[fire.incidentLevel]) {
    throw new Error('newLevel must be strictly greater than current level');
  }
  (remult as { __serverInternal?: boolean }).__serverInternal = true;
  try {
    await remult.repo(FireIncident).update(fireId, {
      incidentLevel: newLevel, statusAsAt: new Date(),
    });
  } finally {
    (remult as { __serverInternal?: boolean }).__serverInternal = false;
  }
}
```

### `FireIncident.softDelete(fireId: string, reason: string): Promise<void>`

```typescript
@BackendMethod({ allowed: [Roles.stateOfficer, Roles.admin] })
static async softDelete(fireId: string, reason: string): Promise<void> {
  if (!reason || reason.length < 1 || reason.length > 500) {
    throw new Error('reason must be 1-500 chars');
  }
  const fire = await remult.repo(FireIncident).findId(fireId);
  if (!fire) throw new Error('Fire not found');
  if (!TERMINAL_STATUSES.includes(fire.status)) {
    throw new Error('Fire must be in a terminal status to be soft-deleted');
  }
  const fr = await remult.repo(FinalReport).findFirst({ fireIncidentId: fireId });
  if (fr?.isSignedOff) {
    throw new Error('Fire is signed off; call removeSignOff first');
  }
  (remult as { __serverInternal?: boolean }).__serverInternal = true;
  try {
    await remult.repo(FireIncident).update(fireId, {
      isDeleted: true, deletionReason: reason, nextReportDue: null,
    });
    const sitreps = await remult.repo(SituationReport).find({
      where: { fireIncidentId: fireId },
    });
    for (const s of sitreps) {
      await remult.repo(SituationReport).update(s.id, { isParentDeleted: true });
    }
    if (fr) {
      await remult.repo(FinalReport).update(fr.id, { isParentDeleted: true });
    }
  } finally {
    (remult as { __serverInternal?: boolean }).__serverInternal = false;
  }
}
```

Operation is sequential, not transactional in the showcase. The Postgres data provider commits each `update` independently. Production code would wrap in a transaction.

### `FinalReport.removeSignOff(finalReportId: string, reason: string): Promise<void>`

```typescript
@BackendMethod({ allowed: [Roles.stateOfficer, Roles.admin] })
static async removeSignOff(finalReportId: string, reason: string): Promise<void> {
  if (!reason || reason.length < 1 || reason.length > 500) {
    throw new Error('reason must be 1-500 chars');
  }
  const fr = await remult.repo(FinalReport).findId(finalReportId);
  if (!fr) throw new Error('FinalReport not found');
  if (!fr.isSignedOff) throw new Error('FinalReport is not signed off');
  (remult as { __serverInternal?: boolean }).__serverInternal = true;
  try {
    await remult.repo(FinalReport).update(finalReportId, {
      isSignedOff: false,
      signOffRemovedAt: new Date(),
      signOffRemovedBy: remult.user!.id,
    });
    const lastSitrep = await remult.repo(SituationReport).findFirst(
      { fireIncidentId: fr.fireIncidentId },
      { orderBy: { reportNumber: 'desc' }, limit: 1 },
    );
    let nextReportDue: Date | null;
    if (!lastSitrep) {
      nextReportDue = new Date(Date.now() + 30 * MS_PER_MINUTE);
    } else {
      const prevSitrep = await remult.repo(SituationReport).findFirst(
        { fireIncidentId: fr.fireIncidentId, reportNumber: { '!=': lastSitrep.reportNumber } },
        { orderBy: { reportNumber: 'desc' }, limit: 1 },
      );
      const parent = await remult.repo(FireIncident).findId(fr.fireIncidentId);
      const previousStatus = prevSitrep?.status ?? parent!.status;
      nextReportDue = computeNextReportDue({
        previousStatus, newStatus: lastSitrep.status,
        prevLoss: prevSitrep?.potentialLoss, prevSpread: prevSitrep?.potentialSpread,
        newLoss: lastSitrep.potentialLoss, newSpread: lastSitrep.potentialSpread,
      });
    }
    await remult.repo(FireIncident).update(fr.fireIncidentId, { nextReportDue });
  } finally {
    (remult as { __serverInternal?: boolean }).__serverInternal = false;
  }
}
```

`reason` is validated for length but stored only in logs (the entity keeps only `signOffRemovedAt` + `signOffRemovedBy`).

---

## Resource Tracking Model

The full resource tracking system (not in scope for this showcase) tracks resources per agency and per type across many categories. For the showcase, flatten to totals on `FireIncident` (`totalPersonnel`, `totalVehicles`, `totalAircraft`) and snapshots on `SituationReport` (`personnel`, `vehicles`, `aircraft`). The full per-agency breakdown is a future enhancement.

---

## User Workflows

### Incident List

Displays all fire incidents visible to the current user (district-filtered for IncidentEditor/Viewer; cross-district for StateOfficer/Admin). Shows: fire name, district, fire number, status (colour-coded via `STATUS_BADGE_CLASSES`), fire area, incident level, whether it's a major fire, last report date, next report due.

Sortable by name, district, number, last report date. "New Incident" action visible only to users with create permission.

### Incident Detail

Shows full incident information and a timeline of situation reports (newest first). Action buttons are permission-gated:

- "Edit" — visible if user can update this incident
- "Escalate" — visible to StateOfficer/Admin
- "New Sitrep" — visible to IncidentEditor+ (hidden if FinalReport exists)
- "Delete" — visible to StateOfficer/Admin (disabled if status is not terminal or if signed off)
- "Sign off" / "Remove sign-off" — on the Final Report subpanel; latter visible only to StateOfficer/Admin

### Incident Form (Create / Edit)

Form for creating or editing a fire incident. Fields driven by entity metadata where possible. Enum fields render as dropdowns. Validation runs on the client before submit (same rules as server). Required fields: name, districtId, status, reportedAt.

### Situation Report Form

Form for submitting a new sitrep against a fire. Pre-populates fire identity fields (district, fire number) as read-only. Captures status, area, weather, strategy, significant events, predicted behaviour, control progress, community impact, potentials, and resource snapshot. After submission the sitrep cannot be edited.

---

## Implementation Phases

### Phase 1: Infrastructure

Replace the existing dev auth's `Roles.user` with the four showcase roles (`viewer`, `incidentEditor`, `stateOfficer`, `admin`). Extend `UserInfo` with `CurrentUser` to carry `districtId`. Replace `DEV_USERS` with the eight identities above. Generate the `add_fire_entities` Atlas migration; add the hand-written `seed_districts` migration; run `bun run migrate:hash` and `bun run migrate:apply`.

### Phase 2: Domain Entities

Define the eleven enums, `FireIncident`, `SituationReport`, `FinalReport`, and `District` entities with all fields, permissions, row-level filtering, and lifecycle hooks. Register them in `apps/api/src/config.ts`.

**Demo moment: four entity files produce a full API with auth. No controllers written.**

### Phase 3: Domain Operations

Add the four BackendMethods: `getNextFireNumber`, `escalate`, `softDelete`, `removeSignOff`. Business logic lives on the entities.

**Demo moment: business logic on the entity, callable from frontend with type safety.**

### Phase 4: Frontend Feature

Build the incident list, incident detail with sitrep timeline + final-report subpanel, incident form, and sitrep form as a lazy-loaded feature route.

### Phase 5: The Demo Moment

Add a new field to `FireIncident` — e.g. `estimatedContainmentDate` with a date validator. Show it working: field appears in API response, validates on both client and server, renders in form. Two files touched. Zero codegen.

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

**"This is just a demo, production will be harder."** Acknowledge it. The showcase deliberately omits complex integrations, PDF generation, and background processing. Frame it as: the 80% of work that is CRUD, forms, permissions, and validation gets radically simpler. The 20% that is infrastructure integration is a separate conversation.

**"What about our complex queries?"** The `getNextFireNumber` operation proves you can drop to raw queries when needed. The framework doesn't lock you in.

**"What about our existing auth library?"** The role model is simplified. The point is that wherever roles come from, the permission enforcement is declarative on the entity. Swapping the auth source is middleware — entity permissions stay unchanged.

**"We'd need to rewrite everything."** No. The showcase demonstrates what new features could look like. Migration is incremental and optional. One domain at a time, if at all.

---

## Showcase-Specific Out of Scope

The high-level Scope table above lists what's out for the showcase as a whole. This section makes explicit what we deliberately do NOT carry over from EMI:

- Full edit-history audit log (EMI's `EditHistory` per-row table). We record only `createdBy` / `createdAt` / `updatedAt` / last sign-off event.
- File attachments and attachment URLs.
- Geo geometry (GeoJSON `Point`). Only decimal `latitude` / `longitude` number fields.
- Charge codes (`DeecaChargeCode`, `PvChargeCode`, `VfsChargeCode`, `DedjtrChargeCode`).
- Wildfire prediction integration (`WildFireId`).
- Resource breakdown by agency (EMI's working/resting resources across DEECA/PV/CFA/SES/FRV). Showcase uses three simple totals per sitrep.
- Region as a separate entity. `District.regionId` and `District.regionName` are denormalised columns.
- Real Entra ID auth. Dev users persist via `DEV_USERS` array; swap-in is a future task per `docs/00-plan.md`.

---

## Follow-Up Showcases

Once the fire core is built, natural next steps:

- **ISP (Incident Shift Plans)** — complex nested structures, demonstrates handling non-trivial aggregates
- **Dashboard aggregation** — cross-domain queries, demonstrates collapsing multiple APIs into shared entity queries
- **Real auth (Entra ID)** — swap dev auth middleware, entity permissions untouched, proves the abstraction holds
