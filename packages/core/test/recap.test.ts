import { describe, it, expect } from 'vitest';
import {
  initialState,
  advance,
  summarizeEvents,
  challengeBoss,
  killTime,
  readiness,
  bossHp,
  d0,
} from '../src/index';
import type { EventLog } from '../src/index';

// summarizeEvents has two paths: the exact recap attached by `advance` (used
// even when the raw event array is capped), and a fallback that counts from a
// hand-assembled stream. The fallback must agree with the engine's own league
// accounting — leagues accrue only while marching, not while parked at a gate.
describe('summarizeEvents fallback', () => {
  it('does not over-count leagues across a gate-parked stretch', () => {
    // One advance that marches a full region to the first gate and then farms it
    // (seed 1 stays well below the auto-challenge bar, so it parks rather than
    // bursting through). The stream therefore holds marching kills, a 'gate'
    // event, and parked kills — the exact case the naive per-kill count breaks.
    const s = initialState(1);
    const events = advance(s, 660);
    expect(s.gate.atGate).toBe(true); // parked at the first gate

    const exact = summarizeEvents(events); // prefers the attached exact recap
    const plain = [...events]; // spread strips the attached recap
    expect((plain as EventLog).recap).toBeUndefined();
    const fallback = summarizeEvents(plain); // forced down the counting path

    // The stream genuinely contains parked kills (after the gate event) that a
    // per-kill fallback would wrongly credit with leagues.
    const gateIdx = plain.findIndex((e) => e.type === 'gate');
    expect(gateIdx).toBeGreaterThanOrEqual(0);
    const parkedKills = plain.slice(gateIdx).filter((e) => e.type === 'kill').length;
    expect(parkedKills).toBeGreaterThan(0);

    // Gate-aware fallback matches the exact recap instead of over-counting.
    expect(fallback.leaguesTraveled).toBeCloseTo(exact.leaguesTraveled, 6);
    // Kills and gold are still counted in full regardless of park state.
    expect(fallback.kills).toBe(exact.kills);
    expect(fallback.goldEarned).toBeCloseTo(exact.goldEarned, 6);
  });
});

// A winning manual challenge advances the zone, so its kill schedule must be
// re-primed to the new (harder) zone's cadence from the current clock — exactly
// as the advance loop re-adds killTime after an auto-challenge win.
describe('challengeBoss kill-schedule re-priming', () => {
  it('re-primes the next kill to the new zone cadence, not the parked schedule', () => {
    const s = initialState(2);
    s.zone = 9; // parked at region 0's gate
    s.gate.atGate = true;
    // Readiness 1.5 (>= 1.0) => a guaranteed win. dps = d0 + weaponPower.
    s.gear.weapon = { power: (1.5 * bossHp(9)) / 30 - d0, rarity: 'rare', zone: 9 };
    // Land mid-interval: timeSec is not aligned to the parked schedule, so a
    // stale (un-re-primed) nextKillAtSec would fire the next kill early.
    s.timeSec = 1000;
    s.nextKillAtSec = 1000.5; // imminent parked-zone kill
    expect(readiness(s)).toBeGreaterThanOrEqual(1.0);

    const result = challengeBoss(s);
    expect(result.won).toBe(true);
    expect(s.zone).toBe(10); // stepped into region 1

    const newZoneKillTime = killTime(s); // killTime evaluated in the new zone
    // Re-primed to the current clock + the new zone's kill cadence.
    expect(s.nextKillAtSec).toBeCloseTo(s.timeSec + newZoneKillTime, 6);
    expect(s.nextKillAtSec).not.toBeCloseTo(1000.5, 6); // not the stale schedule

    // The next kill actually lands on the new-zone cadence, in the new zone.
    const kill = advance(s, newZoneKillTime + 1e-6).find((e) => e.type === 'kill');
    expect(kill).toBeDefined();
    expect(kill).toMatchObject({ zone: 10 });
    expect(kill!.timeSec).toBeCloseTo(1000 + newZoneKillTime, 6);
  });
});
