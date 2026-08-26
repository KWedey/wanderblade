// One roster, so the log and the scene name and draw the same creature. The
// species a kill produces is decided here and read by both; neither picks its
// own. Presentational only — nothing here reaches the economy (DECISIONS.md #12).

import { INK } from './scene/palette';

/**
 * Silhouettes, in the order `MONSTER_SILHOUETTES` declares them. Named here so
 * a roster entry says which creature it is instead of carrying a bare index;
 * `species.test.ts` holds this list against the scene's.
 */
export const SWARMLING = 0;
export const OOZE = 1;
export const HOUND = 2;
export const STALKER = 3;
export const GOLEM = 4;

export interface Species {
  name: string;
  /** Index into `MONSTER_SHAPES`. */
  shape: number;
  /**
   * The creature's own colour, not its realm's. A species keeps it wherever it
   * is drawn, so the Bestiary and the road agree and a player learns a threat
   * by sight. Realm identity is the backdrop's job (DECISIONS.md #35).
   */
  body: string;
}

const s = (name: string, shape: number, body: string): Species => ({ name, shape, body });

/**
 * Road creatures per realm. A realm's roster need not use every silhouette, and
 * may repeat one — what it may not do is name a creature the scene cannot draw.
 */
const ROSTERS: Species[][] = [
  // Greenwood - lime turf under a cyan sky, so the roster runs dark and warm.
  [
    s('Green Sprite', SWARMLING, INK.teal),
    s('Moss Troll', GOLEM, INK.bronze),
    s('Ashen Wolf', HOUND, INK.greyDark),
    s('Thornback Lynx', STALKER, INK.orange),
    s('Bramble Boar', HOUND, INK.wood),
  ],
  // Ruinfields - khaki turf and bleached stone; the dead read cold against it.
  [
    s('Grave Mite', SWARMLING, INK.plum),
    s('Rubble Golem', GOLEM, INK.stone),
    s('Dust Jackal', HOUND, INK.woodLight),
    s('Tomb Wight', STALKER, INK.steelBlue),
    s('Cracked Sentinel', GOLEM, INK.greyDark),
  ],
  // Mistmarsh - teal water light, so nothing in the roster is allowed to be teal.
  [
    s("Will-o'-Wisp", SWARMLING, INK.yellow),
    s('Bog Lurker', OOZE, INK.moss),
    s('Fen Serpent', OOZE, INK.olive),
    s('Mire Hag', STALKER, INK.purple),
    s('Marsh Drake', GOLEM, INK.slateGreen),
  ],
  // Ironhills - grey stone turf; the roster carries the only saturated colour.
  [
    s('Cragfang Bat', SWARMLING, INK.indigo),
    s('Rock Wyrm', OOZE, INK.wood),
    s('Iron Kobold', HOUND, INK.crimson),
    s('Anvil Ogre', STALKER, INK.steelBlue),
    s('Forge Golem', GOLEM, INK.bronze),
  ],
  // Ember Wastes - hot orange ground, so the roster goes dark rather than hotter.
  [
    s('Cinder Imp', SWARMLING, INK.crimson),
    s('Slag Ooze', OOZE, INK.olive),
    s('Magma Hound', HOUND, INK.night),
    s('Ember Wraith', STALKER, INK.plum),
    s('Ash Revenant', GOLEM, INK.stone),
  ],
  // Dragon Peaks - violet dusk; the roster answers it in cold blues and bone.
  [
    s('Frost Mote', SWARMLING, INK.ice),
    s('Storm Serpent', OOZE, INK.blue),
    s('Frost Drake', HOUND, INK.cyan),
    s('Wyvern', STALKER, INK.slateGreen),
    s('Ridge Dragon', GOLEM, INK.crimson),
  ],
  // World's Edge - the one low-key realm, so its roster is the brightest.
  [
    s('Riftling', SWARMLING, INK.pink),
    s('Star Wraith', OOZE, INK.cyan),
    s('Edge Reaver', HOUND, INK.rose),
    s('Void Sentinel', STALKER, INK.grey),
    s('Astral Behemoth', GOLEM, INK.purple),
  ],
];

/** How many realms have a roster of their own before the list laps. */
export const ROSTER_COUNT = ROSTERS.length;

/**
 * Creatures in one realm's roster. Not the silhouette count: the Portal
 * guardian has a silhouette no road roster is allowed to name.
 */
export const ROSTER_SIZE = ROSTERS[0]?.length ?? 0;

const FALLBACK = s('Rift Beast', GOLEM, INK.purple);

/**
 * The Portal guardian's colour. Violet in every realm on purpose: the rift is
 * one thing wherever it opens, and the frame it appears in already changed.
 */
export const GUARDIAN_BODY = INK.purple;

/**
 * The creature kill `killIndex` fights in `realm`. Keyed on the engine's own
 * kill index, so the log line and the queued sprite resolve to one answer. Laps
 * with the biome names and the scene's skins, which cycle on the same modulo.
 */
export function speciesAt(realm: number, killIndex: number): Species {
  const r = realm < 0 ? 0 : realm;
  const roster = ROSTERS[r % ROSTERS.length];
  if (!roster || roster.length === 0) return FALLBACK;
  const i = ((killIndex % roster.length) + roster.length) % roster.length;
  return roster[i] ?? FALLBACK;
}

/**
 * The roster slot `killIndex` lands on, for callers that index a per-species
 * cache rather than reading the species itself.
 */
export function speciesIndexAt(realm: number, killIndex: number): number {
  const r = realm < 0 ? 0 : realm;
  const roster = ROSTERS[r % ROSTERS.length];
  const n = roster?.length ?? 1;
  return ((killIndex % n) + n) % n;
}

/** One realm's creatures, in slot order. */
export function rosterAt(realm: number): readonly Species[] {
  const r = realm < 0 ? 0 : realm;
  return ROSTERS[r % ROSTERS.length] ?? [FALLBACK];
}
