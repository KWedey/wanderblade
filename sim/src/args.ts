// Dependency-free argv parsing for the sim harness.
//
// Supported flags (all optional):
//   --days N              simulated days per seed        (default 10)
//   --seed N              first RNG seed                 (default 1)
//   --seeds N             number of consecutive seeds    (default 3)
//   --checkins-per-day N  discrete check-ins per day     (default 4)
//   --csv                 write sim/out/run-<seed>.csv   (default off)
//
// Both `--flag value` and `--flag=value` forms are accepted.

import type { SimConfig } from './types';

const DEFAULTS: SimConfig = {
  days: 10,
  seed: 1,
  seeds: 3,
  checkinsPerDay: 4,
  csv: false,
};

function parseIntFlag(raw: string | undefined, flag: string): number {
  if (raw === undefined) {
    throw new Error(`Flag ${flag} requires a numeric value`);
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`Flag ${flag} requires a positive integer (got "${raw}")`);
  }
  return n;
}

export function parseArgs(argv: readonly string[]): SimConfig {
  const config: SimConfig = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) continue;
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument "${token}"`);
    }

    const eq = token.indexOf('=');
    const name = eq >= 0 ? token.slice(0, eq) : token;
    const inlineValue = eq >= 0 ? token.slice(eq + 1) : undefined;

    const takeValue = (): string | undefined => {
      if (inlineValue !== undefined) return inlineValue;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        i += 1;
        return next;
      }
      return undefined;
    };

    switch (name) {
      case '--days':
        config.days = parseIntFlag(takeValue(), '--days');
        break;
      case '--seed':
        config.seed = parseIntFlag(takeValue(), '--seed');
        break;
      case '--seeds':
        config.seeds = parseIntFlag(takeValue(), '--seeds');
        break;
      case '--checkins-per-day':
        config.checkinsPerDay = parseIntFlag(takeValue(), '--checkins-per-day');
        break;
      case '--csv':
        config.csv = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown flag "${name}"`);
    }
  }

  return config;
}

function printHelp(): void {
  process.stdout.write(
    [
      'Wanderblade economy simulator (M0 pacing harness)',
      '',
      'Usage: npm run sim -- [flags]',
      '',
      '  --days N              simulated days per seed        (default 10)',
      '  --seed N              first RNG seed                 (default 1)',
      '  --seeds N             number of consecutive seeds    (default 3)',
      '  --checkins-per-day N  discrete check-ins per day     (default 4)',
      '  --csv                 write sim/out/run-<seed>.csv',
      '',
    ].join('\n') + '\n',
  );
}
