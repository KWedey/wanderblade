import { describe, expect, it } from 'vitest';
import {
  addMomentum,
  advance,
  enterPortal,
  initialState,
  killTime,
  momentumAt,
  momentumMultiplier,
  MOMENTUM_HALF_LIFE_SEC,
  MOMENTUM_MAX_BONUS,
  MOMENTUM_PER_STRIKE,
  serialize,
  sustainStrikeRate,
  swingInterval,
} from '../src/index';
import { portalReady, strikesAt } from './helpers';

describe('the momentum curve', () => {
  it('halves over the half-life and is effectively spent by ~6s', () => {
    const m = { value: 1, atSec: 0 };
    expect(momentumAt(m, 0)).toBe(1);
    expect(momentumAt(m, MOMENTUM_HALF_LIFE_SEC)).toBeCloseTo(0.5, 10);
    expect(momentumAt(m, 2 * MOMENTUM_HALF_LIFE_SEC)).toBeCloseTo(0.25, 10);
    expect(momentumAt(m, 6)).toBeLessThan(0.13);
  });

  it('adds one strike at a time and clamps at 1', () => {
    let m = { value: 0, atSec: 0 };
    m = addMomentum(m, 0, MOMENTUM_PER_STRIKE);
    expect(m.value).toBeCloseTo(MOMENTUM_PER_STRIKE, 10);
    for (let i = 0; i < 100; i++) m = addMomentum(m, 0, MOMENTUM_PER_STRIKE);
    expect(m.value).toBe(1);
  });

  it('multiplies attack speed from 1x at rest to 1 + MAX_BONUS at full', () => {
    expect(momentumMultiplier(0)).toBe(1);
    expect(momentumMultiplier(1)).toBeCloseTo(1 + MOMENTUM_MAX_BONUS, 10);
  });

  it('sustainStrikeRate is exactly the rate that holds momentum at the cap', () => {
    const rate = sustainStrikeRate();
    let m = { value: 1, atSec: 0 };
    const step = 1 / rate;
    for (let i = 1; i <= 200; i++) m = addMomentum(m, i * step, MOMENTUM_PER_STRIKE);
    expect(momentumAt(m, 200 * step)).toBeCloseTo(1, 8);
    // A hair slower and the cap slips away.
    let slow = { value: 1, atSec: 0 };
    const slowStep = 1 / (rate * 0.9);
    for (let i = 1; i <= 200; i++) slow = addMomentum(slow, i * slowStep, MOMENTUM_PER_STRIKE);
    expect(momentumAt(slow, 200 * slowStep)).toBeLessThan(0.999);
  });
});

describe('one shared curve drives both phases', () => {
  it('shortens Road kill time and boss swing interval by the same factor', () => {
    const s = portalReady(2, 500);
    const roadRatio = killTime(s, 0) / killTime(s, 1);
    const bossRatio = swingInterval(s, 0) / swingInterval(s, 1);
    expect(roadRatio).toBeCloseTo(bossRatio, 10);
    expect(roadRatio).toBeCloseTo(1 + MOMENTUM_MAX_BONUS, 10);
  });

  it('beats the idle kill-time floor rather than being swallowed by it', () => {
    const s = initialState(1); // zone 0: raw kill time is under the floor
    expect(killTime(s, 0)).toBeCloseTo(2, 10);
    expect(killTime(s, 1)).toBeCloseTo(2 / (1 + MOMENTUM_MAX_BONUS), 10);
  });
});

describe('strikes are inputs into advance', () => {
  it('zero strikes reproduces pure idle exactly', () => {
    const idle = initialState(21);
    advance(idle, 7200);
    const empty = initialState(21);
    advance(empty, 7200, []);
    expect(serialize(empty)).toBe(serialize(idle));
    expect(empty.momentum.value).toBe(0);
  });

  it('striking makes the Road pay more in the same wall time', () => {
    const idle = initialState(21);
    advance(idle, 1200);

    const active = initialState(21);
    advance(active, 1200, strikesAt(0, 1200, sustainStrikeRate()));

    expect(active.lifetime.kills).toBeGreaterThan(idle.lifetime.kills);
    expect(active.gold).toBeGreaterThan(idle.gold);
  });

  it('striking makes the guardian fall faster', () => {
    const idle = portalReady(22, 400);
    enterPortal(idle);
    advance(idle, 1200);

    const active = portalReady(22, 400);
    enterPortal(active);
    advance(active, 1200, strikesAt(active.timeSec, 1200, sustainStrikeRate()));

    expect(active.boss.hpRemaining).toBeLessThan(idle.boss.hpRemaining);
  });

  it('ignores strike timestamps outside the advanced window', () => {
    const s = initialState(21);
    advance(s, 600);
    const before = serialize(s);

    const stale = initialState(21);
    advance(stale, 600, [-50, 0, 700, 5000]);
    expect(serialize(stale)).toBe(before);
  });

  it('decays momentum once input stops', () => {
    const s = initialState(21);
    advance(s, 60, strikesAt(0, 60, 4));
    expect(momentumAt(s.momentum, s.timeSec)).toBeGreaterThan(0.5);
    advance(s, 30);
    expect(momentumAt(s.momentum, s.timeSec)).toBeLessThan(0.001);
  });
});
