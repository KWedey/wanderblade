// The deterministic purchase policy, shared by every player policy.
//
// Greedy on ΔDPS-per-gold, then the same over banked Ascendancy. ΔDPS is
// derived from the engine's own formulas so the ranking matches real state;
// the purchases themselves still execute through the engine.

import {
  ascMultiplier,
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
  // The tree multiplies damage and gear by different factors, so the flat term
  // has to be built the way heroDps builds it or the two candidates are ranked
  // on different scales once edge and heft ranks diverge.
  const ascDmg = ascMultiplier(state.ascendancy, 'damage');
  const ascGear = ascMultiplier(state.ascendancy, 'gearPower');
  const flat = base * ascDmg + gearPowerTotal(state.gear) * ascGear;
  const candidates: Candidate[] = [];

  const heroCost = levelCost(level, state.realm);
  if (Number.isFinite(heroCost) && heroCost <= state.gold) {
    const dDps = (heroBaseDamage(level + 1, state.realm) - base) * ascDmg * mult;
    const ratio = dDps / heroCost;
    if (Number.isFinite(ratio) && ratio > 0) {
      candidates.push({ kind: 'hero', id: null, cost: heroCost, ratio });
    }
  }

  for (const id of SKILL_IDS) {
    const def = SKILLS[id];
    if (!def || level < def.unlockLevel) continue;
    const rank = state.hero.skills[id] ?? 0;
    const cost = skillCost(id, rank, state.realm);
    if (!Number.isFinite(cost) || cost > state.gold) continue;
    const oldF = skillRankMult(id, rank);
    const newF = skillRankMult(id, rank + 1);
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
    const cost = ascNodeCost(id, rank);
    if (!Number.isFinite(cost) || cost > asc.banked) continue;

    // Ranks compound, so a rank is worth perRank of what the node already
    // multiplies — not perRank of the un-noded base.
    let dDps: number;
    if (def.effect === 'damage') {
      dDps = base * ascMultiplier(asc, 'damage') * def.perRank * mult;
    } else if (def.effect === 'gearPower') {
      dDps = gear * ascMultiplier(asc, 'gearPower') * def.perRank * mult;
    } else {
      // Speed is asymptotic, so its marginal worth is the ratio the next rank
      // actually moves the multiplier by — not a flat perRank.
      const before = ascSpeedMultiplier(asc);
      const after = ascSpeedMultiplier({ ...asc, nodes: { ...asc.nodes, [id]: rank + 1 } });
      dDps = dps * (after / before - 1);
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
