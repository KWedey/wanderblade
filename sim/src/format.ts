// Report and CSV rendering. Presentation only — no measurement happens here.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fmtTime } from './validators';
import type { SeedResult, ValidatorResult } from './types';

function num(x: number): string {
  if (!Number.isFinite(x)) return '∞';
  if (Math.abs(x) >= 1e6) return x.toExponential(2);
  if (Math.abs(x) >= 100) return x.toFixed(0);
  return x.toFixed(2);
}

function mark(v: ValidatorResult): string {
  return `  ${v.pass ? 'PASS' : 'FAIL'}  ${v.id}  ${v.name}\n          ${v.detail}`;
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
  lines.push('   realm  road      portalReady  entered   victory   boss      eta@entry  banked');
  for (const x of r.realms) {
    lines.push(
      `   ${String(x.realm).padEnd(6)} ${fmtTime(x.roadSec).padEnd(9)} ` +
        `${fmtTime(x.portalReadySec === null ? null : x.portalReadySec - x.startSec).padEnd(12)} ` +
        `${fmtTime(x.portalEnterSec === null ? null : x.portalEnterSec - x.startSec).padEnd(9)} ` +
        `${fmtTime(x.victorySec === null ? null : x.victorySec - x.startSec).padEnd(9)} ` +
        `${fmtTime(x.bossSec).padEnd(9)} ` +
        `${fmtTime(x.bossEtaAtEntrySec).padEnd(10)} ` +
        `${x.bankedAfter === null ? '—' : num(x.bankedAfter)}`,
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
  for (const r of results) {
    for (const v of [...r.correctness, ...r.pacing]) {
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

  lines.push('');
  lines.push(
    allPass
      ? `ALL PASS — ${ids.size} validators × ${results.length} seeds`
      : `FAIL — ${[...ids.values()].filter((r) => r.pass < r.total).length} of ${ids.size} validators failed on at least one seed`,
  );
  lines.push('');
  lines.push('The harness always exits 0; the verdict is the line above.');
  return lines.join('\n');
}

export function writeCsv(r: SeedResult, dir: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `run-${r.seed}.csv`);
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
  writeFileSync(path, [header, ...rows].join('\n') + '\n', 'utf8');
  return path;
}
