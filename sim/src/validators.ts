// The six M0-gating pacing validators (docs/ECONOMY.md "Pacing targets").
// Each returns a PASS/FAIL (plus an optional soft warning) with a human detail
// string. These are pure functions of a SeedResult's measurements.

import type { SeedResult, ValidatorResult } from './types';

const SEC_PER_DAY = 86_400;
const SEC_PER_HOUR = 3_600;

export function fmtTime(sec: number | null): string {
  if (sec === null) return 'never';
  if (sec < 90) return `${sec.toFixed(1)}s`;
  if (sec < SEC_PER_HOUR) return `${(sec / 60).toFixed(1)}m`;
  if (sec < SEC_PER_DAY) return `${(sec / SEC_PER_HOUR).toFixed(2)}h`;
  return `${(sec / SEC_PER_DAY).toFixed(2)}d`;
}

/** (1) First upgrade < 30 seconds of play. */
function v1(r: SeedResult): ValidatorResult {
  const t = r.firstPurchaseSec;
  const pass = t !== null && t < 30;
  return {
    id: 1,
    name: 'First upgrade < 30s',
    pass,
    warn: false,
    detail: `first purchase at ${fmtTime(t)}`,
  };
}

/** (2) First boss down 5-10 min (PASS ≤ 10m; soft-warn if < 5m). */
function v2(r: SeedResult): ValidatorResult {
  const t = r.firstBossSec;
  const pass = t !== null && t <= 10 * 60;
  const warn = pass && r.firstBossTooFast;
  const note = warn ? ' (soft-warn: < 5m, too fast)' : '';
  return {
    id: 2,
    name: 'First boss 5-10 min',
    pass,
    warn,
    detail: `first boss at ${fmtTime(t)}${note}`,
  };
}

/** (3) ≥ 90% of check-ins after day 1 afford ≥ 1 purchase. */
function v3(r: SeedResult): ValidatorResult {
  const after = r.checkins.filter((c) => c.afterDay1);
  const withBuy = after.filter((c) => c.purchases >= 1).length;
  const pct = after.length === 0 ? 0 : withBuy / after.length;
  const pass = after.length > 0 && pct >= 0.9;
  return {
    id: 3,
    name: 'Check-in value ≥90%',
    pass,
    warn: false,
    detail: `${(pct * 100).toFixed(1)}% (${withBuy}/${after.length}) afforded ≥1 buy`,
  };
}

/**
 * (4) 8h-return affords ≥ 3 purchases (median of probes), lower bound only.
 *
 * Intent: the "8h return → a few one-tap buys" target describes a HUMAN making a
 * handful of taps. The bot buys *everything* affordable, so its count measures
 * gold-richness, not human tapping — an upper bound on a greedy count penalises a
 * healthy gold-rich return, which is not a failure. So V4 is a lower bound only:
 * the median 8h return must afford at least 3 purchases, and at least one such
 * return must exist. (See docs/ECONOMY.md "Pacing targets" for the redefinition.)
 */
function v4(r: SeedResult): ValidatorResult {
  const m = r.eightHourMedian;
  const n = r.eightHourSamples.length;
  const pass = n > 0 && m >= 3;
  const min = n > 0 ? Math.min(...r.eightHourSamples) : 0;
  const max = n > 0 ? Math.max(...r.eightHourSamples) : 0;
  return {
    id: 4,
    name: '8h return ≥3 buys',
    pass,
    warn: false,
    detail: `median ${m} (range ${min}-${max}, n=${n})`,
  };
}

/**
 * (5) Soft-wall cadence: no gate reached before day 7 takes > 3 days to cross,
 * AND at least one gate in the first 7 days is a real wall (> 2h parked).
 */
function v5(r: SeedResult): ValidatorResult {
  const day7 = 7 * SEC_PER_DAY;
  const early = r.gates.filter((g) => g.formSec < day7);
  const parkedList = early
    .map((g) => `R${g.region}:${(g.parkedSec / SEC_PER_HOUR).toFixed(2)}h${g.crossed ? '' : '*'}`)
    .join(', ');

  const noOverlongCross = early.every((g) => g.crossed && g.parkedSec <= 3 * SEC_PER_DAY);
  const hasWall = early.some((g) => g.crossed && g.parkedSec > 2 * SEC_PER_HOUR);
  const pass = early.length > 0 && noOverlongCross && hasWall;

  let reason = '';
  if (early.length === 0) reason = 'no gate reached in 7d';
  else if (!noOverlongCross) reason = '; a gate took >3d (or never crossed *)';
  else if (!hasWall) reason = '; no >2h wall (walls too soft)';

  return {
    id: 5,
    name: 'Soft-wall cadence',
    pass,
    warn: false,
    detail: `parked [${parkedList || 'none'}]${reason}`,
  };
}

/** (6) No hard stall: trash kill time ≤ 60s throughout. */
function v6(r: SeedResult): ValidatorResult {
  const pass = r.maxTrashKillTime <= 60;
  return {
    id: 6,
    name: 'No hard stall ≤60s',
    pass,
    warn: false,
    detail: `max trash kill ${r.maxTrashKillTime.toFixed(2)}s @ zone ${r.maxTrashKillTimeZone} (${fmtTime(r.maxTrashKillTimeSec)})`,
  };
}

export function runValidators(r: SeedResult): ValidatorResult[] {
  return [v1(r), v2(r), v3(r), v4(r), v5(r), v6(r)];
}

export const VALIDATOR_NAMES: readonly string[] = [
  'First upgrade < 30s',
  'First boss 5-10 min',
  'Check-in value ≥90%',
  '8h return ≥3 buys',
  'Soft-wall cadence',
  'No hard stall ≤60s',
];
