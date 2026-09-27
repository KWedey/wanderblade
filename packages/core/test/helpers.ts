import {
  advance,
  arcPositionAt,
  bossHp,
  deserialize,
  enemyHp,
  heroDps,
  initialState,
  killsPerZoneFor,
  killTime,
  serialize,
  zonesForRealm,
  type ArcPoint,
  type GameState,
  type Strike,
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

/** Evenly spaced strikes in (from, from + seconds], all aimed at `aim`. */
export function strikesAt(
  from: number,
  seconds: number,
  rate: number,
  aim: ArcPoint | null = null,
): Strike[] {
  const out: Strike[] = [];
  const step = 1 / rate;
  for (let t = from + step; t <= from + seconds + 1e-12; t += step) out.push({ atSec: t, aim });
  return out;
}

/** Where the oldest arc still in flight at `atSec` will be — a perfect aim. */
export function aimAtOldestArc(state: GameState, atSec: number): ArcPoint | null {
  for (const arc of state.arcs) {
    const p = arcPositionAt(arc, atSec);
    if (p) return p;
  }
  return null;
}

/** Advance `seconds` striking at `rate`, aiming every strike at a live arc. */
export function playActive(state: GameState, seconds: number, rate: number): void {
  const end = state.timeSec + seconds;
  const step = 1 / rate;
  let next = state.timeSec + step;
  while (next <= end + 1e-12) {
    advance(state, next - state.timeSec, [{ atSec: next, aim: aimAtOldestArc(state, next) }]);
    next += step;
  }
  if (end > state.timeSec) advance(state, end - state.timeSec);
}

function equip(s: GameState, power: number): void {
  s.gear.weapon = { power, rarity: 'rare', realm: s.realm, zone: s.zone };
  s.nextActionAtSec = s.timeSec + killTime(s, 0);
}

/**
 * A Road state parked at `zone` whose kills take about `killSeconds` each, in
 * the first realm whose road is long enough to have that zone.
 */
export function roadAt(seed: number, zone: number, killSeconds: number): GameState {
  const s = initialState(seed);
  while (zone >= zonesForRealm(s.realm)) s.realm += 1;
  s.zone = zone;
  equip(s, Math.max(1, enemyHp(s.realm, zone) / killSeconds - heroDps(s)));
  return s;
}

/** One kill short of the portal, so the very next kill opens it. */
export function nearPortal(seed: number, killSeconds: number): GameState {
  const s = roadAt(seed, zonesForRealm(0) - 1, killSeconds);
  s.killsInZone = killsPerZoneFor(0) - 1;
  return s;
}

/**
 * Jump straight to a portal-ready Road whose guardian takes roughly
 * `bossSeconds` at zero momentum, so boss and ascension tests need seconds
 * instead of hours. Reaching in like this is what the client must never do.
 */
export function portalReady(seed: number, bossSeconds: number, realm = 0): GameState {
  const s = initialState(seed);
  s.realm = realm;
  s.zone = zonesForRealm(s.realm) - 1;
  s.killsInZone = killsPerZoneFor(s.realm) - 1;
  s.portalReady = true;
  s.gold = 1000;
  s.ascendancy.pending = 5;
  equip(s, Math.max(1, bossHp(s.realm) / bossSeconds - heroDps(s)));
  return s;
}
