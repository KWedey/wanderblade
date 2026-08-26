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
  /** Distant range behind the far hills — the horizon's third depth. */
  range: string;
  bird: string;
  /** Foreground fronds, darker than any mid-ground green. */
  fern: string;
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
    range: INK.grey,
    bird: INK.plum,
    fern: INK.moss,
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
    range: INK.grey,
    bird: INK.wood,
    fern: INK.olive,
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
    range: INK.grey,
    bird: INK.plum,
    fern: INK.slateGreen,
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
    range: INK.steelBlue,
    bird: INK.night,
    fern: INK.slateGreen,
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
    range: INK.plum,
    bird: INK.night,
    fern: INK.wood,
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
    range: INK.night,
    bird: INK.night,
    fern: INK.plum,
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
    range: INK.night,
    bird: INK.purple,
    fern: INK.night,
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

/** Number of named realm skins the endless tail cycles through. */
export const REALM_SKIN_COUNT = REALM_SKINS.length;

/** Lightness of a hex, 0..1. */
export function lightnessOf(hex: string): number {
  return toHsl(hex)[2];
}

/**
 * The bands whose separation decides whether a realm reads as a place or as
 * mud. Sky and turf are the two poles the eye uses to size everything else.
 */
function valueBands(skin: RealmSkin): { sky: number; canopy: number; turf: number; soil: number } {
  return {
    sky: lightnessOf(skin.skyTop),
    canopy: lightnessOf(skin.leaf),
    turf: lightnessOf(skin.turf),
    soil: lightnessOf(skin.soilDark),
  };
}

/** Minimum spread between a realm's lightest and darkest structural band. */
export const MIN_VALUE_SPREAD = 0.42;
/** A sky is the light pole of the frame; below this the realm reads as night. */
export const MIN_SKY_LIGHTNESS = 0.58;
/** The bright accent is what keeps a realm vibrant rather than grimdark. */
export const MIN_ACCENT_LIGHTNESS = 0.55;

export function skinValueSpread(skin: RealmSkin): number {
  const v = Object.values(valueBands(skin));
  return Math.max(...v) - Math.min(...v);
}

/**
 * Why this exists: VISION.md pillar 2 is "vibrant and dangerous, never
 * grimdark", and DECISIONS.md #13 chose 16-bit over 8-bit precisely because
 * colour starvation drifts grimdark. A hand-authored skin can still land
 * below that bar, and realm 199 did - a near-black violet wood with every
 * band compressed into mid-darks. Rather than trusting eight hand edits to
 * stay in range, every skin is lifted through this on the way out, so no
 * realm index can render as mud by construction.
 */
export function enforceValueFloor(skin: RealmSkin): RealmSkin {
  let out = skin;

  const skyL = lightnessOf(out.skyTop);
  if (skyL < MIN_SKY_LIGHTNESS) {
    const lift = (MIN_SKY_LIGHTNESS + 0.02 - skyL) / Math.max(0.001, 1 - skyL);
    out = {
      ...out,
      skyTop: lighten(out.skyTop, lift),
      skyMid: lighten(out.skyMid, lift * 0.9),
      skyHaze: lighten(out.skyHaze, lift * 0.8),
      // The canopy reads against the sky, so it has to travel with it or the
      // gain is spent closing the gap that separates them.
      leaf: lighten(out.leaf, lift * 0.55),
      leafDark: lighten(out.leafDark, lift * 0.4),
      hillFar: lighten(out.hillFar, lift * 0.5),
      hillNear: lighten(out.hillNear, lift * 0.4),
      range: lighten(out.range, lift * 0.6),
    };
  }

  const accentL = lightnessOf(out.accent);
  if (accentL < MIN_ACCENT_LIGHTNESS) {
    out = {
      ...out,
      accent: lighten(out.accent, (MIN_ACCENT_LIGHTNESS + 0.02 - accentL) / 0.9),
    };
  }

  // Spread is opened from the dark end: darkening soil costs nothing, while
  // lifting the light end further would wash the realm out.
  let guard = 0;
  while (skinValueSpread(out) < MIN_VALUE_SPREAD && guard < 24) {
    out = {
      ...out,
      soil: mixHex(out.soil, '#000000', 0.12),
      soilDark: mixHex(out.soilDark, '#000000', 0.12),
      turf: mixHex(out.turf, '#000000', 0.05),
    };
    guard++;
  }
  return out;
}

const FLOORED_SKINS: RealmSkin[] = REALM_SKINS.map(enforceValueFloor);

/** Skin for a 0-based region index; the endless tail cycles the named realms. */
export function realmSkin(region: number): RealmSkin {
  const i = region < 0 ? 0 : region % FLOORED_SKINS.length;
  return FLOORED_SKINS[i]!;
}

