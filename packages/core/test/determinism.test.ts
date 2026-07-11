import { describe, it, expect } from 'vitest';
import { initialState, advance, serialize, deserialize } from '../src/index';
import type { GameState } from '../src/index';

function clone(s: GameState): GameState {
  return deserialize(serialize(s));
}

// The core determinism contract (docs/DECISIONS.md #6):
//   advance(s, a + b) === advance(advance(s, a), b), exactly — same state AND
//   same events. Splits are chosen to land mid-zone, at gates, and across
//   region transitions.
describe('split-advance determinism', () => {
  const seeds = [1, 42, 12345, 999, 7];
  // Each pair sums to 7200s. This asserts EVENT-stream equality, which only holds
  // while the stream stays under EVENT_CAP (50k) — a longer horizon truncates the
  // single vs. split runs at different points. In 2h of pure idle the hero clears
  // the region-0 zones and parks at (forms) the gate, so the splits land mid-zone,
  // at a zone/region transition, and at gate formation. Gate-CROSSING determinism
  // — which now takes a multi-day pure-idle farm — is covered by the state-equality
  // three-way split below (serialize equality holds exactly, even past the cap).
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
        const ev1 = advance(split, a);
        const ev2 = advance(split, b);
        const evSplit = ev1.concat(ev2);

        // JSON.stringify of the arrays ignores the attached `recap` property and
        // compares only the ordered events.
        expect(JSON.stringify(evSplit)).toBe(JSON.stringify(evSingle));
        expect(serialize(split)).toBe(serialize(single));
      });
    }
  }

  it('is invariant under a three-way split that crosses gates', () => {
    // 3 days crosses the region-0 gate for seed 42 (pure idle ~54h), so the split
    // boundaries fall around a real gate/boss transition.
    const one = initialState(42);
    advance(one, 259_200);

    const three = initialState(42);
    advance(three, 86_400);
    advance(three, 86_400);
    advance(three, 86_400);

    expect(serialize(three)).toBe(serialize(one));
    expect(one.lifetime.bossKills).toBeGreaterThan(0); // gates were actually crossed
  });

  it('produces identical results from a deserialized mid-run snapshot', () => {
    const base = initialState(5);
    advance(base, 4321);

    const contA = clone(base);
    const contB = clone(base);
    advance(contA, 2500);
    advance(contB, 2500);

    expect(serialize(contA)).toBe(serialize(contB));
  });
});
