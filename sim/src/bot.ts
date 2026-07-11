// The deterministic bot player (docs/ECONOMY.md "Bot policy").
//
// At each touch the bot repeatedly buys the affordable upgrade with the highest
// expected ΔDPS-per-gold among {hero level, each unlocked skill}, breaking ties
// by lowest cost, until nothing is affordable. Then, if parked at a gate with
// readiness ≥ 1.0 and no active cooldown, it challenges the boss.
//
// ΔDPS is computed analytically from the same ECONOMY formulas the engine uses,
// so ranking matches the real state exactly; the purchases themselves execute
// through the engine's buyHeroLevel / buySkill so state mutation is authoritative.

import {
  buyHeroLevel,
  buySkill,
  challengeBoss,
  gearPowerTotal,
  heroBaseDamage,
  levelCost,
  readiness,
  skillCost,
  skillMult,
  skillMultPerLevel,
  SKILL_IDS,
  SKILLS,
  type GameState,
} from '@wanderblade/core';
import type { Collector } from './collector';

interface Candidate {
  kind: 'hero' | 'skill';
  id: string | null;
  cost: number;
  ratio: number; // expected ΔDPS per gold
}

/** Best affordable upgrade, or null if nothing is affordable. */
function bestCandidate(state: GameState): Candidate | null {
  const level = state.hero.level;
  const base = heroBaseDamage(level);
  const gear = gearPowerTotal(state.gear);
  const mult = skillMult(state.hero.skills);
  const flat = base + gear; // (base + gear); currentDps = flat * mult

  const candidates: Candidate[] = [];

  // Hero level: ΔDPS = (base(level+1) - base(level)) * skillMult.
  {
    const cost = levelCost(level);
    if (Number.isFinite(cost) && cost <= state.gold) {
      const dDps = (heroBaseDamage(level + 1) - base) * mult;
      const ratio = dDps / cost;
      // Skip once damage overflows to Infinity (ΔDPS → NaN): a hero at level
      // ~4370 has base = 25·1.12^level = Infinity, so no finite improvement.
      if (Number.isFinite(ratio) && ratio > 0) {
        candidates.push({ kind: 'hero', id: null, cost, ratio });
      }
    }
  }

  // Each unlocked skill: buying rank sl→sl+1 scales skillMult by newF/oldF.
  for (const id of SKILL_IDS) {
    const def = SKILLS[id];
    if (!def || level < def.unlockLevel) continue;
    const sl = state.hero.skills[id] ?? 0;
    // A skill at its cap offers no further ΔDPS (buySkill would refuse). Skip it
    // cleanly so the greedy loop never picks an unbuyable candidate and stalls.
    if (sl >= def.maxLevel) continue;
    const cost = skillCost(sl);
    if (!Number.isFinite(cost) || cost > state.gold) continue;
    const oldF = 1 + skillMultPerLevel * sl;
    const newF = 1 + skillMultPerLevel * (sl + 1);
    const dDps = flat * mult * (newF / oldF - 1);
    const ratio = dDps / cost;
    if (Number.isFinite(ratio) && ratio > 0) {
      candidates.push({ kind: 'skill', id, cost, ratio });
    }
  }

  if (candidates.length === 0) return null;

  // Highest ΔDPS-per-gold; tie-break lowest cost. Candidate insertion order
  // (hero, then SKILL_IDS order) makes any remaining exact tie deterministic.
  let best = candidates[0] as Candidate;
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i] as Candidate;
    if (c.ratio > best.ratio || (c.ratio === best.ratio && c.cost < best.cost)) {
      best = c;
    }
  }
  return best;
}

/** Run the greedy buy loop. Returns the number of purchases made. */
export function botBuy(state: GameState, collector: Collector): number {
  let purchases = 0;
  // Guard the endless-scaling tail: once income overflows to Infinity, "gold ≥
  // cost" is always true and no purchase reduces the balance, so the loop would
  // never terminate. Past that ceiling there is nothing meaningful left to buy.
  while (Number.isFinite(state.gold)) {
    const pick = bestCandidate(state);
    if (!pick) break;
    const ok = pick.kind === 'hero' ? buyHeroLevel(state) : buySkill(state, pick.id as string);
    // bestCandidate only ever returns affordable, unlocked upgrades, so the buy
    // must succeed; guard defensively to avoid any infinite loop.
    if (!ok) break;
    collector.notePurchase(state.timeSec);
    purchases += 1;
  }
  return purchases;
}

/**
 * Challenge the gate boss if parked, ready (≥ 1.0), and off cooldown.
 * Emits events into the collector. Returns true on a win.
 */
export function botChallenge(state: GameState, collector: Collector): boolean {
  if (!state.gate.atGate) return false;
  if (state.timeSec < state.gate.cooldownUntilSec) return false;
  if (readiness(state) < 1.0) return false;
  const res = challengeBoss(state);
  collector.processEvents(res.events);
  return res.won;
}

/** A full bot touch: greedy buy loop, then one boss challenge. */
export function botTouch(state: GameState, collector: Collector): number {
  const purchases = botBuy(state, collector);
  botChallenge(state, collector);
  return purchases;
}
