// Report and CSV rendering. Presentation only — no measurement happens here.

import { DEFAULT_PX_PER_UNIT, runThumb, warmState, type Thumb } from './thumb';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fmtTime } from './validators';
import type { RealmRecord, SeedResult, ValidatorResult } from './types';

function num(x: number): string {
  if (!Number.isFinite(x)) return '∞';
  if (Math.abs(x) >= 1e6) return x.toExponential(2);
  if (Math.abs(x) >= 100) return x.toFixed(0);
  return x.toFixed(2);
}

function verdict(v: ValidatorResult): string {
  return v.skipped ? 'SKIP' : v.pass ? 'PASS' : 'FAIL';
}

function mark(v: ValidatorResult): string {
  return `  ${verdict(v)}  ${v.id}  ${v.name}\n          ${v.detail}`;
}

export function formatSeedReport(r: SeedResult): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(`── seed ${r.seed} ${'─'.repeat(52)}`);
  lines.push(
    `   ${r.config.days}d · ${r.config.sessionsPerDay}×${r.config.sessionMin}min sessions · ` +
      `${r.victories} victories · realm ${r.finalRealm} · ${r.totalKills.toLocaleString()} kills`,
  );

  lines.push('');
  lines.push(
    '   realm  road      portalReady  entered   victory   boss      active    eta@entry  ' +
      'gear@entry  goldPeak  pending@win  banked  earnMult  treeBuys  abandons',
  );
  const since = (sec: number | null, x: RealmRecord): string =>
    fmtTime(sec === null ? null : sec - x.startSec);
  const opt = (v: number | null): string => (v === null ? '—' : num(v));
  for (const x of r.realms) {
    lines.push(
      `   ${String(x.realm).padEnd(6)} ${fmtTime(x.roadSec).padEnd(9)} ` +
        `${since(x.portalReadySec, x).padEnd(12)} ` +
        `${since(x.portalEnterSec, x).padEnd(9)} ` +
        `${since(x.victorySec, x).padEnd(9)} ` +
        `${fmtTime(x.bossSec).padEnd(9)} ` +
        `${fmtTime(x.activeSec).padEnd(9)} ` +
        `${fmtTime(x.bossEtaAtEntrySec).padEnd(10)} ` +
        `${num(x.gearPowerAtEntry).padEnd(11)} ` +
        `${num(x.goldPeak).padEnd(9)} ` +
        `${opt(x.pendingAtVictory).padEnd(12)} ` +
        `${opt(x.bankedAfter).padEnd(7)} ` +
        `${opt(x.earningsMultAfter).padEnd(9)} ` +
        `${String(x.treePurchasesTotal).padEnd(9)} ` +
        `${x.abandons}`,
    );
  }

  lines.push('');
  lines.push('   correctness');
  for (const v of r.correctness) lines.push(mark(v));
  lines.push('');
  lines.push('   pacing');
  for (const v of r.pacing) lines.push(mark(v));

  if (r.roadWindowUplift.length > 0) {
    const rs = r.roadWindowUplift.map((u) => u.ratio).filter((x) => Number.isFinite(x));
    if (rs.length > 0) {
      lines.push('');
      lines.push(
        `   context: the same 20-min window with road progression left in runs ` +
          `${Math.min(...rs).toFixed(2)}–${Math.max(...rs).toFixed(2)}x — active play also ` +
          `reaches richer zones, which P1 deliberately holds constant`,
      );
    }
  }

  const w = r.witnessed;
  if (w !== null && w.beats.some((b) => b.total > 0)) {
    const cells = w.beats
      .filter((b) => b.total > 0)
      .map((b) => `${b.name} ${((100 * b.inSession) / b.total).toFixed(0)}% (${b.inSession}/${b.total})`);
    lines.push('');
    lines.push(`   witnessed beats: how often a milestone happens while the player is there`);
    lines.push(`     ${cells.join('   ')}`);
    lines.push(
      `     chance alone would be ${(100 * w.baseline).toFixed(1)}% — a session is that share of the ` +
        `day. Reported, never banded (docs/DECISIONS.md #47).`,
    );
  }

  const sweep = r.permanentUplift?.sweep ?? [];
  if (sweep.length > 0) {
    const cell = (h: (typeof sweep)[number]): string =>
      h.ratio === null ? `${fmtTime(h.sec)} —` : `${fmtTime(h.sec)} ${h.ratio.toFixed(2)}x`;
    const rows: string[] = [];
    for (let i = 0; i < sweep.length; i += 5) {
      rows.push(sweep.slice(i, i + 5).map(cell).join('   '));
    }
    lines.push('');
    lines.push(`   horizon sweep: active/idle Ascendancy per checkpoint (reported, never banded)`);
    for (const row of rows) lines.push(`     ${row}`);
    const blocked = sweep.find((h) => h.blocked !== null);
    if (blocked) {
      const why =
        blocked.blocked === 'content-end'
          ? `past content end — a run stopped at realm ${r.permanentUplift?.contentEndRealm} ` +
            `at ${fmtTime(r.permanentUplift?.contentEndSec ?? null)}, so a later ratio would ` +
            `divide a frozen total by a growing one`
          : `past the run length — extend --days to measure them`;
      lines.push(`     — = not measurable: ${why}`);
    }
  }

  if (r.frontierRealm !== null) {
    const when = r.frontierSec === null ? '' : ` at ${fmtTime(r.frontierSec)}`;
    lines.push('');
    lines.push(
      `   frontier: the run ended at realm ${r.frontierRealm}${when}, where guardian HP overflows ` +
        `to Infinity and the portal refuses to open (docs/DECISIONS.md #34)`,
    );
    lines.push(
      `             this is content end, not a stall — every later horizon divides a ` +
        `frozen total by a growing one, so no ratio past it measures pacing (#48)`,
    );
  }

  if (r.abandonProbe) {
    lines.push('');
    lines.push(
      `   abandon probe: ${fmtTime(r.abandonProbe.investedSec)} committed then abandoned ` +
        `forfeits ${fmtTime(r.abandonProbe.lostBossSec)} of guardian damage; the same span ` +
        `on the Road earns ${num(r.abandonProbe.roadGoldGained)} gold and cuts ` +
        `${fmtTime(Math.max(0, r.abandonProbe.etaImprovement))} off the next attempt`,
    );
  }
  return lines.join('\n');
}

