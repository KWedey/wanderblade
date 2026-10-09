// The deterministic purchase policy, shared by every player policy.
//
// Greedy on core's own ΔDPS-per-gold ranking, then the same over banked
// Ascendancy. The ranking, the panel's "buy this next" mark and the spend
// validators all read one number; the purchases execute through the engine.

import {
  bestBuy,
  buyAscendancyNode,
  buyHeroLevel,
  buySkill,
  type GameState,
} from '@wanderblade/core';

/** Run the greedy gold loop. Returns purchases made. */
export function botBuyGold(state: GameState): number {
  let purchases = 0;
  while (Number.isFinite(state.gold)) {
    const pick = bestBuy(state, 'gold');
    if (!pick) break;
    const ok = pick.kind === 'hero' ? buyHeroLevel(state) : buySkill(state, pick.id);
    if (!ok) break;
    purchases += 1;
  }
  return purchases;
}

/** Run the greedy Ascendancy-tree loop. Returns purchases made. */
export function botBuyTree(state: GameState): number {
  let purchases = 0;
  while (Number.isFinite(state.ascendancy.banked)) {
    const pick = bestBuy(state, 'ascendancy');
    if (!pick) break;
    if (!buyAscendancyNode(state, pick.id)) break;
    purchases += 1;
  }
  return purchases;
}

/** A full bot touch. Purchases are refused during a boss attempt by the engine. */
export function botTouch(state: GameState): { gold: number; tree: number } {
  return { gold: botBuyGold(state), tree: botBuyTree(state) };
}
