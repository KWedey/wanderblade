import { describe, expect, it } from 'vitest';
import {
  decayMomentum,
  MOMENTUM_HALF_LIFE_SEC,
  MOMENTUM_MAX_BONUS,
  MOMENTUM_PER_STRIKE,
  MOMENTUM_SUSTAIN_RATE,
  momentumMultiplier,
  strikeMomentum,
} from '../src/active';

describe('momentum decay', () => {
  it('halves over one half-life', () => {
    expect(decayMomentum(1, MOMENTUM_HALF_LIFE_SEC)).toBeCloseTo(0.5, 10);
  });

  it('is frame-rate independent', () => {
    const once = decayMomentum(1, 0.5);
    let many = 1;
    for (let i = 0; i < 50; i++) many = decayMomentum(many, 0.01);
    expect(many).toBeCloseTo(once, 10);
  });

  it('is effectively spent about six seconds after the last strike', () => {
    expect(decayMomentum(1, 6)).toBeLessThan(0.13);
  });
});

describe('strikeMomentum', () => {
  it('adds one strike of momentum', () => {
    expect(strikeMomentum(0)).toBeCloseTo(MOMENTUM_PER_STRIKE, 10);
  });

  it('clamps at the cap', () => {
    expect(strikeMomentum(1)).toBe(1);
    expect(strikeMomentum(0.98)).toBe(1);
  });
});

describe('momentumMultiplier', () => {
  it('is 1x idle and 1 + max bonus at the cap', () => {
    expect(momentumMultiplier(0)).toBe(1);
    expect(momentumMultiplier(1)).toBeCloseTo(1 + MOMENTUM_MAX_BONUS, 10);
  });
});

describe('the sustain rate holds the cap', () => {
  // docs/ACTIVE-PLAY.md: "Sustaining full momentum requires ~4 strikes/sec."
  it('striking at MOMENTUM_SUSTAIN_RATE keeps momentum pinned high', () => {
    const step = 1 / MOMENTUM_SUSTAIN_RATE;
    let m = 0;
    for (let i = 0; i < 200; i++) m = strikeMomentum(decayMomentum(m, step));
    expect(m).toBeGreaterThan(0.9);
  });

  it('striking at half that rate cannot reach the cap', () => {
    const step = 2 / MOMENTUM_SUSTAIN_RATE;
    let m = 0;
    for (let i = 0; i < 200; i++) m = strikeMomentum(decayMomentum(m, step));
    expect(m).toBeLessThan(0.9);
  });

  it('stopping input drains a full meter to nothing', () => {
    let m = 1;
    // 20 s of silence is ten half-lives.
    for (let i = 0; i < 200; i++) m = decayMomentum(m, 0.1);
    expect(m).toBeLessThan(0.001);
  });
});
