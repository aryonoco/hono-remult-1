import { ok, ResultAsync, safeTry } from 'neverthrow';
import { Client } from 'pg';
import { SCHEMA } from '../../config';
import type { FixtureDataset } from './rows';

// Bulk-loads a generated dataset into Postgres. All I/O is modelled with
// neverthrow — the client never throws into the caller; failures travel in the
// Err channel. Connects as the migrations role (which may TRUNCATE) and clears
// only the three fire tables, never the district reference data.

const toError = (e: unknown): Error => (e instanceof Error ? e : new Error(String(e)));

// Postgres caps a statement at 65535 bind parameters; ~40 columns per fire row
// means batches of 800 stay well under that.
const BATCH_ROWS = 800;

interface InsertSummary {
  readonly fires: number;
  readonly sitreps: number;
  readonly finalReports: number;
}

function seedDatabase(
  connectionString: string,
  dataset: FixtureDataset,
): ResultAsync<InsertSummary, Error> {
  // must-use-result has no model for yield*, so each yielded Result is disabled.
  return safeTry(async function* () {
    const client = new Client({ connectionString });
    // eslint-disable-next-line neverthrow/must-use-result
    yield* ResultAsync.fromPromise(client.connect(), toError);
    try {
      // eslint-disable-next-line neverthrow/must-use-result
      yield* run(client, `SET search_path TO ${SCHEMA}`);
      // eslint-disable-next-line neverthrow/must-use-result
      yield* run(client, 'TRUNCATE "fireIncidents", "situationReports", "finalReports" CASCADE');
      // eslint-disable-next-line neverthrow/must-use-result
      yield* insertTable(client, 'fireIncidents', dataset.fires);
      // eslint-disable-next-line neverthrow/must-use-result
      yield* insertTable(client, 'situationReports', dataset.sitreps);
      // eslint-disable-next-line neverthrow/must-use-result
      yield* insertTable(client, 'finalReports', dataset.finalReports);
    } finally {
      await client.end();
    }
    return ok({
      fires: dataset.fires.length,
      sitreps: dataset.sitreps.length,
      finalReports: dataset.finalReports.length,
    });
  });
}

function run(client: Client, sql: string): ResultAsync<unknown, Error> {
  return ResultAsync.fromPromise(client.query(sql), toError);
}

function insertTable(
  client: Client,
  table: string,
  rows: readonly object[],
): ResultAsync<number, Error> {
  return safeTry(async function* () {
    const first = rows[0];
    if (first === undefined) {
      return ok(0);
    }
    const columns = Object.keys(first);
    const columnList = columns.map((c) => `"${c}"`).join(', ');
    for (let start = 0; start < rows.length; start += BATCH_ROWS) {
      const batch = rows.slice(start, start + BATCH_ROWS);
      const params: unknown[] = [];
      const tuples = batch.map((row) => {
        const record = row as Record<string, unknown>;
        const placeholders = columns.map((col) => {
          params.push(record[col] ?? null);
          return `$${params.length}`;
        });
        return `(${placeholders.join(', ')})`;
      });
      const sql = `INSERT INTO "${table}" (${columnList}) VALUES ${tuples.join(', ')}`;
      // eslint-disable-next-line neverthrow/must-use-result
      yield* ResultAsync.fromPromise(client.query(sql, params), toError);
    }
    return ok(rows.length);
  });
}

export { type InsertSummary, seedDatabase };
