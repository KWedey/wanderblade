import { describe, it, expect } from 'vitest';
import { initialState, SKILLS, type GameState } from '@wanderblade/core';
import { parseArgs } from '../src/args';
import { botBuy } from '../src/bot';
import { Collector } from '../src/collector';
import { simulateSeed } from '../src/simulate';
import { runValidators } from '../src/validators';
import type { SimConfig } from '../src/types';

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({
  days: 1,
  seed: 1,
  seeds: 1,
  checkinsPerDay: 4,
  csv: false,
  ...over,
});

describe('parseArgs', () => {
  it('applies documented defaults with no flags', () => {
    expect(parseArgs([])).toEqual({
      days: 10,
      seed: 1,
      seeds: 3,
      checkinsPerDay: 4,
      csv: false,
    });
  });

  it('parses space- and equals-separated flags plus the --csv boolean', () => {
    expect(parseArgs(['--days', '5', '--seed=7', '--seeds', '2', '--checkins-per-day=6', '--csv'])).toEqual({
      days: 5,
      seed: 7,
      seeds: 2,
      checkinsPerDay: 6,
      csv: true,
    });
  });

  it('rejects unknown flags and non-positive integers', () => {
    expect(() => parseArgs(['--nope'])).toThrow();
    expect(() => parseArgs(['--days', '0'])).toThrow();
    expect(() => parseArgs(['--seed', 'x'])).toThrow();
  });
});

describe('botBuy termination guard', () => {
  it('makes zero purchases and terminates when gold has overflowed to Infinity', () => {
    const state: GameState = initialState(1);
    state.gold = Infinity;
    const bought = botBuy(state, new Collector());
    // Infinite balance never drops below cost — the guard must stop the loop.
    expect(bought).toBe(0);
  });

  it('spends a finite balance down and then stops', () => {
    const state: GameState = initialState(1);
    state.gold = 1000;
    const bought = botBuy(state, new Collector());
    expect(bought).toBeGreaterThan(0);
    expect(Number.isFinite(state.gold)).toBe(true);
    expect(state.gold).toBeLessThan(1000);
  });

  it('skips capped skills instead of stalling the greedy loop', () => {
    // A skill at its cap offers no buyable ΔDPS; the bot must skip it and keep
    // spending on hero levels, not break out of the loop early.
    const state: GameState = initialState(1);
    state.hero.level = 15; // both skills unlocked
    state.hero.skills.cleave = SKILLS.cleave!.maxLevel; // capped
    state.hero.skills.warcry = SKILLS.warcry!.maxLevel; // capped
    state.gold = 1e6;
    const bought = botBuy(state, new Collector());
    expect(bought).toBeGreaterThan(0); // kept buying hero levels
    expect(state.hero.skills.cleave).toBe(SKILLS.cleave!.maxLevel); // no over-buy
    expect(state.hero.skills.warcry).toBe(SKILLS.warcry!.maxLevel);
  });
});

describe('simulateSeed determinism', () => {
  it('produces identical measurements for the same seed', () => {
    const a = simulateSeed(1, cfg());
    const b = simulateSeed(1, cfg());
    expect(a.finalZone).toBe(b.finalZone);
    expect(a.firstPurchaseSec).toBe(b.firstPurchaseSec);
    expect(a.firstBossSec).toBe(b.firstBossSec);
    expect(a.maxTrashKillTime).toBe(b.maxTrashKillTime);
    expect(a.checkins.map((c) => c.purchases)).toEqual(b.checkins.map((c) => c.purchases));
  });

  it('produces the six M0 validators, ordered 1..6', () => {
    const r = simulateSeed(1, cfg());
    r.validators = runValidators(r);
    expect(r.validators.map((v) => v.id)).toEqual([1, 2, 3, 4, 5, 6]);
    for (const v of r.validators) expect(typeof v.pass).toBe('boolean');
  });

  it('measures a finite, non-negative max trash kill time', () => {
    const r = simulateSeed(1, cfg());
    expect(Number.isFinite(r.maxTrashKillTime)).toBe(true);
    expect(r.maxTrashKillTime).toBeGreaterThanOrEqual(0);
  });
});
