// `npm run thumb` — what a human thumb catches, swept across the two things a
// thumb costs. Re-run this whenever arc flight, catch radius, coins per kill,
// or tap cadence changes; the answer moves with all four.

import { ARC_CATCH_RADIUS, ARC_FLIGHT_SEC } from '@wanderblade/core';
import { DEFAULT_PX_PER_UNIT, sweep, type SweepAxes, type ThumbResult } from './thumb';

const DEFAULTS = {
  latencyMs: [80, 150, 220, 300, 400],
  scatterPx: [0, 4, 8, 12, 16],
  tapsPerSec: [3, 5, 8],
  lead: [0, 0.5, 0.9, 1],
  pick: ['landing', 'apex'] as ('landing' | 'apex')[],
  seconds: 240,
  seeds: 3,
  seed: 7,
  pxPerUnit: DEFAULT_PX_PER_UNIT,
};

const HELP = `Wanderblade thumb harness — catch rate against human reaction and aim

  npm run thumb -- [options]

  --latency A,B,C    reaction latency in ms          (default ${DEFAULTS.latencyMs.join(',')})
  --scatter A,B,C    aim error, 1 sigma, in px       (default ${DEFAULTS.scatterPx.join(',')})
  --taps A,B,C       taps per second                 (default ${DEFAULTS.tapsPerSec.join(',')})
  --lead A,B,C       fraction of latency predicted   (default ${DEFAULTS.lead.join(',')})
  --pick A,B         coin chosen: landing|apex       (default ${DEFAULTS.pick.join(',')})
  --seconds N        measured seconds per cell       (default ${DEFAULTS.seconds})
  --seed N           first RNG seed                  (default ${DEFAULTS.seed})
  --seeds N          seeds averaged per cell         (default ${DEFAULTS.seeds})
  --px-per-unit N    scene px per arc-space unit     (default ${DEFAULTS.pxPerUnit})
  --csv              machine-readable rows instead of the table
  --help             this message

Catch radius is ${ARC_CATCH_RADIUS} arc-space units; arcs fly for ${ARC_FLIGHT_SEC}s.
A perfect oracle is --latency 0 --scatter 0, or any latency at --lead 1.`;

function numList(raw: string | undefined, flag: string): number[] {
  const parts = (raw ?? '').split(',').map((p) => Number(p.trim()));
  if (parts.length === 0 || parts.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error(`Flag ${flag} wants a comma-separated list of non-negative numbers`);
  }
  return parts;
}

function pct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

function gold(n: number): string {
  const tiers: [number, string][] = [
    [1e12, 'T'],
    [1e9, 'B'],
    [1e6, 'M'],
    [1e3, 'K'],
  ];
  for (const [scale, suffix] of tiers) {
    if (n >= scale) return `${(n / scale).toFixed(2)}${suffix}`;
  }
  return n.toFixed(0);
}

function table(rows: ThumbResult[]): string {
  const head = ['taps/s', 'pick', 'lead', 'latency', 'scatter', 'x radius', 'catch', 'gold/s', 'x idle'];
  const body = rows.map((r) => [
    r.thumb.tapsPerSec.toFixed(0),
    r.thumb.pick,
    r.thumb.lead.toFixed(2),
    `${r.thumb.latencyMs}ms`,
    `${r.thumb.scatterPx}px`,
    r.scatterRadii.toFixed(2),
    pct(r.catchRate),
    gold(r.goldPerSec),
    `${r.vsIdle.toFixed(2)}x`,
  ]);
  const widths = head.map((h, i) =>
    Math.max(h.length, ...body.map((line) => (line[i] ?? '').length)),
  );
  const line = (cells: string[]): string =>
    cells.map((c, i) => c.padStart(widths[i] ?? c.length)).join('  ');
  return [line(head), line(widths.map((w) => '-'.repeat(w))), ...body.map(line)].join('\n');
}

function main(argv: readonly string[]): void {
  const axes: SweepAxes = {
    latencyMs: DEFAULTS.latencyMs,
    scatterPx: DEFAULTS.scatterPx,
    tapsPerSec: DEFAULTS.tapsPerSec,
    lead: DEFAULTS.lead,
    pick: DEFAULTS.pick,
  };
  let { seconds, seed, pxPerUnit, seeds } = DEFAULTS;
  let csv = false;

  for (let i = 0; i < argv.length; i++) {
    const [flag, inline] = (argv[i] ?? '').split('=', 2);
    const value = inline ?? argv[i + 1];
    const step = (): void => {
      if (inline === undefined) i++;
    };
    switch (flag) {
      case '--help':
        console.log(HELP);
        return;
      case '--csv':
        csv = true;
        break;
      case '--latency':
        axes.latencyMs = numList(value, flag);
        step();
        break;
      case '--scatter':
        axes.scatterPx = numList(value, flag);
        step();
        break;
      case '--taps':
        axes.tapsPerSec = numList(value, flag);
        step();
        break;
      case '--lead':
        axes.lead = numList(value, flag);
        step();
        break;
      case '--pick':
        axes.pick = (value ?? '').split(',').map((v) => {
          if (v !== 'landing' && v !== 'apex') throw new Error(`--pick wants landing or apex`);
          return v;
        });
        step();
        break;
      case '--seconds':
        seconds = numList(value, flag)[0] ?? seconds;
        step();
        break;
      case '--seed':
        seed = numList(value, flag)[0] ?? seed;
        step();
        break;
      case '--seeds':
        seeds = numList(value, flag)[0] ?? seeds;
        step();
        break;
      case '--px-per-unit':
        pxPerUnit = numList(value, flag)[0] ?? pxPerUnit;
        step();
        break;
      default:
        if (flag) throw new Error(`Unknown flag ${flag} (try --help)`);
    }
  }

  const rows = sweep(axes, { seed, seconds, pxPerUnit, seeds });
  if (csv) {
    console.log('tapsPerSec,pick,lead,latencyMs,scatterPx,scatterRadii,catchRate,goldPerSec,vsIdle');
    for (const r of rows) {
      console.log(
        [
          r.thumb.tapsPerSec,
          r.thumb.pick,
          r.thumb.lead,
          r.thumb.latencyMs,
          r.thumb.scatterPx,
          r.scatterRadii.toFixed(4),
          r.catchRate.toFixed(4),
          r.goldPerSec.toFixed(0),
          r.vsIdle.toFixed(4),
        ].join(','),
      );
    }
    return;
  }

  console.log(`seeds ${seed}..${seed + seeds - 1}, ${seconds}s per cell, ${pxPerUnit}px per arc unit\n`);
  console.log(table(rows));
}

main(process.argv.slice(2));
