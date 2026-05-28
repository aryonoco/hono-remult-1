// Orchestrator for `bun run migrate:generate <name>`.
//
// Step 1: re-populate the atlas_desired scratch DB with the current
// Remult entity schema. Step 2: invoke Atlas, which diffs that DB
// against the existing migrations directory and writes a new .sql file.
import { $ } from 'bun';

const name: string | undefined = Bun.argv[2];
if (!name) {
  throw new Error(
    'Usage: bun run migrate:generate <name>\nExample: bun run migrate:generate add_due_date',
  );
}

await $`bun apps/api/src/db/sync-to-desired.ts`;
await $`atlas migrate diff ${name} --env local`;
