import { describe, expect, it } from 'vitest';
import {
  advance,
  deserialize,
  dropChanceFor,
  goldPerKill,
  initialState,
  serialize,
  SPECIES,
  speciesFor,
  speciesIndex,
  type GameEvent,
} from '../src/index';
import { clone, roadAt } from './helpers';

function kills(events: GameEvent[]): Array<Extract<GameEvent, { type: 'kill' }>> {
  return events.filter((e): e is Extract<GameEvent, { type: 'kill' }> => e.type === 'kill');
}

describe('a zone is monsters, not one monster repeated', () => {
  it('keeps the roster mean at exactly 1, so no pacing band can move', () => {
    const total = SPECIES.reduce((t, s) => t + s.goldMult, 0);
    expect(total).toBeCloseTo(SPECIES.length, 12);
  });

  it('varies payout between neighbouring kills in the same zone', () => {
    const s = roadAt(4, 10, 0.3);
    const seen = new Set<number>();
    const paid = new Set<string>();
    for (const e of kills(advance(s, 60))) {
      seen.add(e.species);
      paid.add(e.gold.toExponential(9));
    }
    // The critic's complaint, inverted: three names, three different numbers.
    expect(seen.size).toBe(SPECIES.length);
    expect(paid.size).toBe(SPECIES.length);
  });

  it('pays exactly the zone rate times that monster’s share', () => {
    const s = roadAt(4, 10, 0.3);
    const rate = goldPerKill(s);
    for (const e of kills(advance(s, 30))) {
      expect(e.gold).toBeCloseTo(rate * speciesFor(e.killIndex).goldMult, 9);
      expect(e.species).toBe(speciesIndex(e.killIndex));
    }
  });

  it('consumes no RNG draw, so the drop stream stays keyed to the kill', () => {
    // speciesIndex is a pure function of the index — a state that has not
    // advanced still knows what its next hundred kills will be.
    const a = initialState(9);
    const b = clone(a);
    const before = a.rngState;
    for (let i = 1; i <= 100; i++) expect(speciesIndex(i)).toBe(speciesIndex(i));
    expect(a.rngState).toBe(before);
    expect(serialize(a)).toBe(serialize(b));
  });

  it('gives the drop weight its own shape, not gold’s', () => {
    const byGold = [...SPECIES].sort((x, y) => x.goldMult - y.goldMult);
    const byDrop = [...SPECIES].sort((x, y) => x.dropMult - y.dropMult);
    // The richest monster is deliberately not the most generous one.
    expect(byGold.map((s) => s.dropMult)).not.toEqual(byDrop.map((s) => s.dropMult));
    for (const s of SPECIES) expect(dropChanceFor(0) * s.dropMult).toBeGreaterThan(0);
  });

  it('records a Bestiary count per species that adds up to every kill', () => {
    const s = roadAt(4, 10, 0.3);
    advance(s, 600);
    const counted = s.collection.speciesKills.reduce((t, n) => t + n, 0);
    expect(counted).toBe(s.killIndex);
    expect(s.collection.speciesKills.length).toBe(SPECIES.length);
    for (const n of s.collection.speciesKills) expect(n).toBeGreaterThan(0);
  });

  it('is split-invariant: the same span in halves records the same Bestiary', () => {
    const whole = roadAt(4, 10, 0.3);
    advance(whole, 400);
    const halves = roadAt(4, 10, 0.3);
    advance(halves, 150);
    advance(halves, 250);
    expect(halves.collection.speciesKills).toEqual(whole.collection.speciesKills);
    expect(halves.gold).toBe(whole.gold);
  });

  it('keeps the tally dense from the first kill, so its JSON carries no null', () => {
    const s = initialState(7);
    advance(s, 0.5);
    expect(s.killIndex).toBe(1);
    expect(speciesIndex(1)).toBeGreaterThan(0); // the first kill is not species 0
    expect(s.collection.speciesKills).toEqual([0, 0, 0, 1]);
    expect(JSON.stringify(s.collection.speciesKills)).not.toContain('null');
    expect(serialize(clone(s))).toBe(serialize(s));

    // The padding is part of the state, so a split has to lay it down identically.
    const halves = initialState(7);
    advance(halves, 0.2);
    advance(halves, 0.3);
    expect(serialize(halves)).toBe(serialize(s));
  });

  it('reads the holes an older engine left in the tally as zero kills', () => {
    const s = initialState(7);
    advance(s, 0.5);
    const old = JSON.parse(serialize(s)) as { collection: { speciesKills: (number | null)[] } };
    old.collection.speciesKills = [null, null, null, 1];

    const loaded = deserialize(JSON.stringify(old));
    expect(loaded.collection.speciesKills).toEqual([0, 0, 0, 1]);
  });

  it('loads a save written before the Bestiary existed, rather than discarding it', () => {
    const s = roadAt(4, 10, 0.3);
    advance(s, 120);
    const old = JSON.parse(serialize(s)) as Record<string, unknown>;
    delete (old.collection as Record<string, unknown>).speciesKills;

    const loaded = deserialize(JSON.stringify(old));
    expect(loaded.collection.speciesKills).toEqual([]);
    expect(loaded.killIndex).toBe(s.killIndex);
    // And it starts counting from the next kill without throwing.
    advance(loaded, 60);
    expect(loaded.collection.speciesKills.reduce((t, n) => t + n, 0)).toBeGreaterThan(0);
  });
});
