# TODO

Deferred work and known divergences to revisit.

## BackendMethods: use instance methods for single-row operations

**Convention** (`docs/00-foundation1.md` — Guiding Principle 2 "No Separate Controllers"; and
`.claude/rules/entity-conventions.md` — "Business Logic"): instance methods for operations on a
single entity (approve, archive, submit); static methods for collection operations (bulk update,
reports, aggregations).

**Divergence.** Three of the four fire-domain `@BackendMethod`s take an id, look the row up with
`findId`, and mutate that single row — yet are declared `static`:

- `FireIncident.escalate(fireId, newLevel)` — `libs/shared/domain/src/fire/fire-incident.ts:393`
- `FireIncident.softDelete(fireId, reason)` — `libs/shared/domain/src/fire/fire-incident.ts:438`
- `FinalReport.removeSignOff(finalReportId, reason)` — `libs/shared/domain/src/fire/final-report.ts:281`

`FireIncident.getNextFireNumber(districtId)` (`fire-incident.ts:387`) is correctly static — it is a
collection-level `count()`, not a single-row operation, so it should stay static.

**Fix.** Convert the three single-row methods to instance `@BackendMethod`s that operate on `this`
(the row Remult loads for the instance) instead of taking an id and re-fetching. Call sites then
become `await fire.escalate(newLevel)` / `await fire.softDelete(reason)` /
`await finalReport.removeSignOff(reason)`. Update the backend specs
(`fire-incident.backend.spec.ts`, `final-report.backend.spec.ts`) accordingly. Note this is the one
spot the showcase contradicts its own stated entity conventions; the frontend is not built yet, so
there are no UI call sites to migrate.

**Caveat.** The conversion is not purely mechanical: an instance `@BackendMethod` first loads the
row through the normal repository — subject to `apiPrefilter` and read permissions — before the
method body runs, whereas the current static versions fetch with `findId` inside the body (which
bypasses `apiPrefilter`). Verify the district-scoping/visibility behaviour stays identical after the
refactor, and adjust the not-found / not-permitted error handling so the messages match the current
ones.
