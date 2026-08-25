// Per-realm color skins for the road scene (DECISIONS.md #13: DB32, hard edges,
// no smooth gradients). Every band is a flat fill; depth comes from stacked
// bands and value contrast, never from a gradient or a blur.
//
// A realm re-skin recolors the whole scene from one record — sky, hills,
// foliage, soil, monsters — which is what makes ten realms feel like ten places
// without ten sets of art.

/** Ink names the sprite grids in pixels.ts reference. */
export type InkSet = Record<string, string>;

export interface RealmSkin {
  skyTop: string;
  skyMid: string;
  skyHaze: string;
  cloud: string;
  cloudShade: string;
  sun: string;
  hillFar: string;
  hillNear: string;
  hillLip: string;
  leaf: string;
  leafDark: string;
  bark: string;
  turf: string;
  turfLip: string;
  grassBlade: string;
  soil: string;
  soilDark: string;
  rock: string;
  rockLight: string;
  petal: string;
  petalCore: string;
  monBody: string;
  monBodyDark: string;
  /** Drives strike flashes, the momentum meter, and impact sparks. */
  accent: string;
}

// DB32 anchors, used verbatim so the scene and the CSS chrome share a palette.
const INK = {
  black: '#1a1c2c',
  night: '#222034',
  plum: '#45283c',
  wood: '#663931',
  woodLight: '#8f563b',
  orange: '#df7126',
  tan: '#d9a066',
  parchment: '#eec39a',
  yellow: '#fbf236',
  lime: '#99e550',
  green: '#6abe30',
  teal: '#37946e',
  moss: '#4b692f',
  olive: '#524b24',
  slateGreen: '#323c39',
  indigo: '#3f3f74',
  steelBlue: '#306082',
  blue: '#5b6ee1',
  sky: '#639bff',
  cyan: '#5fcde4',
  ice: '#cbdbfc',
  grey: '#9badb7',
  greyDark: '#847e87',
  stone: '#696a6a',
  purple: '#76428a',
  crimson: '#ac3232',
  rose: '#d95763',
  pink: '#d77bba',
  khaki: '#8f974a',
  bronze: '#8a6f30',
} as const;

