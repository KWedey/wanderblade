import { describe, expect, it } from 'vitest';
import { initialState, SKILLS, type GameState } from '@wanderblade/core';
import { parseArgs } from '../src/args';
import { botBuyGold, botBuyTree } from '../src/bot';
import { CAP_RATE, strikeTimes } from '../src/policy';
import { runPlayer } from '../src/simulate';
import { runCorrectness, runPacing } from '../src/validators';
import type { SimConfig } from '../src/types';

const cfg = (over: Partial<SimConfig> = {}): SimConfig => ({
  days: 1,
  seed: 1,
  seeds: 1,
  sessionMin: 20,
  sessionsPerDay: 2,
  csv: false,
  quick: false,
  ...over,
});

describe('parseArgs', () => {
  it('applies documented defaults with no flags', () => {
    expect(parseArgs([])).toEqual({
      days: 14,
      seed: 1,
      seeds: 3,
      sessionMin: 20,
      sessionsPerDay: 2,
      csv: false,
      quick: false,
    });
  });

  it('parses space- and equals-separated flags plus the --csv boolean', () => {
    expect(
      parseArgs(['--days', '5', '--seed=7', '--seeds', '2', '--session-min=30', '--csv']),
    ).toEqual({
      days: 5,
      seed: 7,
      seeds: 2,
      sessionMin: 30,
      sessionsPerDay: 2,
      csv: true,
      quick: false,
    });
  });

  it('returns help and rejects bad input', () => {
    expect(parseArgs(['--help'])).toBe('help');
    expect(() => parseArgs(['--nope'])).toThrow();
    expect(() => parseArgs(['--days', '0'])).toThrow();
    expect(() => parseArgs(['--seed', 'x'])).toThrow();
    expect(() => parseArgs(['--session-min', '800'])).toThrow();
  });
});

describe('bot termination guards', () => {
  it('makes zero purchases and terminates when gold has overflowed to Infinity', () => {
    const state: GameState = initialState(1);
    state.gold = Infinity;
    expect(botBuyGold(state)).toBe(0);
  });

  it('spends a finite balance down and then stops', () => {
    const state: GameState = initialState(1);
    state.gold = 1000;
    expect(botBuyGold(state)).toBeGreaterThan(0);
    expect(Number.isFinite(state.gold)).toBe(true);
    expect(state.gold).toBeLessThan(1000);
  });

  it('skips capped skills instead of stalling the greedy loop', () => {
    const state: GameState = initialState(1);
    state.hero.level = 15;
    state.hero.skills.cleave = SKILLS.cleave!.maxLevel;
    state.hero.skills.warcry = SKILLS.warcry!.maxLevel;
    state.gold = 1e6;
    expect(botBuyGold(state)).toBeGreaterThan(0);
    expect(state.hero.skills.cleave).toBe(SKILLS.cleave!.maxLevel);
    expect(state.hero.skills.warcry).toBe(SKILLS.warcry!.maxLevel);
  });

  it('spends banked Ascendancy down to nothing affordable', () => {
    const state: GameState = initialState(1);
    state.ascendancy.banked = 200;
    expect(botBuyTree(state)).toBeGreaterThan(0);
    expect(state.ascendancy.banked).toBeLessThan(200);
    expect(botBuyTree(state)).toBe(0);
  });

  it('buys nothing from the tree during a boss attempt', () => {
    const state: GameState = initialState(1);
    state.phase = 'boss';
    state.ascendancy.banked = 1e6;
    expect(botBuyTree(state)).toBe(0);
    expect(botBuyGold(state)).toBe(0);
  });
});

describe('strikeTimes', () => {
  it('emits evenly spaced timestamps strictly inside the window', () => {
    const ts = strikeTimes(10, 1, 4);
    expect(ts).toEqual([10.25, 10.5, 10.75, 11]);
    expect(strikeTimes(0, 0, 4)).toEqual([]);
    expect(strikeTimes(0, 10, 0)).toEqual([]);
  });

  it('uses the momentum-sustaining rate as the reference cadence', () => {
    expect(CAP_RATE).toBeGreaterThan(3);
    expect(CAP_RATE).toBeLessThan(4);
  });
});

describe('runPlayer determinism and contract watching', () => {
  it('produces identical runs for the same seed and policy', () => {
    const a = runPlayer(1, cfg(), { policy: 'road-active', entry: 'prompt' });
    const b = runPlayer(1, cfg(), { policy: 'road-active', entry: 'prompt' });
    expect(a.state.timeSec).toBe(b.state.timeSec);
    expect(a.state.gold).toBe(b.state.gold);
    expect(a.state.lifetime.kills).toBe(b.state.lifetime.kills);
    expect(a.realms.map((r) => r.portalReadySec)).toEqual(b.realms.map((r) => r.portalReadySec));
  });

  it('reports no phase-contract violations on a clean run', () => {
    const r = runPlayer(2, cfg({ days: 2 }), { policy: 'road-active', entry: 'prompt' });
    expect(r.violations).toEqual([]);
  });

  it('the active policy strikes and the idle policy never does', () => {
    const active = runPlayer(3, cfg(), { policy: 'road-active', entry: 'prompt' });
    const idle = runPlayer(3, cfg(), { policy: 'road-idle', entry: 'prompt' });
    expect(active.totalActiveSec).toBeGreaterThan(0);
    expect(idle.totalActiveSec).toBe(0);
    expect(idle.state.momentum.value).toBe(0);
    expect(active.state.lifetime.kills).toBeGreaterThan(idle.state.lifetime.kills);
  });

  it('stops at portal-ready when asked', () => {
    const r = runPlayer(4, cfg({ days: 30 }), {
      policy: 'road-active',
      entry: 'prompt',
      stopAtPortalReady: true,
    });
    expect(r.state.portalReady).toBe(true);
    expect(r.state.phase).toBe('road');
  });
});

describe('validators are total', () => {
  it('emits every C and P id with a boolean verdict', () => {
    const main = runPlayer(1, cfg(), { policy: 'road-active', entry: 'prompt' });
    const stub = {
      seed: 1,
      config: cfg(),
      realms: main.realms,
      samples: main.samples,
      correctness: [],
      pacing: [],
      roadUplift: [],
      roadWindowUplift: [],
      bossUplift: [],
      eightHourBuys: [],
      twentyFourHourZones: [],
      portalReachSec: { idle: null, active: null },
      promptVsOverfarm: null,
      abandonProbe: null,
      totalKills: main.state.lifetime.kills,
      finalRealm: main.state.realm,
      victories: 0,
      correctnessLive: main.violations,
      offlineMatchesLive: true,
      offlineMatchesLiveDetail: '',
      replayIdentical: true,
      replayIdenticalDetail: '',
      abandonClean: true,
      abandonCleanDetail: '',
      remainingTimeCarried: true,
      remainingTimeCarriedDetail: '',
      earningsBonusIsolated: true,
      earningsBonusIsolatedDetail: '',
    };
    const c = runCorrectness(stub);
    const p = runPacing(stub);
    expect(c.map((v) => v.id)).toEqual(['C1','C2','C3','C4','C5','C6','C7','C8','C9','C10']);
    expect(p.map((v) => v.id)).toEqual(['P1','P2','P3','P4','P5','P6','P7']);
    for (const v of [...c, ...p]) expect(typeof v.pass).toBe('boolean');
  });
});
