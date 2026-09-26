// Dependency-free argv parsing. Both `--flag value` and `--flag=value` work;
// the flag list lives once, in HELP below.

import type { SimConfig } from './types';

const DEFAULTS: SimConfig = {
  days: 14,
  seed: 1,
  seeds: 3,
  sessionMin: 20,
  sessionsPerDay: 2,
  csv: false,
  quick: false,
};

export const HELP = `Wanderblade economy simulator

  npm run sim -- [options]

  --days N             simulated days per seed           (default ${DEFAULTS.days})
  --seed N             first RNG seed                    (default ${DEFAULTS.seed})
  --seeds N            number of consecutive seeds       (default ${DEFAULTS.seeds})
  --session-min N      minutes per active session        (default ${DEFAULTS.sessionMin})
  --sessions-per-day N active sessions per day           (default ${DEFAULTS.sessionsPerDay})
  --csv                write sim/out/run-<seed>.csv
  --quick              skip the long probes; C3-5, C7-8, P3-4, P7, P10 print SKIP
  --help               this message

The harness always exits 0. Read the printed PASS/FAIL summary.`;

function parseIntFlag(raw: string | undefined, flag: string): number {
  if (raw === undefined) throw new Error(`Flag ${flag} requires a numeric value`);
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`Flag ${flag} requires a positive integer (got "${raw}")`);
  }
  return n;
}

export function parseArgs(argv: readonly string[]): SimConfig | 'help' {
  const config: SimConfig = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === undefined) continue;
    if (!token.startsWith('--')) throw new Error(`Unexpected argument "${token}"`);

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
      case '--help':
        return 'help';
      case '--days':
        config.days = parseIntFlag(takeValue(), '--days');
        break;
      case '--seed':
        config.seed = parseIntFlag(takeValue(), '--seed');
        break;
      case '--seeds':
        config.seeds = parseIntFlag(takeValue(), '--seeds');
        break;
      case '--session-min':
        config.sessionMin = parseIntFlag(takeValue(), '--session-min');
        break;
      case '--sessions-per-day':
        config.sessionsPerDay = parseIntFlag(takeValue(), '--sessions-per-day');
        break;
      case '--csv':
        config.csv = true;
        break;
      case '--quick':
        config.quick = true;
        break;
      default:
        throw new Error(`Unknown flag "${name}"`);
    }
  }

  if (config.sessionMin * 60 * config.sessionsPerDay > 86_400) {
    throw new Error('Active sessions cannot exceed a full day');
  }
  return config;
}
