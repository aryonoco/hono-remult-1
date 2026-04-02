# Fire Incident Showcase — Domain Specification

## Purpose

Reimplement the core of the fire incident domain in the hono-remult-1 stack as a team showcase. The goal is to make the ceremony reduction visceral: the same domain the team works with daily, rebuilt with radically less plumbing.

This is not a migration plan. It is a proof-of-concept that demonstrates what new feature development could look like.

---

## Scope

### In Scope

| Concept | Why |
|---|---|
| `FireIncident` entity (~25 fields) | Core aggregate the team works with every day |
| `SituationReport` entity (~15 fields) | Shows entity relations, versioned data, lifecycle |
| 5-6 key enums (Status, Cause, IncidentLevel, etc.) | Enum-driven domains are the bread and butter |
| Role-based permissions (4 roles, ~12 actions) | Declarative permission model is a headline feature |
| Row-level filtering (district-scoped visibility) | Users only see incidents in their district |
| Backend operations (escalate, submit sitrep) | Business logic on entities, not scattered across layers |
| Frontend feature (list + detail + form) | Full frontend story with entity metadata |
| Isomorphic validation | The "add a field" demo moment |

### Out of Scope

| Concept | Why |
|---|---|
| ISP (Incident Shift Plans) | Separate complex subsystem — its own showcase later |
| PDF generation | Infrastructure concern, not an architecture pattern |
| External system integrations (mapping, resources, messaging) | Not what we're demonstrating |
| Full 150+ report fields | Diminishing returns — 25 representative fields prove the same point |
| Attachment/file handling | Platform concern, not a domain pattern |
| Dashboard aggregation | Follow-up showcase (cross-domain query story) |

---

## Fire Incident Lifecycle

A fire incident progresses through sequential reports:

### 1. Initial Report

Created when a fire is first reported. Captures location, name, initial status, initial resource deployment, estimated area, land classification, cause/detection details, and initial department response. Establishes the fire number (district-scoped, sequential per financial year).

- Sets `nextReportDue` to 30 minutes after creation
- Default status is "Going"
- Can only be edited by the original author (unless the user has elevated "edit others' initial report" permission)

### 2. Situation Reports

Ongoing updates during active fire management. Captures current fire behaviour, resources deployed (working vs resting, per agency), control progress, weather, strategy, and community impact.

- Multiple situation reports per fire
- Each updates the fire's current status, area, and resource snapshot
- Recalculates `nextReportDue` based on status/potential transitions (see Business Rules)
- Can be edited and deleted by authorised users
- Most recent sitrep determines the fire's "current" state

### 3. Final Report

Formal closure documentation when fire reaches a safe state. Captures losses (stock, homes, infrastructure), investigation findings, cost class, and burnt land classification breakdown.

- Can only be created when most recent sitrep status is a "safe" variant or "not found"
- Must be signed off by an authorised user to formally close the incident
- Sign-off locks the fire — only State Officers or Admins can edit or remove the sign-off after that
- No further `nextReportDue` once signed off

### 4. Soft Deletion

Incidents are never hard-deleted. A soft delete sets `isDeleted = true` and clears `nextReportDue`.

- Only allowed when fire is in a safe status
- Not allowed if already signed off
- Fire incidents are government records subject to audit, legal proceedings, and historical analysis — hard deletion would break traceability

---

## Roles & Permissions

### Role Definitions

| Role | Who They Are | Access Level |
|---|---|---|
| Viewer | State coordination centre staff, intelligence/operations/finance officers, non-FFMVic commanders, department liaison officers | Read-only across all incident information |
| IncidentEditor | Duty officers, incident controllers, planning officers, situation officers — anyone with an endorsed AIIMS IMT unit lead role from any agency | Create and edit incidents and sitreps, create and sign off final reports |
| StateOfficer | State agency commanders and regional agency commanders (FFMVic only) | Everything IncidentEditor can do, plus: delete sitreps, delete incidents, remove final report sign-offs, edit others' initial reports |
| Admin | System administrators | Unrestricted access to all functions |

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
| Edit situation report | No | Yes | Yes | Yes |
| Delete situation report | No | No | Yes | Yes |
| Create final report | No | Yes | Yes | Yes |
| Edit final report | No | Yes | Yes | Yes |
| Sign off final report | No | Yes | Yes | Yes |
| Remove sign-off on final report | No | No | Yes | Yes |
| Delete incident (soft) | No | No | Yes | Yes |

