// The deterministic purchase policy, shared by every player policy.
//
// Greedy on ΔDPS-per-gold, then the same over banked Ascendancy. ΔDPS is
// derived from the engine's own formulas so the ranking matches real state;
// the purchases themselves still execute through the engine.

import {
  ascNodeCost,
  ascSpeedMultiplier,
  ASC_NODES,
  ASC_NODE_IDS,
  buyAscendancyNode,
  buyHeroLevel,
  buySkill,
  gearPowerTotal,
  heroBaseDamage,
  heroDps,
  levelCost,
  skillCost,
  skillMult,
  skillRankMult,
  SKILLS,
  SKILL_IDS,
  type GameState,
} from '@wanderblade/core';

interface Candidate {
  kind: 'hero' | 'skill' | 'node';
  id: string | null;
  cost: number;
  ratio: number;
}

function pickBest(candidates: Candidate[]): Candidate | null {
  if (candidates.length === 0) return null;
  let best = candidates[0] as Candidate;
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i] as Candidate;
    if (c.ratio > best.ratio || (c.ratio === best.ratio && c.cost < best.cost)) best = c;
  }
  return best;
}

/** Best affordable gold upgrade, or null. */
function bestGoldBuy(state: GameState): Candidate | null {
  const level = state.hero.level;
  const base = heroBaseDamage(level, state.realm);
  const mult = skillMult(state.hero.skills);
  const flat = base + gearPowerTotal(state.gear);
  const candidates: Candidate[] = [];

  const heroCost = levelCost(level, state.realm);
  if (Number.isFinite(heroCost) && heroCost <= state.gold) {
    const dDps = (heroBaseDamage(level + 1, state.realm) - base) * mult;
    const ratio = dDps / heroCost;
    if (Number.isFinite(ratio) && ratio > 0) {
      candidates.push({ kind: 'hero', id: null, cost: heroCost, ratio });
    }
  }

  for (const id of SKILL_IDS) {
    const def = SKILLS[id];
    if (!def || level < def.unlockLevel) continue;
    const rank = state.hero.skills[id] ?? 0;
    const cost = skillCost(rank, state.realm);
    if (!Number.isFinite(cost) || cost > state.gold) continue;
    const oldF = skillRankMult(rank);
    const newF = skillRankMult(rank + 1);
    const ratio = (flat * mult * (newF / oldF - 1)) / cost;
    if (Number.isFinite(ratio) && ratio > 0) candidates.push({ kind: 'skill', id, cost, ratio });
  }

  return pickBest(candidates);
}

/**
 * Best affordable Ascendancy node. Speed nodes are ranked by the DPS they are
 * worth, so all three effects compete on one scale.
 */
function bestNodeBuy(state: GameState): Candidate | null {
  const dps = heroDps(state);
  const base = heroBaseDamage(state.hero.level, state.realm);
  const gear = gearPowerTotal(state.gear);
  const mult = skillMult(state.hero.skills);
  const asc = state.ascendancy;
  const candidates: Candidate[] = [];

  for (const id of ASC_NODE_IDS) {
    const def = ASC_NODES[id];
    if (!def) continue;
    const rank = asc.nodes[id] ?? 0;
    if (rank >= def.maxRank) continue;
    const cost = ascNodeCost(id, rank);
    if (!Number.isFinite(cost) || cost > asc.banked) continue;

    let dDps: number;
    if (def.effect === 'damage') dDps = base * def.perRank * mult;
    else if (def.effect === 'gearPower') dDps = gear * def.perRank * mult;
    else {
      const speed = ascSpeedMultiplier(asc);
      dDps = (dps * def.perRank) / speed;
    }
    const ratio = dDps / cost;
    if (Number.isFinite(ratio) && ratio > 0) candidates.push({ kind: 'node', id, cost, ratio });
  }

  return pickBest(candidates);
}

/** Run the greedy gold loop. Returns purchases made. */
export function botBuyGold(state: GameState): number {
  let purchases = 0;
  while (Number.isFinite(state.gold)) {
    const pick = bestGoldBuy(state);
    if (!pick) break;
    const ok = pick.kind === 'hero' ? buyHeroLevel(state) : buySkill(state, pick.id as string);
    if (!ok) break;
    purchases += 1;
  }
  return purchases;
}

/** Run the greedy Ascendancy-tree loop. Returns purchases made. */
export function botBuyTree(state: GameState): number {
  let purchases = 0;
  while (Number.isFinite(state.ascendancy.banked)) {
    const pick = bestNodeBuy(state);
    if (!pick) break;
    if (!buyAscendancyNode(state, pick.id as string)) break;
    purchases += 1;
  }
  return purchases;
}

/** A full bot touch. Purchases are refused during a boss attempt by the engine. */
export function botTouch(state: GameState): { gold: number; tree: number } {
  return { gold: botBuyGold(state), tree: botBuyTree(state) };
}
