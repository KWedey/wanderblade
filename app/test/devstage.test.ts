import { describe, expect, it } from 'vitest';

import {
  affordableCount,
  FULL_LENGTH_REALM,
  initialState,
  serialize,
  zonesForRealm,
} from '@wanderblade/core';

import {
  seedFromQuery,
  spendDown,
  STAGE_PRESETS,
  stageFromQuery,
  stageState,
} from '../src/devstage';
import { readSave, writeSave } from '../src/save';
import { installMemoryStorage } from './helpers/memory-storage';

installMemoryStorage();

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
    const mid = STAGE_PRESETS['mid']!;
    const reinvested = stageState({ ...mid, seed: 7 });
    const banked = stageState({ ...mid, seed: 7, rounds: 1 });
    expect(reinvested.hero.level).toBeGreaterThan(banked.hero.level);
  });

  it('keeps mid deep in realm 0, short of its portal', () => {
    const s = stageState({ ...STAGE_PRESETS['mid']!, seed: 7 });
    expect(s.realm).toBe(0);
    expect(s.phase).toBe('road');
    expect(s.portalReady).toBe(false);
    expect(s.zone).toBeGreaterThanOrEqual(Math.floor(zonesForRealm(0) / 2));
  });

  it('takes late through several realms and leaves it on the Road', () => {
    const s = stageState({ ...STAGE_PRESETS['late']!, seed: 7 });
    expect(s.realm).toBeGreaterThan(FULL_LENGTH_REALM);
    expect(s.ascendancy.victories).toBe(s.realm);
    expect(s.phase).toBe('road');
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

describe('seedFromQuery', () => {
  it('reads a seed without a stage, so a fresh run can repeat', () => {
    expect(seedFromQuery('?seed=7')).toBe(7);
    expect(seedFromQuery('?stage=mid&seed=11')).toBe(11);
  });

  it('floors a fractional seed', () => {
    expect(seedFromQuery('?seed=7.9')).toBe(7);
  });

  it('returns null when there is no usable seed', () => {
    for (const search of ['', '?seed=', '?seed=abc', '?seed=0', '?seed=-3', '?seed=Infinity']) {
      expect(seedFromQuery(search), search).toBeNull();
    }
  });
});

describe('a staged capture shows a real choice', () => {
  // "Never capture a frame where every upgrade is unaffordable - the panel's
  // answer is 'buy nothing', the one answer a screenshot must never give."
  // Count with core's own affordableCount: it prices Ascendancy nodes in
  // Ascendancy, where a gold-only check calls all three of them buyable at
  // every staged state and so can never fail.
  it.each(Object.keys(STAGE_PRESETS))('leaves %s able to afford something', (stage) => {
    const state = stageState({ ...STAGE_PRESETS[stage]!, seed: 7 });
    expect(affordableCount(state), `${stage} stages to an all-unaffordable shop`).toBeGreaterThan(
      0,
    );
  });
});

describe('staging lands on one state wherever it runs', () => {
  // The browser reaches staged state through stageFromQuery and then hands it
  // to Game; both hops are pure and seeded, so a page load must land on the
  // byte-identical state a Node harness reports for the same query.
  it('stageFromQuery matches stageState for the same preset and seed', () => {
    const fromQuery = stageFromQuery('?stage=mid&seed=7');
    const direct = stageState({ ...STAGE_PRESETS['mid']!, seed: 7 });
    expect(serialize(fromQuery!)).toBe(serialize(direct));
  });

  // save.ts validates field by field and discards anything malformed, so a
  // staged run has to survive the round-trip with its purse intact.
  it('keeps every affordable row across a save round-trip', () => {
    const staged = stageState({ ...STAGE_PRESETS['mid']!, seed: 7 });
    writeSave(staged);
    const loaded = readSave();
    expect(loaded).not.toBeNull();
    expect(serialize(loaded!.state)).toBe(serialize(staged));
    expect(affordableCount(loaded!.state)).toBe(affordableCount(staged));
  });
});
