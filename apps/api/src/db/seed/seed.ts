// Entry point for `bun run db:seed`. Deterministically generates the statewide
// fire-incident fixtures and loads them into Postgres, replacing any existing
// fire data. Pass `--dry-run` to generate and report without touching the DB.
//
// Determinism: a fixed seed and a fixed anchor date mean every run produces
// identical data, so a rebuilt devcontainer or a `just db-reset` always yields
// the same incidents. On failure it throws, so the process exits non-zero.
import { DATABASE_URL_MIGRATIONS } from '../../env';
import { DEFAULT_SEED, generateDataset, summarise } from './generate';
import { seedDatabase } from './insert';
import { Rng } from './prng';

const dryRun = Bun.argv.includes('--dry-run');

const dataset = generateDataset(new Rng(DEFAULT_SEED));
const summary = summarise(dataset);

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
    'Generated fixtures:',
    `  fires=${summary.fires} sitreps=${summary.sitreps} finalReports=${summary.finalReports}`,
    `  active=${summary.active} major=${summary.major} signedOff=${summary.signedOff} signOffRemoved=${summary.signOffRemoved} softDeleted=${summary.softDeleted}`,
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
