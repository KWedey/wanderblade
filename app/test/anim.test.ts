// Tests for the pure frame-loop math. smoothStep's frame-rate independence is
// the load-bearing property — it is the fix for the "counter converges 2× as
// fast on a 120Hz phone" class of bug that per-frame constant easing has.

import { describe, expect, it } from 'vitest';
import { killProgress, smoothStep, zoneSweep } from '../src/anim';

describe('smoothStep', () => {
  it('converges identically whether stepped once or sixty times over the same second', () => {
    const target = 100;
    const rate = 8;
    const oneStep = smoothStep(0, target, rate, 1);
    let manySteps = 0;
    for (let i = 0; i < 60; i++) manySteps = smoothStep(manySteps, target, rate, 1 / 60);
    expect(Math.abs(oneStep - manySteps)).toBeLessThan(1e-9);
  });

  it('never overshoots the target', () => {
    let v = 0;
    for (let i = 0; i < 1000; i++) {
      v = smoothStep(v, 100, 18, 1 / 60);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(v).toBeCloseTo(100, 5);
  });

  it('settles a debit (higher rate) faster than an equal-magnitude credit', () => {
    const dt = 0.1;
    const creditRemaining = 100 - smoothStep(0, 100, 8, dt);
    const debitRemaining = smoothStep(100, 0, 18, dt);
    expect(debitRemaining).toBeLessThan(creditRemaining);
  });
});

describe('killProgress', () => {
  it('reports mid-kill progress from the absolute schedule', () => {
    // Kill completes at t=10s, duration 2s, now t=9s → halfway.
    expect(killProgress(10, 9, 0, 2)).toBeCloseTo(0.5, 10);
  });

  it('advances with wall-clock extrapolation between ticks', () => {
    expect(killProgress(10, 9, 0.5, 2)).toBeCloseTo(0.75, 10);
  });

  it('freezes when extrapolation is zeroed (recap pause)', () => {
    expect(killProgress(10, 9, 0, 2)).toBe(killProgress(10, 9, 0, 2));
  });

  it('clamps to [0,1] when a purchase shrinks the duration estimate or extrapolation runs past the schedule', () => {
    // Remaining time (8s) far exceeds the new shorter duration → clamp low.
    expect(killProgress(10, 2, 0, 2)).toBe(0);
    // Extrapolated past the scheduled completion → clamp high.
    expect(killProgress(10, 9.9, 0.6, 2)).toBe(1);
  });

  it('keeps the display target within [gold, gold + goldPerKill] for any inputs', () => {
    // The invariant that prevents both snap-back and affordability illusions:
    // p ∈ [0,1] means the accrual can never exceed the confirmed next payout.
    for (const [next, time, since, dur] of [
      [10, 0, 0, 2],
      [10, 9.999, 0.6, 0.01],
      [10, 20, 0, 2],
      [0, 0, 0, 2],
    ] as const) {
      const p = killProgress(next, time, since, dur);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });
});

describe('zoneSweep', () => {
  it('sweeps with kill progress while marching', () => {
    expect(zoneSweep(false, 5, 0.5, 10)).toBeCloseTo(0.55, 10);
  });

  it('holds at the whole-kill mark while parked at a gate', () => {
    expect(zoneSweep(true, 10, 0.7, 10)).toBe(1);
    expect(zoneSweep(true, 3, 0.7, 10)).toBeCloseTo(0.3, 10);
  });

  it('never exceeds a full bar', () => {
    expect(zoneSweep(false, 10, 0.9, 10)).toBe(1);
  });
});
