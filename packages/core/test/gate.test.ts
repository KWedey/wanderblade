import { describe, it, expect } from 'vitest';
import {
  initialState,
  advance,
  summarizeEvents,
  readiness,
  enemyHp,
  killTime,
  d0,
} from '../src/index';

// Gate rule (docs/DESIGN.md, DECISIONS.md #9): parked at a gate the hero farms
// the approach zone at full income (gold + drops), but leagues pause.
describe('gate farming', () => {
  it('arrives at the first gate after clearing a full region', () => {
    const s = initialState(1);
    advance(s, 600);
    expect(s.gate.atGate).toBe(true);
    expect(s.zone).toBe(9); // last zone of region 0
    expect(s.leagues).toBeCloseTo(10, 6); // 10 zones * 1 league
  });

  it('keeps earning gold while parked but freezes leagues and zone', () => {
    const s = initialState(1);
    advance(s, 600);
    expect(s.gate.atGate).toBe(true);

    const leaguesBefore = s.leagues;
    const goldBefore = s.gold;
    const zoneBefore = s.zone;

    // Readiness here is well below the auto-challenge threshold, so 60s of
    // farming stays parked.
    expect(readiness(s)).toBeLessThan(1.1);
    const recap = summarizeEvents(advance(s, 60));

    expect(s.gate.atGate).toBe(true); // still parked
    expect(s.zone).toBe(zoneBefore); // zone frozen
    expect(s.leagues).toBe(leaguesBefore); // leagues paused
    expect(recap.leaguesTraveled).toBe(0);
    expect(s.gold).toBeGreaterThan(goldBefore); // income continues
    expect(recap.kills).toBeGreaterThan(0);
    expect(recap.goldEarned).toBeGreaterThan(0);
  });

  it('emits a gate event on arrival', () => {
    const s = initialState(1);
    const events = advance(s, 600);
    const gate = events.find((e) => e.type === 'gate');
    expect(gate).toBeDefined();
    expect(gate).toMatchObject({ type: 'gate', region: 0, zone: 9 });
  });

  it('forms a gate at every region end past World\'s Edge (region 8+)', () => {
    // The gate structure continues into the endless tail: clearing the last zone
    // of a region beyond World's Edge parks at a gate, exactly like the 7 named
    // regions. Gates are the tail's anti-runaway wall, not just an early feature.
    const s = initialState(1);
    s.worldsEdgeReached = true;
    s.zone = 79; // region 7's last zone (region index 7 = the 8th region)
    s.killsInZone = 9; // one kill from clearing the zone
    // dps = enemyHp(79) → readiness 0.5 (< the 1.1 auto-challenge bar), so the
    // gate that forms stays parked rather than being auto-cleared on formation.
    s.gear.weapon = { power: enemyHp(79) - d0, rarity: 'epic', zone: 79 };
    s.nextKillAtSec = s.timeSec + killTime(s);
    expect(readiness(s)).toBeLessThan(1.1);

    const events = advance(s, killTime(s) + 0.001); // the zone-clearing kill

    expect(s.gate.atGate).toBe(true);
    expect(s.zone).toBe(79);
    const gate = events.find((e) => e.type === 'gate');
    expect(gate).toMatchObject({ type: 'gate', region: 7, zone: 79 });
  });
});