### Row-Level Filtering

- Non-admin users see only incidents in their assigned district
- Admins and State Officers see all incidents across all districts

---

## Entities

### FireIncident

The core aggregate. Each fire incident is identified by a district-scoped fire number and a system-wide global incident ID.

**Identity and Tracking**

| Field | Type | Description |
|---|---|---|
| id | UUID, auto | Primary key |
| fireNumber | string | District-scoped sequential identifier, e.g. "042". Assigned at creation, unique per district per financial year |
| name | string, required | Widely known name of the fire (e.g. "Mount Alexander Road Fire") |
| globalIncidentId | integer | System-wide unique ID. Constructed as: `10` + last 2 digits of financial year + district ID (2 digits, zero-padded) + fire number (3 digits, zero-padded). Example: fire #42 in district 5, FY2024 = `1024050042` |
| financialYear | integer | Australian financial year (July-June). If current Melbourne-timezone month > 6, financial year = current year + 1; otherwise current year |

**Location**

| Field | Type | Description |
|---|---|---|
| regionName | string | Region the fire is in |
| districtName | string, required | District the fire is in. Determines row-level visibility and fire number scoping |
| locationDescription | string | Free-text detailed location description |
| latitude | number | Decimal degrees |
| longitude | number | Decimal degrees |

**Status and Classification**

| Field | Type | Description |
|---|---|---|
| status | FireStatus enum, required | Current fire control state. Only writable by StateOfficer or Admin |
| statusAsAt | datetime | When the status last changed |
| incidentLevel | IncidentLevel enum | Severity classification. Only writable by StateOfficer or Admin |
| controlAgency | ControlAgency enum | Which agency has control of the incident |
| isMajor | boolean | Whether this is a declared major fire. When true, `declaredBySource` and `declaredByTimestamp` become required |

**Cause**

| Field | Type | Description |
|---|---|---|
| causeSource | CauseSource enum | How the fire started |
| fuelType | FuelType enum | Dominant fuel type at fire origin |

**Area**

| Field | Type | Description |
|---|---|---|
| fireAreaHectares | number | Current estimated fire area. Automatically set to 0 when status is SafeOverrun |
| burntAreaHectares | number | Confirmed burnt area |

**Resources** (simplified totals — the full system tracks per-agency, see Resource Tracking)

| Field | Type | Description |
|---|---|---|
| totalPersonnel | number | Total personnel across all agencies |
| totalVehicles | number | Total vehicles across all agencies |
| totalAircraft | number | Total aircraft (fixed-wing + helicopters) |

**Lifecycle**

| Field | Type | Description |
|---|---|---|
| nextReportDue | datetime, nullable | When the next situation report is expected. Null when deleted or signed off. Calculated by business rules (see below) |
| isDeleted | boolean | Soft delete flag. Queries filter these out by default |
| createdAt | datetime, auto | When the incident was created |
| createdBy | string, auto, immutable | User ID of creator |
| updatedAt | datetime, auto | Last modification timestamp |

### SituationReport

A point-in-time snapshot of fire conditions, linked to a FireIncident. Multiple sitreps per fire, ordered by report number.

**Identity**

| Field | Type | Description |
|---|---|---|
| id | UUID, auto | Primary key |
| fireIncidentId | UUID, required | Foreign key to FireIncident |
| reportNumber | integer, auto | Sequential per fire, auto-incremented on creation |

**Content**

| Field | Type | Description |
|---|---|---|
| reportType | ReportType enum | Always SituationReport for this entity (InitialReport and FinalReport are out of scope for this showcase) |
| fireName | string | Fire name at time of report (can evolve from the incident name) |
| status | FireStatus enum | Fire status at time of report |
| fireAreaHectares | number | Fire area at time of report |
| weatherConditions | string | Current weather affecting the fire |
| currentStrategy | string | Current suppression strategy description |
| significantEvents | string (long text) | Notable events since last report |
| predictedBehaviour | string | Expected fire behaviour going forward |

**Resources** (snapshot at time of report)

| Field | Type | Description |
|---|---|---|
| personnel | number | Total personnel at time of report |
| vehicles | number | Total vehicles at time of report |
| aircraft | number | Total aircraft at time of report |

**Audit**

