// One definition of "what can I buy right now", shared by the client's upgrade
// panel, the simulator's purchase policy, and the spend-depth validator. A
// shop row the player can see is the same row the sim counts.

import {
  ASC_NODES,
  ASC_NODE_IDS,
  SKILLS,
  SKILL_IDS,
} from './constants';
import { ascNodeCost, levelCost, skillCost } from './formulas';
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
  /** `null` when the track has no cap. */
  maxRank: number | null;
  /** Cost of the next rank; `Infinity` once capped. */
  cost: number;
  /** Hero level this unlocks at. 0 means available from the first minute. */
  unlockLevel: number;
  unlocked: boolean;
  atMax: boolean;
  /** Unlocked, not capped, and the currency is on hand. */
  affordable: boolean;
}

/**
 * Every purchase track, in a stable order: hero, then skills, then tree nodes.
 * Locked and capped rows are included — the caller decides what to show.
 */
export function purchaseOptions(state: GameState): PurchaseOption[] {
  const out: PurchaseOption[] = [];
  const level = state.hero.level;

  const heroCost = levelCost(level, state.realm);
  out.push({
    kind: 'hero',
    id: 'hero',
    name: 'Hero Level',
    currency: 'gold',
    rank: level,
    maxRank: null,
    cost: heroCost,
    unlockLevel: 0,
    unlocked: true,
    atMax: false,
    affordable: state.gold >= heroCost,
  });

  for (const id of SKILL_IDS) {
    const def = SKILLS[id];
    if (!def) continue;
    const rank = state.hero.skills[id] ?? 0;
    const unlocked = level >= def.unlockLevel;
    const atMax = rank >= def.maxLevel;
    const cost = atMax ? Infinity : skillCost(rank, state.realm);
    out.push({
      kind: 'skill',
      id,
      name: def.name,
      currency: 'gold',
      rank,
      maxRank: def.maxLevel,
      cost,
      unlockLevel: def.unlockLevel,
      unlocked,
      atMax,
      affordable: unlocked && !atMax && state.gold >= cost,
    });
  }

  for (const id of ASC_NODE_IDS) {
    const def = ASC_NODES[id];
    if (!def) continue;
    const rank = state.ascendancy.nodes[id] ?? 0;
    const atMax = rank >= def.maxRank;
    const cost = ascNodeCost(id, rank);
    out.push({
      kind: 'node',
      id,
      name: def.name,
      currency: 'ascendancy',
      rank,
      maxRank: def.maxRank,
      cost,
      unlockLevel: 0,
      unlocked: true,
      atMax,
      affordable: !atMax && state.ascendancy.banked >= cost,
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

/** Rows carrying a real price: unlocked and not capped, affordable or not. */
export function pricedCount(state: GameState): number {
  let n = 0;
  for (const o of purchaseOptions(state)) if (o.unlocked && !o.atMax) n += 1;
  return n;
}
