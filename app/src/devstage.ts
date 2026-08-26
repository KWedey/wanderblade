// Dev-only state staging, for capturing what the game looks like deep into a
// run instead of thirty seconds into one. Every number it produces comes from
// the engine: it advances real time and makes real purchases. Nothing here
// writes a display value (DECISIONS.md #12).

import {
  advance,
  buyHeroLevel,
  buySkill,
  initialState,
  SKILL_IDS,
  type GameState,
} from '@wanderblade/core';

export interface StagePlan {
  seed: number;
  /** Total engine time to live through, in seconds. */
  totalSec: number;
  /** How many buy-everything-affordable passes to spread across that time. */
  rounds: number;
}

export const STAGE_PRESETS: Record<string, Omit<StagePlan, 'seed'>> = {
  mid: { totalSec: 6 * 3600, rounds: 40 },
  late: { totalSec: 21 * 24 * 3600, rounds: 220 },
};

/**
 * Spends everything affordable, repeatedly, until a pass buys nothing. A single
 * pass is not enough: one level-up can make the next skill affordable.
 *
 * Each track is drained inside the pass. Skill ranks are uncapped, so buying
 * one rank per pass never converged within any sane pass budget.
 */
export function spendDown(state: GameState, maxPasses = 40): number {
  let bought = 0;
  for (let pass = 0; pass < maxPasses; pass++) {
    let boughtThisPass = 0;
    while (buyHeroLevel(state)) {
      bought++;
      boughtThisPass++;
    }
    for (const id of SKILL_IDS) {
      while (buySkill(state, id)) {
        bought++;
        boughtThisPass++;
      }
    }
    if (boughtThisPass === 0) break;
  }
  return bought;
}

/**
 * Live a run forward. Time is advanced in chunks with a spend pass between
 * them, because a player who banks everything to the end reaches a weaker
 * build than one who reinvests, and the capture should show the real one.
 */
export function stageState(plan: StagePlan): GameState {
  const state = initialState(plan.seed);
  const rounds = Math.max(1, plan.rounds);
  const chunk = plan.totalSec / rounds;
  for (let i = 0; i < rounds; i++) {
    advance(state, chunk);
    spendDown(state);
  }
  return state;
}

/**
 * Reads `?stage=late&seed=7` and returns staged state, or null. Dev builds
 * only — the caller guards on import.meta.env.DEV so no production bundle can
 * reach a code path that fabricates a save.
 */
export function stageFromQuery(search: string): GameState | null {
  const params = new URLSearchParams(search);
  const name = params.get('stage');
  if (!name) return null;
  const preset = STAGE_PRESETS[name];
  if (!preset) return null;
  const rawSeed = Number(params.get('seed'));
  const seed = Number.isFinite(rawSeed) && rawSeed > 0 ? Math.floor(rawSeed) : 20260825;
  return stageState({ ...preset, seed });
}
