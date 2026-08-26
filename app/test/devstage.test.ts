import { describe, expect, it } from 'vitest';

import { initialState, purchaseOptions } from '@wanderblade/core';

import { spendDown, STAGE_PRESETS, stageFromQuery, stageState } from '../src/devstage';

describe('spendDown', () => {
  it('buys nothing when nothing is affordable', () => {
    expect(spendDown(initialState(1))).toBe(0);
  });

  it('leaves the state unable to afford another level', () => {
    const state = initialState(1);
    state.gold = 1e9;
    expect(spendDown(state)).toBeGreaterThan(0);
    const before = state.gold;
    spendDown(state);
    expect(state.gold).toBe(before);
  });
});

describe('stageState', () => {
  it('is deterministic for a seed', () => {
    const plan = { seed: 7, totalSec: 3600, rounds: 8 };
    const a = stageState(plan);
    const b = stageState(plan);
    expect(a.killIndex).toBe(b.killIndex);
    expect(a.hero.level).toBe(b.hero.level);
    expect(a.gold).toBeCloseTo(b.gold, 6);
  });

  it('reaches a stronger build than banking every coin to the end', () => {
    const reinvested = stageState({ seed: 7, totalSec: 6 * 3600, rounds: 40 });
    const banked = stageState({ seed: 7, totalSec: 6 * 3600, rounds: 1 });
    expect(reinvested.hero.level).toBeGreaterThan(banked.hero.level);
  });

  it('advances real engine time', () => {
    const staged = stageState({ seed: 3, totalSec: 3600, rounds: 4 });
    expect(staged.timeSec).toBeCloseTo(3600, 3);
    expect(staged.killIndex).toBeGreaterThan(0);
  });
});

describe('stageFromQuery', () => {
  it('returns null without a stage param', () => {
    expect(stageFromQuery('')).toBeNull();
    expect(stageFromQuery('?seed=4')).toBeNull();
  });

  it('returns null for an unknown preset', () => {
    expect(stageFromQuery('?stage=nonsense')).toBeNull();
  });

  it('honours the seed', () => {
    const a = stageFromQuery('?stage=mid&seed=11');
    expect(a?.seed).toBe(11);
  });

  it('falls back to a fixed seed so captures repeat', () => {
    const a = stageFromQuery('?stage=mid');
    const b = stageFromQuery('?stage=mid');
    expect(a?.seed).toBe(b?.seed);
  });

  it('exposes a late preset that is longer than mid', () => {
    expect(STAGE_PRESETS['late']!.totalSec).toBeGreaterThan(STAGE_PRESETS['mid']!.totalSec);
  });
});

describe('a staged capture shows a real choice', () => {
  // "Never capture a frame where every upgrade is unaffordable - the panel's
  // answer is 'buy nothing', the one answer a screenshot must never give."
  // Ending staging on a spend pass froze the shop at zero gold, which is not a
  // state a player is ever in: income is continuous.
  it.each(Object.keys(STAGE_PRESETS))('leaves %s able to afford something', (stage) => {
    const state = stageState({ ...STAGE_PRESETS[stage]!, seed: 7 });
    const affordable = purchaseOptions(state).filter((o) => o.unlocked && !o.atMax && state.gold >= o.cost);
    expect(affordable.length, `${stage} stages to an all-unaffordable shop`).toBeGreaterThan(0);
  });
});
