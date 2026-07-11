import { describe, it, expect } from 'vitest';
import { initialState, advance } from '../src/index';

// PERFORMANCE: a 10-day advance must run in seconds (plain loop, no per-kill
// allocation beyond capped events).
describe('performance smoke', () => {
  it('advances 10 simulated days of pure idle in well under 10s', () => {
    const s = initialState(7);
    const tenDays = 10 * 24 * 60 * 60; // 864000s

    const t0 = Date.now();
    advance(s, tenDays);
    const elapsedMs = Date.now() - t0;

    expect(elapsedMs).toBeLessThan(10_000);
    expect(s.timeSec).toBe(tenDays);
    // A real 10-day idle run is hundreds of thousands of kills (the 2s walking
    // floor caps the rate at 43_200/day) — confirms we truly looped.
    expect(s.lifetime.kills).toBeGreaterThan(100_000);
    // Pure idle (zero taps) is a slow, gate-walled gear farm now, so 10 days does
    // NOT reach World's Edge — but it does cross real gates, proving the gate loop
    // (form → park → farm → auto-challenge → advance) ran end-to-end.
    expect(s.lifetime.bossKills).toBeGreaterThan(0);
    expect(s.zone).toBeGreaterThan(9);
  });
});
