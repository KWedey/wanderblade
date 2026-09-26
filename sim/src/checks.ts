// Direct correctness experiments the live run cannot observe on its own:
// offline-vs-live equivalence, input replay, abandonment, the offline-time
// handoff after a mid-gap victory, and the earnings bonus staying out of DPS.

import {
  abandonBoss,
  advance,
  bossEtaSec,
  enterPortal,
  goldPerKill,
  heroDps,
  serialize,
  type GameState,
} from '@wanderblade/core';
import { CAP_RATE, SEC_PER_DAY, SEC_PER_HOUR, strikeTimes } from './policy';
import { clone } from './simulate';
import type { Check } from './types';

/** One long advance must equal many short ones, in the boss phase and on the Road. */
export function offlineMatchesLive(portalReadyState: GameState): Check {
  const offline = clone(portalReadyState);
  const live = clone(portalReadyState);
  enterPortal(offline);
  enterPortal(live);

  const span = 4 * SEC_PER_HOUR;
  advance(offline, span);
  for (let i = 0; i < span * 4; i++) advance(live, 0.25);

  const pass = serialize(live) === serialize(offline);
  return {
    pass,
    detail: pass
      ? `4h boss: one advance == ${span * 4} client ticks, byte-identical`
      : `boss HP diverged: offline ${offline.boss.hpRemaining} vs live ${live.boss.hpRemaining}`,
  };
}

/** The same strike timestamps must reproduce the same state, however split. */
export function replayIdentical(start: GameState): Check {
  const span = SEC_PER_HOUR;
  const strikes = strikeTimes(start.timeSec, span, CAP_RATE);

  const single = clone(start);
  advance(single, span, strikes);

  const split = clone(start);
  advance(split, 1, strikes);
  advance(split, 1234.5, strikes);
  advance(split, span - 1235.5, strikes);

  const pass = serialize(split) === serialize(single);
  return {
    pass,
    detail: pass
      ? `${strikes.length} strikes over 1h: 1-way == 3-way split, byte-identical`
      : 'split advance diverged from the single advance',
  };
}

/** Abandoning must roll back boss damage only, and bank nothing. */
export function abandonClean(portalReadyState: GameState): Check {
  const s = clone(portalReadyState);
  const before = {
    gold: s.gold,
    pending: s.ascendancy.pending,
    banked: s.ascendancy.banked,
    level: s.hero.level,
    zone: s.zone,
    weapon: s.gear.weapon?.power ?? 0,
  };
  if (!enterPortal(s).entered) return { pass: false, detail: 'could not enter the portal' };
  // A quarter of the predicted fight: enough damage to be worth abandoning,
  // never enough to finish it.
  const eta = bossEtaSec(s, 0);
  advance(s, Number.isFinite(eta) ? eta / 4 : 3600);
  const damaged = s.boss.hpRemaining < s.boss.hpMax;
  abandonBoss(s);

  const problems: string[] = [];
  if (!damaged) problems.push('no damage was dealt to abandon');
  if (s.phase !== 'road') problems.push('did not return to the Road');
  if (s.gold !== before.gold) problems.push('gold changed');
  if (s.ascendancy.pending !== before.pending) problems.push('pending changed');
  if (s.ascendancy.banked !== before.banked) problems.push('banked changed');
  if (s.hero.level !== before.level) problems.push('hero level changed');
  if (s.zone !== before.zone) problems.push('road position changed');
  if ((s.gear.weapon?.power ?? 0) !== before.weapon) problems.push('gear changed');
  if (s.lifetime.ascensions !== 0) problems.push('an ascension fired');

  enterPortal(s);
  if (s.boss.hpRemaining !== s.boss.hpMax) problems.push('guardian HP did not reset to full');

  return {
    pass: problems.length === 0,
    detail: problems.length === 0 ? 'road build intact, boss HP restored, nothing banked' : problems.join('; '),
  };
}

/** A victory mid-gap must spend the leftover elapsed time on the next Road. */
export function remainingTimeCarried(portalReadyState: GameState): Check {
  const s = clone(portalReadyState);
  if (!enterPortal(s).entered) return { pass: false, detail: 'could not enter the portal' };

  const events = advance(s, 14 * SEC_PER_DAY);
  const ascend = events.find((e) => e.type === 'ascend');
  if (!ascend) return { pass: false, detail: 'the guardian did not fall inside 14 days' };

  const after = events.filter((e) => e.type === 'kill' && e.timeSec > ascend.timeSec);
  const wrongRealm = after.filter((e) => e.type === 'kill' && e.realm !== s.realm).length;
  const pass = after.length > 0 && wrongRealm === 0 && s.gold > 0;
  return {
    pass,
    detail: pass
      ? `victory at ${ascend.timeSec.toFixed(0)}s, then ${after.length} realm-${s.realm} kills in the same advance`
      : `${after.length} post-victory kills, ${wrongRealm} in the wrong realm`,
  };
}

/** The earnings bonus must move gold and leave every combat number alone. */
export function earningsBonusIsolated(state: GameState): Check {
  const withBonus = clone(state);
  const without = clone(state);
  withBonus.ascendancy.victories = without.ascendancy.victories + 5;

  const dpsSame = heroDps(withBonus) === heroDps(without);
  const goldUp = goldPerKill(withBonus) > goldPerKill(without);
  return {
    pass: dpsSame && goldUp,
    detail: dpsSame
      ? `+5 victories: gold/kill ${goldPerKill(without).toFixed(2)} → ${goldPerKill(withBonus).toFixed(2)}, DPS unchanged`
      : 'the earnings bonus moved DPS',
  };
}
