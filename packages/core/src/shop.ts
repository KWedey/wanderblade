// One definition of "what can I buy right now", shared by the client's upgrade
// panel, the simulator's purchase policy, and the spend-depth validator. A
// shop row the player can see is the same row the sim counts.

import {
  ASC_NODES,
  ASC_NODE_IDS,
  SKILLS,
  SKILL_IDS,
} from './constants';
import {
  ascMultiplier,
  ascNodeCost,
  ascSpeedMultiplier,
  gearPowerTotal,
  heroBaseDamage,
  heroDps,
  levelCost,
  skillCost,
  skillMult,
  skillRankMult,
} from './formulas';
import type { GameState } from './types';

export type PurchaseKind = 'hero' | 'skill' | 'node';
export type PurchaseCurrency = 'gold' | 'ascendancy';

export interface PurchaseOption {
  kind: PurchaseKind;
  /** `'hero'` for the hero level, otherwise the skill or node id. */
  id: string;
  name: string;
  currency: PurchaseCurrency;
  rank: number;
  /** Cost of the next rank. Every track is uncapped. */
  cost: number;
  /** Hero level this unlocks at. 0 means available from the first minute. */
  unlockLevel: number;
  unlocked: boolean;
  /** Exactly what the engine will accept right now — the buy call returns true. */
  affordable: boolean;
  /**
   * DPS this rank adds, per unit of its currency. The one ranking of "what is
   * worth buying": the panel marks it, the bot spends on it, and the spend
   * validators count it. Zero for a row that buys no damage.
   */
  valuePerCost: number;
}

/** A ratio only counts when both sides are real and positive. */
function ratio(gain: number, cost: number): number {
  const r = gain / cost;
  return Number.isFinite(r) && r > 0 ? r : 0;
}

/**
 * DPS one more rank of a tree node is worth. Ranks compound, so a rank buys
 * `perRank` of what the node already multiplies, not of the un-noded base.
 */
function nodeGain(state: GameState, id: string, rank: number): number {
  const def = ASC_NODES[id];
  if (!def) return 0;
  const asc = state.ascendancy;
  const mult = skillMult(state.hero.skills);
  if (def.effect === 'damage') {
    return heroBaseDamage(state.hero.level, state.realm) * ascMultiplier(asc, 'damage') * def.perRank * mult;
  }
  if (def.effect === 'gearPower') {
    return gearPowerTotal(state.gear) * ascMultiplier(asc, 'gearPower') * def.perRank * mult;
  }
  // Speed is asymptotic: its marginal worth is how far the next rank actually
  // moves the multiplier, never a flat perRank.
  const before = ascSpeedMultiplier(asc);
  const after = ascSpeedMultiplier({ ...asc, nodes: { ...asc.nodes, [id]: rank + 1 } });
  return heroDps(state) * (after / before - 1);
}

/**
 * Every purchase track, in a stable order: hero, then skills, then tree nodes.
 * Locked rows are included — the caller decides what to show.
 */
export function purchaseOptions(state: GameState): PurchaseOption[] {
  const out: PurchaseOption[] = [];
  const level = state.hero.level;
  // Every purchase is refused for the duration of a guardian attempt, so a row
  // the wallet could cover is still not one the engine will take.
  const locked = state.phase === 'boss';

  // The tree multiplies damage and gear by different factors, so the flat term
  // has to be built the way heroDps builds it, or two candidates get ranked on
  // different scales once the edge and heft ranks diverge.
  const base = heroBaseDamage(level, state.realm);
  const mult = skillMult(state.hero.skills);
  const ascDmg = ascMultiplier(state.ascendancy, 'damage');
  const ascGear = ascMultiplier(state.ascendancy, 'gearPower');
  const flat = base * ascDmg + gearPowerTotal(state.gear) * ascGear;

  const heroCost = levelCost(level, state.realm);
  out.push({
    kind: 'hero',
    id: 'hero',
    name: 'Hero Level',
    currency: 'gold',
    rank: level,
    cost: heroCost,
    unlockLevel: 0,
    unlocked: true,
    affordable: !locked && state.gold >= heroCost,
    valuePerCost: ratio(
      (heroBaseDamage(level + 1, state.realm) - base) * ascDmg * mult,
      heroCost,
    ),
  });

  for (const id of SKILL_IDS) {
    const def = SKILLS[id];
    if (!def) continue;
    const rank = state.hero.skills[id] ?? 0;
    const unlocked = level >= def.unlockLevel;
    const cost = skillCost(def.id, rank, state.realm);
    out.push({
      kind: 'skill',
      id,
      name: def.name,
      currency: 'gold',
      rank,
      cost,
      unlockLevel: def.unlockLevel,
      unlocked,
      affordable: !locked && unlocked && state.gold >= cost,
      valuePerCost: unlocked
        ? ratio(flat * mult * (skillRankMult(id, rank + 1) / skillRankMult(id, rank) - 1), cost)
        : 0,
    });
  }

  for (const id of ASC_NODE_IDS) {
    const def = ASC_NODES[id];
    if (!def) continue;
    const rank = state.ascendancy.nodes[id] ?? 0;
    const cost = ascNodeCost(id, rank);
    out.push({
      kind: 'node',
      id,
      name: def.name,
      currency: 'ascendancy',
      rank,
      cost,
      unlockLevel: 0,
      unlocked: true,
      affordable: !locked && state.ascendancy.banked >= cost,
      valuePerCost: ratio(nodeGain(state, id, rank), cost),
    });
  }

  return out;
}

/** Rows the player can act on this instant — the spend-depth measure. */
export function affordableCount(state: GameState): number {
  let n = 0;
  for (const o of purchaseOptions(state)) if (o.affordable) n += 1;
  return n;
}

/** Rows carrying a real price: unlocked, affordable or not. */
export function pricedCount(state: GameState): number {
  let n = 0;
  for (const o of purchaseOptions(state)) if (o.unlocked) n += 1;
  return n;
}

/**
 * The row worth buying next in `currency`, or null when nothing is affordable.
 * Ties go to the cheaper row, so the same state always names the same buy.
 */
export function bestBuy(state: GameState, currency: PurchaseCurrency): PurchaseOption | null {
  let best: PurchaseOption | null = null;
  for (const o of purchaseOptions(state)) {
    if (o.currency !== currency || !o.affordable || o.valuePerCost <= 0) continue;
    if (
      best === null ||
      o.valuePerCost > best.valuePerCost ||
      (o.valuePerCost === best.valuePerCost && o.cost < best.cost)
    ) {
      best = o;
    }
  }
  return best;
}
