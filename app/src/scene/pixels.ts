// Hand-authored pixel art for the road scene, as character grids.
//
// Every glyph is an *ink name*, not a color: the baker (sprites.ts) resolves
// names against a per-realm ink set, so one monster grid re-skins across all
// ten realms without a second drawing. '.' is transparent.
//
// Grids are validated by app/test/pixels.test.ts — ragged rows or glyphs with
// no ink are a test failure, not a silently-blank sprite.

export interface SpriteMap {
  rows: string[];
  /** glyph -> ink name, resolved against an InkSet at bake time. */
  legend: Record<string, string>;
}

/** Shared ink for the hard 1px outline every sprite carries. */
const OUTLINE = { o: 'outline' } as const;

// --- Hero ----------------------------------------------------------------
// 12x18, facing right. Two walk frames; the sword is a separate sprite so it
// can swing independently of the body.

const HERO_LEGEND: Record<string, string> = {
  ...OUTLINE,
  h: 'hair',
  s: 'skin',
  H: 'hatBand',
  K: 'cloak',
  S: 'skinLit',
  e: 'eye',
  T: 'tunicLit',
  c: 'scarf',
  t: 'tunic',
  B: 'belt',
  p: 'pants',
  k: 'boot',
};

const HERO_UPPER = [
  '....oooooo....',
  '...ohhhhhho...',
  '.oooooooooooo.',
  'oHHHHHHHHHHHHo',
  '.oHHHooooHHHo.',
  '..ohSssssSho..',
  '..ohseessseo..',
  '...osssssso...',
  '..occcccccco..',
  'oKottttttttoKo',
  'oKotttTTtttoKo',
  'oKottttttttoKo',
  '.KotttBBtttoK.',
  '.KoBBBBBBBBoK.',
  '.KoppppppppoK.',
  '..oppppppppo..',
];

export const HERO_WALK_A: SpriteMap = {
  rows: [
    ...HERO_UPPER,
    '..opppoopppo..',
    '..opppoopppo..',
    '..okkkookkko..',
    '..oooooooooo..',
  ],
  legend: HERO_LEGEND,
};

export const HERO_WALK_B: SpriteMap = {
  rows: [
    ...HERO_UPPER,
    '..opppoopppo..',
    '.opppppoopppo.',
    '.okkkkkookkko.',
    '.oooooooooooo.',
  ],
  legend: HERO_LEGEND,
};

/** 16x5, hilt at the left, blade to the right. Drawn rotated for the swing. */
export const SWORD: SpriteMap = {
  rows: [
    '...oo.............',
    '...oMoMMMMMMMMMo..',
    'ogggoommmmmmmmmmMo',
    '...oMoFFFFFFFFFo..',
    '...oo.............',
  ],
  legend: { ...OUTLINE, F: 'steelFuller', M: 'steelDark', g: 'grip', m: 'steel' },
};

// --- Monsters ------------------------------------------------------------
// Silhouette is the whole job here: a roster of same-sized blobs reads as one
// recolored enemy. These differ in footprint before they differ in color — a
// golem taller than the hero, a hound longer than it is tall, a stalker on
// stilts, and swarmlings that only ever appear in threes.
// 'b' body, 'B' body shadow, 'a' eye sclera, 'e' pupil.

const MONSTER_LEGEND: Record<string, string> = {
  ...OUTLINE,
  b: 'body',
  B: 'bodyDark',
  h: 'bodyLight',
  E: 'eyeGlow',
  t: 'tooth',
  a: 'sclera',
  e: 'pupil',
};

/** 24x30 — the heavy. Half again the hero's height, horned and asymmetric. */
export const MON_GOLEM: SpriteMap = {
  rows: [
    '........oo....oo........',
    '.......obo....obo.......',
    '......obbo....obbo......',
    '......obbooooobbbo......',
    '.....obbbbbbbbbbbbo.....',
    '.....obBBBbbbBBBbbo.....',
    '.....obbEEbbbbEEbbo.....',
    '.....obbbbbbbbbbbbo.....',
    '.....obbbtttttbbbbo.....',
    '.....oobbBBBBBBbboo.....',
    '......obbbbbbbbbbo......',
    '...oooobbbbbbbbbboooo...',
    '..obbbobbbbbbbbbbobbbo..',
    '.obbbbobbbbbbbbbbobbbbo.',
    'obbbbbobbbbbbbbbbobbbbbo',
    'obbbbbobbbBBBBbbbobbbbbo',
    'obbbbbobbbbbbbbbbobbbbbo',
    'obbbboobbbbbbbbbboobbbbo',
    'oobbbo.obbbbbbbbo.obbboo',
    '.ooobo.obbbbbbbbo.obooo.',
    '...obo.obbbbbbbbo.obo...',
    '...ooo.obbbbbbbbo.ooo...',
    '.......obbbbbbbbo.......',
    '......oobbbbbbbboo......',
    '......obbbo..obbbo......',
    '......obbbo..obbbo......',
    '......obbbo..obbbo......',
    '.....obbbbo..obbbbo.....',
    '.....obbbbo..obbbbo.....',
    '.....oooooo..oooooo.....',
  ],
  legend: MONSTER_LEGEND,
};

