// Dev-only state staging, for capturing what the game looks like deep into a
// run instead of thirty seconds into one. Every number it produces comes from
// the engine: it advances real time and makes real purchases. Nothing here
// writes a display value (DECISIONS.md #12).

import {
  advance,
  buyHeroLevel,
  buySkill,
  enterPortal,
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

/**
 * `mid` sits deep in realm 0's road, short of its portal (idle-ready at 40–80
 * min, ADR #63); `late` lives through weeks of realms, taking each portal as it
 * opens, and ends on a Road the way a returning player finds one.
 */
export const STAGE_PRESETS: Record<string, Omit<StagePlan, 'seed'>> = {
  mid: { totalSec: 25 * 60, rounds: 40 },
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
 * An open portal is taken at the next pass; the settle never opens one, so
 * a fight begun in the last chunk has ended and the run is back on the Road.
 */
export function stageState(plan: StagePlan): GameState {
  const state = initialState(plan.seed);
  const rounds = Math.max(1, plan.rounds);
  // The settle comes out of the plan's own budget, not on top of it, so a
  // staged run still advances exactly plan.totalSec of engine time.
  const settle = plan.totalSec * SETTLE_FRACTION;
  const chunk = (plan.totalSec - settle) / rounds;
  for (let i = 0; i < rounds; i++) {
    advance(state, chunk);
    spendDown(state);
    if (state.phase === 'road' && state.portalReady) enterPortal(state);
  }
  advance(state, settle);
  return state;
}

/**
 * Share of the plan the run finishes unspent, so the panel offers a real choice
 * rather than the zero-gold frame a spend pass ends on. A share and not a fixed
 * span because the wait after a drained purse scales with rank — one second at
 * hero level 48, two and a half hours at 205 — and sized well past the margin so
 * an income retune cannot fail the gate on a harness that is fine.
 */
const SETTLE_FRACTION = 0.05;

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
  return stageState({ ...preset, seed: seedFromQuery(search) ?? 20260825 });
}

/**
 * `?seed=7` as a run seed, or null when it is absent or not a whole number in
 * 1..2^32-1. Checked after flooring, and against the engine's uint32 seed, so
 * `0.5` and `2^32` cannot slip through as seed 0.
 */
export function seedFromQuery(search: string): number | null {
  const seed = Math.floor(Number(new URLSearchParams(search).get('seed')));
  return seed >= 1 && seed <= 0xffff_ffff ? seed : null;
}
