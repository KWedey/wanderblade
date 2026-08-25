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
  c: 'scarf',
  t: 'tunic',
  B: 'belt',
  p: 'pants',
  k: 'boot',
};

const HERO_UPPER = [
  '....oooo....',
  '...ohhhho...',
  '..ohhhhhho..',
  '..ohhsssso..',
  '..ohsssoso..',
  '..ohssssso..',
  '...osssso...',
  '..occcccco..',
  '.otttttttto.',
  '.otttttttto.',
  '.ottttttsso.',
  '.oBBBBBBBBo.',
  '..oppppppo..',
];

export const HERO_WALK_A: SpriteMap = {
  rows: [
    ...HERO_UPPER,
    '..oppooppo..',
    '..oppooppo..',
    '..oppooppo..',
    '..okkookko..',
    '..oooooooo..',
  ],
  legend: HERO_LEGEND,
};

export const HERO_WALK_B: SpriteMap = {
  rows: [
    ...HERO_UPPER,
    '..oppooppo..',
    '.oppo..oppo.',
    '.opo....opo.',
    '.okko..okko.',
    '.oooo..oooo.',
  ],
  legend: HERO_LEGEND,
};

/** 16x5, hilt at the left, blade to the right. Drawn rotated for the swing. */
export const SWORD: SpriteMap = {
  rows: [
    '....o...........',
    '....oMMMMMMMMMMo',
    'ogggommmmmmmmmmo',
    '....oMMMMMMMMMMo',
    '....o...........',
  ],
  legend: { ...OUTLINE, M: 'steelDark', m: 'steel', g: 'grip' },
};

// --- Monsters ------------------------------------------------------------
// Four silhouettes, re-inked per realm. 'b' body, 'a' eye sclera, 'e' pupil.

const MONSTER_LEGEND: Record<string, string> = {
  ...OUTLINE,
  b: 'body',
  B: 'bodyDark',
  a: 'sclera',
  e: 'pupil',
};

export const MON_BLOB: SpriteMap = {
  rows: [
    '......oooo......',
    '....oobbbboo....',
    '...obbbbbbbbo...',
    '..obbbbbbbbbbo..',
    '..obbaabbaabbo..',
    '.obbaeabbaeabbo.',
    '.obbbaabbaabbbo.',
    '.obbbbbbbbbbbbo.',
    '.obbbbbbbbbbbbo.',
    '.obbbbooooobbbo.',
    '.obbbbbbbbbbbbo.',
    '..obbbbbbbbbbo..',
    '..oobbbbbbbboo..',
    '....oooooooo....',
  ],
  legend: MONSTER_LEGEND,
};

export const MON_BEAST: SpriteMap = {
  rows: [
    '..oo........oo..',
    '.obbo......obbo.',
    '.obbboooooobbbo.',
    'obbabbbbbbbbbbbo',
    'obaebbbbbbbbbbbo',
    'obbabbbbbbbbbbbo',
    'obBBbbbbbbbbbbbo',
    'ooobbbbbbbbbbboo',
    '..obbbbbbbbbbbo.',
    '..obboooooobbbo.',
    '..obo......obo..',
    '..obo......obo..',
    '..ooo......ooo..',
  ],
  legend: MONSTER_LEGEND,
};

export const MON_BRUTE: SpriteMap = {
  rows: [
    '....oooooo......',
    '...obbbbbbo.....',
    '..obbbbbbbbo....',
    '..obaabbaabo....',
    '..obaebbaebo....',
    '..obbbbbbbbo....',
    '..oobBBBBboo....',
    'obbobbbbbbobbo..',
    'obbobbbbbbobbo..',
    'obbobbbbbbobbo..',
    'oooobbbbbboooo..',
    '...obbbbbbbo....',
    '...obbbbbbbo....',
    '...obboobbo.....',
    '...obo..obo.....',
    '...obo..obo.....',
    '..obbo..obbo....',
    '..oooo..oooo....',
  ],
  legend: MONSTER_LEGEND,
};

export const MON_FLYER: SpriteMap = {
  rows: [
    '..o..........o..',
    '.oBo........oBo.',
    '.oBBo..oo..oBBo.',
    '..oBBoobbooBBo..',
    '...oBobbbbBBo...',
    '....oobbbboo....',
    '.....obeebo.....',
    '.....obbbbo.....',
    '......obbo......',
    '......obbo......',
    '.......oo.......',
  ],
  legend: MONSTER_LEGEND,
};

export const MONSTER_SHAPES = [MON_BLOB, MON_BEAST, MON_BRUTE, MON_FLYER];

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
    '.....oooooo.....',
    '...ooLLLLLLoo...',
    '..oLLllllllLLo..',
    '.oLLllllllllLLo.',
    '.oLllllllllllLo.',
    'oLLlllllllllLLLo',
    'oLlllllllllllLLo',
    'oLLlllllllllLLLo',
    '.oLlllllllllLLo.',
    '.oLLllllllllLLo.',
    '..oLLllllllLLo..',
    '...ooLLLLLLoo...',
    '.....oowwoo.....',
    '......owwo......',
    '......owwo......',
    '......owwo......',
    '......owwo......',
    '.....owwwwo.....',
    '....oowwwwoo....',
    '...oooooooooo...',
  ],
  legend: { ...OUTLINE, l: 'leaf', L: 'leafDark', w: 'bark' },
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
  MON_BLOB,
  MON_BEAST,
  MON_BRUTE,
  MON_FLYER,
  COIN,
  GEM,
  TREE,
  ROCK,
  FENCE,
  TUFT,
  FLOWER,
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
  g: ['.....', '.####', '#...#', '#...#', '.####', '....#', '.###.'],
};

/** Every character in-world text is allowed to use. */
export const FONT_COVERAGE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-.×! g';

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
