// Scarcity diagnostic: what the upgrade panel shows at every look of a mixed
// schedule, in the terms P8 bands (docs/DECISIONS.md #63). Reported, never
// tuned here — the numbers say where prices sit against income.

import {
  bossBand,
  bossEtaSec,
  enterPortal,
  initialState,
  purchaseOptions,
  type GameState,
} from '@wanderblade/core';
import { botTouch } from './bot';
import { CAP_RATE, runActive, runIdle, SEC_PER_DAY } from './policy';
import {
  isLean,
  SPEND_GRACE_SEC,
  SPEND_LEAN_MAX,
  SPEND_REACH_SEC,
  withinReach,
} from './probes';
import { goldPerSec, reachSec } from './simulate';

interface Look {
  timeSec: number;
  realm: number;
  zone: number;
  level: number;
  affordable: number;
  reachSec: number;
  wallet: number;
  minuteIncome: number;
  prices: string;
  ranks: string;
}

function flag(argv: string[], name: string, fallback: number): number {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const n = Number(argv[i + 1]);
  if (!Number.isFinite(n)) throw new Error(`Flag --${name} requires a numeric value`);
  return n;
}

function look(s: GameState, realmStart: number): Look | null {
  if (s.phase !== 'road' || s.timeSec - realmStart < SPEND_GRACE_SEC) return null;
  const rows = purchaseOptions(s).filter((o) => o.currency === 'gold' && o.unlocked);
  const income = goldPerSec(s);
  return {
    timeSec: s.timeSec,
    realm: s.realm,
    zone: s.zone,
    level: s.hero.level,
    affordable: rows.filter((o) => o.affordable).length,
    reachSec: reachSec(s),
    wallet: s.gold,
    minuteIncome: income * 60,
    prices: rows.map((o) => `${o.id}:${(o.cost / (income * 60)).toFixed(1)}m${o.affordable ? '*' : ''}`).join(' '),
    ranks: rows.map((o) => `${o.id[0]}${o.rank}`).join(' '),
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const days = flag(argv, 'days', 1);
  const seed = flag(argv, 'seed', 1);
  const sessionMin = flag(argv, 'session-min', 20);
  const perDay = flag(argv, 'sessions-per-day', 2);
  const state = initialState(seed);
  const looks: Look[] = [];
  let realmStart = 0;
  const onShop = (s: GameState, inSession: boolean): void => {
    if (!inSession) return;
    const l = look(s, realmStart);
    if (l) looks.push(l);
  };
  const enter = (): void => {
    if (state.phase !== 'road' || !state.portalReady) return;
    botTouch(state);
    if (bossEtaSec(state, 1) > bossBand(state.realm).maxSec) return;
    enterPortal(state);
  };
  const onEvents = (events: readonly { type: string; timeSec: number }[]): void => {
    for (const e of events) if (e.type === 'ascend') realmStart = e.timeSec;
  };
  const horizon = days * SEC_PER_DAY;
  const sessionSec = sessionMin * 60;
  const gapSec = SEC_PER_DAY / perDay - sessionSec;
  while (state.timeSec < horizon) {
    enter();
    runActive(state, sessionSec, CAP_RATE, { onShop, onEvents, onSlice: enter, onPurchases: () => {} });
    enter();
    runIdle(state, gapSec, { onShop, onEvents, onSlice: enter });
    botTouch(state);
  }

  const n = looks.length;
  const hist = new Map<number, number>();
  for (const l of looks) hist.set(l.affordable, (hist.get(l.affordable) ?? 0) + 1);
  const lean = looks.filter(isLean).length / n;
  const reach = looks.filter(withinReach).length / n;
  const out: string[] = [];
  out.push(`shop looks: ${n} over ${days}d, seed ${seed}, realm ${state.realm} reached`);
  out.push(`  lean (≤${SPEND_LEAN_MAX} affordable): ${(lean * 100).toFixed(1)}%   reach (≤${SPEND_REACH_SEC}s): ${(reach * 100).toFixed(1)}%`);
  out.push('  affordable histogram: ' + [...hist.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}:${((100 * v) / n).toFixed(1)}%`).join('  '));
  const byRealm = new Map<number, Look[]>();
  for (const l of looks) byRealm.set(l.realm, [...(byRealm.get(l.realm) ?? []), l]);
  out.push('  per realm: ' + [...byRealm.entries()].map(([r, ls]) => {
    const lf = ls.filter(isLean).length / ls.length;
    const rf = ls.filter(withinReach).length / ls.length;
    return `r${r} lean ${(lf * 100).toFixed(0)}% reach ${(rf * 100).toFixed(0)}% (${ls.length})`;
  }).join(' | '));
  out.push('  sample looks (prices in minutes of current income; wallet likewise):');
  const from = flag(argv, 'from', Math.floor(n / 2));
  for (let i = from; i < Math.min(n, from + 16); i++) {
    const l = looks[i]!;
    out.push(`    t=${(l.timeSec / 3600).toFixed(3)}h r${l.realm} z${l.zone} L${l.level} aff=${l.affordable} reach=${l.reachSec.toFixed(0)}s wallet=${(l.wallet / l.minuteIncome).toFixed(2)}m  ${l.prices}  [${l.ranks}]`);
  }
  process.stdout.write(out.join('\n') + '\n');
}

main();
