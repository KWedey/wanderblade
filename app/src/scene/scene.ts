// The road scene: a full-bleed side-scrolling pixel world that the HUD sits on
// top of. Owns only presentation state — parallax offsets, one monster, loot
// arcs, particles, floaters, camera shake. Every number it *displays* is handed
// to it by the controller; it invents no economy (DECISIONS.md #12).
//
// Rendering is done once into a small offscreen buffer at scene resolution,
// then upscaled with smoothing off. That single indirection is what makes the
// pixels square and identical everywhere instead of resolution-dependent mush.

import { formatNumber } from '../format';
import { GUARDIAN_BODY, rosterAt, speciesIndexAt } from '../species';
import { ditherAt, falloff, momentumLift } from './light';
import {
  arcApexHeight,
  arcSpaceFromScene,
  decayTo,
  floaterOffsetY,
  lifeRemaining,
  sceneFromArcSpace,
  shakeOffset,
  stepParticle,
  wrap,
  heroPocket,
  peakFollow,
  inPocket,
  nudgeFromPocket,
  type Floater,
  type HeroPocket,
  type PeakState,
  type FloaterTier,
  mergeTargetIndex,
  type Particle,
} from './fx';
import { arcPositionAt, type ArcPoint, type LootArc } from '@wanderblade/core';
import {
  HERO_INK,
  LOOT_INK,
  OUTLINE_INK,
  backdropSkin,
  groundBladeOf,
  REALM_SKIN_COUNT,
  lighten,
  mixHex,
  monsterInk,
  realmSkin,
  foregroundInk,
  sceneryInk,
  type RealmSkin,
} from './palette';
import {
  BIRD_DOWN,
  BIRD_UP,
  COIN,
  FENCE,
  FERN,
  FLOWER,
  GEM,
  NUMERAL_FONT,
  HERO_WALK_A,
  HERO_WALK_B,
  BOSS_SHAPE,
  MONSTER_SHAPES,
  ROCK,
  SWORD,
  TREE,
  TREE_TALL,
  TREE_WIDE,
  TUFT,
  textWidth,
} from './pixels';
import {
  bakeSprite,
  context,
  drawSprite,
  drawSpriteRotated,
  drawText,
  type BakedSprite,
} from './sprites';
import {
  COMBO_LANE,
  FLOATER_RISE,
  laneBaseline,
  LANE_COUNT,
  LANE_BASE_OFFSET,
  LANE_STEP,
  lanesTouching,
  placeRun,
  type LaneSpan,
} from './textlane';

/** Everything the scene needs for one frame. All display values; no engine writes. */
export interface SceneModel {
  region: number;
  /** Lifetime kill count — the scene edge-detects it to fire death FX. */
  kills: number;
  /** Display estimate [0,1] of progress through the current kill. */
  killProgress: number;
  /** Gold the current enemy pays, for the loot-arc floater. */
  goldPerKill: number;
  dps: number;
  /** Momentum [0,1] and its multiplier, from the active-play model. */
  momentum: number;
  momentumMult: number;
  /**
   * Core's whole attack-speed multiplier: the Ascendancy speed node times
   * momentum. The swing animation runs on this, not on momentum alone -- a
   * player who buys the speed node has to see the blade move.
   */
  attackSpeedMult: number;
  /** World frozen behind the recap modal. */
  paused: boolean;
  reduceMotion: boolean;
  /**
   * Set only in the Portal (DECISIONS.md #15). `hpFrac` is the guardian's
   * remaining health [0,1]; the scene swaps the road queue for one guardian
   * standing in a drawn portal rather than dressing the boss as an encounter.
   */
  boss: { hpFrac: number } | null;
  /** Loot arcs in flight, straight off GameState — the scene never owns these. */
  arcs: readonly LootArc[];
  /** Engine clock the arcs are evaluated against. */
  timeSec: number;
}

/**
 * Where a Strike landed, in the engine's arc space: hero at the origin, x
 * along the road, arc apex at y = 1. The scene renders arcs and reports the
 * pointer; the engine decides what a Strike hits. Scene units never cross
 * this boundary, so a resize or a scale change cannot move a hit.
 */
export interface Scene {
  frame(dtSec: number, model: SceneModel): void;
  /**
   * Register a Strike and report where it landed in core's arc space, or null
   * when it had no position (keyboard, or a tap that could not be located). A
   * positionless Strike still swings and still builds momentum.
   */
  strikeAt(clientX: number | null, clientY: number | null): ArcPoint | null;
  /** Play the catch flourish for an `arcCatch` the engine resolved. */
  catchArc(bonusGold: number, upgraded: boolean): void;
  /** CSS pixels of chrome above the world band. */
  setSceneTop(cssPx: number): void;
  /** CSS pixels of chrome docked to the right of the road. */
  setSceneRight(cssPx: number): void;
  /** Viewport point loot streaks fly to — the HUD's gold readout. */
  setCollectAnchor(clientX: number, clientY: number): void;
  dispose(): void;
}

// --- Tuning --------------------------------------------------------------

/** Scene units across the viewport, before integer-scale rounding. */
export const TARGET_SCENE_WIDTH = 300;
const MIN_PIXEL_SCALE = 2;
const MAX_PIXEL_SCALE = 8;

/** Ground scroll in scene units/sec at momentum zero. */
const WALK_SPEED = 34;
const HERO_X_FRAC = 0.24;
/** The world band never shrinks below this, however tall the chrome gets. */
const MIN_BAND_H = 60;
/** Gap between hero and monster once the monster has closed, as a share of the
 * scene width — a fixed pixel gap crowds a phone and wastes a desktop frame. */
/**
 * How much air is left between the blade and the lead monster's near edge.
 * Deliberately not a fraction of the viewport: on a wide screen that put the
 * creature 57 units from a hero whose blade reaches 16, and the frame was
 * judged "a man swinging at nothing". Held just past the blade's 19-unit tip
 * so the lunge closes the last of it -- at 15 the two bodies touched at rest
 * and the frame collided its fight instead of staging it.
 */
const BLADE_REACH = 23;
/** Fraction of the kill spent closing the distance; the rest is the fight. */
const APPROACH_FRAC = 0.3;
/** Seconds the guardian spends walking out of its portal. Then it stands: its
 * health is a ten-minute fight, and marching it in over that reads as a road
 * approach rather than a duel. */
const BOSS_ENTRANCE_SEC = 1.1;

const SWINGS_PER_SEC = 1.7;

/** Seconds one animated swing stands for, at `attackSpeedMult`. */
/** Device pixels per scene pixel, snapped so the display blit is never fractional. */
export function blitScaleFor(cssW: number, dpr: number, sceneW: number): number {
  return Math.max(1, Math.round(Math.floor(cssW * dpr) / Math.max(1, sceneW)));
}

export function swingInterval(attackSpeedMult: number): number {
  return 1 / (SWINGS_PER_SEC * Math.max(0.01, attackSpeedMult));
}

/**
 * Damage one animated swing is worth. The scene never computes damage - it
 * apportions core's dps across the interval the swing represents, so the
 * numbers on screen integrate back to core's dps exactly however fast the
 * blade is moving.
 */
export function damagePerSwing(dps: number, attackSpeedMult: number): number {
  return dps * swingInterval(attackSpeedMult);
}
const SWING_ANIM_SEC = 0.32;
const SHAKE_DECAY = 9;
const MAX_SHAKE = 3.2;

/** Seconds a thrown coin stays in the air, and so stays catchable. */
export const ARC_FLIGHT_SEC = 1.5;
const FLOATER_LIFE = 1.05;
/**
 * The number hierarchy. Gold headline lives in the DOM HUD; everything in the
 * world ranks below it and every in-world number is assigned a tier here, so
 * size and color are never picked per call site.
 */
const TIER_SCALE: Record<FloaterTier, number> = { payout: 1, catch: 1, damage: 1 };
const TEXT_CATCH = '#fbf236';
const TEXT_DAMAGE = '#ffffff';
const LOOT_GLOW = '#fbf236';
/**
 * Hit sparks are cold steel, never gold. Sharing the realm accent with loot
 * made a coin indistinguishable from the shower it spawned inside, so the one
 * thing worth aiming at looked like the thing you were told to ignore.
 */
/**
 * Two stops down from the old white-hot burst, and never gold. White sparks
 * were the brightest pixels on screen, which is what kept beating the hero for
 * attention however they were layered; sharing the realm accent with loot made
 * a coin indistinguishable from the shower it spawned inside. Steel reads as
 * impact without competing for the eye or for the thing worth aiming at.
 */
const SPARK_COLORS = ['#9badb7', '#696a6a', '#847e87'];
const RIM_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
/** How long a strike keeps the hero's rim flared. */
const STRIKE_RIM_SEC = 0.06;
const IMPACT_GLOW = '#ffffff';

/** Floor on the gap between damage numbers, whatever the tap rate. */
const DAMAGE_TEXT_INTERVAL_SEC = 0.28;
const STREAK_SEC = 0.5;

const PARTICLE_CAP = 220;
const FLOATER_CAP = 12;
/** Scene units within which a second payout joins the run already there. */
const MERGE_RADIUS = 26;

/**
 * A coin that has landed and is sitting on the road before it flies to the
 * counter. Without the pause a kill's loot is on screen for a heartbeat and
 * the road reads as empty between fights.
 */
interface Rest {
  x: number;
  y: number;
  age: number;
  gold: boolean;
  spin: number;
}

/** How long a landed coin sits before it streaks to the gold readout. */
const REST_SEC = 0.55;

interface Streak {
  x0: number;
  y0: number;
  age: number;
  gold: boolean;
  spin: number;
}

interface Monster {
  /** Slot in the realm's baked roster; the last slot is the Portal guardian. */
  sprite: number;
  /** Scene x of the monster's feet. */
  x: number;
  /** Seconds of white-flash left from the last hit. */
  flash: number;
  /** Knockback offset, eased back to zero. */
  recoil: number;
  bob: number;
  /** Sideways offset for swarm members so three do not stand in one column. */
  spread: number;
}

/**
 * How far behind the engaged monster the next one in line waits. Wide enough
 * that the third one rests clear of the docked panel's edge rather than being
 * sliced by it, and that the frame reads as a duel with a queue behind it
 * instead of as a crowd.
 */
