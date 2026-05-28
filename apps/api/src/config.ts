import { Task } from '@workspace/shared-domain';
import type { ClassType } from 'remult';

// Single registration point for Remult entities. main.ts uses this list
// to mount the API; the Atlas schema-sync script uses it to populate the
// scratch DB Atlas reads as the "desired" schema state.
export const entities: ClassType<unknown>[] = [Task];

// Postgres schema all entities live in. Set in postgres-init/00-init.sql
// (`app` schema + `search_path = app, public`); passed to Remult's
// createPostgresDataProvider so generated SQL is schema-qualified.
export const SCHEMA = 'app';
