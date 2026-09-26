import { describe, expect, it } from 'vitest';
import {
  advance,
  deserialize,
  enterPortal,
  initialState,
  killTime,
  serialize,
} from '../src/index';
import { portalReady, strikesAt } from './helpers';

describe('serialize / deserialize', () => {
  it('round-trips a fresh state exactly', () => {
    const s = initialState(1234);
    const round = deserialize(serialize(s));
    expect(round).toEqual(s);
    expect(serialize(round)).toBe(serialize(s));
  });

  it('round-trips a mid-run Road state, preserving rngState, schedule, arcs, and momentum', () => {
    const s = initialState(77);
    advance(s, 3333.5, strikesAt(0, 3333, 2));
    advance(s, killTime(s, 0) + 0.01); // one unstruck kill leaves an arc in flight
    expect(s.killIndex).toBeGreaterThan(0);
    expect(s.gold).toBeGreaterThan(0);
    expect(s.momentum.value).toBeGreaterThan(0);
    expect(s.arcs.length).toBeGreaterThan(0);

    const round = deserialize(serialize(s));
    expect(round.rngState).toBe(s.rngState);
    expect(round.killIndex).toBe(s.killIndex);
    expect(round.nextActionAtSec).toBe(s.nextActionAtSec);
    expect(round.momentum).toEqual(s.momentum);
    expect(round.arcs).toEqual(s.arcs);
    expect(round).toEqual(s);
  });

  it('round-trips a mid-fight boss state, preserving partial guardian HP', () => {
    const s = portalReady(78, 4 * 3600);
    enterPortal(s);
    advance(s, 900, strikesAt(s.timeSec, 900, 3));
    expect(s.boss.hpRemaining).toBeGreaterThan(0);
    expect(s.boss.hpRemaining).toBeLessThan(s.boss.hpMax);

    const round = deserialize(serialize(s));
    expect(round.phase).toBe('boss');
    expect(round.boss).toEqual(s.boss);
    expect(round).toEqual(s);
  });

  it('a deserialized state continues identically to the original', () => {
    const original = initialState(9);
    advance(original, 2000);
    const restored = deserialize(serialize(original));

    const strikes = strikesAt(2000, 1500, 2);
    const evA = advance(original, 1500, strikes);
    const evB = advance(restored, 1500, strikes);

    expect(JSON.stringify(evB)).toBe(JSON.stringify(evA));
    expect(serialize(restored)).toBe(serialize(original));
  });

  it('serialized JSON is valid and stable', () => {
    const s = initialState(3);
    advance(s, 1000);
    const json = serialize(s);
    expect(() => {
      JSON.parse(json);
    }).not.toThrow();
    expect(serialize(deserialize(json))).toBe(json);
  });

  // Older saves stored kills and ascensions twice over. The copies are dropped
  // on load, and a save from before `victories` existed keeps its count.
  it('drops the duplicate counters an older save carries, keeping the count', () => {
    const s = portalReady(11, 3600);
    enterPortal(s);
    advance(s, 86_400);
    expect(s.ascendancy.victories).toBe(1);

    const legacy = JSON.parse(serialize(s)) as Record<string, Record<string, unknown>>;
    legacy.lifetime!.kills = s.killIndex;
    legacy.lifetime!.ascensions = 1;
    legacy.collection!.bossTrophies = 1;
    delete legacy.ascendancy!.victories;

    const loaded = deserialize(JSON.stringify(legacy));
    expect(loaded.ascendancy.victories).toBe(1);
    expect(loaded.killIndex).toBe(s.killIndex);
    expect(serialize(loaded)).toBe(serialize(s));

    const twin = deserialize(serialize(s));
    advance(loaded, 3600);
    advance(twin, 3600);
    expect(serialize(loaded)).toBe(serialize(twin));
  });
});