const QUEUE_GAP = 55;
/** Monsters visible at once: the one being fought, plus the queue behind it. */
const QUEUE_DEPTH = 5;

/** The guardian is baked after the realm's roster, so it owns the last slot. */
const bossSlot = (region: number): number => rosterAt(region).length;

interface Prop {
  kind: 'tree' | 'rock' | 'tuft' | 'flower';
  /** Position along the prop track, in scene units. */
  at: number;
  layer: 'tree' | 'ground';
  /** Which silhouette of that kind — trees pick one of three. */
  variant: number;
}

/** Deterministic [0,1) hash — prop layout must not shimmer between frames. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const PROP_SPAN = 1400;

/** Drifting pollen and leaf litter. Scenery only — recycled, never spawned. */
interface Mote {
  at: number;
  yFrac: number;
  size: number;
  phase: number;
}

function buildMotes(): Mote[] {
  const motes: Mote[] = [];
  for (let i = 0; i < 46; i++) {
    motes.push({
      at: hash01(i * 1.31) * PROP_SPAN,
      yFrac: hash01(i * 7.7),
      size: hash01(i * 2.9) > 0.72 ? 2 : 1,
      phase: hash01(i * 5.1) * Math.PI * 2,
    });
  }
  return motes;
}

function buildProps(): Prop[] {
  const props: Prop[] = [];
  for (let i = 0; i < 34; i++) {
    props.push({
      kind: 'tree',
      at: hash01(i) * PROP_SPAN,
      layer: 'tree',
      variant: Math.floor(hash01(i * 3.7) * 3),
    });
  }
  for (let i = 0; i < 150; i++) {
    const r = hash01(i + 500);
    const kind: Prop['kind'] = r < 0.11 ? 'rock' : r < 0.3 ? 'flower' : 'tuft';
    props.push({ kind, at: hash01(i + 900) * PROP_SPAN, layer: 'ground', variant: 0 });
  }
  return props;
}

/** Fence posts march at a fixed pitch so the rails between them line up. */
const FENCE_PITCH = 74;

interface SkinnedSprites {
  monsters: BakedSprite[];
  /** Three canopy silhouettes; a treeline of one shape reads as a stamp. */
  trees: BakedSprite[];
  /** Nearest-camera copies, two value steps down. */
  fernNear: BakedSprite;
  tuftNear: BakedSprite;
  rock: BakedSprite;
  fence: BakedSprite;
  tuft: BakedSprite;
  flower: BakedSprite;
  fern: BakedSprite;
  birds: BakedSprite[];
}

