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
  S: 'bodySpec',
  E: 'eyeGlow',
  t: 'tooth',
};

// Silhouette is the whole job here. Only the shape is authored; sculpt() adds
// the tone bands, specular edge and variable outline. Creatures lean at the
// hero with weight on the front foot, and every outline is broken by an
// asymmetric growth so no two profiles read the same.
// 'b' body, 'E' lit eye, 't' bared tooth.

/** 24x30 - the heavy. Crag-grown shoulder, head thrust forward, weight on the front foot. */
export const MON_GOLEM: SpriteMap = {
  rows: [
    '........b...............',
    '.....b.bb...............',
    '.....bbbb...bb.bbbbb....',
    '.....bbbb....b.bbbbb....',
    '...bbbbbb.....bbbbbbbb..',
    '...bbbbbb.....bbbbbbbb..',
    '..bbbbbbb..bbbbbbbbbbb..',
    '..bbbbbbb..bbbbbbbbbbbb.',
    '..bb.bbbbbbbbbbbEEbbEEb.',
    '..bb.bbbbbbbbbbbbbbbbbb.',
    '.bbb.bbbbbbbbbbbbbbbbb..',
    '.bbb.bbbbbbbbbbbtttttt..',
    '.bbb..bbbbbbbbbbbtbbtb..',
    '.bbb..bbbbbbbbbb.bbbb...',
    'bbbb..bbbbbbbbbb...bbb..',
    'bbbb..bbbbbbbbbb...bbb..',
    'bbbb..bbbbbbbbbb...bbb..',
    'bbb....bbbbbbbbb....bbbb',
    'bbb....bbbbbbbbb....bbbb',
    'bbb....bbbbbbbbb....bbbb',
    'bbb...bbbbbbbbbbb..bbbbb',
    'bbbb..bbbbbbbbbbb..bbbbb',
    'bbbb..bbbbbbbbbbb..b.b.b',
    'b.b..bbbb...bbbbb....b..',
    '.....bbbb...bbbbb.......',
    '.....bbbb...bbbbb.......',
    '.....bbbb....bbbbb......',
    '....bbbbb....bbbbb......',
    '....bbbbb....bbbbbbb....',
    '....bbbbb....bbbbbbb....',
  ],
  legend: MONSTER_LEGEND,
};

/** 14x28 - stilt-legged and folded forward, one shoulder blade standing proud. */
export const MON_STALKER: SpriteMap = {
  rows: [
    '....b..bbbbb..',
    '.....b.bbbbb..',
    '......bbbbbbb.',
    '.....bbEEbEEb.',
    '..bb.bbbbbbbb.',
    '..bbbbbbtttt..',
    '..bbbbbbbbbb..',
    '...bbbbb......',
    '.bbbbbbb.bbb..',
    '.bbbbbbbbbbb..',
    '.bbbbbbbbbbb..',
    '.bbbbbbbb.bbb.',
    'bbbbbbbbb.bbb.',
    'bbbbbbbbb.bbb.',
    'bbb.bbbbb.bbbb',
    'b.b.bbbbb.bbbb',
    '....bbbbb.b.b.',
    '...bbbbbbb....',
    '...bbbbbbb....',
    '...bbbbbbb....',
    '...bbb..bbb...',
    '...bbb..bbb...',
    '...bbb..bbb...',
    '...bbb..bbb...',
    '...bbb...bbb..',
    '..bbbb...bbb..',
    '..bbbb...bbbbb',
    '..bbbb...bbbbb',
  ],
  legend: MONSTER_LEGEND,
};

/** 30x14 - low and long, head carried down, hackles crested over the shoulders. */
export const MON_HOUND: SpriteMap = {
  rows: [
    '..........bb..bb..............',
    '........bbbbbbbb..............',
    '......bbbbbbbbbbbb....b.......',
    '......bbbbbbbbbbbb..b.........',
    '.bb.bbbbbbbbbbbbbbbbbbbbbbbb..',
    'bbbbbbbbbbbbbbbbbbbbbbbEEbEE..',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbb..',
    '...bbbbbbbbbbbbbbbbbbb.bbbbbbb',
    '....bbbbbbbbbbbbbbbbb..bbttttt',
    '....bbbbbb...bbb.bbb....bbbbb.',
    '....bbbbbb...bbb.bbb..........',
    '....bbbbbb...bbb.bbb..........',
    '...bbbbbbb...bbbbbbb..........',
    '...bbbbbbb...bbbbbbb..........',
  ],
  legend: MONSTER_LEGEND,
};

/** 20x14 - a crawler hauling itself forward on one knuckled forelimb. */
export const MON_OOZE: SpriteMap = {
  rows: [
    '.........bb.........',
    '.....bb..bb..b......',
    '.....bb..bbbbbbbbb..',
    '....bbb....bEEbEEb..',
    '.bbb.bb....bbbbbbb..',
    '.bbbbbbbbbbbbbbbbbbt',
    'bbbbbbbbbbbbbbttttt.',
    '.bbbbbbbbbbbb.bbb...',
    '..bbbbbbbbbbb.bbb...',
    '..bbbbbbbbbbb.bbb...',
    '..bbbbbbbbbb.bbbbb..',
    '...bbbbbbbbb.bbbbb..',
    '...bbbbbb....b.b.b..',
    '...b..bb.......b....',
  ],
  legend: MONSTER_LEGEND,
};

