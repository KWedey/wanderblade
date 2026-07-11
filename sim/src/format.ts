// Console tables + CSV output for the sim harness. Plain ASCII, no deps.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { SeedResult, ValidatorResult } from './types';
import { VALIDATOR_NAMES } from './validators';

const SEC_PER_DAY = 86_400;
const SEC_PER_HOUR = 3_600;

type Align = 'l' | 'r';

/** Render a simple fixed-width table with a header rule. */
export function table(headers: string[], rows: string[][], align?: Align[]): string {
  const cols = headers.length;
  const widths = headers.map((h, i) => {
    let w = h.length;
    for (const row of rows) {
      const cell = row[i] ?? '';
      if (cell.length > w) w = cell.length;
    }
    return w;
  });
  const pad = (s: string, i: number): string => {
    const w = widths[i] ?? 0;
    const a = align?.[i] ?? 'l';
    return a === 'r' ? s.padStart(w) : s.padEnd(w);
  };
  const line = (cells: string[]): string =>
    cells.map((c, i) => pad(c, i)).join('  ').replace(/\s+$/, '');
  const rule = widths.map((w) => '-'.repeat(w)).join('  ');
  const out: string[] = [];
  out.push(line(headers));
  out.push(rule);
  for (const row of rows) {
    const cells: string[] = [];
    for (let i = 0; i < cols; i++) cells.push(row[i] ?? '');
    out.push(line(cells));
  }
  return out.join('\n');
}

function fmtGold(g: number): string {
  if (!Number.isFinite(g)) return 'Inf'; // endless-tail numeric overflow
  if (g < 1_000) return g.toFixed(0);
  if (g < 1_000_000) return `${(g / 1_000).toFixed(1)}k`;
  if (g < 1e9) return `${(g / 1e6).toFixed(1)}M`;
  if (g < 1e12) return `${(g / 1e9).toFixed(1)}B`;
  return g.toExponential(2);
}

function fmtReadiness(r: number): string {
  if (!Number.isFinite(r)) return '-'; // overflow tail: dps/bossHp is Inf/Inf
  return r >= 1 ? 'Ready' : r.toFixed(2);
}

function fmtHours(sec: number): string {
  return `${(sec / SEC_PER_HOUR).toFixed(1)}h`;
}

function fmtTime(sec: number | null): string {
  if (sec === null) return 'never';
  if (sec < 90) return `${sec.toFixed(1)}s`;
  if (sec < SEC_PER_HOUR) return `${(sec / 60).toFixed(1)}m`;
  if (sec < SEC_PER_DAY) return `${(sec / SEC_PER_HOUR).toFixed(2)}h`;
  return `${(sec / SEC_PER_DAY).toFixed(2)}d`;
}

/** Full per-seed report: headline, gate walls, check-in timeline, validators. */
export function formatSeedReport(r: SeedResult): string {
  const out: string[] = [];
  out.push('');
  out.push(`=== Seed ${r.seed} — ${r.config.days}d, ${r.config.checkinsPerDay} check-ins/day ===`);

  // Headline milestones.
  out.push('');
  out.push(
    [
      `first buy: ${fmtTime(r.firstPurchaseSec)}`,
      `first boss: ${fmtTime(r.firstBossSec)}`,
      `final: region ${r.finalRegion} zone ${r.finalZone}`,
      `leagues: ${r.finalLeagues.toFixed(1)}`,
      `kills: ${r.totalKills.toLocaleString('en-US')}`,
      r.worldsEdgeReached ? "World's Edge reached" : '',
    ]
      .filter(Boolean)
      .join('  |  '),
  );

  // Gate walls.
  if (r.gates.length > 0) {
    out.push('');
    out.push('Gate walls (region boss gates):');
    const rows = r.gates.map((g) => [
      `R${g.region}`,
      `z${g.zone}`,
      fmtTime(g.formSec),
      g.crossed ? fmtTime(g.crossSec) : 'not crossed',
      fmtHours(g.parkedSec) + (g.crossed ? '' : '+'),
    ]);
    out.push(
      table(
        ['region', 'gateZone', 'reached', 'crossed', 'parked'],
        rows,
        ['l', 'l', 'r', 'r', 'r'],
      ),
    );
  }

  // Check-in timeline (purchases per check-in).
  out.push('');
  out.push('Check-in timeline:');
  const rows = r.checkins.map((c) => [
    String(c.index),
    fmtHours(c.timeSec),
    `d${c.day}`,
    String(c.arrivalRegion),
    String(c.arrivalZone),
    fmtGold(c.arrivalGold),
    String(c.purchases),
    String(c.heroLevel),
    fmtReadiness(c.readiness),
    c.eightHourProbePurchases === null ? '-' : String(c.eightHourProbePurchases),
  ]);
  out.push(
    table(
      ['#', 't', 'day', 'reg', 'zone', 'gold@in', 'buys', 'lvl', 'rdy', '8h?'],
      rows,
      ['r', 'r', 'l', 'r', 'r', 'r', 'r', 'r', 'r', 'r'],
    ),
  );

  // Per-seed validator results.
  out.push('');
  out.push('Validators:');
  const vrows = r.validators.map((v) => [
    String(v.id),
    v.name,
    v.pass ? (v.warn ? 'PASS*' : 'PASS') : 'FAIL',
    v.detail,
  ]);
  out.push(table(['#', 'target', 'result', 'detail'], vrows, ['r', 'l', 'l', 'l']));

  return out.join('\n');
}