/**
 * CSS variables that dress the panel in the realm the player is standing in.
 * Four critics in a row called the panel "a different game" - brown-and-gold
 * parchment against a green-and-blue world. Geometry was not the cause;
 * palette was. Derived from the skin's own earth and accent so the panel
 * cannot drift away from the scene again.
 */
export function panelVars(skin: RealmSkin): Record<string, string> {
  const earth = skin.soil;
  const deep = mixHex(skin.soilDark, '#000000', 0.2);
  return {
    '--panel': deep,
    '--panel-inner': earth,
    '--panel-sunk': mixHex(earth, '#000000', 0.22),
    '--panel-edge': skin.accent,
    '--bevel-lit': lighten(earth, 0.24),
    '--bevel-dark': mixHex(deep, '#000000', 0.4),
    '--ink-light': lighten(skin.skyHaze, 0.32),
    '--ink-dim': skin.accent,
    '--ink-faint': mixHex(lighten(skin.skyHaze, 0.2), earth, 0.35),
    '--wood': earth,
    '--wood-light': lighten(earth, 0.18),
    '--wood-shadow': deep,
    '--drop': `0 4px 0 ${mixHex(deep, '#000000', 0.5)}`,
    '--drop-pressed': `0 2px 0 ${mixHex(deep, '#000000', 0.5)}`,
  };
}

/** Fixed inks the hero and his sword always wear, in every realm. */
/**
 * The hero has to be the brightest silhouette in the frame, not the darkest.
 * A dark figure with a thin rim works when the space around it is empty; ours
 * stands in a busy one, so it wins on luminance or it does not win.
 */
