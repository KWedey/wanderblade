import { describe, it, expect } from 'vitest';
import { initialState, advance, serialize, deserialize } from '../src/index';

describe('serialize / deserialize', () => {
  it('round-trips a fresh state exactly', () => {
    const s = initialState(1234);
    const round = deserialize(serialize(s));
    expect(round).toEqual(s);
    expect(serialize(round)).toBe(serialize(s));
  });

  it('round-trips a mid-run state, preserving rngState and killIndex', () => {
    const s = initialState(77);
    advance(s, 3333.5); // partial time → non-trivial kill schedule + rng position
    expect(s.killIndex).toBeGreaterThan(0);
    expect(s.gold).toBeGreaterThan(0);

    const json = serialize(s);
    const round = deserialize(json);

    expect(round.rngState).toBe(s.rngState);
    expect(round.killIndex).toBe(s.killIndex);
    expect(round.nextKillAtSec).toBe(s.nextKillAtSec);
    expect(round.timeSec).toBe(s.timeSec);
    expect(round).toEqual(s);
  });

  it('a deserialized state continues identically to the original', () => {
    const original = initialState(9);
    advance(original, 2000);

    const restored = deserialize(serialize(original));

    const evA = advance(original, 1500);
    const evB = advance(restored, 1500);

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
    // idempotent: serialize(deserialize(x)) === x
    expect(serialize(deserialize(json))).toBe(json);
  });
});
