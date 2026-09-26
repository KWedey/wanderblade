import { describe, expect, it } from 'vitest';
import {
  advance,
  CLOCK_MS_PER_SEC,
  clockAfter,
  clockMs,
  createRng,
  enterPortal,
  initialState,
  serialize,
  type GameEvent,
} from '../src/index';
import { clone, portalReady, ROAD_KILL0_SEC, strikesAt } from './helpers';

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
    // Strike exactly on the instants zone-0 kills land on.
    const strikes = [1, 2, 3, 4, 5].map((n) => ({
      atSec: n * ROAD_KILL0_SEC,
      aim: { x: 0.5, y: 1 },
    }));
    const span = 6 * ROAD_KILL0_SEC;
    const single = initialState(8);
    const evSingle = advance(single, 2 * span, strikes);

    const split = initialState(8);
    const evSplit = advance(split, span, strikes).concat(advance(split, span, strikes));

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
      const single = portalReady(51, 4 * 3600);
      enterPortal(single);
      advance(single, a + b);

      const split = portalReady(51, 4 * 3600);
      enterPortal(split);
      advance(split, a);
      advance(split, b);

      expect(split.boss.hpRemaining).toBe(single.boss.hpRemaining);
      expect(serialize(split)).toBe(serialize(single));
    });

    it(`struck boss, split ${a}+${b}: identical boss HP and state`, () => {
      const strikes = strikesAt(0, a + b, 3);

      const single = portalReady(51, 4 * 3600);
      enterPortal(single);
      advance(single, a + b, strikes);

      const split = portalReady(51, 4 * 3600);
      enterPortal(split);
      advance(split, a, strikes);
      advance(split, b, strikes);

      expect(split.boss.hpRemaining).toBe(single.boss.hpRemaining);
      expect(serialize(split)).toBe(serialize(single));
    });
  }

  it('reaches the same boss HP offline as it does live, tick by tick', () => {
    const offline = portalReady(52, 4 * 3600);
    enterPortal(offline);
    advance(offline, 3600);

    const live = portalReady(52, 4 * 3600);
    enterPortal(live);
    for (let i = 0; i < 14_400; i++) advance(live, 0.25); // 250 ms client ticks

    expect(live.boss.hpRemaining).toBe(offline.boss.hpRemaining);
    expect(serialize(live)).toBe(serialize(offline));
  });
});

describe('split-advance determinism: ascension', () => {
  // The guardian falls at ~3600s and the next realm's Road runs out the rest.
  // Event equality only holds below EVENT_CAP, which each half gets in full,
  // so the window stays short enough that neither side truncates.
  const splits: Array<[number, number]> = [
    [3600, 3600],
    [1, 7199],
    [1234.5, 5965.5],
  ];

  for (const [a, b] of splits) {
    it(`victory mid-advance, split ${a}+${b}: identical next-realm state`, () => {
      const single = portalReady(53, 3600);
      enterPortal(single);
      const evSingle = advance(single, a + b);

      const split = portalReady(53, 3600);
      enterPortal(split);
      const evSplit = advance(split, a).concat(advance(split, b));

      expect(single.lifetime.ascensions).toBe(1);
      expect(JSON.stringify(evSplit)).toBe(JSON.stringify(evSingle));
      expect(serialize(split)).toBe(serialize(single));
    });
  }

  it('survives a many-way split across the victory instant', () => {
    const one = portalReady(53, 3600);
    enterPortal(one);
    advance(one, 7200);

    const many = portalReady(53, 3600);
    enterPortal(many);
    for (let i = 0; i < 120; i++) advance(many, 60);

    expect(serialize(many)).toBe(serialize(one));
    expect(one.realm).toBe(1);
  });

  it('does not reset the RNG stream on ascension', () => {
    const s = portalReady(53, 3600);
    const rngAtEntry = s.rngState;
    const killIndexAtEntry = s.killIndex;
    enterPortal(s);
    advance(s, 7200);
    expect(s.lifetime.ascensions).toBe(1);
    // Road kills after ascension advanced the stream; it never rewound.
    expect(s.killIndex).toBeGreaterThan(killIndexAtEntry);
    expect(s.rngState).not.toBe(rngAtEntry);
  });
});

// Float seconds add non-associatively, so before the clock was quantized the
// contract above held only for exactly-representable inputs. On the
// millisecond grid every sum is an integer sum.
describe('split-advance determinism: the millisecond clock grid', () => {
  it('0.1 + 0.2 + 0.3 lands on the same instant however it is bracketed', () => {
    const left = initialState(3);
    advance(left, 0.1);
    advance(left, 0.2);
    advance(left, 0.3);
    const right = initialState(3);
    advance(right, 0.1);
    advance(right, 0.5);
    expect(left.timeSec).toBe(0.6);
    expect(serialize(left)).toBe(serialize(right));
  });

  it('rounds the requested seconds to the grid and keeps timeSec on it', () => {
    const s = initialState(3);
    expect(advance(s, 0.0004)).toHaveLength(0);
    expect(s.timeSec).toBe(0);
    advance(s, 0.0006);
    expect(s.timeSec).toBe(0.001);
    advance(s, 1234.5678);
    expect(s.timeSec).toBe(1234.569);
    expect(clockMs(s.timeSec)).toBe(1234569);
  });

  it('survives many seeded random fractional splits from a fractional start, with strikes', () => {
    const START_SEC = 987.654;
    const SPAN_MS = 600_000;
    const strikes = strikesAt(START_SEC, SPAN_MS / CLOCK_MS_PER_SEC, 1.7, { x: 0.5, y: 1 });

    const single = initialState(21);
    advance(single, START_SEC);
    const evSingle = advance(single, SPAN_MS / CLOCK_MS_PER_SEC, strikes);

    const rng = createRng(0xc0ffee);
    for (let trial = 0; trial < 20; trial++) {
      const split = initialState(21);
      advance(split, START_SEC);
      let evSplit: GameEvent[] = [];
      let leftMs = SPAN_MS;
      while (leftMs > 0) {
        const pieceMs = Math.min(leftMs, 1 + Math.floor(rng.next() * 45_000));
        evSplit = evSplit.concat(advance(split, pieceMs / CLOCK_MS_PER_SEC, strikes));
        leftMs -= pieceMs;
      }
      expect(JSON.stringify(evSplit), `trial ${trial}`).toBe(JSON.stringify(evSingle));
      expect(serialize(split), `trial ${trial}`).toBe(serialize(single));
    }
    expect(evSingle.filter((e) => e.type === 'arcCatch').length).toBeGreaterThan(0);
  });

  it('a strike stamped through clockAfter at the tick boundary is never lost', () => {
    const s = initialState(3);
    advance(s, 4095.999);
    const atSec = clockAfter(s.timeSec, 0.001);
    const events = advance(s, 0.001, [{ atSec, aim: null }]);
    expect(s.timeSec).toBe(atSec);
    expect(s.momentum.atSec).toBe(atSec);
    expect(events).toHaveLength(0);
    expect(s.momentum.value).toBeGreaterThan(0);
  });
});