/** 30x14 — low and long. Reads as a different animal at a glance. */
export const MON_HOUND: SpriteMap = {
  rows: [
    '........................oo....',
    '.....................ooobbo...',
    '....oooooooooooooooooobbbbbo..',
    '..oobbbbbbbbbbbbbbbbbbbbBBBBo.',
    '.obbbbbbbbbbbbbbbbbbbbbbEEbo..',
    'obbbbbbbbbbbbbbbbbbbbbbbbbbbbo',
    'obbbbbbbbbbbbbbbbbbbbbbbttttbo',
    'obbbbbbbbbbbbbbbbbbbbbbbbbbbbo',
    'ooobbbbbbbbbbbbbbbbbbbbbbbbboo',
    '..obbo..obbo....obbo..obbo....',
    '..obbo..obbo....obbo..obbo....',
    '..obbo..obbo....obbo..obbo....',
    '..obbo..obbo....obbo..obbo....',
    '..oooo..oooo....oooo..oooo....',
  ],
  legend: MONSTER_LEGEND,
};

/** 14x28 — thin and tall, on long legs. */
export const MON_STALKER: SpriteMap = {
  rows: [
    '...oo....oo...',
    '...obo..obo...',
    '...obboobbo...',
    '....obbbbbo...',
    '...obbbbbbbo..',
    '..obBBbbBBbo..',
    '..obEEbbEEbo..',
    '..obbtttbbbo..',
    '..oobbbbbboo..',
    '....obbbbo....',
    '....obbbbo....',
    '...obbbbbbo...',
    '..obbbbbbbbo..',
    '.obbbbbbbbbbo.',
    'obbbbbbbbbbbbo',
    'obbbbBBBBbbbbo',
    'obbbbbbbbbbbbo',
    '.obbbbbbbbbbo.',
    '..obbbbbbbbo..',
    '...obbbbbbo...',
    '...obbbbbbo...',
    '...obboobbo...',
    '...obo..obo...',
    '...obo..obo...',
    '...obo..obo...',
    '...obo..obo...',
    '..obbo..obbo..',
    '..oooo..oooo..',
  ],
  legend: MONSTER_LEGEND,
};

/** 10x10 — never alone; the scene spawns these in threes. */
export const MON_SWARMLING: SpriteMap = {
  rows: [
    '...oooo...',
    '..obbbbo..',
    '.obbbbbbo.',
    'obBBbbBBbo',
    'obEEbbEEbo',
    'obbttttbbo',
    'obbbBBbbbo',
    '.obbbbbbo.',
    '..obbbbo..',
    '...oooo...',
  ],
  legend: MONSTER_LEGEND,
};

/** 20x14 — lopsided, so it never reads as a circle. */
export const MON_OOZE: SpriteMap = {
  rows: [
    '.....oooo...........',
    '...oobbbboo....oo...',
    '..obbbbbbbbo..obbo..',
    '.obbbbbbbbbboobbbbo.',
    '.obBBbbBBbbbbbbbbbo.',
    'obbEEbbEEbbbbbbbbbbo',
    'obbbbbbbbbbbbbbbbbbo',
    'obbttttttbbbbbbbbbbo',
    'obbbbBBBBBbbbbbbbbbo',
    'obbbbbbbbbbbbbbbbbbo',
    '.obbbbbbbbbbbbbbbbo.',
    '.oobbbbbbbbbbbbbboo.',
    '..oobbbbbbbbbbbboo..',
    '....oooooooooooo....',
  ],
  legend: MONSTER_LEGEND,
};

/** Ordered small to large; the scene picks by kill index. */
/**
 * Rim-lights the upper contour of a body so a two-tone creature reads as
 * volume rather than a flat cut-out. Light comes from above: the first body
 * pixel down each column turns light, but only in the sprite's top band, so
 * undersides and limbs stay in shadow.
 */