| Field | Type | Description |
|---|---|---|
| submittedAt | datetime | When this report was submitted |
| submittedBy | string, auto | User who submitted the report |
| createdAt | datetime, auto | Record creation timestamp |

---

## Enums

### FireStatus

Represents fire control state at a point in time. Ordered by priority (highest urgency first):

| Value | Display Name | Meaning |
|---|---|---|
| Going | Going | Fire is actively burning and spreading. Requires immediate attention and frequent reporting |
| Contained | Contained | Fire spread has been halted within established control lines, but still requires active management |
| UnderControlFirst | Under Control - 1 | First stage of progressive fire control before reaching safe state |
| UnderControlSecond | Under Control - 2 | Second stage of progressive fire control |
| Safe | Safe | Fire is completely extinguished. No residual risk |
| SafeOverrun | Safe - Overrun | Fire area exceeded initial estimates but is now safely contained. Fire area is automatically set to 0 |
| SafeNotFound | Safe - Not Found | Reported fire was not located or confirmed at scene |
| SafeFalseAlarm | Safe - False Alarm | Reported fire was a false alarm |
| NotFound | Not Found | Fire could not be located during initial assessment (status still unknown) |

**"Safe" statuses** (for business rule purposes): Safe, SafeOverrun, SafeNotFound, SafeFalseAlarm. These enable final report creation and soft deletion.

### IncidentLevel

| Value | Display Name |
|---|---|
| LevelOne | Level 1 |
| LevelTwo | Level 2 |
| LevelThree | Level 3 |

Escalation can only go up (1 -> 2 -> 3), never down.

### CauseSource

How the fire started. 26 values:

| Value | Display Name |
|---|---|
| BurningBuilding | Burning Building |
| BurningHouseStoveFlue | Burning House, Stove, Flue |
| BurningOffDepartmentalPrescribed | Burning Off (Departmental Prescribed) |
| BurningOffStubbleGrassScrub | Burning Off, Stubble, Grass, Scrub |
| BurningOffWindrowHeap | Burning Off, Windrow, Heap |
| BurningVehicleMachine | Burning Vehicle, Machine |
| BurningVehicleMachineMalicious | Burning Vehicle, Machine - Malicious |
| CampfireBarbeque | Campfire, Barbeque |
| DeliberateLightingMalicious | Deliberate Lighting (Malicious) |
| ExhaustChainsaw | Exhaust, Chainsaw |
| ExhaustOther | Exhaust, Other |
| Fireworks | Fireworks |
| Lightning | Lightning |
| NonDeliberateLightingMischievous | Non-Deliberate Lighting (Mischievous) |
| Other | Other |
| PipeCigaretteMatch | Pipe, Cigarette, Match |
| PowerTransmission | Power Transmission |
| RelightBurningOff | Relight - Burning Off |
| RelightPrescribedFire | Relight - Prescribed Fire |
| RelightWildfire | Relight - Wildfire |
| SniggingHauling | Snigging, Hauling |
| Train | Train |
| UnattendedCampfire | Unattended Campfire - Contained Within Boundary |
| Unknown | Unknown |
| WasteDisposalDomestic | Waste Disposal, Domestic |
| WasteDisposalIndustrial | Waste Disposal, Industrial, Sawmill, Tip |

### ReportType

| Value | Display Name |
|---|---|
| InitialReport | Initial Report |
| SituationReport | Situation Report |
| FinalReport | Final Report |

### ControlAgency

Which agency has control of the incident:

| Value | Display Name |
|---|---|
| DEECA | DEECA |
| CFA | CFA |
| FRV | FRV |
| Interstate | Interstate |

### FuelType

Dominant fuel type at fire origin:

| Value | Display Name |
|---|---|
| Grassland | Grassland |
| Woodland | Woodland |
| Spinifex | Spinifex |
| MalleeHeath | Mallee Heath |
| Shrubland | Shrubland |
| Buttongrass | Buttongrass |
| Forest | Forest |
| Pine | Pine |

### Potential

Used for potential loss and potential spread assessments:

| Value | Display Name |
|---|---|
| Low | Low |
| Moderate | Moderate |
| High | High |

### CostClass

Estimated total cost of the incident:

