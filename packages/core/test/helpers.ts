import {
  advance,
  bossHp,
  deserialize,
  enemyHp,
  heroDps,
  initialState,
  killsPerZone,
  killTime,
  serialize,
  zonesPerRealm,
  type GameState,
} from '../src/index';

/** Seconds a zone-0 kill takes at the starting build, with no momentum. */
export const ROAD_KILL0_SEC = killTime(initialState(0), 0);

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

function equip(s: GameState, power: number): void {
  s.gear.weapon = { power, rarity: 'rare', realm: s.realm, zone: s.zone };
  s.nextActionAtSec = s.timeSec + killTime(s, 0);
}

/** A Road state parked at `zone` whose kills take about `killSeconds` each. */
export function roadAt(seed: number, zone: number, killSeconds: number): GameState {
  const s = initialState(seed);
  s.zone = zone;
  equip(s, Math.max(1, enemyHp(s.realm, zone) / killSeconds - heroDps(s)));
  return s;
}

/** One kill short of the portal, so the very next kill opens it. */
export function nearPortal(seed: number, killSeconds: number): GameState {
  const s = roadAt(seed, zonesPerRealm - 1, killSeconds);
  s.killsInZone = killsPerZone - 1;
  return s;
}

/**
 * Jump straight to a portal-ready Road whose guardian takes roughly
 * `bossSeconds` at zero momentum, so boss and ascension tests need seconds
 * instead of hours. Reaching in like this is what the client must never do.
 */
export function portalReady(seed: number, bossSeconds: number): GameState {
  const s = initialState(seed);
  s.zone = zonesPerRealm - 1;
  s.killsInZone = killsPerZone - 1;
  s.portalReady = true;
  s.gold = 1000;
  s.ascendancy.pending = 5;
  equip(s, Math.max(1, bossHp(s.realm) / bossSeconds - heroDps(s)));
  return s;
}