export function formatSummary(results: SeedResult[]): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('═'.repeat(72));
  lines.push('SUMMARY');
  lines.push('');

  const ids = new Map<string, { name: string; pass: number; total: number; fails: string[] }>();
  const skipped = new Map<string, string>();
  for (const r of results) {
    for (const v of [...r.correctness, ...r.pacing]) {
      if (v.skipped) {
        skipped.set(v.id, v.name);
        continue;
      }
      const row = ids.get(v.id) ?? { name: v.name, pass: 0, total: 0, fails: [] };
      row.total += 1;
      if (v.pass) row.pass += 1;
      else row.fails.push(`seed ${r.seed}: ${v.detail}`);
      ids.set(v.id, row);
    }
  }

  let allPass = true;
  for (const [id, row] of ids) {
    const pass = row.pass === row.total;
    if (!pass) allPass = false;
    lines.push(`  ${pass ? 'PASS' : 'FAIL'}  ${id}  ${row.name}  (${row.pass}/${row.total} seeds)`);
    for (const f of row.fails) lines.push(`          ${f}`);
  }
  for (const [id, name] of skipped) lines.push(`  SKIP  ${id}  ${name}  (not measured under --quick)`);

  const skipNote = skipped.size === 0 ? '' : `; ${skipped.size} skipped under --quick`;
  lines.push('');
  lines.push(
    allPass
      ? `ALL PASS — ${ids.size} validators × ${results.length} seeds${skipNote}`
      : `FAIL — ${[...ids.values()].filter((r) => r.pass < r.total).length} of ${ids.size} ` +
          `measured validators failed on at least one seed${skipNote}`,
  );
  lines.push('');
  lines.push('The harness always exits 0; the verdict is the line above.');
  return lines.join('\n');
}

