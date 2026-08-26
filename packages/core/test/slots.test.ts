import { describe, expect, it } from 'vitest';
import {
  advance,
  gearPower,
  gearPowerTotal,
  GEAR_SLOTS,
  RARITIES,
  SLOT_POWER,
  type GearState,
  type Rarity,
} from '../src/index';
import { clone, roadAt } from './helpers';

/** A kit where every slot holds the drop rolled at `realm`/`z` at `rarity`. */
function kitAt(realm: number, z: number, rarity: Rarity): GearState {
  const gear = {} as GearState;
  for (const slot of GEAR_SLOTS) {
    gear[slot] = { power: gearPower(realm, z, rarity, slot), rarity, realm, zone: z };
  }
  return gear;
}

describe('a slot says something about the item in it', () => {
  it('weights every slot and sums to exactly the number of them', () => {
    const total = GEAR_SLOTS.reduce((t, s) => t + SLOT_POWER[s], 0);
    expect(total).toBeCloseTo(GEAR_SLOTS.length, 12);
    for (const slot of GEAR_SLOTS) expect(SLOT_POWER[slot]).toBeGreaterThan(0);
  });

  /**
   * The band-safety argument, exactly rather than statistically: a kit of the
   * same drop in every slot is worth what it was worth before the weights,
   * because the weights are a redistribution and not a raise.
   */
  it('leaves a matched kit worth exactly what it was unweighted', () => {
    for (const realm of [0, 1, 7, 30]) {
      for (const z of [0, 17, 49]) {
        for (const rarity of RARITIES) {
          const weighted = gearPowerTotal(kitAt(realm, z, rarity));
          // What the same kit was worth when every slot shared one formula.
          const flat = GEAR_SLOTS.length * (gearPower(realm, z, rarity, 'armor') / SLOT_POWER.armor);
          // Relative, because these reach 1e10 and an absolute epsilon there
          // is a test of float layout rather than of the weights.
          expect(weighted / flat).toBeCloseTo(1, 12);
        }
      }
    }
  });

  it('gives the same drop a different number in each slot', () => {
    for (const realm of [0, 4, 20]) {
      const powers = GEAR_SLOTS.map((s) => gearPower(realm, 30, 'rare', s));
      expect(new Set(powers).size).toBe(GEAR_SLOTS.length);
      // A longsword outweighs a trinket, and the order never inverts.
      expect(gearPower(realm, 30, 'rare', 'weapon')).toBeGreaterThan(
        gearPower(realm, 30, 'rare', 'armor'),
      );
      expect(gearPower(realm, 30, 'rare', 'armor')).toBeGreaterThan(
        gearPower(realm, 30, 'rare', 'trinket'),
      );
    }
  });

  /**
   * The bug a blind reviewer filed: two differently-named items carrying
   * bit-identical numbers, on 43.2% of looks. Position and rarity alone cannot
   * separate them, so the slot has to.
   */
  it('never lets two slots of one drop collide, whatever the roll', () => {
    for (const realm of [0, 3, 11]) {
      for (const z of [0, 25, 49]) {
        for (const rarity of RARITIES) {
          const kit = kitAt(realm, z, rarity);
          const powers = GEAR_SLOTS.map((s) => kit[s]?.power);
          expect(new Set(powers).size).toBe(GEAR_SLOTS.length);
        }
      }
    }
  });

  it('scales with realm, zone and rarity exactly as it did', () => {
    // The slot factor multiplies; it must not disturb the other three terms.
    for (const slot of GEAR_SLOTS) {
      const a = gearPower(3, 10, 'rare', slot);
      expect(gearPower(3, 10, 'epic', slot) / a).toBeCloseTo(
        gearPower(0, 0, 'epic', 'armor') / gearPower(0, 0, 'rare', 'armor'),
        9,
      );
      expect(gearPower(4, 10, 'rare', slot) / a).toBeCloseTo(
        gearPower(4, 0, 'rare', 'armor') / gearPower(3, 0, 'rare', 'armor'),
        9,
      );
    }
  });

  it('equips real drops into slots that no longer report one number', () => {
    const s = roadAt(6, 20, 0.3);
    advance(s, 4000);
    const worn = GEAR_SLOTS.map((k) => s.gear[k]).filter((x) => x !== null);
    expect(worn.length).toBe(GEAR_SLOTS.length);
    const powers = worn.map((x) => x.power);
    expect(new Set(powers).size).toBe(GEAR_SLOTS.length);
  });

  it('is split-invariant: the weights are a formula, not a roll', () => {
    const whole = roadAt(6, 20, 0.3);
    advance(whole, 3000);
    const halves = clone(roadAt(6, 20, 0.3));
    advance(halves, 1100);
    advance(halves, 1900);
    expect(gearPowerTotal(halves.gear)).toBe(gearPowerTotal(whole.gear));
    expect(halves.collection.gearFound).toBe(whole.collection.gearFound);
  });
});
