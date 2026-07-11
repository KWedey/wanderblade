import { describe, it, expect } from 'vitest';
import {
  initialState,
  challengeBoss,
  readiness,
  bossHp,
  killTime,
  bossRetryCooldownSec,
  d0,
} from '../src/index';
import type { GameState } from '../src/index';

/** Build a state parked at the region-0 gate (zone 9) with a chosen readiness. */
function gateState(targetReadiness: number, seed = 2): GameState {
  const s = initialState(seed);
  s.zone = 9;
  s.gate.atGate = true;
  // level 0 => base d0, skillMult 1, so dps = d0 + weaponPower.
  // readiness = dps * 30 / bossHp(9)  =>  dps = target * bossHp(9) / 30.
  const dps = (targetReadiness * bossHp(9)) / 30;
  s.gear.weapon = { power: dps - d0, rarity: 'common', zone: 9 };
  s.nextKillAtSec = s.timeSec + killTime(s);
  return s;
}

// Boss resolution is a pure function of readiness (docs/ECONOMY.md): win iff >= 1.0.
describe('challengeBoss', () => {
  it('wins when readiness >= 1.0 and opens the next region', () => {
    const s = gateState(1.05);
    expect(readiness(s)).toBeCloseTo(1.05, 6);

    const result = challengeBoss(s);

    expect(result.won).toBe(true);
    expect(s.gate.atGate).toBe(false);
    expect(s.zone).toBe(10); // first zone of region 1
    expect(s.killsInZone).toBe(0);
    expect(s.lifetime.bossKills).toBe(1);
    expect(result.events.some((e) => e.type === 'bossWin')).toBe(true);
    expect(result.events.some((e) => e.type === 'region')).toBe(true);
  });

  it('the win outcome always agrees with the readiness >= 1.0 rule', () => {
    for (const target of [0.9, 0.999, 1.0, 1.001, 1.5]) {
      const s = gateState(target);
      const r = readiness(s);
      expect(challengeBoss(s).won).toBe(r >= 1.0);
    }
  });

  it('loses when readiness < 1.0 and sets a retry cooldown', () => {
    const s = gateState(0.95);
    const result = challengeBoss(s);

    expect(result.won).toBe(false);
    expect(s.gate.atGate).toBe(true); // still parked, no progress lost
    expect(s.zone).toBe(9);
    expect(s.lifetime.bossKills).toBe(0);
    expect(s.gate.cooldownUntilSec).toBeCloseTo(s.timeSec + bossRetryCooldownSec, 6);
    const fail = result.events.find((e) => e.type === 'bossFail');
    expect(fail).toBeDefined();
    expect(fail).toMatchObject({ type: 'bossFail', region: 0, zone: 9 });
  });

  it('respects the cooldown: a retry during cooldown is a no-op', () => {
    const s = gateState(0.95);
    challengeBoss(s); // fail -> cooldown until timeSec + 60

    // Even after buffing to a winning readiness, the retry is blocked mid-cooldown.
    s.gear.weapon = { power: (1.5 * bossHp(9)) / 30 - d0, rarity: 'rare', zone: 9 };
    const blocked = challengeBoss(s);
    expect(blocked.won).toBe(false);
    expect(blocked.events).toHaveLength(0);
    expect(s.gate.atGate).toBe(true);

    // Once the cooldown elapses, the (now-ready) challenge wins.
    s.timeSec = s.gate.cooldownUntilSec;
    const retry = challengeBoss(s);
    expect(retry.won).toBe(true);
    expect(s.zone).toBe(10);
  });

  it('does nothing when not parked at a gate', () => {
    const s = initialState(1);
    const result = challengeBoss(s);
    expect(result.won).toBe(false);
    expect(result.events).toHaveLength(0);
  });

  it("beating the final region's boss reaches World's Edge and scales on", () => {
    const s = initialState(3);
    s.zone = 69; // last zone of region 6 (World's Edge)
    s.gate.atGate = true;
    s.gear.weapon = { power: (2 * bossHp(69)) / 30, rarity: 'epic', zone: 69 };
    s.nextKillAtSec = s.timeSec + killTime(s);

    const result = challengeBoss(s);

    expect(result.won).toBe(true);
    expect(s.worldsEdgeReached).toBe(true);
    expect(s.zone).toBe(70); // first zone past the finale; gates still continue ahead
    const types = result.events.map((e) => e.type);
    expect(types).toContain('bossWin');
    expect(types).toContain('edge');
    expect(types).toContain('region');
  });

  it('emits the one-time edge event only on the first World\'s Edge crossing', () => {
    // Beating a boss in the endless tail (region 7+) must NOT re-fire 'edge'.
    const s = initialState(3);
    s.worldsEdgeReached = true; // already past the finale
    s.zone = 79; // region 7's gate (the 8th region)
    s.gate.atGate = true;
    s.gear.weapon = { power: (2 * bossHp(79)) / 30, rarity: 'epic', zone: 79 };
    s.nextKillAtSec = s.timeSec + killTime(s);

    const result = challengeBoss(s);

    expect(result.won).toBe(true);
    expect(s.zone).toBe(80); // stepped into region 8
    const types = result.events.map((e) => e.type);
    expect(types).toContain('bossWin');
    expect(types).not.toContain('edge'); // fires exactly once, on the first crossing
  });
});
