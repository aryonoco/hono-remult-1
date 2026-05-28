// Populates the atlas_desired scratch DB with the current Remult entity
// schema. Atlas reads atlas_desired as the "src" (desired state) during
// `atlas migrate diff`. Invoked by migrate-generate.ts before Atlas runs.
//
// Why the wipe-and-rebuild dance: Remult's ensureSchema is additive only
// (it never drops or alters), so re-running it against a stale DB would
// retain removed fields and pollute the diff. Dropping and recreating
// the schema each time guarantees atlas_desired reflects exactly what
// the entities currently say.
import { Client } from 'pg';
import type { SqlDatabase } from 'remult';
import { remult } from 'remult';
import { createPostgresDataProvider } from 'remult/postgres';

import { entities, SCHEMA } from '../config';
import { ATLAS_DESIRED_URL } from '../env';

const client: Client = new Client({ connectionString: ATLAS_DESIRED_URL });
await client.connect();
await client.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
await client.query(`CREATE SCHEMA ${SCHEMA}`);
await client.end();

const dp: SqlDatabase = await createPostgresDataProvider({
  connectionString: ATLAS_DESIRED_URL,
  schema: SCHEMA,
});
remult.dataProvider = dp;

interface Lifecycle {
  ensureSchema?: (m: ReturnType<typeof remult.repo>['metadata'][]) => Promise<void>;
  end?: () => Promise<void>;
}
const lifecycle: Lifecycle = dp as Lifecycle;

if (!lifecycle.ensureSchema) {
  throw new Error('Postgres data provider is missing ensureSchema');
}
await lifecycle.ensureSchema(entities.map((e) => remult.repo(e).metadata));

if (lifecycle.end) {
  await lifecycle.end();
}
