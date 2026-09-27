// Wanderblade economy simulator — CLI entry point.
//
// Runs every policy in docs/ECONOMY.md's simulator contract across N seeds and
// prints the correctness and pacing PASS/FAIL summary. It reports honest
// results; it never tunes constants.

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { HELP, parseArgs } from './args';
import { formatSeedReport, formatSummary, formatThumb, writeCsv } from './format';
import { simulateSeed } from './simulateSeed';
import type { SeedResult } from './types';

function main(): void {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed === 'help') {
    process.stdout.write(HELP + '\n');
    return;
  }
  const config = parsed;

  const out: string[] = [];
  out.push('Wanderblade — Road / Portal Boss / Ascension economy simulator');
  out.push(
    `config: days=${config.days} seeds=${config.seed}..${config.seed + config.seeds - 1} ` +
      `sessions=${config.sessionsPerDay}×${config.sessionMin}min csv=${config.csv}`,
  );

  const results: SeedResult[] = [];
  const csvDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');
  const csvPaths: string[] = [];

  for (let i = 0; i < config.seeds; i++) {
    const result = simulateSeed(config.seed + i, config);
    results.push(result);
    out.push(formatSeedReport(result));
    if (config.csv) csvPaths.push(...writeCsv(result, csvDir));
  }

  out.push(formatThumb(config.seed));
  out.push(formatSummary(results));
  if (csvPaths.length > 0) {
    out.push('');
    out.push('CSV written:');
    for (const p of csvPaths) out.push(`  ${p}`);
  }

  process.stdout.write(out.join('\n') + '\n');
  process.exitCode = 0;
}

main();
