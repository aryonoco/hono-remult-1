// Entry point for `bun run db:seed`. Deterministically generates the statewide
// fire-incident fixtures and loads them into Postgres, replacing any existing
// fire data. Pass `--dry-run` to generate and report without touching the DB.
//
// Determinism: given a fixed seed AND a fixed reference date the output is
// byte-identical. Production seeds with the real wall-clock so re-seeding on a
// later date keeps the rolling-active set fresh; set `SEED_NOW` (an ISO date)
// to pin the reference date for a reproducible fixture set. On failure it
// throws, so the process exits non-zero.
import { DATABASE_URL_MIGRATIONS } from '../../env';
import { DEFAULT_SEED, generateDataset, summarise } from './generate';
import { seedDatabase } from './insert';
import { Rng } from './prng';

const dryRun = Bun.argv.includes('--dry-run');

// SEED_NOW pins the reference "now" for reproducible fixtures; otherwise the
// real wall-clock is used. Read through a variable key (mirroring env.ts) so it
// satisfies Biome's noProcessEnv/useLiteralKeys and tsc's index-signature rule.
const SEED_NOW_KEY = 'SEED_NOW';
function referenceNow(): Date {
  const raw = Bun.env[SEED_NOW_KEY];
  if (raw === undefined || raw === '') {
    return new Date();
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`SEED_NOW is not a valid date: ${raw}`);
  }
  return parsed;
}

const now = referenceNow();
const dataset = generateDataset(new Rng(DEFAULT_SEED), now);
const summary = summarise(dataset, now);

const seasonLines = [...summary.perSeason.entries()]
  .sort(([a], [b]) => a - b)
  .map(([fy, n]) => `    FY${fy}: ${n}`)
  .join('\n');

// Bun's stdout writer — avoids the console / node:process globals the linter
// forbids while still emitting progress for the CLI.
async function out(message: string): Promise<void> {
  await Bun.write(Bun.stdout, `${message}\n`);
}

await out(
  [
    `Generated fixtures (reference now=${now.toISOString()}):`,
    `  fires=${summary.fires} sitreps=${summary.sitreps} finalReports=${summary.finalReports}`,
    `  active=${summary.active} (upcoming=${summary.activeUpcoming} overdue=${summary.activeOverdue}) major=${summary.major} signedOff=${summary.signedOff} signOffRemoved=${summary.signOffRemoved} softDeleted=${summary.softDeleted}`,
    '  per financial year:',
    seasonLines,
  ].join('\n'),
);

if (dryRun) {
  await out('Dry run — database not modified.');
} else {
  const result = await seedDatabase(DATABASE_URL_MIGRATIONS, dataset);
  const loaded = result.match(
    (value) => value,
    (error) => {
      throw new Error(`Seed failed: ${error.message}`);
    },
  );
  await out(
    `Seeded database: ${loaded.fires} fires, ${loaded.sitreps} sitreps, ${loaded.finalReports} final reports.`,
  );
}