| Value | Display Name |
|---|---|
| LessThanThousand | Less than $1,000 |
| OneToFiveThousand | $1,000 - $4,999 |
| FiveToTenThousand | $5,000 - $9,999 |
| TenToTwentyThousand | $10,000 - $19,999 |
| TwentyToFiftyThousand | $20,000 - $49,999 |
| FiftyToHundredThousand | $50,000 - $99,999 |
| HundredThousandOrGreater | $100,000 or greater |

---

## Business Rules

### Next Report Due Calculation

When a situation report is created or updated, `nextReportDue` is recalculated based on the current state:

| Condition | Next Report Due | Rationale |
|---|---|---|
| Status transitions from Contained/UnderControl back to Going | Now + 15 minutes | Fire re-escalation demands immediate follow-up |
| Potential (loss or spread) escalates while Contained/UnderControl (Low->Moderate or Moderate->High) | Now + 15 minutes | Worsening conditions under control require urgent reassessment |
| Status becomes any Safe variant | Now + 1 month | Minimal ongoing reporting once safe |
| Status is Going with High potential (loss or spread) | Now + 2 hours | Active high-severity fire needs frequent updates |
| All other Contained/UnderControl scenarios | Now + 24 hours | Standard cadence for controlled fires |

**Special cases:**
- On initial report creation: `nextReportDue = now + 30 minutes`
- On soft deletion: `nextReportDue = null`
- On final report sign-off: `nextReportDue = null`

### Fire Numbering

- Fire numbers are sequential integers per district per financial year
- When creating a fire, query the max fire number for that district + financial year, then assign max + 1
- The `globalIncidentId` is constructed as: `10` (fire type code) + last 2 digits of financial year + district ID (zero-padded to 2 digits) + fire number (zero-padded to 3 digits)

### Financial Year

- Runs July to June (Australian financial year)
- Determined from current date in Melbourne timezone (Australia/Melbourne)
- If month > 6 (July onwards): financial year = current calendar year + 1
- If month <= 6 (January-June): financial year = current calendar year
- Example: a fire on 15 March 2025 is in FY2025. A fire on 15 August 2025 is in FY2026.

### Status Transition Rules

- Final report can only be created when status is a safe variant (Safe, SafeOverrun, SafeNotFound, SafeFalseAlarm) or NotFound
- Soft deletion only allowed when status is a safe variant
- Soft deletion not allowed if fire has a signed-off final report
- When status is SafeOverrun, `fireAreaHectares` is automatically set to 0
- Major fire declaration (`isMajor = true`) requires `declaredBySource` (non-empty string) and `declaredByTimestamp` (must be in the past)

### Incident Level Escalation

- Level can only go up: LevelOne -> LevelTwo -> LevelThree
- Cannot be de-escalated
- Only StateOfficer or Admin can change incident level

### Timestamp Ordering Validation

These timestamps must be in chronological order when present:

1. Fire Started <= Fire Detected
2. Fire Detected <= First Reported
3. First Reported <= First Crew Sent
4. First Crew Sent <= First Crew Arrived

### Sign-Off Workflow

**Signing off a final report:**
1. All final report fields must be valid
2. User confirms sign-off (endorser identity and timestamp recorded)
3. Fire is locked — no further edits unless sign-off is removed
4. `nextReportDue` becomes null

**Removing a sign-off** (StateOfficer or Admin only):
1. Records who removed the sign-off and when
2. Final report becomes editable again
3. `nextReportDue` is recalculated

---

## Resource Tracking Model

The full resource tracking system (not all of which is in scope for this showcase) tracks resources per agency and per type:

**Agencies:** DEECA, Parks Victoria, Melbourne Water, Agriculture Victoria, CFA, SES, FRV, Other

**Resource types per agency:**
- Personnel (count)
- Vehicles: passenger vehicles, G-Wagens, heavy vehicles, fire tankers, trucks, trailers, water carriers, floats
- Plant/machinery: dozer, excavator, feller buncher, grader, harvester, loader, skidder, tractor
- Aircraft: fixed-wing, helicopters
- Other (free text)

**Two states tracked:** Working (actively deployed) and Resting (on-site but rotated out)

For the showcase, flatten this to totals on `FireIncident` (totalPersonnel, totalVehicles, totalAircraft) and snapshots on `SituationReport` (personnel, vehicles, aircraft). The full per-agency breakdown is a future enhancement.

---

## Domain Operations

### Get Next Fire Number

