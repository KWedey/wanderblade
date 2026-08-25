import { describe, expect, it } from 'vitest';
import { advance, enterPortal, initialState, serialize } from '../src/index';
import { clone, portalReady, strikesAt } from './helpers';

// The load-bearing invariant (docs/DECISIONS.md #6):
//   advance(s, a + b) === advance(advance(s, a), b), exactly — same state AND
//   same events — now including strikes, phase transitions, and ascension.
describe('split-advance determinism: pure idle Road', () => {
  const seeds = [1, 42, 12345, 999, 7];
  const splits: Array<[number, number]> = [
    [3600, 3600],
    [1800, 5400],
    [1000, 6200],
    [1, 7199],
    [5000, 2200],
  ];

  for (const seed of seeds) {
    for (const [a, b] of splits) {
      it(`seed ${seed}, split ${a}+${b}: identical state and events`, () => {
        const single = initialState(seed);
        const evSingle = advance(single, a + b);

        const split = initialState(seed);
        const evSplit = advance(split, a).concat(advance(split, b));

        // JSON.stringify of the arrays compares only the ordered events.
        expect(JSON.stringify(evSplit)).toBe(JSON.stringify(evSingle));
        expect(serialize(split)).toBe(serialize(single));
      });
    }
  }

  it('is invariant under a many-way split across a multi-day offline gap', () => {
    const one = initialState(42);
    advance(one, 10 * 86_400);

    const many = initialState(42);
    for (let i = 0; i < 240; i++) advance(many, 3600);

    expect(serialize(many)).toBe(serialize(one));
    expect(one.collection.zonesCleared).toBeGreaterThan(0);
  });
});

describe('split-advance determinism: strikes', () => {
  const rates = [0.7, 2, 4];
  const splits: Array<[number, number]> = [
    [300, 300],
    [1, 599],
    [123.456, 476.544],
    [599.9, 0.1],
  ];

  for (const rate of rates) {
    for (const [a, b] of splits) {
      it(`rate ${rate}/s, split ${a}+${b}: identical state and events`, () => {
        const strikes = strikesAt(0, 600, rate);

        const single = initialState(8);
        const evSingle = advance(single, a + b, strikes);

        // The same full array is handed to both halves; each strike must land in
        // exactly one of them.
        const split = initialState(8);
        const evSplit = advance(split, a, strikes).concat(advance(split, b, strikes));

        expect(JSON.stringify(evSplit)).toBe(JSON.stringify(evSingle));
        expect(serialize(split)).toBe(serialize(single));
      });
    }
  }

  it('is invariant when a split lands exactly on a strike timestamp', () => {
    const strikes = strikesAt(0, 600, 2); // strikes at 0.5, 1.0, 1.5, ...
    const single = initialState(8);
    advance(single, 600, strikes);

    const split = initialState(8);
    advance(split, 100, strikes); // boundary at t=100, a strike instant
    advance(split, 500, strikes);

    expect(serialize(split)).toBe(serialize(single));
  });

  it('is invariant when a strike and a kill share an instant', () => {
    // Zone 0 kills land on the 2s floor; strike exactly on those instants.
    const strikes = [2, 4, 6, 8, 10];
    const single = initialState(8);
    const evSingle = advance(single, 12, strikes);

    const split = initialState(8);
    const evSplit = advance(split, 6, strikes).concat(advance(split, 6, strikes));

    expect(JSON.stringify(evSplit)).toBe(JSON.stringify(evSingle));
    expect(serialize(split)).toBe(serialize(single));
  });

  it('gives identical results for identical inputs from a reloaded snapshot', () => {
    const base = initialState(5);
    advance(base, 4321, strikesAt(0, 4321, 1.5));

    const a = clone(base);
    const b = clone(base);
    const strikes = strikesAt(4321, 2500, 3);
    advance(a, 2500, strikes);
    advance(b, 2500, strikes);

    expect(serialize(a)).toBe(serialize(b));
  });
});

describe('split-advance determinism: boss phase', () => {
  const splits: Array<[number, number]> = [
    [1800, 1800],
    [1, 3599],
    [777.25, 2822.75],
  ];

  for (const [a, b] of splits) {
    it(`idle boss, split ${a}+${b}: identical boss HP and state`, () => {
      const single = portalReady(51, 300);
      enterPortal(single);
      advance(single, a + b);

      const split = portalReady(51, 300);
      enterPortal(split);
      advance(split, a);
      advance(split, b);

      expect(split.boss.hpRemaining).toBe(single.boss.hpRemaining);
      expect(serialize(split)).toBe(serialize(single));
    });

    it(`struck boss, split ${a}+${b}: identical boss HP and state`, () => {
      const strikes = strikesAt(0, a + b, 3);

      const single = portalReady(51, 300);
      enterPortal(single);
      advance(single, a + b, strikes);

      const split = portalReady(51, 300);
      enterPortal(split);
      advance(split, a, strikes);
      advance(split, b, strikes);

      expect(split.boss.hpRemaining).toBe(single.boss.hpRemaining);
      expect(serialize(split)).toBe(serialize(single));
    });
  }

  it('reaches the same boss HP offline as it does live, tick by tick', () => {
    const offline = portalReady(52, 300);
    enterPortal(offline);
    advance(offline, 3600);

    const live = portalReady(52, 300);
    enterPortal(live);
    for (let i = 0; i < 14_400; i++) advance(live, 0.25); // 250 ms client ticks

    expect(live.boss.hpRemaining).toBe(offline.boss.hpRemaining);
    expect(serialize(live)).toBe(serialize(offline));
  });
});

describe('split-advance determinism: ascension', () => {
  const splits: Array<[number, number]> = [
    [43_200, 43_200],
    [1, 86_399],
    [12_345.5, 74_054.5],
  ];

  for (const [a, b] of splits) {
    it(`victory mid-advance, split ${a}+${b}: identical next-realm state`, () => {
      const single = portalReady(53, 4000);
      enterPortal(single);
      const evSingle = advance(single, a + b);

      const split = portalReady(53, 4000);
      enterPortal(split);
      const evSplit = advance(split, a).concat(advance(split, b));

      expect(single.lifetime.ascensions).toBe(1);
      expect(JSON.stringify(evSplit)).toBe(JSON.stringify(evSingle));
      expect(serialize(split)).toBe(serialize(single));
    });
  }

  it('survives a many-way split across the victory instant', () => {
    const one = portalReady(53, 4000);
    enterPortal(one);
    advance(one, 86_400);

    const many = portalReady(53, 4000);
    enterPortal(many);
    for (let i = 0; i < 1440; i++) advance(many, 60);

    expect(serialize(many)).toBe(serialize(one));
    expect(one.realm).toBe(1);
  });

  it('does not reset the RNG stream on ascension', () => {
    const s = portalReady(53, 4000);
    const rngAtEntry = s.rngState;
    const killIndexAtEntry = s.killIndex;
    enterPortal(s);
    advance(s, 86_400);
    expect(s.lifetime.ascensions).toBe(1);
    // Road kills after ascension advanced the stream; it never rewound.
    expect(s.killIndex).toBeGreaterThan(killIndexAtEntry);
    expect(s.rngState).not.toBe(rngAtEntry);
  });
});
