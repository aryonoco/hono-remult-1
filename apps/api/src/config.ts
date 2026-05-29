import {
  District,
  districtSchemaExtras,
  FinalReport,
  FireIncident,
  finalReportSchemaExtras,
  fireIncidentSchemaExtras,
  SituationReport,
} from '@workspace/shared-domain';
import type { ClassType } from 'remult';

// Single registration point for Remult entities. main.ts uses this list
// to mount the API; the Atlas schema-sync script uses it to populate the
// scratch DB Atlas reads as the "desired" schema state.
export const entities: ClassType<unknown>[] = [
  District,
  FireIncident,
  SituationReport,
  FinalReport,
];

// Raw-SQL DDL fragments for constraints Remult does not express
// (UNIQUE / INDEX / CHECK). Applied to the scratch DB after ensureSchema
// in sync-to-desired.ts so Atlas sees them in the desired state.
export const schemaExtras: readonly string[] = [
  ...districtSchemaExtras,
  ...fireIncidentSchemaExtras,
  ...finalReportSchemaExtras,
] as const;

// Postgres schema all entities live in. Set in postgres-init/00-init.sql
// (`app` schema + `search_path = app, public`); passed to Remult's
// createPostgresDataProvider so generated SQL is schema-qualified.
export const SCHEMA = 'app';