/** 12x12 - never alone; the scene spawns these in threes. All jaw and spine. */
export const MON_SWARMLING: SpriteMap = {
  rows: [
    '...b........',
    '...b..b.....',
    '..bb..bb.b..',
    '.....bbbbbb.',
    '..bbbbEEbEE.',
    '..bbbbbbbbb.',
    'bbbbbbbbbbbb',
    'bbbbbbbttttt',
    '..bbbb.....t',
    '.b.bbb.bbb..',
    '...bbb.bbb..',
    '...b.b.b.b..',
  ],
  legend: MONSTER_LEGEND,
};

/**
 * Turns an authored silhouette into a lit, outlined creature.
 *
 * Only the shape is drawn by hand, because the shape is where danger lives.
 * Tone bands, the specular edge and the variable outline weight are the same
 * rule for every creature, applied here: three bands stepping away from a
 * light at upper-left in authored space, which the scene's horizontal flip
 * puts at upper-right, under the sun it actually draws.
 */
export function sculpt(map: SpriteMap): SpriteMap {
  const grid = map.rows.map((r) => r.split(''));
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const solid = (x: number, y: number): boolean => {
    const cell = grid[y]?.[x];
    return cell !== undefined && cell !== '.' && cell !== 'o';
  };

  // How far a pixel sits inside the form from the two lit faces. Summing the
  // faces rather than walking the diagonal is what keeps a thin limb from
  // coming out entirely specular: it stays lit at the top and falls off down
  // its length, the way a cylinder does.
  const run = (x: number, y: number, dx: number, dy: number): number => {
    let n = 0;
    while (n < 6 && solid(x + dx * (n + 1), y + dy * (n + 1))) n++;
    return n;
  };
  const out = grid.map((r) => [...r]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (grid[y]![x] !== 'b') continue;
      const depth = run(x, y, 0, -1) + run(x, y, -1, 0);
      out[y]![x] = depth === 0 ? 'S' : depth <= 2 ? 'h' : depth <= 6 ? 'b' : 'B';
    }
  }

  // Outline only where the form turns away. A lit edge is separated by its
  // own specular, and a uniform 1px ring is what read as a sticker.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (out[y]![x] !== '.') continue;
      const lit = solid(x + 1, y) && solid(x, y + 1);
      const touches =
        solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1);
      if (!touches) continue;
      // The away side is down and right of the body it wraps.
      const away = solid(x - 1, y) || solid(x, y - 1);
      if (away || !lit) out[y]![x] = 'o';
    }
  }
  return { rows: out.map((r) => r.join('')), legend: map.legend };
}

/** Distinct tone values a sculpted body uses, for the shading sweep. */
export function toneBands(map: SpriteMap): string[] {
  const seen = new Set<string>();
  for (const row of map.rows) {
    for (const ch of row) {
      if (ch === 'S' || ch === 'h' || ch === 'b' || ch === 'B') seen.add(ch);
    }
  }
  return [...seen].sort();
}

/** The authored shapes, before sculpt() lights them. */
export const MONSTER_SILHOUETTES = [
  MON_SWARMLING,
  MON_OOZE,
  MON_HOUND,
  MON_STALKER,
  MON_GOLEM,
];

export const MONSTER_SHAPES = MONSTER_SILHOUETTES.map(sculpt);

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

/** Every character panel and HUD text is allowed to use. */
export const FONT_COVERAGE =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-.\u00d7! ' +
  "abcdefghijklmnopqrstuvwxyz,:/()%'\u00b7\u2014~";

/**
 * A companion 3x5 face for in-world numerals. Damage, payouts and catch
 * bonuses render in this rather than the 5x7 body face: a late-realm payout
 * at 5x7 is wider than the hero sprite, and the answer is a smaller glyph set,
 * not a different rendering path. Uppercase only \u2014 every string that reaches
 * it is a number plus a magnitude suffix, so callers upper-case first and the
 * face keeps one baseline with no descenders to steal rows from a 5px cap.
 */