Given a district name, determine the next available fire number for the current financial year. Query existing fires for that district + financial year, find the maximum fire number, return max + 1 (or 1 if none exist).

### Escalate Incident

Given a new incident level, validate that the new level is higher than the current level (cannot de-escalate). Update `incidentLevel` and `statusAsAt`. Requires StateOfficer or Admin role.

### Soft Delete

Given a reason string, validate that the fire's current status is a safe variant and that it has no signed-off final report. Set `isDeleted = true`, clear `nextReportDue`. Requires StateOfficer or Admin role.

### Submit Situation Report

Given a fire incident ID and report data, create a new situation report with an auto-incremented `reportNumber` (max existing + 1 for that fire). Set `submittedBy` from the current user. Update the parent `FireIncident.nextReportDue` according to the calculation rules.

---

## User Workflows

### Incident List

Displays all fire incidents visible to the current user (filtered by district for non-admins). Shows: fire name, district, fire number, status (colour-coded), fire area, incident level, whether it's a major fire, last report date, next report due.

Sortable by name, district, number, last report date. "New Incident" action visible only to users with create permission.

### Incident Detail

Shows full incident information and a timeline of situation reports (newest first). Action buttons are permission-gated:

- "Edit" — visible if user can update this incident
- "Escalate" — visible to StateOfficer/Admin
- "New Sitrep" — visible to IncidentEditor+ (hidden if final report exists)
- "Delete" — visible to StateOfficer/Admin (disabled if status is not safe or if signed off)

### Incident Form (Create / Edit)

Form for creating or editing a fire incident. Fields driven by entity metadata where possible. Enum fields render as dropdowns. Validation runs on the client before submit (same rules as server). Required fields: name, districtName, status.

### Situation Report Form

Form for submitting a new sitrep against a fire. Pre-populates fire identity fields (district, fire number) as read-only. Captures status, area, weather, strategy, significant events, predicted behaviour, and resource snapshot.

---

## Implementation Phases

### Phase 1: Infrastructure

Add database persistence (SQLite) and extend the existing dev auth with the four showcase roles (Viewer, IncidentEditor, StateOfficer, Admin). Add dev users across different districts so row-level filtering is testable.

### Phase 2: Domain Entities

Define the enums, `FireIncident` entity, and `SituationReport` entity with all fields, permissions, row-level filtering, and lifecycle hooks. Register them with the API.

**Demo moment: two entity files produce a full API with auth. No controllers written.**

### Phase 3: Domain Operations

Add the four domain operations: getNextFireNumber, escalate, softDelete, submitForFire. Business logic lives on the entities.

**Demo moment: business logic on the entity, callable from frontend with type safety.**

### Phase 4: Frontend Feature

Build the incident list, incident detail with sitrep timeline, incident form, and sitrep form as a lazy-loaded feature route.

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
| Business operation | Controller action -> service method -> repository call -> mapping | Method on the entity |
| Validation | Backend validation + separate frontend form config (can drift) | Entity field definition (runs identically both sides) |
| Type safety across boundary | Generated TypeScript client (can be stale) | Direct import — same object |
| New domain from scratch | ~6 new projects, generators, codegen setup | 1 entity file, register in array |

---

## Risks and Mitigations

**"This is just a demo, production will be harder."** Acknowledge it. The showcase deliberately omits complex integrations, PDF generation, and background processing. Frame it as: the 80% of work that is CRUD, forms, permissions, and validation gets radically simpler. The 20% that is infrastructure integration is a separate conversation.

**"What about our complex queries?"** The getNextFireNumber operation proves you can drop to raw queries when needed. The framework doesn't lock you in.

**"What about our existing auth library?"** The role model is simplified. The point is that wherever roles come from, the permission enforcement is declarative on the entity. Swapping the auth source is middleware — entity permissions stay unchanged.

**"We'd need to rewrite everything."** No. The showcase demonstrates what new features could look like. Migration is incremental and optional. One domain at a time, if at all.

---

## Follow-Up Showcases

Once the fire core is built, natural next steps:

- **ISP (Incident Shift Plans)** — complex nested structures, demonstrates handling non-trivial aggregates
- **Dashboard aggregation** — cross-domain queries, demonstrates collapsing multiple APIs into shared entity queries
- **Real auth (Entra ID)** — swap dev auth middleware, entity permissions untouched, proves the abstraction holds
