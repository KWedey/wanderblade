import {
  advance,
  deserialize,
  initialState,
  killsPerZone,
  serialize,
  zonesPerRealm,
  type GameState,
} from '../src/index';

export function clone(s: GameState): GameState {
  return deserialize(serialize(s));
}

/** A state advanced by `seconds` of pure idle from a fresh seed. */
export function idleTo(seed: number, seconds: number): GameState {
  const s = initialState(seed);
  if (seconds > 0) advance(s, seconds);
  return s;
}

/** Evenly spaced strike timestamps in (from, from + seconds]. */
export function strikesAt(from: number, seconds: number, rate: number): number[] {
  const out: number[] = [];
  const step = 1 / rate;
  for (let t = from + step; t <= from + seconds + 1e-12; t += step) out.push(t);
  return out;
}

/**
 * Jump straight to a portal-ready Road with a chosen weapon, so boss and
 * ascension tests need seconds instead of hours. Reaching in like this is what
 * the client must never do, which is why it lives in the test helper.
 */
export function portalReady(seed: number, weaponPower: number): GameState {
  const s = initialState(seed);
  s.zone = zonesPerRealm - 1;
  s.killsInZone = killsPerZone - 1;
  s.portalReady = true;
  s.gold = 1000;
  s.ascendancy.pending = 5;
  s.gear.weapon = { power: weaponPower, rarity: 'rare', realm: s.realm, zone: s.zone };
  return s;
}
