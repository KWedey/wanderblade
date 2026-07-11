import { describe, it, expect } from 'vitest';
import {
  initialState,
  advance,
  summarizeEvents,
  bossHp,
  killTime,
  autoChallengeReadiness,
  d0,
} from '../src/index';
import type { GameState } from '../src/index';

/**
 * Parked at the region-0 gate with a chosen readiness. Uses seed 1, whose first
 * RNG draw is >= dropChance, so the single kill we advance never drops gear —
 * keeping readiness fixed for a clean threshold assertion.
 */
function gateState(targetReadiness: number): GameState {
  const s = initialState(1);
  s.zone = 9;
  s.gate.atGate = true;
  const dps = (targetReadiness * bossHp(9)) / 30;
  s.gear.weapon = { power: dps - d0, rarity: 'common', zone: 9 };
  s.nextKillAtSec = s.timeSec + killTime(s);
  return s;
}

// Auto-challenge (docs/DESIGN.md, DECISIONS.md #9) fires inside advance — offline
// too — once readiness crosses autoChallengeReadiness (1.1).
describe('auto-challenge during advance', () => {
  it('does not fire below the 1.1 readiness threshold', () => {
    const s = gateState(1.05);
    const events = advance(s, killTime(s) + 0.001); // exactly one gate kill
    const recap = summarizeEvents(events);

    expect(recap.kills).toBe(1);
    expect(events.some((e) => e.type === 'drop')).toBe(false); // seed 1: no drop
    expect(events.some((e) => e.type === 'bossWin')).toBe(false);
    expect(s.gate.atGate).toBe(true);
    expect(s.zone).toBe(9);
  });

  it('fires at or above the 1.1 readiness threshold and clears the gate', () => {
    const s = gateState(autoChallengeReadiness + 0.1);
    const events = advance(s, killTime(s) + 0.001);

    expect(events.some((e) => e.type === 'bossWin')).toBe(true);
    expect(s.gate.atGate).toBe(false);
    expect(s.zone).toBe(10);
    expect(s.lifetime.bossKills).toBe(1);
  });

  it('breaks through gates offline from a pure-idle run (zero taps)', () => {
    // No purchases, no manual challenges — farmed gear alone must cross gates.
    // The guarantee (DECISIONS.md #9) is that the zero-interaction idle player
    // ALWAYS breaks through eventually: gear farmed at the gate pushes Readiness
    // past 1.1 with no gold spent. With the tuned economy (bossHpMult 60, scarce
    // drops) that is a slow, multi-day gear farm — a player who buys even a few
    // levels crosses in minutes (see the V2 first-boss target) — so this asserts
    // the guarantee holds over a generous idle window, not that it is fast.
    const s = initialState(1);
    const events = advance(s, 8 * 24 * 60 * 60); // 8 days of pure idle

    expect(s.lifetime.bossKills).toBeGreaterThanOrEqual(1);
    // Over 8 days the raw event array is truncated at EVENT_CAP long before the
    // first (multi-day) gate cross, so count boss wins from the exact attached
    // recap, not the capped stream.
    expect(summarizeEvents(events).bossWins).toBe(s.lifetime.bossKills);
    expect(s.zone).toBeGreaterThan(9); // advanced past the region-0 gate via gear alone
  });
});