/** Aggregate PASS/FAIL matrix across all seeds. */
export function formatSummary(results: SeedResult[]): string {
  const out: string[] = [];
  out.push('');
  out.push('==================== M0 PACING SUMMARY ====================');

  const headers = ['#', 'target', ...results.map((r) => `seed ${r.seed}`), 'aggregate'];
  const align: Align[] = ['r', 'l', ...results.map((): Align => 'l'), 'l'];

  const rows: string[][] = [];
  const aggregatePass: boolean[] = [];
  for (let i = 0; i < VALIDATOR_NAMES.length; i++) {
    const name = VALIDATOR_NAMES[i] ?? '';
    const cells: string[] = [String(i + 1), name];
    let allPass = true;
    for (const r of results) {
      const v = r.validators[i] as ValidatorResult | undefined;
      if (!v) {
        cells.push('?');
        allPass = false;
        continue;
      }
      cells.push(v.pass ? (v.warn ? 'PASS*' : 'PASS') : 'FAIL');
      if (!v.pass) allPass = false;
    }
    aggregatePass.push(allPass);
    cells.push(allPass ? 'PASS' : 'FAIL');
    rows.push(cells);
  }
  out.push(table(headers, rows, align));

  const overall = aggregatePass.every(Boolean);
  out.push('');
  out.push(`OVERALL M0 EXIT: ${overall ? 'PASS' : 'FAIL'}  (all targets, all seeds)`);
  out.push('  * = PASS with a soft warning (see per-seed detail)');
  out.push('===========================================================');
  return out.join('\n');
}

/** Write the per-check-in timeline for one seed to sim/out/run-<seed>.csv. */
export function writeCsv(r: SeedResult, outDir: string): string {
  mkdirSync(outDir, { recursive: true });
  const header = [
    'checkin_index',
    'time_sec',
    'time_hours',
    'day',
    'after_day1',
    'arrival_region',
    'arrival_zone',
    'arrival_gold',
    'leagues',
    'hero_level',
    'gear_power',
    'dps',
    'readiness',
    'purchases',
    'eight_hour_probe_purchases',
  ].join(',');

  const lines = r.checkins.map((c) =>
    [
      c.index,
      c.timeSec,
      (c.timeSec / SEC_PER_HOUR).toFixed(3),
      c.day,
      c.afterDay1 ? 1 : 0,
      c.arrivalRegion,
      c.arrivalZone,
      c.arrivalGold.toFixed(3),
      c.leagues.toFixed(1),
      c.heroLevel,
      c.gearPower.toFixed(3),
      c.dps.toFixed(3),
      c.readiness.toFixed(4),
      c.purchases,
      c.eightHourProbePurchases === null ? '' : c.eightHourProbePurchases,
    ].join(','),
  );

  const path = join(outDir, `run-${r.seed}.csv`);
  writeFileSync(path, header + '\n' + lines.join('\n') + '\n', 'utf8');
  return path;
}