/** Writes the sample timeline and the realm table; returns both paths. */
export function writeCsv(r: SeedResult, dir: string): string[] {
  mkdirSync(dir, { recursive: true });
  const samplesPath = join(dir, `run-${r.seed}.csv`);
  const header =
    'timeSec,phase,realm,zone,gold,gearPower,dps,heroLevel,pending,banked,bossHpFrac,earningsMult';
  const rows = r.samples.map((s) =>
    [
      s.timeSec.toFixed(1),
      s.phase,
      s.realm,
      s.zone,
      s.gold.toExponential(4),
      s.gearPower.toExponential(4),
      s.dps.toExponential(4),
      s.heroLevel,
      s.pending.toFixed(3),
      s.banked.toFixed(3),
      s.bossHpFrac.toFixed(5),
      s.earningsMult.toFixed(4),
    ].join(','),
  );
  writeFileSync(samplesPath, [header, ...rows].join('\n') + '\n', 'utf8');

  const realmsPath = join(dir, `realms-${r.seed}.csv`);
  writeFileSync(realmsPath, realmsCsv(r.realms), 'utf8');
  return [samplesPath, realmsPath];
}

export const REALM_CSV_COLUMNS = [
  'realm',
  'startSec',
  'portalReadySec',
  'portalEnterSec',
  'victorySec',
  'roadSec',
  'bossSec',
  'activeSec',
  'bossEtaAtEntrySec',
  'bossActiveEtaAtEntrySec',
  'gearPowerAtEntry',
  'goldPeak',
  'pendingAtVictory',
  'bankedAfter',
  'earningsMultAfter',
  'treePurchasesTotal',
  'abandons',
] as const satisfies readonly (keyof RealmRecord)[];

export function realmsCsv(realms: RealmRecord[]): string {
  const cell = (v: number | null): string => (v === null ? '' : String(v));
  const rows = realms.map((x) => REALM_CSV_COLUMNS.map((k) => cell(x[k])).join(','));
  return [REALM_CSV_COLUMNS.join(','), ...rows].join('\n') + '\n';
}

/**
 * The active layer's skill metric, printed and never banded.
 *
 * Catch *rate* answers "is active play faster". It cannot answer "is active
 * play skilful", because in a field this dense a tap that misses its coin
 * lands on a neighbour — under the shipped circular window **every** catch at
 * human latency is a neighbour (`docs/DECISIONS.md` #43). `aimed coin` is the
 * share that took the coin the player actually went for, and it is the number
 * that separates the two questions. Reported so it stops living only inside an
 * ad-hoc sweep; no PASS/FAIL, nothing here can go red.
 */
export function formatThumb(seed: number): string {
  const warm = warmState(seed);
  const opts = { seed, seconds: 20, pxPerUnit: DEFAULT_PX_PER_UNIT, seeds: 1 };
  const base = { scatterPx: 0, tapsPerSec: 5, lead: 0 } as const;
  const rows: [string, Thumb][] = [
    ['  0 ms  landing', { ...base, latencyMs: 0, pick: 'landing' }],
    ['250 ms  landing', { ...base, latencyMs: 250, pick: 'landing' }],
    ['250 ms  apex   ', { ...base, latencyMs: 250, pick: 'apex' }],
    ['250 ms  landing, sloppy aim', { ...base, latencyMs: 250, scatterPx: 12, pick: 'landing' }],
  ];
  const out: string[] = [
    '',
    'ACTIVE THUMB — reported, not a validator',
    '',
    '  latency  pick                          catch rate   aimed coin',
  ];
  for (const [label, thumb] of rows) {
    const r = runThumb(thumb, opts, warm);
    out.push(
      `  ${label.padEnd(30)}${r.catchRate.toFixed(2).padStart(8)}` +
        `${(r.intendedRate * 100).toFixed(0).padStart(12)}%`,
    );
  }
  out.push('');
  out.push(
    '  "aimed coin" is the share of catches that took the coin the player went',
    '  for. A high catch rate beside a low aimed-coin share means active play is',
    '  faster without being skilful — see docs/DECISIONS.md #43 and #45.',
  );
  return out.join('\n');
}
