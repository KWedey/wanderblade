// Wanderblade M0 economy simulator — entry point.
//
//   npm run sim -- [--days N] [--seed N] [--seeds N] [--checkins-per-day N] [--csv]
//
// Runs the deterministic bot player across N seeds, prints a per-seed milestone
// timeline plus the M0-gating PASS/FAIL summary, and (optionally) writes a CSV
// timeline per seed. It reports honest results; it never tunes constants.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseArgs } from './args';
import { simulateSeed } from './simulate';
import { runValidators } from './validators';
import { formatSeedReport, formatSummary, writeCsv } from './format';
import type { SeedResult } from './types';

function main(): void {
  const config = parseArgs(process.argv.slice(2));

  const out: string[] = [];
  out.push('Wanderblade — M0 economy simulator');
  out.push(
    `config: days=${config.days} seed=${config.seed} seeds=${config.seeds} ` +
      `checkins/day=${config.checkinsPerDay} csv=${config.csv}`,
  );

  const results: SeedResult[] = [];
  const csvDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');
  const csvPaths: string[] = [];

  for (let i = 0; i < config.seeds; i++) {
    const seed = config.seed + i;
    const result = simulateSeed(seed, config);
    result.validators = runValidators(result);
    results.push(result);
    out.push(formatSeedReport(result));
    if (config.csv) csvPaths.push(writeCsv(result, csvDir));
  }

  out.push(formatSummary(results));

  if (csvPaths.length > 0) {
    out.push('');
    out.push('CSV written:');
    for (const p of csvPaths) out.push(`  ${p}`);
  }

  process.stdout.write(out.join('\n') + '\n');

  // The harness itself ran successfully — exit 0 so `npm run sim` is "clean".
  // PASS/FAIL against the M0 targets lives in the printed summary above (a
  // tuning agent follows); harness success is not the same as targets passing.
  process.exitCode = 0;
}

main();
