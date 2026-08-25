// The PASS/FAIL contract. C-validators are the correctness list in
// docs/ECONOMY.md "Redesigned simulator contract"; P-validators are the pacing
// bands in docs/ACTIVE-PLAY.md. Both are pure functions of a SeedResult.

import type { SeedResult, Uplift, ValidatorResult } from './types';

const SEC_PER_HOUR = 3600;
const SEC_PER_DAY = 86_400;

export function fmtTime(sec: number | null): string {
  if (sec === null || !Number.isFinite(sec)) return 'never';
  if (sec < 90) return `${sec.toFixed(1)}s`;
  if (sec < SEC_PER_HOUR) return `${(sec / 60).toFixed(1)}m`;
  if (sec < SEC_PER_DAY) return `${(sec / SEC_PER_HOUR).toFixed(2)}h`;
  return `${(sec / SEC_PER_DAY).toFixed(2)}d`;
}

function ok(id: string, name: string, pass: boolean, detail: string): ValidatorResult {
  return { id, name, pass, detail };
}

function ratios(list: Uplift[]): number[] {
  return list.map((u) => u.ratio).filter((r) => Number.isFinite(r));
}

function range(xs: number[]): string {
  if (xs.length === 0) return 'no samples';
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return `${min.toFixed(2)}–${max.toFixed(2)} (mean ${mean.toFixed(2)}, n=${xs.length})`;
}

function inBand(xs: number[], lo: number, hi: number): boolean {
  return xs.length > 0 && xs.every((x) => x >= lo && x <= hi);
}

// --- Correctness ---------------------------------------------------------

export function runCorrectness(r: SeedResult): ValidatorResult[] {
  const out: ValidatorResult[] = [];
  const entered = r.realms.filter((x) => x.portalEnterSec !== null);
  const won = r.realms.filter((x) => x.victorySec !== null);

  out.push(
    ok(
      'C1',
      'No automatic portal entry, online or offline',
      r.correctnessLive.every((v) => !v.includes('no explicit action')),
      `${entered.length} entries, all explicit`,
    ),
  );
  out.push(
    ok(
      'C2',
      'No Road income during boss elapsed time',
      r.correctnessLive.every((v) => !v.includes('during boss elapsed time')),
      r.correctnessLive.filter((v) => v.includes('during boss')).join('; ') || 'gold, gear, pending, road, collection all frozen',
    ),
  );
  out.push(
    ok('C3', 'Offline boss HP equals live boss HP', r.offlineMatchesLive, r.offlineMatchesLiveDetail),
  );
  out.push(
    ok(
      'C4',
      'Identical timestamped inputs give identical results',
      r.replayIdentical,
      r.replayIdenticalDetail,
    ),
  );
  out.push(
    ok(
      'C5',
      'Abandonment resets boss progress only, never banks',
      r.abandonClean,
      r.abandonCleanDetail,
    ),
  );
  out.push(
    ok(
      'C6',
      'Victory banks, rewards, resets, unlocks exactly once',
      r.victories === won.length && won.every((x) => x.bankedAfter !== null),
      `${r.victories} victories, ${won.length} recorded ascensions`,
    ),
  );
  out.push(
    ok(
      'C7',
      'Remaining offline time advances the next realm Road',
      r.remainingTimeCarried,
      r.remainingTimeCarriedDetail,
    ),
  );
  out.push(
    ok(
      'C8',
      'Earnings bonus moves gold and never DPS',
      r.earningsBonusIsolated,
      r.earningsBonusIsolatedDetail,
    ),
  );
  out.push(
    ok(
      'C9',
      'No non-finite HP, DPS, currency, or multiplier',
      r.correctnessLive.every((v) => !v.includes('non-finite')),
      `${r.samples.length} samples clean`,
    ),
  );
  out.push(
    ok(
      'C10',
      'Guardian HP never regenerates',
      r.correctnessLive.every((v) => !v.includes('regenerated')),
      'monotonic across every attempt',
    ),
  );
  return out;
}

// --- Pacing --------------------------------------------------------------

export function runPacing(r: SeedResult): ValidatorResult[] {
  const out: ValidatorResult[] = [];

  const road = ratios(r.roadUplift);
  out.push(
    ok('P1', 'Road active vs idle gold, 20 min: 1.8–2.2x', inBand(road, 1.8, 2.2), range(road)),
  );

  const boss = ratios(r.bossUplift);
  out.push(
    ok('P2', 'Boss active vs zero-tap: 1.4–1.8x faster', inBand(boss, 1.4, 1.8), range(boss)),
  );

  const eight = r.eightHourBuys;
  out.push(
    ok(
      'P3',
      '8h idle return affords ≥1 upgrade',
      eight.length > 0 && eight.every((n) => n >= 1),
      `buys ${range(eight)}`,
    ),
  );

  const day = r.twentyFourHourZones;
  out.push(
    ok(
      'P4',
      '24h idle return advances ≥1 zone',
      day.length > 0 && day.every((n) => n >= 1),
      `zones ${range(day)}`,
    ),
  );

  const activeH = r.portalReachSec.active === null ? null : r.portalReachSec.active / SEC_PER_HOUR;
  const idleH = r.portalReachSec.idle === null ? null : r.portalReachSec.idle / SEC_PER_HOUR;
  out.push(
    ok(
      'P5',
      'Realm start → portal: 2–4h active, 8–16h idle',
      activeH !== null && idleH !== null && activeH >= 2 && activeH <= 4 && idleH >= 8 && idleH <= 16,
      `active ${activeH === null ? 'never' : activeH.toFixed(2) + 'h'}, idle ${idleH === null ? 'never' : idleH.toFixed(2) + 'h'}`,
    ),
  );

  // The band is in *active* minutes, so it is measured as the fight's length
  // at sustained momentum — the number the portal preview shows. Wall-clock
  // elapsed is longer for anyone who is not striking the whole time.
  const durations = r.realms
    .filter((x) => x.victorySec !== null && x.bossActiveEtaAtEntrySec !== null)
    .map((x) => x.bossActiveEtaAtEntrySec as number);
  const outOfBand = durations.filter((d) => d < 20 * 60 || d > 90 * 60);
  out.push(
    ok(
      'P6',
      'Portal boss duration, prepared build: 20–90 min active',
      durations.length > 0 && outOfBand.length === 0,
      durations.length === 0
        ? 'no completed attempt'
        : `${durations.length - outOfBand.length}/${durations.length} realms in band: ` +
          durations.map((d) => fmtTime(d)).join(', '),
    ),
  );

  const pv = r.promptVsOverfarm;
  out.push(
    ok(
      'P7',
      'Ascending promptly beats farming a ready realm 2x longer',
      pv !== null && pv.promptBanked > pv.overfarmBanked,
      pv === null
        ? 'not measured'
        : `prompt ${pv.promptBanked.toFixed(1)} vs overfarm ${pv.overfarmBanked.toFixed(1)} Ascendancy at ${fmtTime(pv.horizonSec)}`,
    ),
  );

  return out;
}