const REALM_SKINS: RealmSkin[] = [
  // Greenwood — the sunlit default: high-key cyan sky over vivid grass.
  {
    skyTop: INK.sky,
    skyMid: INK.cyan,
    skyHaze: INK.ice,
    cloud: '#ffffff',
    cloudShade: INK.ice,
    sun: INK.yellow,
    hillFar: INK.teal,
    hillNear: INK.green,
    hillLip: INK.lime,
    leaf: INK.lime,
    leafDark: INK.green,
    bark: INK.wood,
    turf: INK.green,
    turfLip: INK.lime,
    grassBlade: INK.lime,
    soil: INK.woodLight,
    soilDark: INK.wood,
    rock: INK.grey,
    rockLight: INK.ice,
    petal: INK.rose,
    petalCore: INK.yellow,
    monBody: INK.purple,
    monBodyDark: INK.plum,
    accent: INK.yellow,
  },
  // Ruinfields — sun-bleached stone and dry gold.
  {
    skyTop: INK.cyan,
    skyMid: INK.ice,
    skyHaze: INK.parchment,
    cloud: '#ffffff',
    cloudShade: INK.ice,
    sun: INK.yellow,
    hillFar: INK.greyDark,
    hillNear: INK.khaki,
    hillLip: INK.lime,
    leaf: INK.khaki,
    leafDark: INK.olive,
    bark: INK.greyDark,
    turf: INK.khaki,
    turfLip: INK.lime,
    grassBlade: INK.bronze,
    soil: INK.tan,
    soilDark: INK.woodLight,
    rock: INK.ice,
    rockLight: '#ffffff',
    petal: INK.parchment,
    petalCore: INK.tan,
    monBody: INK.steelBlue,
    monBodyDark: INK.indigo,
    accent: INK.parchment,
  },
  // Mistmarsh — cold teal water light under a pale sky.
  {
    skyTop: INK.steelBlue,
    skyMid: INK.cyan,
    skyHaze: INK.grey,
    cloud: INK.ice,
    cloudShade: INK.grey,
    sun: INK.ice,
    hillFar: INK.slateGreen,
    hillNear: INK.teal,
    hillLip: INK.green,
    leaf: INK.teal,
    leafDark: INK.slateGreen,
    bark: INK.plum,
    turf: INK.teal,
    turfLip: INK.green,
    grassBlade: INK.lime,
    soil: INK.olive,
    soilDark: INK.slateGreen,
    rock: INK.stone,
    rockLight: INK.grey,
    petal: INK.pink,
    petalCore: INK.ice,
    monBody: INK.rose,
    monBodyDark: INK.crimson,
    accent: INK.cyan,
  },
  // Ironhills — hard blue stone and cold steel.
  {
    skyTop: INK.indigo,
    skyMid: INK.blue,
    skyHaze: INK.ice,
    cloud: INK.ice,
    cloudShade: INK.grey,
    sun: INK.ice,
    hillFar: INK.steelBlue,
    hillNear: INK.stone,
    hillLip: INK.grey,
    leaf: INK.moss,
    leafDark: INK.slateGreen,
    bark: INK.stone,
    turf: INK.stone,
    turfLip: INK.grey,
    grassBlade: INK.moss,
    soil: INK.greyDark,
    soilDark: INK.slateGreen,
    rock: INK.grey,
    rockLight: INK.ice,
    petal: INK.blue,
    petalCore: INK.ice,
    monBody: INK.orange,
    monBodyDark: INK.crimson,
    accent: INK.cyan,
  },
  // Ember Wastes — the loud one: orange sky, red rock, everything hot.
  {
    skyTop: INK.orange,
    skyMid: INK.yellow,
    skyHaze: INK.parchment,
    cloud: INK.tan,
    cloudShade: INK.woodLight,
    sun: '#ffffff',
    hillFar: INK.crimson,
    hillNear: INK.rose,
    hillLip: INK.orange,
    leaf: INK.orange,
    leafDark: INK.crimson,
    bark: INK.plum,
    turf: INK.woodLight,
    turfLip: INK.tan,
    grassBlade: INK.orange,
    soil: INK.wood,
    soilDark: INK.plum,
    rock: INK.crimson,
    rockLight: INK.rose,
    petal: INK.yellow,
    petalCore: '#ffffff',
    monBody: INK.teal,
    monBodyDark: INK.slateGreen,
    accent: INK.yellow,
  },
  // Dragon Peaks — violet dusk over black rock.
  {
    skyTop: INK.purple,
    skyMid: INK.pink,
    skyHaze: INK.rose,
    cloud: INK.pink,
    cloudShade: INK.purple,
    sun: INK.yellow,
    hillFar: INK.plum,
    hillNear: INK.purple,
    hillLip: INK.pink,
    leaf: INK.pink,
    leafDark: INK.purple,
    bark: INK.plum,
    turf: INK.purple,
    turfLip: INK.pink,
    grassBlade: INK.pink,
    soil: INK.plum,
    soilDark: INK.night,
    rock: INK.greyDark,
    rockLight: INK.grey,
    monBody: INK.green,
    monBodyDark: INK.moss,
    petal: INK.yellow,
    petalCore: '#ffffff',
    accent: INK.pink,
  },
  // World's Edge — starlit void, the only low-key realm.
  {
    skyTop: INK.night,
    skyMid: INK.indigo,
    skyHaze: INK.purple,
    cloud: INK.indigo,
    cloudShade: INK.night,
    sun: INK.cyan,
    hillFar: INK.plum,
    hillNear: INK.indigo,
    hillLip: INK.blue,
    leaf: INK.blue,
    leafDark: INK.indigo,
    bark: INK.night,
    turf: INK.indigo,
    turfLip: INK.blue,
    grassBlade: INK.cyan,
    soil: INK.plum,
    soilDark: INK.night,
    rock: INK.steelBlue,
    rockLight: INK.blue,
    petal: INK.cyan,
    petalCore: '#ffffff',
    monBody: INK.pink,
    monBodyDark: INK.purple,
    accent: INK.cyan,
  },
];

/** Skin for a 0-based region index; the endless tail cycles the named realms. */
export function realmSkin(region: number): RealmSkin {
  const i = region < 0 ? 0 : region % REALM_SKINS.length;
  return REALM_SKINS[i]!;
}

/** Fixed inks the hero and his sword always wear, in every realm. */
export const HERO_INK: InkSet = {
  outline: INK.black,
  hair: INK.wood,
  skin: INK.parchment,
  scarf: INK.rose,
  tunic: INK.blue,
  belt: INK.woodLight,
  pants: INK.plum,
  boot: INK.wood,
  steel: '#ffffff',
  steelDark: INK.ice,
  grip: INK.woodLight,
};

export const LOOT_INK: InkSet = {
  outline: INK.black,
  coin: INK.yellow,
  coinLight: '#ffffff',
  coinDark: INK.orange,
  gem: INK.pink,
  gemLight: '#ffffff',
};

/** Scenery + monster inks derived from a realm skin. */
export function sceneryInk(skin: RealmSkin): InkSet {
  return {
    outline: INK.black,
    leaf: skin.leaf,
    leafDark: skin.leafDark,
    bark: skin.bark,
    rock: skin.rock,
    rockLight: skin.rockLight,
    grassBlade: skin.grassBlade,
    petal: skin.petal,
    petalCore: skin.petalCore,
  };
}

export function monsterInk(skin: RealmSkin): InkSet {
  return {
    outline: INK.black,
    body: skin.monBody,
    bodyDark: skin.monBodyDark,
    sclera: '#ffffff',
    pupil: INK.black,
  };
}

export const OUTLINE_INK = INK.black;