export function withTopLight(map: SpriteMap, band = 0.45): SpriteMap {
  const height = map.rows.length;
  const limit = Math.max(2, Math.round(height * band));
  const grid = map.rows.map((r) => r.split(''));
  const width = grid[0]?.length ?? 0;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < limit; y++) {
      const cell = grid[y]?.[x];
      if (cell === undefined || cell === '.' || cell === 'o') continue;
      if (cell === 'b') grid[y]![x] = 'h';
      break;
    }
  }
  return { rows: grid.map((r) => r.join('')), legend: map.legend };
}

export const MONSTER_SHAPES = [
  MON_SWARMLING,
  MON_OOZE,
  MON_HOUND,
  MON_STALKER,
  MON_GOLEM,
].map((m) => withTopLight(m));

/** Index into MONSTER_SHAPES of the shape that spawns as a group of three. */
export const SWARM_SHAPE = 0;

// --- Loot ----------------------------------------------------------------

export const COIN: SpriteMap = {
  rows: [
    '..oooo..',
    '.oGGGGo.',
    'oGGgGGGo',
    'oGgGGGGo',
    'oGGGGGGo',
    'oGGGGDGo',
    '.oGGDGo.',
    '..oooo..',
  ],
  legend: { ...OUTLINE, G: 'coin', g: 'coinLight', D: 'coinDark' },
};

export const GEM: SpriteMap = {
  rows: [
    '...oo...',
    '..oPPo..',
    '.oPpPPo.',
    'oPpPPPPo',
    'oPPPPPPo',
    '.oPPPPo.',
    '..oPPo..',
    '...oo...',
  ],
  legend: { ...OUTLINE, P: 'gem', p: 'gemLight' },
};

// --- Scenery -------------------------------------------------------------

export const TREE: SpriteMap = {
  rows: [
    '...oo...oooo....',
    '..oLLo.ooLLLLo..',
    '.oLiiLooLiiiiLo.',
    'oLiiiiLLiiiillLo',
    'oLiiiilliilllLLo',
    'oLLiillllllllLLo',
    '.oLllllllllllLo.',
    'oLLlllllllllllLo',
    'oLlllllLLllllllo',
    '.oLllLLLllllLLo.',
    '..oLLllllllLLoo.',
    '...ooLLLLLLoo...',
    '.....ooLLoo.....',
    '......owwo......',
    '......owWo......',
    '......owwo......',
    '......oWwo......',
    '.....owwwwo.....',
    '....oowwwwwoo...',
    '...oooooooooo...',
  ],
  legend: { ...OUTLINE, i: 'leafLite', l: 'leaf', L: 'leafDark', w: 'bark', W: 'barkDark' },
};

export const ROCK: SpriteMap = {
  rows: [
    '...oooo...',
    '..orrrro..',
    '.orrrrrro.',
    'orrrrRrrro',
    'orrRrrrrro',
    'orrrrrrrro',
    'oooooooooo',
  ],
  legend: { ...OUTLINE, r: 'rock', R: 'rockLight' },
};

export const FENCE: SpriteMap = {
  rows: [
    '.oooo.',
    '.owwo.',
    'oowwoo',
    '.owwo.',
    '.owwo.',
    '.owwo.',
    'oowwoo',
    '.owwo.',
    '.owwo.',
    '.owwo.',
    '.owwo.',
    '.owwo.',
    '.oooo.',
  ],
  legend: { ...OUTLINE, w: 'bark' },
};

export const TUFT: SpriteMap = {
  rows: ['v...v', 'v.v.v', '.vvv.', '..v..'],
  legend: { v: 'grassBlade' },
};

export const FLOWER: SpriteMap = {
  rows: ['.f.', 'fFf', '.v.', '.v.'],
  legend: { f: 'petal', F: 'petalCore', v: 'grassBlade' },
};


/** 14x28 conifer — height variety so the treeline is not one stamped shape. */
export const TREE_TALL: SpriteMap = {
  rows: [
    '......oo......',
    '.....oLLo.....',
    '.....oLLo.....',
    '....oLllLo....',
    '....oLllLo....',
    '...oLlllllo...',
    '...oLlllllo...',
    '..oLlllllllo..',
    '..oLlllllllo..',
    '...oLlllllo...',
    '..oLlllllllo..',
    '.oLlllllllllo.',
    '.oLlllllllllo.',
    '..oLlllllllo..',
    '.oLlllllllllo.',
    'oLllllllllllLo',
    'oLllllllllllLo',
    '.oLlllllllllo.',
    '..oLlllllllo..',
    '...oLlllllo...',
    '....oLllLo....',
    '.....owwo.....',
    '.....owwo.....',
    '.....owwo.....',
    '.....owwo.....',
    '....owwwwo....',
    '...oowwwwoo...',
    '..oooooooooo..',
  ],
  legend: { ...OUTLINE, l: 'leaf', L: 'leafDark', w: 'bark' },
};

