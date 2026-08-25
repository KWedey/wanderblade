import { describe, expect, it } from 'vitest';
import { advance, enterPortal, initialState } from '../src/index';
import { portalReady, strikesAt } from './helpers';

// A long offline gap must reconcile in seconds — it runs on a cold app start.
describe('performance smoke', () => {
  it('advances 10 idle days of Road in well under 10s', () => {
    const s = initialState(7);
    const tenDays = 10 * 86_400;

    const t0 = Date.now();
    advance(s, tenDays);
    const elapsedMs = Date.now() - t0;

    expect(elapsedMs).toBeLessThan(10_000);
    expect(s.timeSec).toBe(tenDays);
    expect(s.lifetime.kills).toBeGreaterThan(100_000);
    expect(s.collection.zonesCleared).toBeGreaterThan(0);
  });

  it('advances a 10-day boss stretch in well under 10s', () => {
    const s = portalReady(7, 1);
    enterPortal(s);

    const t0 = Date.now();
    advance(s, 10 * 86_400);
    expect(Date.now() - t0).toBeLessThan(10_000);
    expect(s.lifetime.bossDamage).toBeGreaterThan(0);
  });

  it('advances an hour of capped-rate striking in well under 5s', () => {
    const s = initialState(7);
    const t0 = Date.now();
    advance(s, 3600, strikesAt(0, 3600, 4));
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
