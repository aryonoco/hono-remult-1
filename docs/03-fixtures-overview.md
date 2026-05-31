# Fixtures — Statewide Bushfire Demo Data

Deterministic, realistic fixtures that make the fire showcase land: a statewide history of Victorian bushfire
incidents spanning the 2017-18 to 2025-26 fire seasons, generated once from a fixed seed so every devcontainer
rebuild — or `just db-reset` — reproduces the exact same data.

See `02-fire-showcase-overview.md` for the domain model these fixtures populate.

---

## What it produces

Roughly **13,500 fire incidents**, **38,000 situation reports** and **7,000 final reports** across all **16 DEECA
fire districts**, weighted to the real severity of each season. The headline shape:

| Financial year | Season  | Fires (approx) | Why                                                      |
| -------------- | ------- | -------------- | -------------------------------------------------------- |
| FY2018         | 2017-18 | ~1,640         | Above normal; St Patrick's Day fires in the south-west   |
| FY2019         | 2018-19 | ~2,130         | Active, dry; Gippsland and Bunyip-fringe fires           |
| FY2020         | 2019-20 | ~3,480         | Black Summer — catastrophic East Gippsland (Snowy/Tambo) |
| FY2021         | 2020-21 | ~620           | Well below normal — first La Niña, very wet              |
| FY2022         | 2021-22 | ~1,070         | Below normal — second La Niña                            |
| FY2023         | 2022-23 | ~650           | Well below normal — third La Niña; floods, little fire   |
| FY2024         | 2023-24 | ~1,210         | Above normal — El Niño; Pomonal / Grampians              |
| FY2025         | 2024-25 | ~1,460         | Well above normal — Grampians and Little Desert          |
| FY2026         | 2025-26 | ~1,190         | In progress to 31 May 2026; elevated risk west/central   |

Megafire events are placed in the districts where they actually burned and dated to their real windows, so the
busy years concentrate where they should rather than smearing evenly across the state.

Every record is **data an operator could have entered through the forms**: only form-enterable fields are set, and
the values respect the entity's validators, permissions and lifecycle invariants. The hook-computed fields
(financial year, district-scoped fire number, global incident id, denormalised status/totals/cadence, sign-off and
soft-delete bookkeeping) are reproduced exactly as the live `saving`/`saved` hooks would compute them — but with
historical timestamps the live insert path cannot produce.

---

## Realism

- **Geography is correct.** Each fire's latitude/longitude is sampled inside its district's official boundary
  polygon (Victorian Government Land and Fire District geometry), clustered around real rural localities so fires
  read as "near a town or track". A point is never placed in the wrong district or out at sea.
- **District character drives the detail.** Districts fall into four fire archetypes (remote forest, mixed
  foothills, grassland/agricultural, semi-arid mallee), each with its own fuel, cause and detection mixes grounded
  in DEECA/CFA/AFAC patterns — lightning-led forest country versus powerline/machinery/burning-off grassland.
- **Fire sizes are heavy-tailed.** Around 80% of fires are held under 5 hectares (matching the FFMVic first-attack
  benchmark), with a long tail to tens of thousands of hectares in severe seasons.
- **Lifecycles are complete.** Fires progress through situation reports toward a terminal state, with final reports,
  sign-offs, sign-off removals, escalations to Level 2/3, major declarations, and soft deletions — and a handful of
  currently-active incidents near the anchor date.
- **Authorship reads like real people.** A pool of non-switchable operator identities files incidents in their own
  districts (with state officers covering the unstaffed ones); see `libs/shared/domain/src/auth/operators.ts`. The
  eight switchable dev users are unchanged.

A coverage pass guarantees that **every enum value and every lifecycle state appears at least once**, so the UI's
badges, filters and detail panels can all be exercised — even values that almost never occur naturally (such as
spinifex/buttongrass fuels) are seeded a token few in the only country where they are conceivable.

---

## How it works

The generator lives in `apps/api/src/db/seed/` and is fully **data-driven**:

| File                      | Role                                                               |
| ------------------------- | ------------------------------------------------------------------ |
| `data/districts.json`     | 16 districts: codes, regions, boundary polygons, localities        |
| `data/seasons.json`       | per-season counts, severity, calendar weighting, megafire clusters |
| `data/distributions.json` | per-archetype fuel/cause/detection weights and fire-size buckets   |
| `data/tuning.json`        | every behavioural probability, range and threshold                 |
| `prng.ts`                 | seeded mulberry32 generator — no `Math.random`, no wall clock      |
| `geo.ts`                  | point-in-polygon test and clustered in-district sampling           |
| `simulate.ts`             | one fire's full record trail (reuses the domain's compute helpers) |
| `generate.ts`             | orchestration, fire numbering and the enum/state coverage pass     |
| `insert.ts`               | batched Postgres load (neverthrow for all I/O)                     |
| `seed.ts`                 | CLI entry point                                                    |

**Determinism** comes from a fixed seed plus a fixed anchor date (31 May 2026): nothing reads the wall clock or
`Math.random`, and the domain's own `computeFinancialYear` / `computeGlobalIncidentId` / `computeNextReportDue`
helpers are reused (fed historical dates) so the derived fields can never drift from the entity logic.

`seed.spec.ts` asserts the whole dataset on every CI run: determinism, unique and sequential fire numbering, the
canonical id/financial-year formulas, timeline ordering, sign-off/soft-delete consistency, latest-sitrep
denormalisation, point-in-polygon membership, full enum/state coverage, and a column-drift guard against the entity
metadata.

---

## Running it

A freshly built devcontainer is seeded automatically — `post-create` applies migrations then loads the fixtures.
Otherwise:

```bash
just db-seed        # (re)load the fixtures — idempotent (truncate + re-insert)
just db-seed-dry    # generate and print a summary without touching the database
just db-reset       # drop, recreate schema + grants, migrate and seed from scratch
```

The seed runs as the migrations role (it truncates the three fire tables before inserting) and never touches the
district reference data, which is owned by the Atlas migrations.

---

## Data provenance

- **District codes, regions and ROSE names** — authoritative DEECA fire-district reference data.
- **Boundary geometry and localities** — the Victorian Government Landfolio "Land and Fire District" layer
  (reprojected to WGS84 and simplified).
- **Per-season counts and severity** — DEECA/FFMVic and CFA annual reporting, with ENSO state from the Bureau of
  Meteorology; the long-run anchor is roughly 600 unplanned public-land bushfires per year statewide.

District boundaries, fire numbers and locality names are real; people's names, individual fire names and the
incident narratives are synthetic but plausible, generated deterministically.