/** 22x16 broad canopy — the short, wide member of the treeline. */
export const TREE_WIDE: SpriteMap = {
  rows: [
    '....oo.....oooo.......',
    '..ooLLoo.ooLLLLoo.....',
    '.oLLiiLLoLLiiiiLLoo...',
    'oLiiiiiLLLiiiiiillLo..',
    'oLiiiiillliiiilllLLo..',
    'oLLiilllllllllllllLLo.',
    'oLlllllllllllllllllLo.',
    '.oLlllllLLLlllllllLLo.',
    'oLLllllLLLLLllllllLo..',
    '.oLLlllllLLlllllLLoo..',
    '..ooLLLllllllLLLoo....',
    '....oooLLLLLLooo......',
    '.......oowwoo.........',
    '.......oWwwo..........',
    '......owwwwwo.........',
    '.....oooooooo.........',
  ],
  legend: { ...OUTLINE, i: 'leafLite', l: 'leaf', L: 'leafDark', w: 'bark', W: 'barkDark' },
};

/** 7x5, two frames — distant birds working the upper third of the sky. */
export const BIRD_UP: SpriteMap = {
  rows: ['oo...oo', '.oo.oo.', '..ooo..', '.......', '.......'],
  legend: { o: 'bird' },
};

export const BIRD_DOWN: SpriteMap = {
  rows: ['.......', '..ooo..', '.oo.oo.', 'oo...oo', '.......'],
  legend: { o: 'bird' },
};

/** 12x18 — foreground fronds that sweep past the camera ahead of the road. */
export const FERN: SpriteMap = {
  rows: [
    'l..l....l...',
    'll.ll..ll...',
    '.l.l.l.l.l..',
    '.ll.lll.ll.l',
    '..l.lll.l.ll',
    '..ll.l.ll.l.',
    '...l.l.l.ll.',
    '...ll.lll.l.',
    '....l.l.l.l.',
    '....ll.ll.l.',
    '.....l.l.ll.',
    '.....ll.l.l.',
    '.....l.ll.l.',
    '.....l.l.ll.',
    '.....ll.l.l.',
    '......l.ll..',
    '......l.l...',
    '......ll....',
  ],
  legend: { l: 'fern' },
};

// --- Validation ----------------------------------------------------------

/**
 * Structural faults in a sprite grid: ragged rows, or a glyph with no ink.
 * Returns [] for a sound grid. Pure — the test calls it on every export.
 */
export function spriteMapFaults(name: string, map: SpriteMap): string[] {
  const faults: string[] = [];
  if (map.rows.length === 0) {
    faults.push(`${name}: empty grid`);
    return faults;
  }
  const width = map.rows[0]!.length;
  map.rows.forEach((row, y) => {
    if (row.length !== width) {
      faults.push(`${name}: row ${y} is ${row.length} wide, expected ${width}`);
    }
    for (const glyph of row) {
      if (glyph !== '.' && !(glyph in map.legend)) {
        faults.push(`${name}: row ${y} uses glyph '${glyph}' with no legend entry`);
      }
    }
  });
  return faults;
}

/** Every sprite grid in this module, keyed by export name, for the test sweep. */
export const ALL_SPRITE_MAPS: Record<string, SpriteMap> = {
  HERO_WALK_A,
  HERO_WALK_B,
  SWORD,
  MON_GOLEM,
  MON_HOUND,
  MON_STALKER,
  MON_SWARMLING,
  MON_OOZE,
  COIN,
  GEM,
  TREE,
  TREE_TALL,
  TREE_WIDE,
  ROCK,
  FENCE,
  TUFT,
  FLOWER,
  BIRD_UP,
  BIRD_DOWN,
  FERN,
};

// --- Bitmap font ---------------------------------------------------------
// 5x7 glyphs for in-world text (floating damage, payouts, catches). Kept in the
// scene rather than the DOM so the numbers sit *inside* the pixel grid at the
// same resolution as the art. '#' is on, '.' is off.

export const GLYPH_W = 5;
export const GLYPH_H = 7;