export const NUMERAL_GLYPHS: Record<string, string[]> = {
  '0': ['.#.', '#.#', '#.#', '#.#', '.#.'],
  '1': ['.#.', '##.', '.#.', '.#.', '###'],
  '2': ['##.', '..#', '.#.', '#..', '###'],
  '3': ['##.', '..#', '.#.', '..#', '##.'],
  '4': ['#.#', '#.#', '###', '..#', '..#'],
  '5': ['###', '#..', '##.', '..#', '##.'],
  '6': ['.##', '#..', '###', '#.#', '###'],
  '7': ['###', '..#', '.#.', '.#.', '.#.'],
  '8': ['###', '#.#', '###', '#.#', '###'],
  '9': ['###', '#.#', '###', '..#', '##.'],
  A: ['.#.', '#.#', '###', '#.#', '#.#'],
  B: ['##.', '#.#', '##.', '#.#', '##.'],
  C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'],
  E: ['###', '#..', '##.', '#..', '###'],
  F: ['###', '#..', '##.', '#..', '#..'],
  G: ['.##', '#..', '#.#', '#.#', '.##'],
  H: ['#.#', '#.#', '###', '#.#', '#.#'],
  I: ['###', '.#.', '.#.', '.#.', '###'],
  J: ['..#', '..#', '..#', '#.#', '.#.'],
  K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'],
  M: ['#.#', '###', '###', '#.#', '#.#'],
  N: ['##.', '#.#', '#.#', '#.#', '#.#'],
  O: ['###', '#.#', '#.#', '#.#', '###'],
  P: ['##.', '#.#', '##.', '#..', '#..'],
  Q: ['###', '#.#', '#.#', '###', '..#'],
  R: ['##.', '#.#', '##.', '#.#', '#.#'],
  S: ['.##', '#..', '.#.', '..#', '##.'],
  T: ['###', '.#.', '.#.', '.#.', '.#.'],
  U: ['#.#', '#.#', '#.#', '#.#', '###'],
  V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  W: ['#.#', '#.#', '###', '###', '#.#'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: ['#.#', '#.#', '.#.', '.#.', '.#.'],
  Z: ['###', '..#', '.#.', '#..', '###'],
  '.': ['...', '...', '...', '.##', '.##'],
  '+': ['...', '.#.', '###', '.#.', '...'],
  '-': ['...', '...', '###', '...', '...'],
  '\u00d7': ['...', '#.#', '.#.', '#.#', '...'],
  '/': ['..#', '..#', '.#.', '#..', '#..'],
  '%': ['#.#', '..#', '.#.', '#..', '#.#'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'],
  ' ': ['...', '...', '...', '...', '...'],
};

export const NUMERAL_COVERAGE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ+-.\u00d7/%! ';

/** A glyph set plus the cell it is drawn on. Every text routine takes one. */
export interface BitmapFont {
  name: string;
  glyphs: Record<string, string[]>;
  coverage: string;
  w: number;
  h: number;
}

/** Panels, HUD, widget labels \u2014 anything that is words. */
export const BODY_FONT: BitmapFont = {
  name: 'body',
  glyphs: FONT,
  coverage: FONT_COVERAGE,
  w: GLYPH_W,
  h: GLYPH_H,
};

/** In-world numbers, which rank below the DOM gold headline. */
export const NUMERAL_FONT: BitmapFont = {
  name: 'numeral',
  glyphs: NUMERAL_GLYPHS,
  coverage: NUMERAL_COVERAGE,
  w: 3,
  h: 5,
};

/**
 * Malformed or missing glyphs. A missing glyph is not a blank \u2014 drawText
 * advances past it, so the word renders with a hole in it.
 */
export function fontFaults(font: BitmapFont = BODY_FONT): string[] {
  const faults: string[] = [];
  for (const ch of font.coverage) {
    if (!(ch in font.glyphs)) faults.push(`${font.name} glyph '${ch}' is missing`);
  }
  for (const [ch, rows] of Object.entries(font.glyphs)) {
    if (rows.length !== font.h) {
      faults.push(`${font.name} glyph '${ch}': ${rows.length} rows, expected ${font.h}`);
    }
    rows.forEach((row, y) => {
      if (row.length !== font.w) {
        faults.push(`${font.name} glyph '${ch}' row ${y}: ${row.length} wide, expected ${font.w}`);
      }
    });
  }
  return faults;
}

/** Rendered width of `text` in scene units at `scale`, including 1px letter gaps. */
export function textWidth(text: string, scale: number, font: BitmapFont = BODY_FONT): number {
  if (text.length === 0) return 0;
  return (text.length * (font.w + 1) - 1) * scale;
}

export interface MassProfile {
  /** Row of the sprite\u2019s shoulders \u2014 where it first reaches half its widest. */
  top: number;
  /** Width of the widest row, which is the mass a bar should span. */
  width: number;
}

/**
 * Where a sprite\u2019s visual mass begins. A bounding box puts a health bar on a
 * shelf of empty air over a tall creature\u2019s antenna; the shoulders are where
 * the creature actually is.
 */
export function massProfile(map: SpriteMap): MassProfile {
  const fill = map.rows.map((row) => {
    let n = 0;
    for (const ch of row) if (ch !== '.') n++;
    return n;
  });
  const widest = Math.max(0, ...fill);
  if (widest === 0) return { top: 0, width: map.rows[0]?.length ?? 0 };
  const shoulders = fill.findIndex((n) => n * 2 >= widest);
  return { top: shoulders < 0 ? 0 : shoulders, width: widest };
}
