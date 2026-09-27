// Realm length and the pacing bands, as functions of realm index
// (docs/DECISIONS.md #63). Realm 0 is tutorial-length; realms grow toward the
// full ladder and hold it from FULL_LENGTH_REALM on, so a new player ascends in
// one sitting and a veteran keeps the bands docs/ACTIVE-PLAY.md always had.

import {
  BOSS_BAND_FULL_SEC,
  BOSS_BAND_REALM0_SEC,
  bossHpMultFull,
  bossHpMultRealm0,
  DROPS_PER_ZONE,
  FULL_LENGTH_REALM,
  KILLS_PER_ZONE_FULL,
  KILLS_PER_ZONE_REALM0,
  PORTAL_BAND_FULL_SEC,
  PORTAL_BAND_REALM0_SEC,
  ZONES_FULL,
  ZONES_REALM0,
} from './constants';

/** A duration band in seconds, inclusive at both ends. */
export interface PaceBand {
  minSec: number;
  maxSec: number;
}

/** Where `realm` sits between the tutorial realm (0) and the full ladder (1). */
export function realmRamp(realm: number): number {
  if (!(realm > 0)) return 0;
  return realm >= FULL_LENGTH_REALM ? 1 : realm / FULL_LENGTH_REALM;
}

/** Linear interpolation between the tutorial value and the full-ladder value. */
function ramp(realm0: number, full: number, realm: number): number {
  return realm0 + (full - realm0) * realmRamp(realm);
}

/** Zones in `realm`'s road. Clearing the last one opens the portal. */
export function zonesForRealm(realm: number): number {
  return Math.round(ramp(ZONES_REALM0, ZONES_FULL, realm));
}

/** Kills that clear one zone of `realm`. */
export function killsPerZoneFor(realm: number): number {
  return Math.round(ramp(KILLS_PER_ZONE_REALM0, KILLS_PER_ZONE_FULL, realm));
}

/** Leagues gained per Road kill in `realm`. Zone length = 1 league. */
export function leaguesPerKillFor(realm: number): number {
  return 1 / killsPerZoneFor(realm);
}

/** Chance of a gear drop per kill in `realm`: DROPS_PER_ZONE spread over the zone. */
export function dropChanceFor(realm: number): number {
  return DROPS_PER_ZONE / killsPerZoneFor(realm);
}

/** Guardian HP multiple of the realm's final-zone enemy, before BOSS_REALM_GAIN. */
export function bossHpMultFor(realm: number): number {
  return ramp(bossHpMultRealm0, bossHpMultFull, realm);
}

function bandFor(realm0: PaceBand, full: PaceBand, realm: number): PaceBand {
  return {
    minSec: ramp(realm0.minSec, full.minSec, realm),
    maxSec: ramp(realm0.maxSec, full.maxSec, realm),
  };
}

/** Realm start → portal available, for a player who never stops striking and one who never starts. */
export function portalBand(realm: number): { active: PaceBand; idle: PaceBand } {
  return {
    active: bandFor(PORTAL_BAND_REALM0_SEC.active, PORTAL_BAND_FULL_SEC.active, realm),
    idle: bandFor(PORTAL_BAND_REALM0_SEC.idle, PORTAL_BAND_FULL_SEC.idle, realm),
  };
}

/** How long `realm`'s guardian should take a prepared build at sustained full momentum. */
export function bossBand(realm: number): PaceBand {
  return bandFor(BOSS_BAND_REALM0_SEC, BOSS_BAND_FULL_SEC, realm);
}
