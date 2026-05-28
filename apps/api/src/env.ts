// Typed environment boundary. All env reads happen here; the rest of
// the API imports the resolved constants. Bun.env (rather than
// process.env) is used so the file complies with Biome's noProcessEnv
// rule without needing suppressions.

function required(key: string): string {
  const value: string | undefined = Bun.env[key];
  if (value === undefined || value === '') {
    throw new Error(`Required env var ${key} is not set. Copy .env.example to .env.`);
  }
  return value;
}

// Runtime DB connection (DML only — connects as hrm_runtime).
export const DATABASE_URL: string = required('DATABASE_URL');

// Migration DB connection (DDL allowed — connects as hrm_app). Only
// used by Atlas via apps/api/src/db/* scripts, never by the API runtime.
export const DATABASE_URL_MIGRATIONS: string = required('DATABASE_URL_MIGRATIONS');

// Scratch DB Atlas reads as the "desired" schema state. Populated by
// apps/api/src/db/sync-to-desired.ts before each `atlas migrate diff`.
export const ATLAS_DESIRED_URL: string = required('ATLAS_DESIRED_URL');