export const FONT: Record<string, string[]> = {
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['#####', '....#', '...#.', '..##.', '....#', '#...#', '.###.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '+': ['.....', '..#..', '..#..', '#####', '..#..', '..#..', '.....'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '×': ['.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '.....'],
  '!': ['..#..', '..#..', '..#..', '..#..', '..#..', '.....', '..#..'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  'a': ['.....', '.....', '.###.', '....#', '.####', '#...#', '.####'],
  'b': ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.'],
  'c': ['.....', '.....', '.####', '#....', '#....', '#....', '.####'],
  'd': ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####'],
  'e': ['.....', '.....', '.###.', '#...#', '#####', '#....', '.###.'],
  'f': ['..##.', '.#...', '.#...', '####.', '.#...', '.#...', '.#...'],
  'g': ['.....', '.####', '#...#', '#...#', '.####', '....#', '.###.'],
  'h': ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#'],
  'i': ['..#..', '.....', '.##..', '..#..', '..#..', '..#..', '.###.'],
  'j': ['...#.', '.....', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  'k': ['#....', '#....', '#..#.', '#.#..', '##...', '#.#..', '#..#.'],
  'l': ['.##..', '..#..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  'm': ['.....', '.....', '##.#.', '#.#.#', '#.#.#', '#...#', '#...#'],
  'n': ['.....', '.....', '####.', '#...#', '#...#', '#...#', '#...#'],
  'o': ['.....', '.....', '.###.', '#...#', '#...#', '#...#', '.###.'],
  'p': ['.....', '####.', '#...#', '#...#', '####.', '#....', '#....'],
  'q': ['.....', '.####', '#...#', '#...#', '.####', '....#', '....#'],
  'r': ['.....', '.....', '#.##.', '##...', '#....', '#....', '#....'],
  's': ['.....', '.....', '.####', '#....', '.###.', '....#', '####.'],
  't': ['.#...', '.#...', '####.', '.#...', '.#...', '.#..#', '..##.'],
  'u': ['.....', '.....', '#...#', '#...#', '#...#', '#..##', '.##.#'],
  'v': ['.....', '.....', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  'w': ['.....', '.....', '#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'],
  'x': ['.....', '.....', '#...#', '.#.#.', '..#..', '.#.#.', '#...#'],
  'y': ['.....', '#...#', '#...#', '#...#', '.####', '....#', '.###.'],
  'z': ['.....', '.....', '#####', '...#.', '..#..', '.#...', '#####'],
  ',': ['.....', '.....', '.....', '.....', '.##..', '.##..', '.#...'],
  ':': ['.....', '.##..', '.##..', '.....', '.##..', '.##..', '.....'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  '(': ['...#.', '..#..', '.#...', '.#...', '.#...', '..#..', '...#.'],
  ')': ['.#...', '..#..', '...#.', '...#.', '...#.', '..#..', '.#...'],
  '%': ['##..#', '##.#.', '...#.', '..#..', '.#...', '.#.##', '#..##'],
  "'": ['..#..', '..#..', '.....', '.....', '.....', '.....', '.....'],
  '·': ['.....', '.....', '.....', '.##..', '.##..', '.....', '.....'],
  '—': ['.....', '.....', '.....', '.....', '#####', '.....', '.....'],
  '~': ['.....', '.....', '.##.#', '#..#.', '.....', '.....', '.....'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['....#', '....#', '....#', '....#', '#...#', '#...#', '.###.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
};

/** Every character in-world text is allowed to use. */
export const FONT_COVERAGE =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-.×! ' +
  "abcdefghijklmnopqrstuvwxyz,:/()%'·—~";

/**
 * Malformed or missing glyphs. A missing glyph is not a blank — drawText
 * advances past it, so the word renders with a hole in it.
 */
export function fontFaults(): string[] {
  const faults: string[] = [];
  for (const ch of FONT_COVERAGE) {
    if (!(ch in FONT)) faults.push(`glyph '${ch}' is missing from FONT`);
  }
  for (const [ch, rows] of Object.entries(FONT)) {
    if (rows.length !== GLYPH_H) {
      faults.push(`glyph '${ch}': ${rows.length} rows, expected ${GLYPH_H}`);
    }
    rows.forEach((row, y) => {
      if (row.length !== GLYPH_W) {
        faults.push(`glyph '${ch}' row ${y}: ${row.length} wide, expected ${GLYPH_W}`);
      }
    });
  }
  return faults;
}

/** Rendered width of `text` in scene units at `scale`, including 1px letter gaps. */
export function textWidth(text: string, scale: number): number {
  if (text.length === 0) return 0;
  return (text.length * (GLYPH_W + 1) - 1) * scale;
}