export function createScene(canvas: HTMLCanvasElement): Scene {
  const displayCtx = context(canvas);
  const buffer = document.createElement('canvas');
  const ctx = context(buffer);

  // Hero, sword and loot never re-skin, so they bake exactly once.
  const heroA = bakeSprite(HERO_WALK_A, HERO_INK);
  const heroB = bakeSprite(HERO_WALK_B, HERO_INK);
  const sword = bakeSprite(SWORD, HERO_INK);
  const coin = bakeSprite(COIN, LOOT_INK);
  const gem = bakeSprite(GEM, LOOT_INK);

  const skinCache = new Map<number, SkinnedSprites>();
  function skinnedFor(region: number): SkinnedSprites {
    const key = region % REALM_SKIN_COUNT;
    const cached = skinCache.get(key);
    if (cached) return cached;
    const skin = realmSkin(key);
    const sInk = sceneryInk(skin);
    // The treeline stands behind everything that matters; it bakes off the
    // graded skin so the sprite plane has something to read against.
    const bInk = sceneryInk(backdropSkin(skin));
    const fgInk = foregroundInk(skin);
    const built: SkinnedSprites = {
      // Baked per roster slot, not per silhouette: a realm may field one
      // silhouette twice, and those are two species wearing two colours.
      monsters: [
        ...rosterAt(key).map((sp) =>
          bakeSprite(MONSTER_SHAPES[sp.shape] ?? MONSTER_SHAPES[0]!, monsterInk(sp.body, skin.turf)),
        ),
        bakeSprite(MONSTER_SHAPES[BOSS_SHAPE]!, monsterInk(GUARDIAN_BODY, skin.turf)),
      ],
      trees: [TREE, TREE_TALL, TREE_WIDE].map((t) => bakeSprite(t, bInk)),
      rock: bakeSprite(ROCK, sInk),
      fence: bakeSprite(FENCE, sInk),
      tuft: bakeSprite(TUFT, sInk),
      flower: bakeSprite(FLOWER, sInk),
      fern: bakeSprite(FERN, sInk),
      fernNear: bakeSprite(FERN, fgInk),
      tuftNear: bakeSprite(TUFT, fgInk),
      birds: [BIRD_UP, BIRD_DOWN].map((b) => bakeSprite(b, bInk)),
    };
    skinCache.set(key, built);
    return built;
  }

  const props = buildProps();
  const motes = buildMotes();

  // Ground texture (grass blades, fringe dots, soil strata) is a deterministic
  // function of index and the current turf geometry, so it is baked once per
  // resize instead of re-hashed on every one of the ~60 frames it draws per
  // second.
  interface GroundBlade { x0: number; y: number; toneAlt: boolean; tall: boolean; dot: boolean }
  interface GroundFringe { x0: number; tuft: boolean }
  interface GroundStrata { x0: number; y: number; len: number }
  let groundBlades: GroundBlade[] = [];
  let groundFringe: GroundFringe[] = [];
  let groundStrata: GroundStrata[] = [];

  function buildGroundTexture(): void {
    const belowH = Math.max(8, sceneBottomY - groundY);
    const turfH = Math.max(6, Math.floor(belowH * 0.76));

    groundBlades = [];
    for (let i = 0; i < 3400; i++) {
      const depth = hash01(i * 1.7);
      groundBlades.push({
        x0: hash01(i * 4.1 + 3) * PROP_SPAN,
        y: groundY + 3 + Math.floor(depth * (turfH - 4)),
        toneAlt: i % 3 === 0,
        tall: depth < 0.62,
        dot: i % 5 === 0,
      });
    }

    groundFringe = [];
    for (let i = 0; i < 140; i++) {
      groundFringe.push({ x0: hash01(i * 6.3 + 11) * PROP_SPAN, tuft: i % 3 === 0 });
    }

    groundStrata = [];
    for (let i = 0; i < 46; i++) {
      groundStrata.push({
        x0: hash01(i * 2.3) * PROP_SPAN,
        y: groundY + turfH + 3 + Math.floor(hash01(i * 7.7) * Math.max(1, belowH - turfH - 4)),
        len: 4 + Math.floor(hash01(i) * 8),
      });
    }
  }

  // --- Mutable scene state ---
  let pixelScale = 4;
  let vw = 100;
  let vh = 100;
  let groundY = 60;
  /** CSS pixels of chrome above the world band. The view measures it and tells us. */
  let sceneTopCss = 0;
  let sceneRightCss = 0;
  /** Scene x the docked panel starts at: the last column a player can see. */
  let worldRightX = 100;
  /** Scene units the band is pushed down the display canvas by. */
  let sceneOffsetY = 0;
  /**
   * Lowest scene row the player can actually see. In portrait the panel sheet
   * covers the bottom half, so world-anchored HUD (the momentum meter) has to
   * sit above it rather than at the canvas edge.
   */
  let sceneBottomY = 100;
  /** Peak-held momentum and multiplier, so the readout never sags below the cap. */
  let heldMomentum: PeakState = { value: 0, holdLeftSec: 0 };
  let heldMult: PeakState = { value: 1, holdLeftSec: 0 };

  let heroX = 24;

  let clockSec = 0;
  let scrollGround = 0;
  let scrollTrees = 0;
  /** Scene clock the guardian appeared at, for its one walk out of the rift. */
  let bossEnteredAtSec = 0;
  let scrollHillNear = 0;
  let scrollHillFar = 0;
  let scrollClouds = 0;
  let scrollRange = 0;
  let scrollFore = 0;
  let sunX = 0;
  let sunY = 0;
  let sunR = 6;
  /**
   * The height arc-space calls y = 0. Core's arc is y = 4p(1-p): launch and
   * landing sit at the same height, so the scene must launch and land on one
   * line too. Any visual drop from a creature's chest to the ground has to be
   * absorbed by the scene, never passed through as arc-space y.
   */
  let arcBaseY = 0;
  const impacts: { x: number; y: number; age: number; life: number }[] = [];
  let scrollBirds = 0;

  let shake = 0;
  let swingCooldown = 0;
  let swingAnim = 0;
  let heroFlash = 0;
  let dustCooldown = 0;
  let damageTextCooldown = 0;

  /**
   * Index 0 is the monster the engine is actually killing; the rest are the
   * kills queued behind it, walking in. One duel in an empty field is what the
   * road looked like before, and it read as a paused screen.
   */
  const queue: Monster[] = [];
  let lastKills = -1;
  let deathBurstQueued = false;

  const particles: Particle[] = [];
  const floaters: Floater[] = [];
  const rests: Rest[] = [];
  const streaks: Streak[] = [];

  let collectAnchor = { x: 0, y: 0 };
  let collectAnchorCss: { x: number; y: number } | null = null;
  let model: SceneModel = {
    region: 0,
    kills: 0,
    killProgress: 0,
    goldPerKill: 0,
    dps: 0,
    momentum: 0,
    momentumMult: 1,
    attackSpeedMult: 1,
    paused: false,
    reduceMotion: false,
    boss: null,
    arcs: [],
    timeSec: 0,
  };

  function resize(): void {
    const cssW = Math.max(1, canvas.clientWidth);
    const cssH = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, 3);

    pixelScale = Math.max(
      MIN_PIXEL_SCALE,
      Math.min(MAX_PIXEL_SCALE, Math.round(cssW / TARGET_SCENE_WIDTH) || MIN_PIXEL_SCALE),
    );
    vw = Math.ceil(cssW / pixelScale);
    vh = Math.ceil(cssH / pixelScale);
    buffer.width = vw;
    buffer.height = vh;

    // Whole device pixels per scene pixel. Our stretch is nearest-neighbour, so
    // a fractional one duplicates columns unevenly; the element box is
    // unchanged, leaving the last fraction to the compositor's real filtering.
    const blit = blitScaleFor(cssW, dpr, vw);
    canvas.width = vw * blit;
    canvas.height = vh * blit;
    displayCtx.imageSmoothingEnabled = false;
    ctx.imageSmoothingEnabled = false;

    // Portrait puts the panels above and gives the road the bottom band, so
    // the core verb lives under the thumb; landscape docks the panel right and
    // gives the world the whole frame.
    const landscape = cssW / cssH >= 1;
    sceneOffsetY = landscape ? 0 : Math.min(vh - MIN_BAND_H, Math.round(sceneTopCss / pixelScale));
    sceneOffsetY = Math.max(0, sceneOffsetY);
    const bandH = vh - sceneOffsetY;
    groundY = Math.floor(bandH * (landscape ? 0.72 : 0.66));
    arcBaseY = groundY - 2;
    sceneBottomY = bandH;
    // The panel is docked over the canvas, not beside it, so the scene is wider
    // than the world anyone can see. Creatures queued past this were walking on
    // behind the UI, which sliced the guardian into a third of a sprite.
    worldRightX = Math.max(40, vw - Math.round(sceneRightCss / pixelScale));
    heroX = Math.floor(vw * (landscape ? HERO_X_FRAC : 0.3));
    if (collectAnchorCss) setCollectAnchor(collectAnchorCss.x, collectAnchorCss.y);
    buildGroundTexture();
  }

  function setCollectAnchor(clientX: number, clientY: number): void {
    collectAnchorCss = { x: clientX, y: clientY };
    const p = toScene(clientX, clientY);
    // The gold counter sits above the band in portrait, so a coin would fly to
    // a point off the top of the world. Clamp it to the band's own edge.
    collectAnchor = { x: p.x, y: Math.max(2, p.y) };
  }

  /** Client coords to scene units inside the world band. */
  function toScene(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left) / pixelScale,
      y: (clientY - rect.top) / pixelScale - sceneOffsetY,
    };
  }

  /** The view owns layout; it tells the scene how much chrome sits above the road. */
  function setSceneTop(cssPx: number): void {
    const next = Math.max(0, Math.round(cssPx));
    if (next === sceneTopCss) return;
    sceneTopCss = next;
    resize();
  }

  function setSceneRight(cssPx: number): void {
    const next = Math.max(0, Math.round(cssPx));
    if (next === sceneRightCss) return;
    sceneRightCss = next;
    resize();
  }

  const onResize = (): void => resize();
  window.addEventListener('resize', onResize);
  resize();

  // --- Spawning ----------------------------------------------------------

  function addParticle(p: Particle): void {
    if (particles.length >= PARTICLE_CAP) particles.shift();
    particles.push(p);
  }

  const laneY = (lane: number): number => laneBaseline(lane, groundY);

  function floaterSpan(f: Floater): LaneSpan {
    const w = textWidth(f.text, TIER_SCALE[f.tier], NUMERAL_FONT);
    return { x: f.x - w / 2, w, lane: f.lane };
  }

  /**
   * `y` on the incoming floater is a wish, not a position: it picks the lane to
   * start looking from, and the allocator moves it to the nearest free one.
   */
  function addFloater(raw: Omit<Floater, 'lane'>): void {
    if (floaters.length >= FLOATER_CAP) floaters.shift();
    // The numeral face is uppercase-only: every string that reaches it is a
    // number plus a magnitude suffix, and folding here means no call site can
    // punch a hole in a payout by passing a lowercase 'a'.
    const f = { ...raw, text: raw.text.toUpperCase() };
    const w = textWidth(f.text, TIER_SCALE[f.tier], NUMERAL_FONT);
    const wish = Math.round((groundY - LANE_BASE_OFFSET - f.y) / LANE_STEP);
    const preferred = Math.max(0, Math.min(LANE_COUNT - 1, wish));
    const taken = floaters.map(floaterSpan);
    const evictable = taken.length;
    if (heldMomentum.value > 0.02) taken.push(...comboSpans());
    taken.push(...barSpans);
    const { lane, evict } = placeRun(f.x - w / 2, w, taken, LANE_COUNT, 3, preferred, evictable);
    // Descending, so each splice leaves the lower indices valid.
    for (const index of [...evict].sort((a, b) => b - a)) floaters.splice(index, 1);
    floaters.push({ ...f, lane });
  }

  interface Payout {
    x: number;
    y: number;
    life: number;
    value: number;
    label: (total: number) => string;
    color: string;
    tier: FloaterTier;
    owned: boolean;
  }

  /**
   * A number the engine just paid. Joins the run already at this spot instead
   * of starting a new one, and is re-placed rather than edited in place so the
   * wider text still gets a lane it fits in.
   */
  function payout(p: Payout): void {
    const at = mergeTargetIndex(floaters, p.tier, p.x, MERGE_RADIUS);
    const total = at < 0 ? p.value : floaters[at]!.value + p.value;
    if (at >= 0) floaters.splice(at, 1);
    addFloater({
      x: p.x,
      y: p.y,
      age: 0,
      life: p.life,
      text: p.label(total),
      color: p.color,
      tier: p.tier,
      owned: p.owned,
      value: total,
    });
  }

  function burst(x: number, y: number, count: number, colors: string[], speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + hash01(clockSec * 60 + i) * 0.9;
      const s = speed * (0.45 + hash01(i * 7.3 + clockSec) * 0.8);
      addParticle({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - speed * 0.35,
        age: 0,
        life: 0.34 + hash01(i * 3.1) * 0.42,
        size: i % 3 === 0 ? 2 : 1,
        color: colors[i % colors.length]!,
        gravity: 0.75,
      });
    }
  }

  /**
   * Append the creature for `killIndex` to the back of the queue. The species
   * is species.ts's answer, the same one the log line names — the scene draws
   * what the road says is there rather than rolling its own monster.
   */
  function enqueueMonster(killIndex: number): void {
    queue.push({
      sprite: speciesIndexAt(model.region, killIndex),
      x: worldRightX + 30,
      flash: 0,
      recoil: 0,
      bob: hash01(killIndex) * Math.PI * 2,
      spread: 0,
    });
  }

  /** Half the lead's sprite, plus whatever its group spread pulls forward. */
  function engageInset(): number {
    const lead = queue[0];
    if (!lead) return 12;
    const sprite = skinnedFor(model.region).monsters[lead.sprite];
    return Math.round((sprite ? sprite.width : 20) / 2) - lead.spread;
  }

  function killMonster(skin: RealmSkin): void {
    const lead = queue[0];
    const x = lead ? lead.x + lead.spread : heroX + BLADE_REACH;
    const y = groundY;
    burst(x, y - 10, 14, [skin.monBody, skin.monBodyDark, ...SPARK_COLORS], 130);
    impacts.push({ x, y: y - 12, age: 0, life: 0.34 });
    shake = Math.min(MAX_SHAKE, shake + 2.1);

    queue.shift();
    // Damage numbers belong to the thing that took the hit; a corpse's number
    // left hanging in the air reads as unowned UI.
    for (let i = floaters.length - 1; i >= 0; i--) {
      if (floaters[i]!.owned) floaters.splice(i, 1);
    }
  }

  function swing(fromStrike: boolean): void {
    // At a maxed speed node and full momentum the cadence outruns a fixed
    // 0.32s animation, and overlapping swings read as a blur rather than as
    // faster hits. The stroke shortens to fit its own interval instead.
    swingAnim = Math.min(SWING_ANIM_SEC, swingInterval(model.attackSpeedMult) * 0.9);
    const lead = queue[0];
    if (!lead || lead.x - engageInset() > heroX + BLADE_REACH + 16) return;

    const leadSprite = skinnedFor(model.region).monsters[lead.sprite];
    const leadHeight = leadSprite ? leadSprite.height : 16;
    // On the creature's body, past its near edge. Six pixels back toward the
    // swinger put the brightest thing in the frame in the hero's neighbourhood,
    // and a burst beside him beats his silhouette even when it paints behind
    // him: draw order fixes occlusion, not adjacency.
    const contactX = lead.x + lead.spread + Math.round(leadSprite ? leadSprite.width * 0.2 : 3);
    const contactY = groundY - Math.round(leadHeight * 0.55);
    lead.flash = 0.05;
    lead.recoil = fromStrike ? 5 : 3;
    burst(contactX, contactY, fromStrike ? 9 : 5, SPARK_COLORS, 105);
    shake = Math.min(MAX_SHAKE, shake + (fromStrike ? 1.5 : 0.7));

    // Only the player's own strikes get a number. Auto-swings land several a
    // second; numbering them all stacks into an unreadable pile and buries the
    // one hit the player actually caused.
    if (!fromStrike) return;
    // A fast tapper out-runs the floater's lifetime and the numbers pile into
    // an illegible column; the flash and sparks already confirm every hit.
    if (damageTextCooldown > 0) return;
    damageTextCooldown = DAMAGE_TEXT_INTERVAL_SEC;
    // Honest: real DPS across the interval this swing represents.
    const damage = damagePerSwing(model.dps, model.attackSpeedMult);
    if (damage < 0.05) return;
    // Above the monster's head, not beside its ribs: the blade sweeps through
    // contact height and a number there is inside the arc.
    payout({
      x: lead.x + lead.spread,
      y: groundY - leadHeight - 6,
      life: 0.5,
      value: damage,
      label: (v) => formatShort(v),
      color: TEXT_DAMAGE,
      tier: 'damage',
      owned: true,
    });
  }

  function toArcSpace(px: number, py: number): ArcPoint {
    return arcSpaceFromScene(px, py, heroX, arcBaseY, arcApexHeight(ARC_FLIGHT_SEC));
  }

  /**
   * Arc-space point of the live arc nearest the hero, if any. A keyboard or
   * held strike has no pointer to aim with, and an unaimed strike can never
   * catch: keyboard play was hard-capped at x1.43 against touch's x2.0 while
   * ACTIVE-PLAY.md promises holding reaches the same ceiling as tapping.
   */
  function autoAim(): ArcPoint | null {
    let best: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const p of arcScreenPoints()) {
      const dx = p.x - heroX;
      const dy = p.y - arcBaseY;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best ? toArcSpace(best.x, best.y) : null;
  }

  function strikeAt(clientX: number | null, clientY: number | null): ArcPoint | null {
    heroFlash = 0.12;
    // Restart the auto-attack cadence rather than zeroing it — zero would go
    // negative on the very next step() and fire an immediate duplicate swing.
    swingCooldown = 1 / SWINGS_PER_SEC;
    swing(true);

    if (clientX === null || clientY === null) {
      const aim = autoAim();
      if (aim) lastAim = sceneFromArcSpace(aim.x, aim.y, heroX, arcBaseY, arcApexHeight(ARC_FLIGHT_SEC));
      return aim;
    }
    const { x: sx, y: sy } = toScene(clientX, clientY);
    lastAim = { x: sx, y: sy };
    return toArcSpace(sx, sy);
  }

  /** Scene coords of the last aimed strike, so a catch pays out where it was earned. */
  let lastAim: { x: number; y: number } | null = null;

  /**
   * The engine caught an arc. The number is the bonus it actually paid, and it
   * lands where the player tapped: paying it out at the hero meant tapping A
   * and reading the reward at B, so the loop never visibly closed.
   */
  function catchArc(bonusGold: number, upgraded: boolean): void {
    const skin = realmSkin(model.region);
    const guard = pocket();
    const aim = lastAim ?? { x: heroX + 24, y: groundY - 30 };
    const at = nudgeFromPocket(guard, aim.x, aim.y);
    payout({
      x: at.x,
      y: at.y,
      life: FLOATER_LIFE,
      value: bonusGold,
      label: (v) => `+${formatShort(v)}`,
      color: TEXT_CATCH,
      tier: 'catch',
      owned: false,
    });
    if (upgraded) {
      addFloater({
        x: at.x,
        y: at.y - 14,
        age: 0,
        life: FLOATER_LIFE,
        text: 'UPGRADED',
        color: '#ffffff',
        tier: 'catch',
        owned: false,
        value: 0,
      });
    }
    burst(at.x, at.y + 4, 12, ['#ffffff', skin.accent, LOOT_GLOW], 150);
    shake = Math.min(MAX_SHAKE, shake + 1.2);
  }

  // --- Simulation --------------------------------------------------------

  function step(dtSec: number): void {
    const skin = realmSkin(model.region);
    clockSec += dtSec;
    heldMomentum = peakFollow(heldMomentum, model.momentum, dtSec);
    heldMult = peakFollow(heldMult, model.momentumMult, dtSec);

    const speed = WALK_SPEED * model.momentumMult;
    scrollGround = wrap(scrollGround + speed * dtSec, PROP_SPAN);
    scrollTrees = wrap(scrollTrees + speed * 0.55 * dtSec, PROP_SPAN);
    scrollHillNear = wrap(scrollHillNear + speed * 0.28 * dtSec, vw * 4);
    scrollHillFar = wrap(scrollHillFar + speed * 0.13 * dtSec, vw * 4);
    scrollClouds = wrap(scrollClouds + speed * 0.05 * dtSec, vw * 3);
    scrollRange = wrap(scrollRange + speed * 0.07 * dtSec, vw * 4);
    // Faster than the ground: the foreground is nearer than the road is.
    scrollFore = wrap(scrollFore + speed * 1.75 * dtSec, PROP_SPAN);
    scrollBirds = wrap(scrollBirds + (speed * 0.12 + 9) * dtSec, vw * 3);

    shake = decayTo(shake, 0, SHAKE_DECAY, dtSec);
    damageTextCooldown = Math.max(0, damageTextCooldown - dtSec);
    heroFlash = Math.max(0, heroFlash - dtSec);
    swingAnim = Math.max(0, swingAnim - dtSec);

    // A kill landed in the engine — the scene never decides this.
    if (lastKills < 0) {
      lastKills = model.kills;
    } else if (model.kills > lastKills) {
      // Offline returns jump thousands of kills; play one death, not a thousand.
      deathBurstQueued = true;
      lastKills = model.kills;
    }
    if (deathBurstQueued) {
      deathBurstQueued = false;
      killMonster(skin);
    }

    if (model.boss) {
      // One guardian, and it stays: the road's queue would walk a second
      // creature into the climax of a realm.
      if (queue.length !== 1 || queue[0]!.sprite !== bossSlot(model.region)) {
        queue.length = 0;
        queue.push({ sprite: bossSlot(model.region), x: worldRightX + 30, flash: 0, recoil: 0, bob: 0, spread: 0 });
        bossEnteredAtSec = clockSec;
      }
    } else {
      if (queue[0]?.sprite === bossSlot(model.region)) queue.length = 0;
      while (queue.length < QUEUE_DEPTH) enqueueMonster(model.kills + queue.length);
    }

    // The engaged monster's position is driven by the engine's kill progress,
    // so it reaches the hero exactly when the kill resolves. Everyone behind it
    // just walks to their slot in the line.
    // The guardian walks out of its portal on the first sliver of the fight and
    // then stands. Driving it by remaining health would march it at the hero
    // over ten minutes, which is a road approach, not a duel.
    const closing = model.boss
      ? Math.min(1, (clockSec - bossEnteredAtSec) / BOSS_ENTRANCE_SEC)
      : null;
    const t = closing ?? Math.min(1, model.killProgress / APPROACH_FRAC);
    const eased = 1 - (1 - t) * (1 - t);
    // Stop the creature's near edge at the blade, not its centre: a fixed
    // centre-to-centre gap put a wide crawler inside the hero and a narrow one
    // out of reach.
    const stop = heroX + BLADE_REACH + engageInset();
    const leadTarget = worldRightX + 20 + (stop - (worldRightX + 20)) * eased;
    for (let i = 0; i < queue.length; i++) {
      const m = queue[i]!;
      const target = i === 0 ? leadTarget : leadTarget + i * QUEUE_GAP;
      m.x = i === 0 ? target + m.recoil : decayTo(m.x, target, 2.4, dtSec);
      m.recoil = decayTo(m.recoil, 0, 12, dtSec);
      m.flash = Math.max(0, m.flash - dtSec);
      m.bob += dtSec * 7;
    }

    // Boot dust: the ground-speed read. Frequency tracks momentum, so a hot
    // streak visibly kicks up more of it than a plodding idle walk.
    dustCooldown -= dtSec;
    if (dustCooldown <= 0 && !model.reduceMotion) {
      dustCooldown = 0.16 / model.momentumMult;
      addParticle({
        x: heroX - 5,
        y: groundY - 1,
        vx: -18 - hash01(clockSec * 13) * 26 * model.momentumMult,
        vy: -14 - hash01(clockSec * 7) * 18,
        age: 0,
        life: 0.4 + hash01(clockSec * 3) * 0.3,
        size: 1 + (hash01(clockSec * 21) > 0.6 ? 1 : 0),
        color: skin.turfLip,
        gravity: 0.35,
      });
    }

    // Auto-attack cadence off core's own attack speed, so the Ascendancy speed
    // node is visible in the blade and not only in the kill timer.
    swingCooldown -= dtSec * model.attackSpeedMult;
    if (swingCooldown <= 0) {
      swingCooldown += 1 / SWINGS_PER_SEC;
      if (queue.length > 0) swing(false);
    }

    for (let i = impacts.length - 1; i >= 0; i--) {

      const im = impacts[i]!;

      im.age += dtSec;

      if (im.age >= im.life) impacts.splice(i, 1);

    }

    for (let i = particles.length - 1; i >= 0; i--) {
      if (!stepParticle(particles[i]!, dtSec)) particles.splice(i, 1);
    }

    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]!;
      f.age += dtSec;
      if (f.age >= f.life) floaters.splice(i, 1);
    }

    for (let i = rests.length - 1; i >= 0; i--) {
      const r = rests[i]!;
      r.age += dtSec;
      r.spin += dtSec * 4;
      // Landed coins ride the road backwards until they are collected.
      r.x -= speed * dtSec;
      if (r.age >= REST_SEC || r.x < -10) {
        streaks.push({ x0: r.x, y0: r.y, age: 0, gold: r.gold, spin: r.spin });
        rests.splice(i, 1);
      }
    }

    for (let i = streaks.length - 1; i >= 0; i--) {
      const s = streaks[i]!;
      s.age += dtSec;
      s.spin += dtSec * 14;
      if (s.age >= STREAK_SEC) {
        burst(collectAnchor.x, collectAnchor.y, 5, ['#fbf236', '#ffffff'], 60);
        streaks.splice(i, 1);
      }
    }
  }

  // --- Drawing -----------------------------------------------------------

  function band(y: number, h: number, color: string): void {
    if (h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(0, y, vw, h);
  }

  function drawSky(skin: RealmSkin): void {
    const skyH = groundY;
    const midY = Math.floor(skyH * 0.74);
    const hazeY = Math.floor(skyH * 0.92);
    band(0, midY, skin.skyTop);
    band(midY, hazeY - midY, skin.skyMid);
    band(hazeY, skyH - hazeY, skin.skyHaze);

    // Sun: stacked rects, never a radial gradient. Kept left of the docked
    // panel so it is never a half-disc cut off by chrome.
    sunX = Math.floor(vw * 0.6);
    sunY = Math.floor(skyH * 0.13);
    sunR = Math.max(5, Math.floor(vw / 26));
    const sx = sunX;
    const sy = sunY;
    // Halo first. A bare disc clipped by a canopy read as a crescent moon in a
    // bright blue sky; light spilling past the leaves reads as sun.
    glowDisc(sx, sy, Math.round(sunR * 1.45), skin.sun, 0.34);
    ctx.fillStyle = skin.sun;
    const r = sunR;
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
      ctx.fillRect(sx - half, sy + dy, half * 2 + 1, 1);
    }
  }

  /** A third depth on the horizon, behind the far hills. */
  function drawRange(skin: RealmSkin): void {
    const span = vw * 4;
    ctx.fillStyle = skin.range;
    const baseY = groundY - Math.floor(groundY * 0.02);
    for (let x = 0; x < vw; x += 3) {
      const wx = x + scrollRange;
      const h = Math.floor(
        groundY * 0.5 +
          Math.sin(wx * 0.05) * groundY * 0.16 +
          Math.sin(wx * 0.019 + 2.1) * groundY * 0.13,
      );
      ctx.fillRect(x, baseY - h, 3, h);
      // Two value bands and a lit cap: a single flat fill read as a grey wall.
      ctx.fillStyle = mixHex(skin.range, '#000000', 0.16);
      ctx.fillRect(x, baseY - Math.floor(h * 0.42), 3, Math.floor(h * 0.42));
      ctx.fillStyle = mixHex(skin.range, '#ffffff', 0.3);
      ctx.fillRect(x, baseY - h, 3, Math.max(1, Math.floor(h * 0.09)));
      ctx.fillStyle = skin.range;
    }
    void span;
  }

  function drawClouds(skin: RealmSkin): void {
    const span = vw * 3;
    ctx.fillStyle = skin.cloud;
    for (let i = 0; i < 74; i++) {
      const base = hash01(i * 3.7) * span;
      const x = Math.floor(wrap(base - scrollClouds, span)) - vw;
      const y = Math.floor(hash01(i * 9.1) * groundY * 0.82) + 3;
      const w = 14 + Math.floor(hash01(i * 5.3) * 22);
      if (x > vw + 60 || x < -80) continue;
      ctx.fillStyle = skin.cloud;
      ctx.fillRect(x, y, w, 4);
      ctx.fillRect(x + 4, y - 3, w - 9, 3);
      ctx.fillRect(x + 9, y - 6, Math.max(3, w - 18), 3);
      ctx.fillStyle = skin.cloudShade;
      ctx.fillRect(x, y + 4, w, 2);
    }
  }

  /** Stepped hill band — quantized columns give the hard pixel silhouette. */
  function drawHills(
    color: string,
    lip: string | null,
    scroll: number,
    amp: number,
    baseH: number,
    freq: number,
    stepPx: number,
  ): void {
    for (let x = 0; x < vw; x += stepPx) {
      const wx = (x + scroll) * freq;
      const h = Math.floor(
        baseH + Math.sin(wx * 0.035) * amp + Math.sin(wx * 0.0131 + 1.3) * amp * 0.6,
      );
      const top = groundY - h;
      ctx.fillStyle = color;
      ctx.fillRect(x, top, stepPx, h);
      if (lip) {
        ctx.fillStyle = lip;
        ctx.fillRect(x, top, stepPx, 2);
      }
    }
  }

  function drawGround(skin: RealmSkin): void {
    const belowH = Math.max(8, sceneBottomY - groundY);
    const turfH = Math.max(6, Math.floor(belowH * 0.76));
    // Momentum climbs the whole lit surface one palette step. A dithered
    // overlay at this size read as static; a palette shift reads as sun.
    const lift = momentumLift(model.momentum);
    ctx.fillStyle = lighten(skin.turf, lift);
    ctx.fillRect(0, groundY, vw, turfH);
    ctx.fillStyle = lighten(skin.turfLip, lift);
    ctx.fillRect(0, groundY, vw, 3);
    ctx.fillStyle = skin.soil;
    ctx.fillRect(0, groundY + turfH, vw, vh - groundY - turfH);
    ctx.fillStyle = skin.soilDark;
    ctx.fillRect(0, groundY + turfH, vw, 2);

    const blade = groundBladeOf(skin);
    // Blade texture over the whole turf band — the single biggest reason a flat
    // fill reads as ground rather than as a colored rectangle. Positions are
    // baked by buildGroundTexture(); only the scroll offset moves per frame.
    for (const b of groundBlades) {
      const x = Math.floor(wrap(b.x0 - scrollGround, PROP_SPAN));
      if (x > vw) continue;
      ctx.fillStyle = b.toneAlt ? skin.turfLip : blade;
      ctx.fillRect(x, b.y, 1, b.tall ? 3 : 2);
      if (b.dot) ctx.fillRect(x + 1, b.y + 1, 1, 1);
    }
    // Fringe standing proud of the horizon line. Its own fill: the blade loop
    // above leaves fillStyle on whichever tone it happened to end on.
    ctx.fillStyle = blade;
    for (const f of groundFringe) {
      const x = Math.floor(wrap(f.x0 - scrollGround, PROP_SPAN));
      if (x > vw) continue;
      ctx.fillRect(x, groundY - 1, 1, 1);
      if (f.tuft) ctx.fillRect(x, groundY - 2, 1, 1);
    }

    // Soil strata: long horizontal marks, not scattered dots.
    ctx.fillStyle = skin.soilDark;
    for (const s of groundStrata) {
      const x = Math.floor(wrap(s.x0 - scrollGround, PROP_SPAN));
      if (x > vw) continue;
      ctx.fillRect(x, s.y, s.len, 1);
    }
  }

  /** A thin treeline on the ground plane, behind the fence — depth, not clutter. */
  /**
   * Standing timber between the hills and the road. The frame used to be half
   * empty sky, and no quantity of clouds fixes that -- it is a camera problem.
   * Trunks run off the top edge and canopies close the upper band, so the
   * camera reads as inside the world rather than pointed above it.
   */
  function drawGrove(skin: RealmSkin): void {
    const span = vw * 2;
    const haze = skin.skyHaze;
    const footY = groundY - Math.floor(groundY * 0.02);
    for (let i = 0; i < 30; i++) {
      const depth = hash01(i * 2.9);
      const x =
        Math.floor(wrap(hash01(i * 6.13 + 3) * span - scrollRange * (1.7 + depth * 1.6), span)) - 30;
      if (x < -60 || x > vw + 60) continue;
      const trunkW = 3 + Math.floor(depth * 6);
      // The hero's column stays clear. A trunk sharing his width and vertical
      // made him half-read as part of the tree.
      if (x + trunkW > heroX - 12 && x < heroX + 12) continue;
      // Distance sets value and height together. The far rank used to tower
      // over the near one at nearly its saturation, so thirty trees crossed
      // the ridgeline as one flat sheet with no depth in it at all.
      const fade = 0.4 - depth * 0.32;
      // Foliage holds its hue much harder than bark does. Mixed toward the sky
      // at the bark's rate the far canopies came out the same grey-white value
      // as the clouds behind them, and the grove was read as scaffolding.
      const leafFade = fade * 0.42;
      const bark = mixHex(skin.bark, haze, fade);
      const barkLit = mixHex(lighten(skin.bark, 0.4), haze, fade);
      const barkDark = mixHex(mixHex(skin.bark, '#000000', 0.4), haze, fade);
      const leafDark = mixHex(skin.leafDark, haze, leafFade);
      const leaf = mixHex(skin.leaf, haze, leafFade);
      // Lightening the leaf by a third walked it to grey-green, which is the
      // value the clouds already occupy. The lit face stays a green.
      const leafLite = mixHex(lighten(skin.leaf, 0.18), haze, leafFade);
      // Near crowns run off the top edge; far ones close well inside it. A
      // canopy nobody can see is a pole, and the poles were named by name.
      const crownY = Math.floor(groundY * (0.66 - depth * 0.5));

      // Cast shadow. A trunk meeting turf on a clean line reads as a decal.
      ctx.fillStyle = mixHex(skin.turf, '#000000', 0.3);
      ctx.fillRect(x - trunkW, footY - 1, trunkW * 3, 2);

      // Tapered trunk with a root flare, a sunward lit edge and bark streaks.
      // Uniform grey-mauve columns with dead-straight sides were named outright.
      for (let y = crownY; y < footY; y++) {
        const f = (y - crownY) / Math.max(1, footY - crownY);
        const flare = f > 0.9 ? Math.round((f - 0.9) * 10 * 2) : 0;
        const w = trunkW + flare;
        ctx.fillStyle = bark;
        ctx.fillRect(x - flare, y, w, 1);
        ctx.fillStyle = barkLit;
        ctx.fillRect(x + w - flare - 1, y, 1, 1);
        if (hash01(i * 3.1 + y * 0.37) > 0.62) {
          ctx.fillStyle = barkDark;
          ctx.fillRect(x + 1 + Math.floor(hash01(y * 1.7 + i) * Math.max(1, w - 2)), y, 1, 1);
        }
      }

      // One bough, growing out of the bole rather than hovering beside it. The
      // first version started a pixel clear of the trunk and read as a wire
      // strung across the sky; this starts inside the wood and tapers.
      const boughSide = hash01(i * 8.3) > 0.5 ? 1 : -1;
      const boughLen = trunkW + 3;
      ctx.fillStyle = barkDark;
      for (let n = 0; n < boughLen; n++) {
        const bx = boughSide > 0 ? x + trunkW - 1 + n : x - n;
        const thick = n < 2 ? 3 : n < boughLen - 2 ? 2 : 1;
        ctx.fillRect(bx, crownY + 5 - Math.round(n * 0.9), 1, thick);
      }

      // A crown with a profile, not a stack of slabs. Width follows a lobed
      // sine up the mass and every row is notched, so the silhouette breaks
      // instead of stepping in clean 90-degree corners.
      const cx = x + Math.floor(trunkW / 2);
      const crownW = trunkW * 4 + 14;
      const crownH = Math.round(crownW * 0.95);
      for (let k = 0; k < crownH; k++) {
        const y = crownY - k;
        if (y < -4) break;
        const t = k / crownH;
        const prof = Math.sin(Math.PI * (0.16 + t * 0.8));
        const notch = Math.round((hash01(i * 9.4 + k * 1.7) - 0.5) * 7);
        const half = Math.max(1, Math.round((crownW / 2) * prof) + notch);
        const lx = cx - half;
        const w = half * 2;
        ctx.fillStyle = leaf;
        ctx.fillRect(lx, y, w, 1);
        // Sun is upper right: the lit face is the far side of the upper mass,
        // and the underside of the crown carries the whole shadow.
        if (t > 0.35) {
          ctx.fillStyle = leafLite;
          ctx.fillRect(lx + Math.round(w * 0.58), y, Math.max(1, Math.round(w * 0.42)), 1);
        }
        if (t < 0.22 || hash01(i * 3.7 + k * 5.3) > 0.86) {
          ctx.fillStyle = leafDark;
          ctx.fillRect(lx, y, Math.max(1, Math.round(w * 0.34)), 1);
        }
      }
    }
  }

  /**
   * The strip the fight is staged in, from the hero's back foot to the far
   * edge of the creature he is swinging at. Nothing on the ground plane may
   * stand in it: a pine between the two bodies is exactly the clutter that
   * made the frame read as a collision rather than a duel.
   */
  function fightBand(): { x0: number; x1: number } {
    const lead = queue[0];
    const sprite = lead ? skinnedFor(model.region).monsters[lead.sprite] : undefined;
    const w = sprite ? sprite.width : 20;
    const cx = lead ? lead.x + lead.spread : heroX + BLADE_REACH;
    return { x0: heroX - 12, x1: cx + w / 2 + 6 };
  }

  function drawTreeline(sprites: SkinnedSprites): void {
    const y = groundY + 1;
    const band = fightBand();
    for (const prop of props) {
      if (prop.kind !== 'tree') continue;
      const x = Math.floor(wrap(prop.at - scrollTrees, PROP_SPAN));
      if (x < -24 || x > vw + 24) continue;
      const sprite = sprites.trees[prop.variant] ?? sprites.trees[0]!;
      const half = sprite.width / 2;
      if (x + half > band.x0 && x - half < band.x1) continue;
      drawShadow(x, Math.round(sprite.width * 0.55));
      drawSprite(ctx, sprite, x, y);
    }
  }

  /**
   * Leaf-fall at three depths. Kills are the only motion the scene had, so
   * between them it went still; this keeps the air busy without inventing any
   * economy value (DECISIONS.md #12).
   */
  function drawDrift(skin: RealmSkin): void {
    if (model.reduceMotion) return;
    const span = vw * 2;
    for (let i = 0; i < 34; i++) {
      const depth = hash01(i * 3.77);
      const speed = 12 + depth * 46;
      const x = Math.floor(wrap(hash01(i * 1.93) * span - clockSec * speed, span));
      if (x > vw + 4) continue;
      const fall = 9 + depth * 26;
      // Falls only through the wooded band; a leaf crossing open sky reads as
      // a dead pixel rather than as weather.
      const top = groundY * 0.42;
      const y = Math.floor(
        top +
          wrap(hash01(i * 8.11) * groundY + clockSec * fall, groundY - top - 4) +
          Math.sin(clockSec * 1.9 + i) * 3,
      );
      if (Math.abs(x - heroX) < 16) continue;
      const size = depth > 0.66 ? 2 : 1;
      ctx.fillStyle = depth > 0.5 ? skin.leaf : mixHex(skin.leafDark, skin.skyHaze, 0.35);
      ctx.fillRect(x, y, size, size);
    }
  }

  function drawMotes(skin: RealmSkin): void {
    if (model.reduceMotion) return;
    for (const m of motes) {
      const x = Math.floor(wrap(m.at - scrollTrees * 1.2, PROP_SPAN));
      if (x > vw) continue;
      const bobY = Math.sin(clockSec * 1.4 + m.phase) * 5;
      // Kept below the hill line. Anywhere a sky gap shows through the grove,
      // a loose coloured pixel reads as dirt on the screen, not as pollen.
      const y = Math.floor(
        Math.min(groundY - 2, groundY * 0.8 + m.yFrac * groundY * 0.22 + bobY),
      );
      ctx.fillStyle = m.size > 1 ? skin.petal : skin.turfLip;
      ctx.fillRect(x, y, m.size, m.size);
    }
  }

  /** Birds working the upper sky — the cheapest life in an otherwise flat band. */
  function drawBirds(sprites: SkinnedSprites): void {
    const span = vw * 3;
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(wrap(hash01(i * 4.7) * span - scrollBirds, span)) - vw;
      if (x < -12 || x > vw + 12) continue;
      const y = Math.floor(hash01(i * 8.3) * groundY * 0.5) + 6;
      if (Math.hypot(x - sunX, y - sunY) < sunR + 8) continue;
      const frame = Math.floor(clockSec * 5 + i) % 2;
      drawSprite(ctx, sprites.birds[frame] ?? sprites.birds[0]!, x, y);
    }
  }

  /**
   * Fronds sweeping past ahead of the road. Drawn over everything at nearly
   * twice ground speed: parallax the camera passes through is what stops a
   * side-scroller reading as a flat backdrop.
   */
  function drawForeground(sprites: SkinnedSprites): void {
    const band = Math.max(6, sceneBottomY - groundY);
    // Mid depth: scattered through the turf, scrolling faster than the road.
    for (let i = 0; i < 34; i++) {
      const x = Math.floor(wrap(hash01(i * 5.9 + 7) * PROP_SPAN - scrollFore * 0.72, PROP_SPAN));
      if (x < -20 || x > vw + 20) continue;
      const y = Math.floor(groundY + band * (0.42 + hash01(i * 3.3) * 0.5));
      drawSprite(ctx, sprites.fern, x, y);
    }
    // Nearest depth: double-size fronds at the frame edge, the layer the
    // camera actually passes through.
    const fern = sprites.fernNear;
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(wrap(hash01(i * 9.1 + 21) * PROP_SPAN - scrollFore, PROP_SPAN));
      if (x < -40 || x > vw + 40) continue;
      const y = vh + 6 + Math.floor(hash01(i * 2.7) * 6);
      ctx.drawImage(
        fern.image,
        Math.floor(x - fern.width),
        Math.floor(y - fern.height * 2),
        fern.width * 2,
        fern.height * 2,
      );
    }
  }

  /** A continuous post-and-rail fence, the way the reference art marks distance. */
  function drawFence(sprites: SkinnedSprites, skin: RealmSkin): void {
    const offset = wrap(scrollGround, FENCE_PITCH);
    const railY = groundY - 8;
    ctx.fillStyle = skin.bark;
    for (let x = -FENCE_PITCH; x < vw + FENCE_PITCH; x += FENCE_PITCH) {
      const px = Math.floor(x - offset);
      ctx.fillRect(px, railY, FENCE_PITCH, 1);
      ctx.fillRect(px, railY + 4, FENCE_PITCH, 1);
      drawShadow(px, sprites.fence.width + 2);
      drawSprite(ctx, sprites.fence, px, groundY + 1);
    }
  }

  function drawProps(sprites: SkinnedSprites): void {
    const band = fightBand();
    for (const prop of props) {
      if (prop.kind === 'tree') continue;
      const x = Math.floor(wrap(prop.at - scrollGround, PROP_SPAN));
      if (x < -30 || x > vw + 30) continue;
      // Grass and flowers are ground texture; a boulder is a third silhouette.
      if (prop.kind === 'rock' && x > band.x0 - 8 && x < band.x1 + 8) continue;
      switch (prop.kind) {
        case 'rock':
          drawShadow(x, sprites.rock.width);
          drawSprite(ctx, sprites.rock, x, groundY + 1);
          break;
        case 'tuft':
          drawSprite(ctx, sprites.tuftNear, x, groundY + 2);
          break;
        case 'flower':
          drawSprite(ctx, sprites.flower, x, groundY + 2);
          break;
        default:
          break;
      }
    }
  }

  /**
   * A dithered disc of light. Every pixel is either painted or not -- the
   * share painted carries the intensity, which is how you get real light
   * without the blur DECISIONS.md #13 forbids.
   */
  function glowDisc(cx: number, cy: number, r: number, color: string, gain = 1): void {
    if (r <= 0 || gain <= 0) return;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(vw - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(sceneBottomY - 1, Math.ceil(cy + r));
    ctx.fillStyle = color;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (!ditherAt(x, y, falloff(d, r) * gain)) continue;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }



  /** A lit pool on the turf: flattened, so it sits on the ground plane. */
  function litPool(cx: number, r: number, color: string, gain: number): void {
    if (gain <= 0) return;
    const cy = groundY + 1;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(vw - 1, Math.ceil(cx + r));
    const y1 = Math.min(sceneBottomY - 1, Math.ceil(cy + r * 0.4));
    ctx.fillStyle = color;
    for (let y = cy; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot((x - cx) * 0.42, y - cy);
        if (!ditherAt(x, y, falloff(d, r * 0.42) * gain)) continue;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  /**
   * Hard contact shadow on the ground plane, cast away from the sun.
   *
   * This used to be alpha-blended black at 0.34, which on turf is almost
   * nothing: every figure in the frame was read as floating on the grass. A
   * shadow in this style is not a soft one turned down, it is a darker flat
   * colour with an edge (DECISIONS.md #13), so this is the realm's own turf
   * stepped toward night.
   */
  function drawShadow(x: number, width: number): void {
    const skin = realmSkin(model.region);
    const core = mixHex(skin.turf, '#1a1c2c', 0.52);
    const edge = mixHex(skin.turf, '#1a1c2c', 0.3);
    // The sun sits upper right, so the shadow pools to the left of the feet.
    const cx = x - Math.round(width * 0.16);
    const rows: readonly (readonly [number, string])[] = [
      [1.15, core],
      [1, core],
      [0.72, edge],
      [0.4, edge],
    ];
    rows.forEach(([scale, color], i) => {
      const w = Math.max(2, Math.round(width * scale));
      ctx.fillStyle = color;
      // +1: the turf's own lip owns the first row under the horizon, and a
      // shadow drawn on it reads as part of that line rather than as contact.
      ctx.fillRect(Math.floor(cx - w / 2), groundY + 1 + i, w, 1);
    });
  }

  /** The hero's own light and contact shadow. Ground decals, so they stay under everything. */
  function drawHeroGround(): void {
    // The hero stands in his own light. White read as salt scattered on the
    // grass, so the pool is a lit tone of the turf itself.
    const lit = realmSkin(model.region);
    litPool(
      heroX,
      20,
      lighten(lit.turf, 0.42),
      Math.min(0.6, 0.16 + momentumLift(model.momentum) * 1.5),
    );
    drawShadow(heroX, 12);
  }

  /** The box no spark, coin, mote or number may be drawn inside. */
  function pocket(): HeroPocket {
    return heroPocket(heroX, groundY, heroA.width, heroA.height);
  }

  function drawHero(): void {
    const stride = model.reduceMotion ? 0 : Math.floor(clockSec * 7 * model.momentumMult) % 2;
    const sprite = stride === 0 ? heroA : heroB;
    const bob = model.reduceMotion ? 0 : Math.floor(Math.sin(clockSec * 14) * 0.6);
    // Rim first, sprite over it: a one-pixel halo of the sky's own light so the
    // figure never sinks into whatever value the ground happens to be.
    // A strike flares the rim and never touches the body — a white wash over a
    // figure reads as "this one got hit", and the hero is the one swinging.
    ctx.globalAlpha = heroFlash > STRIKE_RIM_SEC ? 1 : 0.85;
    for (const [dx, dy] of RIM_OFFSETS) {
      drawSprite(ctx, sprite, heroX + dx, groundY + bob + dy, false, true);
    }
    ctx.globalAlpha = 1;
    drawSprite(ctx, sprite, heroX, groundY + bob, false);

    // The blade sweeps through a real arc; nearest-neighbour rotation keeps it
    // pixelated rather than feathering into an anti-aliased smear.
    // Rests raised and forward; the swing sweeps down through the monster.
    const t = swingAnim / SWING_ANIM_SEC;
    const angle = swingAnim > 0 ? -1.8 + (1 - t) * 2.4 : -0.3;
    const handX = heroX + 5;
    const handY = groundY + bob - 9;
    drawSpriteRotated(ctx, sword, handX, handY, angle, 2, 2);

    if (swingAnim > 0) {
      // A crescent that tapers along the sweep and thins as the swing ends.
      // The old version was a ring of equal blobs, which read as a broken
      // sprite rather than as a blade trail.
      const steps = 10;
      for (let i = 0; i < steps; i++) {
        const f = i / (steps - 1);
        const a = angle + f * 1.15;
        const r = 13 + f * 5;
        // Thick at the blade, one pixel at the tail; brightest at the leading
        // edge and dimmer behind it.
        const thick = Math.max(1, Math.round((1 - f) * 3 * t));
        if (thick <= 0) continue;
        ctx.fillStyle = f < 0.35 ? '#ffffff' : f < 0.7 ? '#cbdbfc' : '#9badb7';
        ctx.fillRect(
          Math.floor(handX + Math.cos(a) * r),
          Math.floor(handY + Math.sin(a) * r),
          thick,
          thick,
        );
      }
    }
  }

  /**
   * The rift the guardian stepped out of. Taller and wider than the thing in
   * front of it, because the frame has to read as the end of a realm before
   * anyone gets to the panel: the boss used to be a road encounter in the same
   * forest with nothing drawn behind it.
   */
  function drawPortal(skin: RealmSkin, cx: number, guardianH: number): void {
    const h = Math.round(guardianH * 1.42);
    const halfW = Math.round(guardianH * 0.5);
    const top = groundY - h;
    // Lit from the inside out. A dark mouth put a dark creature inside a dark
    // hole and lost the whole silhouette; against a bright rift the guardian
    // reads as a shape before it reads as a colour.
    //
    // Violet, not the realm accent: on the accent the Greenwood's rift came out
    // gold and read as a lamplit archway. A tint of the realm keeps ten portals
    // from being one portal, but the otherworld owns the hue.
    const rim = mixHex('#76428a', skin.accent, 0.22);
    const mid = mixHex('#b04ea6', skin.accent, 0.18);
    const core = mixHex('#d77bba', skin.accent, 0.14);
    const CROWN = 0.44;
    for (let y = Math.max(0, top); y < groundY; y++) {
      const t = (y - top) / h;
      // A true dome, not a chamfer: the boxy version read as a barn door.
      const k = t < CROWN ? 1 - t / CROWN : 0;
      const half = Math.max(1, Math.round(halfW * Math.sqrt(Math.max(0, 1 - k * k))));
      // Three flat bands, no gradient and no blur (DECISIONS.md #13).
      ctx.fillStyle = rim;
      ctx.fillRect(cx - half, y, half * 2, 1);
      const b2 = Math.round(half * 0.78);
      ctx.fillStyle = mid;
      ctx.fillRect(cx - b2, y, b2 * 2, 1);
      const b3 = Math.round(half * 0.44);
      ctx.fillStyle = core;
      ctx.fillRect(cx - b3, y, b3 * 2, 1);
      // The mouth's own hard edge, one pixel, darker than anything inside it.
      ctx.fillStyle = OUTLINE_INK;
      ctx.fillRect(cx - half - 1, y, 1, 1);
      ctx.fillRect(cx + half, y, 1, 1);
    }
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(cx - halfW - 1, groundY - 1, halfW * 2 + 2, 2);

    if (model.reduceMotion) return;
    // Embers climbing the throat, so the rift is open rather than painted on.
    ctx.fillStyle = core;
    for (let i = 0; i < 16; i++) {
      const life = (clockSec * 0.32 + hash01(i * 3.7)) % 1;
      const y = Math.round(groundY - 3 - life * (h - 10));
      if (y < top + 2) continue;
      const spread = halfW * 0.9 * (1 - life * 0.5);
      const x = Math.round(cx + (hash01(i * 8.1) - 0.5) * 2 * spread);
      ctx.fillRect(x, y, 1, life > 0.6 ? 1 : 2);
    }
  }

  /** Lanes the engaged monster's health bar is sitting across this frame. */
  let barSpans: LaneSpan[] = [];

  function drawMonsters(sprites: SkinnedSprites): void {
    barSpans = [];
    // Back to front, so the one being fought overlaps the line behind it.
    for (let i = queue.length - 1; i >= 0; i--) {
      const m = queue[i]!;
      const sprite = sprites.monsters[m.sprite] ?? sprites.monsters[0]!;
      const bob = model.reduceMotion ? 0 : Math.round(Math.sin(m.bob) * 1.2);
      // The engaged creature lunges at the hero rather than standing and
      // waiting to be hit; a struck one is kicked back. Both come off the
      // transform, so no extra sprite frames are needed to stop it reading
      // as a statue. Recoil already rides on m.x; only the lunge is added here.
      const lunge =
        i === 0 && !model.reduceMotion
          ? Math.round(Math.max(0, Math.sin(clockSec * 3.4 + m.bob)) ** 2 * 6)
          : model.reduceMotion
            ? 0
            : // Queued creatures sway on their own phase. Two of a kind
              // standing in identical poses was called out by name.
              Math.round(Math.sin(clockSec * 1.6 + m.bob * 2.3) * 2);
      const x = m.x + m.spread - lunge;
      if (x < -40 || x > worldRightX + 60) continue;
      drawShadow(x, sprite.width - 2);
      drawSprite(ctx, sprite, x, groundY + bob, true);
      // The flash lights the creature rather than replacing it. Swapping in the
      // silhouette outright turned a 24x30 golem into a white mass for a third
      // of all frames, which is what read as a missing sprite.
      if (m.flash > 0) {
        ctx.globalAlpha = 0.55;
        drawSprite(ctx, sprite, x, groundY + bob, true, true);
        ctx.globalAlpha = 1;
      }

      // Only the engaged monster carries a bar, and only while it is alive:
      // a bar over a corpse is the clearest possible "this UI is broken".
      if (i !== 0) continue;
      // The guardian's bar is engine state that persists offline, not a display
      // estimate of the next kill.
      const remaining = model.boss
        ? Math.min(1, Math.max(0, model.boss.hpFrac))
        : Math.max(0, 1 - model.killProgress);
      if (remaining >= 1 || remaining <= 0.02) continue;
      // Anchored to the creature's mass, not its box: a stalker's antenna
      // put its bar on a shelf of empty air well above the thing being fought.
      const w = sprite.mass.width;
      const bx = Math.floor(x - w / 2);
      const by = groundY - sprite.height + sprite.mass.top - 3 + bob;
      barSpans = lanesTouching(by - 1, by + 3, groundY, LANE_COUNT).map((lane) => ({
        x: bx - 1,
        w: w + 2,
        lane,
      }));
      ctx.fillStyle = OUTLINE_INK;
      ctx.fillRect(bx - 1, by - 1, w + 2, 4);
      ctx.fillStyle = '#45283c';
      ctx.fillRect(bx, by, w, 2);
      // Never the accent: a yellow bar over a creature read as a wind-up
      // telegraph rather than as its health.
      ctx.fillStyle = remaining < 0.3 ? '#d95763' : '#6abe30';
      ctx.fillRect(bx, by, Math.max(0, Math.round(w * remaining)), 2);
    }
  }

  /** Every live arc's scene position, straight from core's trajectory. */
  function arcScreenPoints(): { x: number; y: number; spin: number }[] {
    const apex = arcApexHeight(ARC_FLIGHT_SEC);
    const out: { x: number; y: number; spin: number }[] = [];
    for (const arc of model.arcs) {
      const a = arcPositionAt(arc, model.timeSec);
      if (!a) continue;
      const p = sceneFromArcSpace(a.x, a.y, heroX, arcBaseY, apex);
      out.push({ x: p.x, y: p.y, spin: arc.expiresAtSec * 9 });
    }
    return out;
  }

  function drawArcs(): void {
    const points = arcScreenPoints();
    // Loot in flight is the brightest thing in the scene; it should light the
    // air around it, not sit on the backdrop as a flat disc.
    for (const p of points) glowDisc(p.x, p.y, 7, LOOT_GLOW, 0.5);

    for (const p of points) {
      const sprite = coin;
      // Squash the coin on its spin so it reads as tumbling metal.
      const squash = Math.abs(Math.cos(p.spin + clockSec * 9));
      const w = Math.max(2, Math.round(sprite.width * (0.35 + squash * 0.65)));
      ctx.drawImage(
        sprite.image,
        Math.floor(p.x - w / 2),
        Math.floor(p.y - sprite.height / 2),
        w,
        sprite.height,
      );
      // Catch affordance: a bright ring pulse. Core only keeps an arc in
      // `state.arcs` while it is catchable, so anything drawn here is live.
      const pulse = (Math.sin(clockSec * 12 + p.spin) + 1) / 2;
      ctx.fillStyle = pulse > 0.5 ? '#ffffff' : '#fbf236';
      const r = 7;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2 + clockSec * 3;
        ctx.fillRect(Math.floor(p.x + Math.cos(ang) * r), Math.floor(p.y + Math.sin(ang) * r), 1, 1);
      }
    }
  }

  /**
   * A tight solid ring on the creature that was struck. The old version was a
   * dithered shockwave expanding to a 26px radius, which at that size stopped
   * reading as light and started reading as scattered dots - "an unfinished
   * particle or a broken alpha mask, not an attack" - draped across the exact
   * 200 pixels the fight happens in. Small, solid and brief stages the hit
   * instead of burying it.
   */
  function drawImpacts(): void {
    for (const im of impacts) {
      const t = im.age / im.life;
      const r = Math.round(3 + t * 6);
      if (t > 0.7) continue;
      ctx.fillStyle = t < 0.35 ? '#ffffff' : IMPACT_GLOW;
      // Four arms, not a disc: it reads as an impact mark and leaves the
      // silhouettes either side of it uncovered.
      ctx.fillRect(Math.floor(im.x - r), Math.floor(im.y), r * 2, 1);
      ctx.fillRect(Math.floor(im.x), Math.floor(im.y - r), 1, r * 2);
    }
  }

  function drawRests(): void {
    for (const r of rests) {
      const sprite = r.gold ? coin : gem;
      // A short settling bounce, then it sits and glints.
      const t = Math.min(1, r.age / 0.22);
      const bounce = Math.round(Math.abs(Math.sin(t * Math.PI)) * -5 * (1 - t));
      drawSprite(ctx, sprite, r.x, r.y + bounce + sprite.height / 2);
      if (Math.sin(clockSec * 9 + r.spin) > 0.7) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(Math.floor(r.x + 3), Math.floor(r.y - 6), 1, 1);
      }
    }
  }

  function drawStreaks(): void {
    for (const s of streaks) {
      const t = Math.min(1, s.age / STREAK_SEC);
      const eased = t * t;
      const x = s.x0 + (collectAnchor.x - s.x0) * eased;
      // Lift out of the ground before homing, so it reads as a throw not a slide.
      const y = s.y0 + (collectAnchor.y - s.y0) * eased - Math.sin(t * Math.PI) * 18;
      const sprite = s.gold ? coin : gem;
      const w = Math.max(2, Math.round(sprite.width * (1 - t * 0.35)));
      ctx.drawImage(
        sprite.image,
        Math.floor(x - w / 2),
        Math.floor(y - sprite.height / 2),
        w,
        sprite.height,
      );
    }
  }

  function drawParticles(): void {
    const guard = pocket();
    for (const p of particles) {
      const life = lifeRemaining(p.age, p.life);
      if (life <= 0) continue;
      if (inPocket(guard, p.x, p.y)) continue;
      // Shrink instead of fading: alpha ramps are the one thing that reads as
      // "not pixel art" in a hard-edged scene.
      const size = life > 0.4 ? p.size : Math.max(1, p.size - 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.floor(p.x), Math.floor(p.y), size, size);
    }
  }

  function drawFloaters(): void {
    for (const f of floaters) {
      const life = lifeRemaining(f.age, f.life);
      if (life <= 0) continue;
      const y = laneY(f.lane) + floaterOffsetY(f.age, f.life, FLOATER_RISE);
      drawText(ctx, f.text, f.x, y, {
        scale: TIER_SCALE[f.tier],
        fill: f.color,
        outline: OUTLINE_INK,
        font: NUMERAL_FONT,
      });
    }
  }

  /** Segments, cells and label on one row: a widget, not a banner. */
  const COMBO_GUTTER = 4;
  const COMBO_SEGS = 6;
  const COMBO_SEG_W = 2;
  const COMBO_GAP = 1;
  const COMBO_METER_W = COMBO_SEGS * (COMBO_SEG_W + COMBO_GAP) - COMBO_GAP;

  /**
   * Seconds the widget spells out what it is, the first time a combo appears
   * in a session. A permanent word costs width on every frame forever to teach
   * something once; this costs it twice, then collapses.
   */
  const COMBO_TEACH_SEC = 2;
  let comboTeachUntilSec = -1;

  function comboLabel(): string {
    // Two decimals, not one: the cap is x1.75 and one decimal rounds it to
    // x1.8, printing a multiplier the game cannot actually reach.
    const value = `\u00d7${heldMult.value.toFixed(2)}`;
    if (comboTeachUntilSec < 0 && heldMomentum.value > 0.02) {
      comboTeachUntilSec = clockSec + COMBO_TEACH_SEC;
    }
    return clockSec < comboTeachUntilSec ? `COMBO ${value}` : value;
  }

  /**
   * The widget's plate in scene pixels. It is drawn in the body face while
   * floaters ride the shorter numeral grid, so it is taller than one lane and
   * has to reserve every lane it covers rather than claiming just its own.
   */
  function comboBox(): { x: number; w: number; top: number; height: number } {
    const w = textWidth(comboLabel(), 1, NUMERAL_FONT) + 3 + COMBO_METER_W;
    return {
      // The upper-left gutter, out of the fight's airspace. Riding it on the
      // hero fixed the idiom and broke the staging: "COMBO x1.74 is 4x his
      // height directly above him", over the one part of the frame that has to
      // read. The world idiom stays; the airspace goes back to the fight.
      x: COMBO_GUTTER,
      w,
      top: COMBO_GUTTER,
      height: NUMERAL_FONT.h + 2,
    };
  }

  /** Lanes the widget sits across, so floaters route around all of them. */
  function comboSpans(): LaneSpan[] {
    const box = comboBox();
    return lanesTouching(box.top, box.top + box.height, groundY, LANE_COUNT).map((lane) => ({
      x: box.x,
      w: box.w,
      lane,
    }));
  }

  function drawMomentumMeter(skin: RealmSkin): void {
    // Hidden at rest: a full-width empty bar labelled x1.0 is the frame
    // announcing that nothing is happening.
    if (heldMomentum.value <= 0.02) return;
    const label = comboLabel();
    const labelW = textWidth(label, 1, NUMERAL_FONT);
    const box = comboBox();
    const y = laneY(COMBO_LANE);
    const hot = heldMomentum.value > 0.7;

    // Outlined type, no plate. The 1px ring is what every other number in the
    // world wears, and it is what keeps this legible over sky or canopy
    // without pasting a rectangle of chrome across the frame.
    drawText(ctx, label, box.x, y, {
      scale: 1,
      fill: hot ? '#ffffff' : skin.accent,
      outline: OUTLINE_INK,
      align: 'left',
      font: NUMERAL_FONT,
    });

    const meterX = box.x + labelW + 3;
    const meterY = y + 1;
    // The pip track is built the way the creature health bar is built: a dark
    // frame with cells inside it, so the two read as the same world's meters.
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(meterX - 1, meterY - 1, COMBO_METER_W + 2, NUMERAL_FONT.h + 2);
    const filled = Math.min(COMBO_SEGS, Math.round(heldMomentum.value * COMBO_SEGS));
    // At rest a row of dark cells reads as broken, not idle. A slow chase
    // light across the empty cells reads as armed and waiting.
    const chase = model.reduceMotion ? -1 : Math.floor(clockSec * 6) % COMBO_SEGS;
    for (let i = 0; i < COMBO_SEGS; i++) {
      const lit = i < filled;
      const idle = filled === 0 && i === chase;
      ctx.fillStyle = lit
        ? i >= COMBO_SEGS - 2
          ? '#ffffff'
          : skin.accent
        : idle
          ? mixHex('#3d3846', skin.accent, 0.55)
          : '#3d3846';
      ctx.fillRect(meterX + i * (COMBO_SEG_W + COMBO_GAP), meterY, COMBO_SEG_W, NUMERAL_FONT.h);
    }
  }

  function draw(): void {
    const skin = realmSkin(model.region);
    const sprites = skinnedFor(model.region);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    const far = backdropSkin(skin);
    drawSky(skin);
    drawClouds(skin);
    drawBirds(sprites);
    drawRange(far);
    drawHills(far.hillFar, null, scrollHillFar, groundY * 0.14, groundY * 0.34, 1, 4);
    drawHills(far.hillNear, far.hillLip, scrollHillNear, groundY * 0.11, groundY * 0.18, 1.7, 3);
    drawGrove(far);
    drawDrift(far);
    drawTreeline(sprites);

    const jolt = model.reduceMotion ? { x: 0, y: 0 } : shakeOffset(shake, clockSec);
    ctx.save();
    ctx.translate(Math.round(jolt.x), Math.round(jolt.y));

    drawGround(skin);
    drawFence(sprites, skin);
    drawProps(sprites);
    if (model.boss) {
      const lead = queue[0];
      const guardian = sprites.monsters[bossSlot(model.region)];
      if (lead && guardian) drawPortal(skin, Math.round(lead.x), guardian.height);
    }
    drawMonsters(sprites);
    drawHeroGround();
    drawArcs();
    drawParticles();
    drawImpacts();
    drawRests();
    drawStreaks();
    drawMotes(skin);
    // Last of the world layers, so nothing bright can ever be painted over the
    // one figure that must always read. The pocket test below is the second
    // line: it keeps effects from crowding the silhouette even from behind.
    drawHero();
    drawFloaters();
    drawForeground(sprites);
    drawMomentumMeter(skin);

    ctx.restore();

    displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    displayCtx.imageSmoothingEnabled = false;
    displayCtx.clearRect(0, 0, canvas.width, canvas.height);
    // Blit only the world band, offset down the display canvas: in portrait the
    // panels own the top and the road owns the thumb zone.
    const scale = canvas.width / vw;
    displayCtx.drawImage(
      buffer,
      0,
      0,
      vw,
      sceneBottomY,
      0,
      Math.round(sceneOffsetY * scale),
      canvas.width,
      Math.round(sceneBottomY * scale),
    );
  }

  function frame(dtSec: number, next: SceneModel): void {
    model = next;
    if (!model.paused) step(Math.min(dtSec, 0.1));
    draw();
  }

  function dispose(): void {
    window.removeEventListener('resize', onResize);
  }

  return { frame, strikeAt, catchArc, setCollectAnchor, setSceneTop, setSceneRight, dispose };
}

/**
 * Compact number for in-world floaters. Delegates past 1000 to the HUD's
 * formatter: its own ladder stopped at T, so a staged late run printed
 * "2.5866247188821906E+295T" across the middle of the frame.
 *
 * A non-finite value says so in words. formatNumber answers Infinity with an
 * infinity sign, drawText skips any glyph its face lacks, and the two together
 * put a silent hole in the frame where the number that broke should be.
 */
export function formatShort(n: number): string {
  if (!Number.isFinite(n)) return 'OVERFLOW';
  if (n < 10) return n.toFixed(1);
  // Round first, then re-test: 999.6 rounds to a bare "1000" where the ladder
  // above prints "1.00K".
  const whole = Math.round(n);
  if (whole < 1000) return String(whole);
  return formatNumber(n);
}
