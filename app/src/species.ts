// One roster, so the log and the scene name and draw the same creature. The
// species a kill produces is decided here and read by both; neither picks its
// own. Presentational only — nothing here reaches the economy (DECISIONS.md #12).

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
}

const s = (name: string, shape: number): Species => ({ name, shape });

/**
 * Road creatures per realm. A realm's roster need not use every silhouette, and
 * may repeat one — what it may not do is name a creature the scene cannot draw.
 */
const ROSTERS: Species[][] = [
  [
    s('Green Sprite', SWARMLING),
    s('Moss Troll', GOLEM),
    s('Ashen Wolf', HOUND),
    s('Thornback Lynx', STALKER),
    s('Bramble Boar', HOUND),
  ],
  [
    s('Grave Mite', SWARMLING),
    s('Rubble Golem', GOLEM),
    s('Dust Jackal', HOUND),
    s('Tomb Wight', STALKER),
    s('Cracked Sentinel', GOLEM),
  ],
  [
    s("Will-o'-Wisp", SWARMLING),
    s('Bog Lurker', OOZE),
    s('Fen Serpent', OOZE),
    s('Mire Hag', STALKER),
    s('Marsh Drake', GOLEM),
  ],
  [
    s('Cragfang Bat', SWARMLING),
    s('Rock Wyrm', OOZE),
    s('Iron Kobold', HOUND),
    s('Anvil Ogre', STALKER),
    s('Forge Golem', GOLEM),
  ],
  [
    s('Cinder Imp', SWARMLING),
    s('Slag Ooze', OOZE),
    s('Magma Hound', HOUND),
    s('Ember Wraith', STALKER),
    s('Ash Revenant', GOLEM),
  ],
  [
    s('Frost Mote', SWARMLING),
    s('Storm Serpent', OOZE),
    s('Frost Drake', HOUND),
    s('Wyvern', STALKER),
    s('Ridge Dragon', GOLEM),
  ],
  [
    s('Riftling', SWARMLING),
    s('Star Wraith', OOZE),
    s('Edge Reaver', HOUND),
    s('Void Sentinel', STALKER),
    s('Astral Behemoth', GOLEM),
  ],
];

/** How many realms have a roster of their own before the list laps. */
export const ROSTER_COUNT = ROSTERS.length;

/**
 * Creatures in one realm's roster. Not the silhouette count: the Portal
 * guardian has a silhouette no road roster is allowed to name.
 */
export const ROSTER_SIZE = ROSTERS[0]?.length ?? 0;

const FALLBACK = s('Rift Beast', GOLEM);

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