export const HERO_INK: InkSet = {
  outline: INK.black,
  hair: lighten(INK.wood, 0.2),
  skin: lighten(INK.parchment, 0.18),
  // A face has to read at 14px: a lit cheek, a dark eye, one tunic highlight.
  skinLit: lighten(INK.parchment, 0.5),
  eye: '#241016',
  hatBand: lighten('#3c2a3f', 0.3),
  cloak: lighten(INK.rose, 0.22),
  scarf: lighten(INK.rose, 0.22),
  tunic: lighten(INK.blue, 0.3),
  tunicLit: lighten(INK.blue, 0.55),
  belt: lighten(INK.woodLight, 0.25),
  pants: lighten(INK.plum, 0.3),
  boot: lighten(INK.wood, 0.18),
  steel: '#ffffff',
  steelDark: INK.ice,
  // A fuller down the blade: a solid white bar read as a parallelogram.
  steelFuller: '#8fa9c9',
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
/**
 * Depth grade. The value floor lifted every band together, so a late realm
 * read as "one lavender value - no foreground/background separation at all".
 * Separation is a relationship between layers, so the scenery behind the
 * sprite plane is pushed back and the sprite plane is left alone.
 */
export const DEPTH_RECESSION = {
  range: 0.46,
  hillFar: 0.38,
  hillNear: 0.3,
  treeline: 0.35,
} as const;

/** Minimum lightness a monster's body must hold over the treeline behind it. */
export const MIN_SPRITE_BACKDROP_GAP = 0.16;

/** The colour distance itself is graded toward: the realm's own deep earth. */
export function depthHaze(skin: RealmSkin): string {
  return mixHex(skin.soilDark, '#000000', 0.45);
}

function recede(color: string, skin: RealmSkin, amount: number): string {
  return mixHex(color, depthHaze(skin), amount);
}

/**
 * Extra recession needed on top of DEPTH_RECESSION.treeline before the darkest
 * monster body clears the canopy behind it. Zero when the gap already holds.
 */
export function backdropRecession(skin: RealmSkin): number {
  // Against the body tone, not the shading tone: the body is what fills the
  // silhouette, and a shadow facet is meant to be dark.
  const body = lightnessOf(skin.monBody);
  let amount = DEPTH_RECESSION.treeline;
  for (let step = 0; step < 40; step++) {
    const gap = body - lightnessOf(recede(skin.leaf, skin, amount));
    if (gap >= MIN_SPRITE_BACKDROP_GAP || amount >= 0.94) break;
    amount += 0.04;
  }
  return amount;
}

const backdropCache = new WeakMap<RealmSkin, RealmSkin>();

/** Bands the camera never reaches, graded back so the sprite plane reads. */
export function backdropSkin(skin: RealmSkin): RealmSkin {
  const hit = backdropCache.get(skin);
  if (hit) return hit;
  const treeline = backdropRecession(skin);
  const graded: RealmSkin = {
    ...skin,
    range: recede(skin.range, skin, DEPTH_RECESSION.range),
    hillFar: recede(skin.hillFar, skin, DEPTH_RECESSION.hillFar),
    hillNear: recede(skin.hillNear, skin, DEPTH_RECESSION.hillNear),
    hillLip: recede(skin.hillLip, skin, DEPTH_RECESSION.hillNear),
    leaf: recede(skin.leaf, skin, treeline),
    leafDark: recede(skin.leafDark, skin, treeline),
    bark: recede(skin.bark, skin, treeline),
  };
  backdropCache.set(skin, graded);
  return graded;
}

/**
 * Ceiling on how far ground texture may stray from the turf under it. Blade
 * tones were hand-authored accents, so the road read as "a confetti field that
 * fights the sprites": texture modulates a surface, it does not compete with
 * the things standing on it.
 */
export const MAX_TEXTURE_CONTRAST = 0.14;

/** The blade tone pulled back toward its turf until it stops shouting. */
export function groundBladeOf(skin: RealmSkin): string {
  let blade = skin.grassBlade;
  const turf = lightnessOf(skin.turf);
  for (let step = 0; step < 24; step++) {
    if (Math.abs(lightnessOf(blade) - turf) <= MAX_TEXTURE_CONTRAST) break;
    blade = mixHex(blade, skin.turf, 0.18);
  }
  return blade;
}

export function sceneryInk(skin: RealmSkin): InkSet {
  return {
    outline: INK.black,
    leaf: skin.leaf,
    leafDark: skin.leafDark,
    // A third green and a bark shadow: two flat tones made every canopy read
    // as a lozenge with nothing inside it.
    leafLite: lighten(skin.leaf, 0.3),
    bark: skin.bark,
    barkDark: mixHex(skin.bark, '#000000', 0.35),
    rock: skin.rock,
    rockLight: skin.rockLight,
    grassBlade: skin.grassBlade,
    petal: skin.petal,
    petalCore: skin.petalCore,
    bird: skin.bird,
    fern: skin.fern,
  };
}

function toHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function channel(p1: number, q: number, t: number): number {
  let u = t;
  if (u < 0) u += 1;
  if (u > 1) u -= 1;
  if (u < 1 / 6) return p1 + (q - p1) * 6 * u;
  if (u < 1 / 2) return q;
  if (u < 2 / 3) return p1 + (q - p1) * (2 / 3 - u) * 6;
  return p1;
}

function toHex(h: number, s: number, l: number): string {
  const hue = ((h % 1) + 1) % 1;
  if (s === 0) {
    const v = Math.round(l * 255);
    return `#${((v << 16) | (v << 8) | v).toString(16).padStart(6, '0')}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p1 = 2 * l - q;
  const r = Math.round(channel(p1, q, hue + 1 / 3) * 255);
  const g = Math.round(channel(p1, q, hue) * 255);
  const b = Math.round(channel(p1, q, hue - 1 / 3) * 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Hue offsets per roster slot, so five creatures share one realm skin
 *  without three identically-coloured bodies standing in the same frame. */
/**
 * Hue turns kept on the cold/sour side of the realm's monster colour. Positive
 * turns walked the palette into magenta, and a critic read the result as
 * friendly: pink is a reward colour, not a threat colour.
 */
const SHAPE_HUE = [0, -0.05, -0.09, 0.04, -0.13];

export function monsterInk(skin: RealmSkin, shape = 0): InkSet {
  const turn = SHAPE_HUE[((shape % SHAPE_HUE.length) + SHAPE_HUE.length) % SHAPE_HUE.length] ?? 0;
  const [bh, bs, bl] = toHsl(skin.monBody);
  const [dh, ds, dl] = toHsl(skin.monBodyDark);
  const vivid = Math.max(bs, 0.5);
  return {
    outline: INK.black,
    body: toHex(bh + turn, vivid, bl),
    bodyDark: toHex(dh + turn, Math.max(ds, 0.45), dl),
    bodyLight: toHex(bh + turn, Math.max(vivid - 0.1, 0.4), Math.min(0.92, bl + 0.16)),
    // The hard edge on a lit facet. Without it three bands still read as flat.
    bodySpec: toHex(bh + turn, Math.max(vivid - 0.22, 0.3), Math.min(0.88, bl + 0.24)),
    // A lit eye and bared teeth are what carry menace at 16-30px; two white
    // dots read as friendly at any size.
    eyeGlow: '#df7126',
    tooth: '#f0f0dc',
  };
}

/** Linear blend of two hex colours. Aerial perspective: distant layers get
 *  mixed toward the haze so depth reads without any gradient. */
export function mixHex(a: string, b: string, t: number): string {
  const k = Math.max(0, Math.min(1, t));
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const r = Math.round(((na >> 16) & 255) * (1 - k) + ((nb >> 16) & 255) * k);
  const g = Math.round(((na >> 8) & 255) * (1 - k) + ((nb >> 8) & 255) * k);
  const bl = Math.round((na & 255) * (1 - k) + (nb & 255) * k);
  return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
}

/** Pushes a colour toward white without leaving the palette's hard-edge look. */
export function lighten(hex: string, t: number): string {
  return mixHex(hex, '#ffffff', t);
}

export const OUTLINE_INK = INK.black;
