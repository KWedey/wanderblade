// The road scene: a full-bleed side-scrolling pixel world the HUD sits on top
// of. Presentation state only: every number it displays comes from the
// controller (DECISIONS.md #12). It renders into a small offscreen buffer and
// upscales with smoothing off, which is what keeps the pixels square everywhere.

import { GUARDIAN_BODY, rosterAt, speciesIndexAt } from '../species';
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
  bodyPocket,
  heroPocket,
  inAnyPocket,
  peakFollow,
  nudgeFromPocket,
  type Floater,
  type HeroPocket,
  type PeakState,
  type FloaterTier,
  mergeTargetIndex,
  type Particle,
} from './fx';
import { arcPositionAt, type ArcPoint } from '@wanderblade/core';
import {
  HERO_INK,
  LOOT_INK,
  OUTLINE_INK,
  REALM_SKIN_COUNT,
  backdropSkin,
  brickJointXs,
  clampHillStep,
  depthBandTones,
  depthHaze,
  foliageNotchAt,
  foregroundInk,
  grassClumpBlades,
  groundBladeOf,
  hillBaseInk,
  inFoliageLobe,
  inRun,
  lighten,
  lightnessOf,
  mixHex,
  glowRingRadii,
  momentumLift,
  monsterInk,
  pillarSpans,
  realmSkin,
  sceneryInk,
  sunHaloBands,
  torchFlicker,
  torchGlowBands,
  vignetteInsets,
  type FoliageLobe,
  type PillarSpan,
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
  ACTOR_SHADOW,
  ARC_FLIGHT_SEC,
  BLADE_REACH,
  BOSS_SCALE,
  LOOT_GLOW,
  PROP_SPAN,
  SWING_ANIM_SEC,
  SWINGS_PER_SEC,
  damagePerSwing,
  formatShort,
  hash01,
  swingInterval,
  type FillCtx,
  type SceneModel,
  type SkinnedSprites,
} from './frame';
import { createViewport, layoutViewport, toScene as toSceneAt, type Chrome } from './geometry';
import {
  bakeSprite,
  context,
  drawSprite,
  drawSpriteRotated,
  drawText,
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

export type { SceneModel } from './frame';

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

/** Ground scroll in scene units/sec at momentum zero. */
const WALK_SPEED = 34;
/** Fraction of the kill spent closing the distance; the rest is the fight. */
const APPROACH_FRAC = 0.3;
/** Seconds the guardian spends walking out of its portal. Then it stands: its
 * health is a ten-minute fight, and marching it in over that reads as a road
 * approach rather than a duel. */
const BOSS_ENTRANCE_SEC = 1.1;
/** Dungeon room geometry (DECISIONS.md #58): brick course height, wall/ceiling band counts, edge-vignette bands and their width in scene pixels. */
const BRICK_H = 7;
const WALL_BANDS = 3;
const VIGNETTE_BANDS = 5;
/** Vignette inset step as a fraction of the shorter viewport side — corners read as dark at any screen size without swallowing the piers the torches are meant to light. */
const VIGNETTE_STEP_FRAC = 0.012;
/** Each pier's width as a fraction of the room, and its lit inner edge's width in scene pixels. */
const PILLAR_FRAC = 0.13;
const PILLAR_EDGE_W = 3;
/** The two torches' horizontal position (fraction of room width, kept under the desktop dock's 0.6vw limit per DECISIONS.md #59) and flicker seed. */
const DUNGEON_TORCHES = [
  { side: 0.16, seed: 2.1 },
  { side: 0.58, seed: 5.7 },
] as const;
/** Torch light-pool reach as a fraction of room width — a pool, not a spotlight covering half the frame. */
const WALL_TORCH_REACH_FRAC = 0.075;
const FLOOR_TORCH_REACH_FRAC = 0.055;

const SHAKE_DECAY = 9;
const MAX_SHAKE = 3.2;
const FLOATER_LIFE = 1.05;
/**
 * The number hierarchy. Gold headline lives in the DOM HUD; everything in the
 * world ranks below it and every in-world number is assigned a tier here, so
 * size and color are never picked per call site.
 */
const TIER_SCALE: Record<FloaterTier, number> = { payout: 1, catch: 1, damage: 1 };
/** White, not LOOT_GLOW: the catch number sits inside the shower it reports and dissolved into it. */
const TEXT_CATCH = '#ffffff';
const TEXT_DAMAGE = '#ffffff';
/** Cold steel, never white or gold: white sparks out-shone the hero, and gold made a coin vanish into its own shower. */
const SPARK_COLORS = ['#9badb7', '#696a6a', '#847e87'];
/** Sparks at the gold readout when a streak lands. */
const COLLECT_SPARKS = [LOOT_GLOW, '#ffffff'];
const NO_JOLT = { x: 0, y: 0 };

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

/** A `{from, len}` run over `[0, span)`, sized as a fraction of `span` between `lenBase` and `lenBase + lenRange`. */
function lobeRun(seed: number, span: number, minLen: number, lenBase: number, lenRange: number, lenOffset: number) {
  return {
    from: Math.floor(hash01(seed) * span),
    len: Math.max(minLen, Math.round(span * (lenBase + hash01(seed + lenOffset) * lenRange))),
  };
}

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

/**
 * Stepped hill band — quantized columns give the hard pixel silhouette. A
 * dark base and a lit cap carry the slope's own form, the same two-band
 * trick drawRange uses below; a single flat fill read as a cardboard
 * cutout, not a hillside catching light from one direction.
 */
export function drawHills(
  ctx: FillCtx,
  vw: number,
  groundY: number,
  color: string,
  lip: string | null,
  scroll: number,
  amp: number,
  baseH: number,
  freq: number,
  stepPx: number,
  haze: string,
): void {
  const base = hillBaseInk(color, haze);
  const cap = lip ?? lighten(color, 0.22);
  // Column height is clamped to a slope the column width can actually draw
  // — the raw sine profile jumps further than a step is wide, which is what
  // a staircased silhouette looks like at this resolution.
  const maxDelta = stepPx * 1.5;
  let prevH: number | null = null;
  for (let x = 0; x < vw; x += stepPx) {
    const wx = (x + scroll) * freq;
    const rawH = Math.floor(
      baseH + Math.sin(wx * 0.035) * amp + Math.sin(wx * 0.0131 + 1.3) * amp * 0.6,
    );
    const h = clampHillStep(prevH, rawH, maxDelta);
    prevH = h;
    const top = groundY - h;
    const baseBandH = Math.max(1, Math.floor(h * 0.4));
    ctx.fillStyle = color;
    ctx.fillRect(x, top, stepPx, h);
    ctx.fillStyle = base;
    ctx.fillRect(x, groundY - baseBandH, stepPx, baseBandH);
    ctx.fillStyle = cap;
    ctx.fillRect(x, top, stepPx, 2);
  }
}

/** Horizontal value bands the turf splits into, far edge to near edge. */
const GROUND_BANDS = 4;

/** Paints one tone per horizontal strip of the turf band — the same fixed-band idiom drawHills uses, applied to the ground plane instead of a silhouette. */
export function drawGroundBands(
  ctx: FillCtx,
  vw: number,
  groundY: number,
  turfH: number,
  tones: readonly string[],
): void {
  const bandH = Math.max(1, Math.floor(turfH / tones.length));
  let y = groundY;
  for (let i = 0; i < tones.length; i++) {
    const h = i === tones.length - 1 ? groundY + turfH - y : bandH;
    ctx.fillStyle = tones[i]!;
    ctx.fillRect(0, y, vw, h);
    y += h;
  }
}

/**
 * Brick courses from `top` to `bottom`: each row a flat tone (depth-banded
 * the same way the turf is) with 1px mortar joints staggered per row via
 * `brickJointXs`, so the wall reads as coursed masonry rather than tile.
 */
export function drawStoneWall(
  ctx: FillCtx,
  x: number,
  w: number,
  top: number,
  bottom: number,
  tones: readonly string[],
  jointTone: string,
  brickH: number,
): void {
  if (tones.length === 0) return;
  const h = Math.max(1, brickH);
  const rows = Math.max(1, Math.ceil((bottom - top) / h));
  for (let r = 0; r < rows; r++) {
    const y = top + r * h;
    const rowH = Math.min(h, bottom - y);
    if (rowH <= 0) break;
    const tone = tones[Math.max(0, Math.min(tones.length - 1, Math.floor((r / rows) * tones.length)))]!;
    ctx.fillStyle = tone;
    ctx.fillRect(x, y, w, rowH);
    ctx.fillStyle = jointTone;
    for (const jx of brickJointXs(w, r, h * 2)) {
      ctx.fillRect(x + jx, y, 1, rowH);
    }
  }
}

/**
 * Two coursed piers flanking the room, each with a lit edge facing the fight
 * — the same lit-face/shadow-face idiom the tree trunks use (DECISIONS.md #54).
 */
export function drawPillars(
  ctx: FillCtx,
  spans: readonly PillarSpan[],
  top: number,
  bottom: number,
  tones: readonly string[],
  jointTone: string,
  edgeColor: string,
  edgeW: number,
  brickH: number,
): void {
  for (const span of spans) {
    drawStoneWall(ctx, span.x, span.w, top, bottom, tones, jointTone, brickH);
    const edgeX = span.x === 0 ? span.x + span.w - edgeW : span.x;
    ctx.fillStyle = edgeColor;
    ctx.fillRect(edgeX, top, edgeW, bottom - top);
  }
}

/** A filled circle on any `FillCtx` — mass, not an outline (mirrors the closure-local `fillDisc` used by the sun). */
function fillFlatDisc(ctx: FillCtx, cx: number, cy: number, r: number): void {
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
    ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

/** Where a torch sits and how strongly its flame is currently burning. */
export interface TorchLight {
  x: number;
  y: number;
  flicker: number;
}

/** Light pools only — the stone each torch actually illuminates, painted before the flame itself. */
export function drawTorchGlow(
  ctx: FillCtx,
  torches: readonly TorchLight[],
  baseTone: string,
  flame: string,
  reach: number,
): void {
  // A pale realm's rock can out-value the flame colour, which would mix the
  // wall darker as the bands step in — lift the mix target above the base.
  const baseLightness = lightnessOf(baseTone);
  const flameLightness = lightnessOf(flame);
  // lighten(hex, t) raises lightness by t * (1 - L), not by t — invert that
  // to solve for the push that clears the base tone by a fixed margin.
  const tint =
    flameLightness > baseLightness
      ? flame
      : lighten(flame, Math.min(1, (baseLightness + 0.12 - flameLightness) / (1 - flameLightness)));
  for (const t of torches) {
    for (const band of torchGlowBands(reach * t.flicker)) {
      ctx.fillStyle = mixHex(baseTone, tint, band.mix);
      fillFlatDisc(ctx, t.x, t.y, band.r);
    }
  }
}

/** The flame itself: a filled core — a hollow ring reads as a marker, not fire (DECISIONS.md #53). */
export function drawTorchFlame(ctx: FillCtx, x: number, y: number, flicker: number, flame: string): void {
  ctx.fillStyle = mixHex(flame, '#000000', 0.3);
  fillFlatDisc(ctx, x, y, Math.max(1, Math.round(6 * flicker)));
  ctx.fillStyle = mixHex(flame, '#ffffff', 0.35);
  fillFlatDisc(ctx, x, y, Math.max(1, Math.round(3 * flicker)));
}

/**
 * Frame the room darkens toward at its very edges: concentric non-overlapping
 * border rings, outermost first, each a flat tone — discrete bands standing in
 * for a vignette gradient (DECISIONS.md #13).
 */
export function drawVignette(ctx: FillCtx, vw: number, vh: number, tones: readonly string[], step: number): void {
  const insets = vignetteInsets(tones.length, step);
  for (let i = 0; i < tones.length; i++) {
    const inset = insets[i]!;
    const innerW = Math.max(0, vw - inset * 2);
    const innerH = Math.max(0, vh - inset * 2 - step * 2);
    ctx.fillStyle = tones[i]!;
    ctx.fillRect(inset, inset, innerW, step);
    ctx.fillRect(inset, vh - inset - step, innerW, step);
    ctx.fillRect(inset, inset + step, step, innerH);
    ctx.fillRect(vw - inset - step, inset + step, step, innerH);
  }
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
          bakeSprite(MONSTER_SHAPES[sp.shape] ?? MONSTER_SHAPES[0]!, monsterInk(sp.body, skin.turf, skin.rock)),
        ),
        bakeSprite(MONSTER_SHAPES[BOSS_SHAPE]!, monsterInk(GUARDIAN_BODY, skin.turf, skin.rock)),
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
    const belowH = Math.max(8, view.sceneBottomY - view.groundY);
    const turfH = Math.max(6, Math.floor(belowH * 0.76));

    groundBlades = [];
    for (let i = 0; i < 3400; i++) {
      const depth = hash01(i * 1.7);
      groundBlades.push({
        x0: hash01(i * 4.1 + 3) * PROP_SPAN,
        y: view.groundY + 3 + Math.floor(depth * (turfH - 4)),
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
        y: view.groundY + turfH + 3 + Math.floor(hash01(i * 7.7) * Math.max(1, belowH - turfH - 4)),
        len: 4 + Math.floor(hash01(i) * 8),
      });
    }
  }

  // --- Mutable scene state ---
  const view = createViewport();
  const chrome: Chrome = { topCss: 0, rightCss: 0 };
  /** Peak-held momentum and multiplier, so the readout never sags below the cap. */
  let heldMomentum: PeakState = { value: 0, holdLeftSec: 0 };
  let heldMult: PeakState = { value: 1, holdLeftSec: 0 };

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
  let scrollBirds = 0;

  let shake = 0;
  let swingCooldown = 0;
  let swingAnim = 0;
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
    boss: false,
    arcs: [],
    timeSec: 0,
  };

  function resize(): void {
    layoutViewport(view, canvas, buffer, chrome, Math.min(window.devicePixelRatio || 1, 3));
    displayCtx.imageSmoothingEnabled = false;
    ctx.imageSmoothingEnabled = false;
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

  const toScene = (clientX: number, clientY: number) => toSceneAt(view, canvas, clientX, clientY);

  /** The view owns layout; it tells the scene how much chrome sits above the road. */
  function setSceneTop(cssPx: number): void {
    const next = Math.max(0, Math.round(cssPx));
    if (next === chrome.topCss) return;
    chrome.topCss = next;
    resize();
  }

  function setSceneRight(cssPx: number): void {
    const next = Math.max(0, Math.round(cssPx));
    if (next === chrome.rightCss) return;
    chrome.rightCss = next;
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

  const laneY = (lane: number): number => laneBaseline(lane, view.groundY);

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
    const wish = Math.round((view.groundY - LANE_BASE_OFFSET - f.y) / LANE_STEP);
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
      x: view.worldRightX + 30,
      flash: 0,
      recoil: 0,
      bob: hash01(killIndex) * Math.PI * 2,
      spread: 0,
    });
  }

  /** The guardian renders at BOSS_SCALE (DECISIONS.md #58); every place that reasons about its on-screen size shares this. */
  function leadScale(): number {
    return model.boss ? BOSS_SCALE : 1;
  }

  /** Half the lead's sprite, plus whatever its group spread pulls forward. */
  function engageInset(): number {
    const lead = queue[0];
    if (!lead) return 12;
    const sprite = skinnedFor(model.region).monsters[lead.sprite];
    return Math.round((sprite ? sprite.width * leadScale() : 20) / 2) - lead.spread;
  }

  function killMonster(skin: RealmSkin): void {
    const lead = queue[0];
    const x = lead ? lead.x + lead.spread : view.heroX + BLADE_REACH;
    const y = view.groundY;
    burst(x, y - 10, 14, [skin.monBody, skin.monBodyDark, ...SPARK_COLORS], 130);
    // One burst at the contact pixel. The mark this replaces was two white bars
    // crossing at 12 units - the brightest object in a 1920px frame, and read
    // by a critic as a mouse cursor rather than as a hit.
    burst(x, y - 12, 10, ['#ffffff', ...SPARK_COLORS], 62);
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
    if (!lead || lead.x - engageInset() > view.heroX + BLADE_REACH + 16) return;

    const leadSprite = skinnedFor(model.region).monsters[lead.sprite];
    // Contact and damage-number placement have to land on the scaled silhouette, not the sprite's raw box.
    const scale = leadScale();
    const leadHeight = leadSprite ? leadSprite.height * scale : 16;
    // On the creature's body, past its near edge. Six pixels back toward the
    // swinger put the brightest thing in the frame in the hero's neighbourhood,
    // and a burst beside him beats his silhouette even when it paints behind
    // him: draw order fixes occlusion, not adjacency.
    const contactX = lead.x + lead.spread + Math.round(leadSprite ? leadSprite.width * scale * 0.2 : 3);
    const contactY = view.groundY - Math.round(leadHeight * 0.55);
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
      y: view.groundY - leadHeight - 6,
      life: 0.5,
      value: damage,
      label: (v) => formatShort(v),
      color: TEXT_DAMAGE,
      tier: 'damage',
      owned: true,
    });
  }

  function toArcSpace(px: number, py: number): ArcPoint {
    return arcSpaceFromScene(px, py, view.heroX, view.arcBaseY, arcApexHeight(ARC_FLIGHT_SEC));
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
      const dx = p.x - view.heroX;
      const dy = p.y - view.arcBaseY;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best ? toArcSpace(best.x, best.y) : null;
  }

  function strikeAt(clientX: number | null, clientY: number | null): ArcPoint | null {
    // Restart the auto-attack cadence rather than zeroing it — zero would go
    // negative on the very next step() and fire an immediate duplicate swing.
    swingCooldown = 1 / SWINGS_PER_SEC;
    swing(true);

    if (clientX === null || clientY === null) {
      const aim = autoAim();
      if (aim) lastAim = sceneFromArcSpace(aim.x, aim.y, view.heroX, view.arcBaseY, arcApexHeight(ARC_FLIGHT_SEC));
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
    const aim = lastAim ?? { x: view.heroX + 24, y: view.groundY - 30 };
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
    scrollHillNear = wrap(scrollHillNear + speed * 0.28 * dtSec, view.vw * 4);
    scrollHillFar = wrap(scrollHillFar + speed * 0.13 * dtSec, view.vw * 4);
    scrollClouds = wrap(scrollClouds + speed * 0.05 * dtSec, view.vw * 3);
    scrollRange = wrap(scrollRange + speed * 0.07 * dtSec, view.vw * 4);
    // Faster than the ground: the foreground is nearer than the road is.
    scrollFore = wrap(scrollFore + speed * 1.75 * dtSec, PROP_SPAN);
    scrollBirds = wrap(scrollBirds + (speed * 0.12 + 9) * dtSec, view.vw * 3);

    shake = decayTo(shake, 0, SHAKE_DECAY, dtSec);
    damageTextCooldown = Math.max(0, damageTextCooldown - dtSec);
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
        queue.push({ sprite: bossSlot(model.region), x: view.worldRightX + 30, flash: 0, recoil: 0, bob: 0, spread: 0 });
        bossEnteredAtSec = clockSec;
      }
    } else {
      if (queue[0]?.sprite === bossSlot(model.region)) queue.length = 0;
      while (queue.length < QUEUE_DEPTH) enqueueMonster(model.kills + queue.length);
    }

    // The lead's position follows the engine's kill progress so it arrives as
    // the kill resolves. The guardian instead walks out over BOSS_ENTRANCE_SEC
    // and stands: a ten-minute march on remaining health reads as a road approach.
    const closing = model.boss
      ? Math.min(1, (clockSec - bossEnteredAtSec) / BOSS_ENTRANCE_SEC)
      : null;
    const t = closing ?? Math.min(1, model.killProgress / APPROACH_FRAC);
    const eased = 1 - (1 - t) * (1 - t);
    // Stop the creature's near edge at the blade, not its centre: a fixed
    // centre-to-centre gap put a wide crawler inside the hero and a narrow one
    // out of reach.
    const stop = view.heroX + BLADE_REACH + engageInset();
    const leadTarget = view.worldRightX + 20 + (stop - (view.worldRightX + 20)) * eased;
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
        x: view.heroX - 5,
        y: view.groundY - 1,
        vx: -18 - hash01(clockSec * 13) * 26 * model.momentumMult,
        vy: -14 - hash01(clockSec * 7) * 18,
        age: 0,
        life: 0.4 + hash01(clockSec * 3) * 0.3,
        size: 1 + (hash01(clockSec * 21) > 0.6 ? 1 : 0),
        color: model.boss ? skin.rock : skin.turfLip,
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
        burst(collectAnchor.x, collectAnchor.y, 5, COLLECT_SPARKS, 60);
        streaks.splice(i, 1);
      }
    }
  }

  // --- Drawing -----------------------------------------------------------

  function band(y: number, h: number, color: string): void {
    if (h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(0, y, view.vw, h);
  }

  function drawSky(skin: RealmSkin): void {
    const skyH = view.groundY;
    const midY = Math.floor(skyH * 0.74);
    const hazeY = Math.floor(skyH * 0.92);
    band(0, midY, skin.skyTop);
    band(midY, hazeY - midY, skin.skyMid);
    band(hazeY, skyH - hazeY, skin.skyHaze);

    sunX = Math.floor(view.vw * 0.6);
    sunR = Math.max(5, Math.floor(view.vw / 26));
    // Far enough down that the widest halo band (sunHaloBands' 2.3x) clears the top edge.
    sunY = Math.max(Math.ceil(sunR * 2.45), Math.floor(skyH * 0.13));
  }

  /** A filled circle, scanline by scanline — mass, not an outline. */
  function fillDisc(cx: number, cy: number, r: number): void {
    for (let dy = -r; dy <= r; dy++) {
      const y = cy + dy;
      if (y < 0 || y >= view.sceneBottomY) continue;
      const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
      ctx.fillRect(cx - half, y, half * 2 + 1, 1);
    }
  }

  /**
   * Stacked solid discs over the treeline, never a radial gradient: behind the
   * canopy the disc tore into two fragments a critic read as an artifact. Each
   * halo band overpaints the last, so the glow is carried by area and colour.
   */
  function drawSun(skin: RealmSkin): void {
    for (const band of sunHaloBands(sunR)) {
      ctx.fillStyle = mixHex(skin.sun, skin.skyTop, band.skyMix);
      fillDisc(sunX, sunY, band.r);
    }
    ctx.fillStyle = skin.sun;
    fillDisc(sunX, sunY, sunR);
  }

  /** A third depth on the horizon, behind the far hills. */
  function drawRange(skin: RealmSkin): void {
    ctx.fillStyle = skin.range;
    const baseY = view.groundY - Math.floor(view.groundY * 0.02);
    for (let x = 0; x < view.vw; x += 3) {
      const wx = x + scrollRange;
      const h = Math.floor(
        view.groundY * 0.5 +
          Math.sin(wx * 0.05) * view.groundY * 0.16 +
          Math.sin(wx * 0.019 + 2.1) * view.groundY * 0.13,
      );
      ctx.fillRect(x, baseY - h, 3, h);
      // Two value bands and a lit cap: a single flat fill read as a grey wall.
      ctx.fillStyle = mixHex(skin.range, '#000000', 0.16);
      ctx.fillRect(x, baseY - Math.floor(h * 0.42), 3, Math.floor(h * 0.42));
      ctx.fillStyle = mixHex(skin.range, '#ffffff', 0.3);
      ctx.fillRect(x, baseY - h, 3, Math.max(1, Math.floor(h * 0.09)));
      ctx.fillStyle = skin.range;
    }
  }

  function drawClouds(skin: RealmSkin): void {
    const span = view.vw * 3;
    ctx.fillStyle = skin.cloud;
    for (let i = 0; i < 74; i++) {
      const base = hash01(i * 3.7) * span;
      const x = Math.floor(wrap(base - scrollClouds, span)) - view.vw;
      const y = Math.floor(hash01(i * 9.1) * view.groundY * 0.82) + 3;
      const w = 14 + Math.floor(hash01(i * 5.3) * 22);
      if (x > view.vw + 60 || x < -80) continue;
      ctx.fillStyle = skin.cloud;
      ctx.fillRect(x, y, w, 4);
      ctx.fillRect(x + 4, y - 3, w - 9, 3);
      ctx.fillRect(x + 9, y - 6, Math.max(3, w - 18), 3);
      ctx.fillStyle = skin.cloudShade;
      ctx.fillRect(x, y + 4, w, 2);
    }
  }

  function drawGround(skin: RealmSkin): void {
    const belowH = Math.max(8, view.sceneBottomY - view.groundY);
    const turfH = Math.max(6, Math.floor(belowH * 0.76));
    // Momentum climbs the whole lit surface one palette step. A dithered
    // overlay at this size read as static; a palette shift reads as sun.
    const lift = momentumLift(model.momentum);
    drawGroundBands(ctx, view.vw, view.groundY, turfH, depthBandTones(lighten(skin.turf, lift), GROUND_BANDS));
    ctx.fillStyle = lighten(skin.turfLip, lift);
    ctx.fillRect(0, view.groundY, view.vw, 3);
    ctx.fillStyle = skin.soil;
    ctx.fillRect(0, view.groundY + turfH, view.vw, view.vh - view.groundY - turfH);
    ctx.fillStyle = skin.soilDark;
    ctx.fillRect(0, view.groundY + turfH, view.vw, 2);

    const blade = groundBladeOf(skin);
    // Blade texture over the whole turf band — the single biggest reason a flat
    // fill reads as ground rather than as a colored rectangle. Positions are
    // baked by buildGroundTexture(); only the scroll offset moves per frame.
    for (const b of groundBlades) {
      const x = Math.floor(wrap(b.x0 - scrollGround, PROP_SPAN));
      if (x > view.vw) continue;
      ctx.fillStyle = b.toneAlt ? skin.turfLip : blade;
      ctx.fillRect(x, b.y, 1, b.tall ? 3 : 2);
      if (b.dot) ctx.fillRect(x + 1, b.y + 1, 1, 1);
    }
    // Fringe standing proud of the horizon line. Its own fill: the blade loop
    // above leaves fillStyle on whichever tone it happened to end on.
    ctx.fillStyle = blade;
    for (const f of groundFringe) {
      const x = Math.floor(wrap(f.x0 - scrollGround, PROP_SPAN));
      if (x > view.vw) continue;
      ctx.fillRect(x, view.groundY - 1, 1, 1);
      if (f.tuft) ctx.fillRect(x, view.groundY - 2, 1, 1);
    }

    // Soil strata: long horizontal marks, not scattered dots.
    ctx.fillStyle = skin.soilDark;
    for (const s of groundStrata) {
      const x = Math.floor(wrap(s.x0 - scrollGround, PROP_SPAN));
      if (x > view.vw) continue;
      ctx.fillRect(x, s.y, s.len, 1);
    }
  }

  /**
   * Standing timber between hills and road. Half-empty sky is a camera problem
   * no number of clouds fixes: trunks run off the top and canopies close the
   * upper band, so the camera reads as inside the world.
   */
  function drawGrove(skin: RealmSkin): void {
    const span = view.vw * 2;
    const haze = skin.skyHaze;
    const footY = view.groundY - Math.floor(view.groundY * 0.02);
    for (let i = 0; i < 30; i++) {
      const depth = hash01(i * 2.9);
      const x =
        Math.floor(wrap(hash01(i * 6.13 + 3) * span - scrollRange * (1.7 + depth * 1.6), span)) - 30;
      if (x < -60 || x > view.vw + 60) continue;
      const trunkW = 3 + Math.floor(depth * 6);
      // The hero's column stays clear. A trunk sharing his width and vertical
      // made him half-read as part of the tree.
      if (x + trunkW > view.heroX - 12 && x < view.heroX + 12) continue;
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
      const crownY = Math.floor(view.groundY * (0.66 - depth * 0.5));

      // Cast shadow. A trunk meeting turf on a clean line reads as a decal.
      ctx.fillStyle = mixHex(skin.turf, '#000000', 0.3);
      ctx.fillRect(x - trunkW, footY - 1, trunkW * 3, 2);

      // Tapered trunk with a root flare, a sunward lit edge and bark streaks.
      // Uniform grey-mauve columns with dead-straight sides were named outright.
      const barkH = Math.max(1, footY - crownY);
      // A streak runs. The first version rolled a dot per row at a fresh x and
      // left 38% of every trunk carrying a lone dark pixel with nothing beside
      // it - which is a scatter of 36px blocks at 6x, not grain.
      const streaks = [0, 1].map((k) => ({
        dx: 1 + Math.floor(hash01(i * 4.3 + k * 2.1) * Math.max(1, trunkW - 2)),
        from: Math.floor(hash01(i * 7.9 + k * 3.3) * barkH * 0.5),
        len: Math.round(barkH * (0.22 + hash01(i * 2.7 + k * 5.9) * 0.34)),
      }));
      for (let y = crownY; y < footY; y++) {
        const f = (y - crownY) / barkH;
        const flare = f > 0.9 ? Math.round((f - 0.9) * 10 * 2) : 0;
        const w = trunkW + flare;
        ctx.fillStyle = bark;
        ctx.fillRect(x - flare, y, w, 1);
        ctx.fillStyle = barkLit;
        ctx.fillRect(x + w - flare - 1, y, 1, 1);
        ctx.fillStyle = barkDark;
        for (const st of streaks) {
          if (inRun(y - crownY, st.from, st.len)) ctx.fillRect(x + st.dx, y, 1, 1);
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
      // Needle clumps: 4 silhouette lobes.
      const crownLobes: FoliageLobe[] = [0, 1, 2, 3].map((li) => {
        const seed = i * 9.4 + li * 3.7;
        return { ...lobeRun(seed, crownH, 3, 0.18, 0.2, 1.3), depth: (hash01(seed + 2.6) - 0.5) * 8 };
      });
      // Shadow patches: two runs per tree read as bough shadow.
      const shadeLobes = [0, 1].map((li) => lobeRun(i * 6.1 + li * 4.9, crownH, 2, 0.1, 0.12, 1.1));
      for (let k = 0; k < crownH; k++) {
        const y = crownY - k;
        if (y < -4) break;
        const t = k / crownH;
        const prof = Math.sin(Math.PI * (0.16 + t * 0.8));
        const notch = Math.round(foliageNotchAt(k, crownLobes));
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
        if (t < 0.22 || inFoliageLobe(k, shadeLobes)) {
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
    const cx = lead ? lead.x + lead.spread : view.heroX + BLADE_REACH;
    return { x0: view.heroX - 12, x1: cx + w / 2 + 6 };
  }

  function drawTreeline(sprites: SkinnedSprites): void {
    const y = view.groundY + 1;
    const band = fightBand();
    for (const prop of props) {
      if (prop.kind !== 'tree') continue;
      const x = Math.floor(wrap(prop.at - scrollTrees, PROP_SPAN));
      if (x < -24 || x > view.vw + 24) continue;
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
    const span = view.vw * 2;
    for (let i = 0; i < 34; i++) {
      const depth = hash01(i * 3.77);
      const speed = 12 + depth * 46;
      const x = Math.floor(wrap(hash01(i * 1.93) * span - clockSec * speed, span));
      if (x > view.vw + 4) continue;
      const fall = 9 + depth * 26;
      // Falls only through the wooded band; a leaf crossing open sky reads as
      // a dead pixel rather than as weather.
      const top = view.groundY * 0.42;
      const y = Math.floor(
        top +
          wrap(hash01(i * 8.11) * view.groundY + clockSec * fall, view.groundY - top - 4) +
          Math.sin(clockSec * 1.9 + i) * 3,
      );
      if (Math.abs(x - view.heroX) < 16) continue;
      const size = depth > 0.66 ? 2 : 1;
      ctx.fillStyle = depth > 0.5 ? skin.leaf : mixHex(skin.leafDark, skin.skyHaze, 0.35);
      ctx.fillRect(x, y, size, size);
      // A leaf is a shape with a tip, not a dot. See drawMotes.
      ctx.fillRect(x + size, y + size, 1, 1);
    }
  }

  function drawMotes(skin: RealmSkin): void {
    if (model.reduceMotion) return;
    for (const m of motes) {
      const x = Math.floor(wrap(m.at - scrollTrees * 1.2, PROP_SPAN));
      if (x > view.vw) continue;
      const bobY = Math.sin(clockSec * 1.4 + m.phase) * 5;
      // Kept below the hill line. Anywhere a sky gap shows through the grove,
      // a loose coloured pixel reads as dirt on the screen, not as pollen.
      const y = Math.floor(
        Math.min(view.groundY - 2, view.groundY * 0.8 + m.yFrac * view.groundY * 0.22 + bobY),
      );
      ctx.fillStyle = m.size > 1 ? skin.petal : skin.turfLip;
      ctx.fillRect(x, y, m.size, m.size);
      // Never one pixel alone: a lone mark at 6x is a 36px square of a colour
      // nothing beside it shares, which reads as damage rather than as pollen.
      ctx.fillRect(x + m.size, y + 1, 1, 1);
    }
  }

  /** Birds working the upper sky — the cheapest life in an otherwise flat band. */
  function drawBirds(sprites: SkinnedSprites): void {
    const span = view.vw * 3;
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(wrap(hash01(i * 4.7) * span - scrollBirds, span)) - view.vw;
      if (x < -12 || x > view.vw + 12) continue;
      const y = Math.floor(hash01(i * 8.3) * view.groundY * 0.5) + 6;
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
    const band = Math.max(6, view.sceneBottomY - view.groundY);
    // Mid depth: scattered through the turf, scrolling faster than the road.
    for (let i = 0; i < 34; i++) {
      const x = Math.floor(wrap(hash01(i * 5.9 + 7) * PROP_SPAN - scrollFore * 0.72, PROP_SPAN));
      if (x < -20 || x > view.vw + 20) continue;
      const y = Math.floor(view.groundY + band * (0.42 + hash01(i * 3.3) * 0.5));
      drawSprite(ctx, sprites.fern, x, y);
    }
    // Nearest depth: double-size fronds at the frame edge, the layer the
    // camera actually passes through.
    const fern = sprites.fernNear;
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(wrap(hash01(i * 9.1 + 21) * PROP_SPAN - scrollFore, PROP_SPAN));
      if (x < -40 || x > view.vw + 40) continue;
      const y = view.vh + 6 + Math.floor(hash01(i * 2.7) * 6);
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
    const railY = view.groundY - 8;
    ctx.fillStyle = skin.bark;
    for (let x = -FENCE_PITCH; x < view.vw + FENCE_PITCH; x += FENCE_PITCH) {
      const px = Math.floor(x - offset);
      ctx.fillRect(px, railY, FENCE_PITCH, 1);
      ctx.fillRect(px, railY + 4, FENCE_PITCH, 1);
      drawShadow(px, sprites.fence.width + 2);
      drawSprite(ctx, sprites.fence, px, view.groundY + 1);
    }
  }

  function drawProps(sprites: SkinnedSprites): void {
    const band = fightBand();
    for (const prop of props) {
      if (prop.kind === 'tree') continue;
      const x = Math.floor(wrap(prop.at - scrollGround, PROP_SPAN));
      if (x < -30 || x > view.vw + 30) continue;
      // Grass and flowers are ground texture; a boulder is a third silhouette.
      if (prop.kind === 'rock' && x > band.x0 - 8 && x < band.x1 + 8) continue;
      switch (prop.kind) {
        case 'rock':
          drawShadow(x, sprites.rock.width);
          drawSprite(ctx, sprites.rock, x, view.groundY + 1);
          break;
        case 'tuft': {
          // A small clump, with its own y jitter, reads as a patch of cover.
          const jitter = Math.floor(hash01(prop.at * 3.3 + 50) * 3);
          const blades = grassClumpBlades(
            hash01(prop.at * 1.9 + 5),
            hash01(prop.at * 2.7 + 13),
            hash01(prop.at * 4.4 + 27),
          );
          for (const b of blades) {
            drawSprite(ctx, sprites.tuftNear, x + b.dx, view.groundY + 2 + jitter + b.dy);
          }
          break;
        }
        case 'flower':
          drawSprite(ctx, sprites.flower, x, view.groundY + 2);
          break;
        default:
          break;
      }
    }
  }

  /**
   * Concentric hard rings, not a dither: one world pixel is a 36px block at
   * desktop scale, so a 34% dither is a scatter of loose dots. At this scale
   * intensity has to be shape.
   */
  function glowDisc(cx: number, cy: number, r: number, color: string, gain = 1): void {
    if (r <= 0 || gain <= 0) return;
    ctx.fillStyle = color;
    for (const rr of glowRingRadii(r, gain)) {
      for (let dy = -rr; dy <= rr; dy++) {
        const y = cy + dy;
        if (y < 0 || y >= view.sceneBottomY) continue;
        const half = Math.round(Math.sqrt(Math.max(0, rr * rr - dy * dy)));
        for (const x of [cx - half, cx + half]) {
          if (x >= 0 && x < view.vw) ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
        }
      }
    }
  }



  /**
   * A lit pool on the turf: flattened, so it sits on the ground plane. Solid,
   * and sized by the gain rather than dithered at a fixed size - see glowDisc.
   * A 16% dither on grass is four lit pixels scattered through a hundred, which
   * is the note "white read as salt scattered on the grass" without the white.
   */
  function litPool(cx: number, r: number, color: string, gain: number): void {
    if (gain <= 0) return;
    const cy = view.groundY + 1;
    const rx = Math.round(r * (0.4 + Math.min(1, gain) * 0.6));
    const ry = Math.max(1, Math.round(rx * 0.42));
    ctx.fillStyle = color;
    for (let dy = 0; dy <= ry; dy++) {
      const y = cy + dy;
      if (y >= view.sceneBottomY) break;
      const half = Math.round(rx * Math.sqrt(Math.max(0, 1 - (dy / ry) ** 2)));
      const x0 = Math.max(0, cx - half);
      ctx.fillRect(x0, y, Math.min(view.vw - x0, half * 2 + 1), 1);
    }
  }

  /**
   * Hard contact shadow: the realm's own ground stepped toward night, with an
   * edge (DECISIONS.md #13); alpha-blended black is invisible on turf. `depth`
   * separates actors from props: at one shared value every cast tiled into a
   * stripe that read as terrain.
   */
  function drawShadow(x: number, width: number, depth = 0.52): void {
    const skin = realmSkin(model.region);
    // Stone, not turf, once the fight is enclosed — a green cast shadow on a
    // dungeon floor is the road's ground pretending it followed the hero in.
    const ground = model.boss ? skin.rock : skin.turf;
    const core = mixHex(ground, '#1a1c2c', depth);
    const edge = mixHex(ground, '#1a1c2c', depth * 0.58);
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
      ctx.fillRect(Math.floor(cx - w / 2), view.groundY + 1 + i, w, 1);
    });
  }

  /** The hero's own light and contact shadow. Ground decals, so they stay under everything. */
  function drawHeroGround(): void {
    // The hero stands in his own light. White read as salt scattered on the
    // grass, so the pool is a lit tone of the ground he is actually on.
    const lit = realmSkin(model.region);
    litPool(
      view.heroX,
      20,
      lighten(model.boss ? lit.rock : lit.turf, 0.42),
      Math.min(0.6, 0.16 + momentumLift(model.momentum) * 1.5),
    );
    // Sized from the sprite, deeper than the props, so his contact reads as his.
    drawShadow(view.heroX, heroA.width - 2, ACTOR_SHADOW);
  }

  /** The box no spark, coin, mote or number may be drawn inside. */
  function pocket(): HeroPocket {
    return heroPocket(view.heroX, view.groundY, heroA.width, heroA.height);
  }

  /**
   * Hero and the creature under the blade. Both silhouettes have to survive the
   * effect that celebrates the hit; a frame where the victim cannot be named is
   * the frame that stops answering who is hitting whom.
   */
  function pockets(): HeroPocket[] {
    const out = [pocket()];
    const lead = queue[0];
    const sprite = lead ? skinnedFor(model.region).monsters[lead.sprite] : null;
    if (lead && sprite) {
      const scale = leadScale();
      out.push(bodyPocket(lead.x + lead.spread, view.groundY, sprite.width * scale, sprite.height * scale));
    }
    return out;
  }

  function drawHero(): void {
    const stride = model.reduceMotion ? 0 : Math.floor(clockSec * 7 * model.momentumMult) % 2;
    const sprite = stride === 0 ? heroA : heroB;
    const bob = model.reduceMotion ? 0 : Math.floor(Math.sin(clockSec * 14) * 0.6);
    // No rim pass. It drew the sprite's own black outline offset four ways, so
    // the "halo of the sky's own light" its comment promised was a second ring
    // of the darkest ink in the frame - the hero read as a blob at thumbnail
    // size, which is the opposite of the job.
    drawSprite(ctx, sprite, view.heroX, view.groundY + bob, false);

    // The blade sweeps a real arc; nearest-neighbour rotation keeps it pixelated.
    // Winds up to -72 deg and finishes level at +10, contact height on the
    // creature: a wider sweep ended in the dirt past the monster.
    const t = swingAnim / SWING_ANIM_SEC;
    const angle = swingAnim > 0 ? -1.25 + (1 - t) * 1.42 : -0.3;
    const handX = view.heroX + 5;
    // The grip rides just above the belt, so it follows the sprite instead of a
    // constant: at a fixed -9 the hand stayed at the old 20px hero's hip and
    // ended up at the taller one's thigh, with the blade swinging from his knee.
    const handY = view.groundY + bob - Math.round(heroA.height * 0.42);
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

  /** The dungeon's one light source, tinted per realm (DECISIONS.md #58). */
  function torchFlame(skin: RealmSkin): string {
    return mixHex('#df7126', skin.accent, 0.25);
  }

  /** Both dungeon torches at a given height — same x/flicker everywhere they're drawn, only y varies. */
  function dungeonTorchesAt(y: number): TorchLight[] {
    return DUNGEON_TORCHES.map(({ side, seed }) => ({
      x: Math.round(view.vw * side),
      y,
      flicker: model.reduceMotion ? 0.92 : torchFlicker(clockSec, seed),
    }));
  }

  /**
   * The dungeon's walls, ceiling and edge vignette (DECISIONS.md #58) — the
   * unshaken backdrop layer, not part of the ground plane the camera jolts.
   */
  function drawDungeonBackdrop(skin: RealmSkin): void {
    const ceilingH = Math.max(8, Math.round(view.groundY * 0.22));
    const wallBase = mixHex(skin.rock, '#1a1c2c', 0.12);
    const ceilingBase = mixHex(skin.rock, '#1a1c2c', 0.55);
    const jointTone = mixHex(wallBase, '#1a1c2c', 0.45);

    drawGroundBands(ctx, view.vw, 0, ceilingH, depthBandTones(ceilingBase, WALL_BANDS));
    drawStoneWall(ctx, 0, view.vw, ceilingH, view.groundY, depthBandTones(wallBase, WALL_BANDS), jointTone, BRICK_H);

    const flame = torchFlame(skin);

    // Piers carry the realm's highlight ink so a dungeon skins per realm. Spanned
    // off view.worldRightX: the canvas paints under the docked panel. Drawn before the
    // torches, which are mounted on the stone they light.
    drawPillars(
      ctx,
      pillarSpans(view.worldRightX, PILLAR_FRAC),
      ceilingH,
      view.groundY,
      depthBandTones(mixHex(skin.rock, '#0a0a12', 0.4), WALL_BANDS),
      jointTone,
      mixHex(skin.rockLight, flame, 0.2),
      PILLAR_EDGE_W,
      BRICK_H,
    );

    // Torches: the fight's own light — the room has no sky to borrow one
    // from (DECISIONS.md #58 — lit from the encounter only).
    // The right dock covers up to 34% of view.vw (styles.css --dock-w), same limit
    // drawSun already respects — a torch past that fraction is never seen.
    const torches = dungeonTorchesAt(ceilingH + Math.round((view.groundY - ceilingH) * 0.32));
    // The wall itself gets brighter near each flame instead of the flame
    // being a marker floating in front of unlit stone.
    drawTorchGlow(ctx, torches, wallBase, flame, view.vw * WALL_TORCH_REACH_FRAC);
    for (const t of torches) drawTorchFlame(ctx, t.x, t.y, t.flicker, flame);

    drawVignette(
      ctx,
      view.vw,
      view.sceneBottomY,
      depthBandTones(mixHex(ceilingBase, '#000000', 0.42), VIGNETTE_BANDS),
      Math.max(1, Math.round(Math.min(view.vw, view.sceneBottomY) * VIGNETTE_STEP_FRAC)),
    );
  }

  /** The dungeon's stone floor — same banded-turf idiom as the road, stone tones instead of grass. */
  function drawDungeonFloor(skin: RealmSkin): void {
    const belowH = Math.max(8, view.sceneBottomY - view.groundY);
    const floorH = Math.max(6, Math.floor(belowH * 0.9));
    const lift = momentumLift(model.momentum);
    const floorBase = mixHex(skin.rock, '#1a1c2c', 0.28);
    drawGroundBands(ctx, view.vw, view.groundY, floorH, depthBandTones(lighten(floorBase, lift), GROUND_BANDS));
    ctx.fillStyle = mixHex(floorBase, '#000000', 0.5);
    ctx.fillRect(0, view.groundY + floorH, view.vw, view.sceneBottomY - view.groundY - floorH);

    // Same torches, spilling a smaller pool onto the stone at their base —
    // one light source lighting the whole room, not just the wall behind it.
    const torches = dungeonTorchesAt(view.groundY + Math.round(floorH * 0.3));
    drawTorchGlow(ctx, torches, floorBase, torchFlame(skin), view.vw * FLOOR_TORCH_REACH_FRAC);
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
      if (x < -40 || x > view.worldRightX + 60) continue;
      // Its shadow, sprite and health bar all have to scale with it together.
      const scale = i === 0 ? leadScale() : 1;
      drawShadow(x, (sprite.width - 2) * scale, i === 0 ? ACTOR_SHADOW : undefined);
      drawSprite(ctx, sprite, x, view.groundY + bob, true, false, scale);
      // The flash lights the creature rather than replacing it. Swapping in the
      // silhouette outright turned a 24x30 golem into a white mass for a third
      // of all frames, which is what read as a missing sprite.
      if (m.flash > 0) {
        ctx.globalAlpha = 0.55;
        drawSprite(ctx, sprite, x, view.groundY + bob, true, true, scale);
        ctx.globalAlpha = 1;
      }

      // Only the live engaged monster carries a bar: one over a corpse reads as
      // broken UI, and the guardian's HP already lives in the side panel.
      if (i !== 0 || model.boss) continue;
      const remaining = Math.max(0, 1 - model.killProgress);
      if (remaining >= 1 || remaining <= 0.02) continue;
      // Anchored to the creature's mass, not its box: a stalker's antenna
      // put its bar on a shelf of empty air well above the thing being fought.
      const w = sprite.mass.width * scale;
      const bx = Math.floor(x - w / 2);
      const by = view.groundY - sprite.height * scale + sprite.mass.top * scale - 3 + bob;
      barSpans = lanesTouching(by - 1, by + 3, view.groundY, LANE_COUNT).map((lane) => ({
        x: bx - 1,
        w: w + 2,
        lane,
      }));
      ctx.fillStyle = OUTLINE_INK;
      ctx.fillRect(bx - 1, by - 1, w + 2, 4);
      // A mid value, not another near-black. Ring and trough were both darker
      // than the turf, so a nearly-dead creature - which is every frame a
      // capture lands on - wore a solid black slab across its shoulders with
      // no internal contrast at all.
      ctx.fillStyle = '#847e87';
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
      const p = sceneFromArcSpace(a.x, a.y, view.heroX, view.arcBaseY, apex);
      out.push({ x: p.x, y: p.y, spin: arc.expiresAtSec * 9 });
    }
    return out;
  }

  function drawArcs(): void {
    const points = arcScreenPoints();
    // The coin itself is core's - it is catchable, so it is never hidden. Its
    // halo and ring are ours, and a dozen of them overlapping turned the kill
    // into a 180px wall of yellow with the creature somewhere inside it.
    const guard = pockets();
    // Loot in flight is the brightest thing in the scene; it should light the
    // air around it, not sit on the backdrop as a flat disc.
    for (const p of points) {
      if (inAnyPocket(guard, p.x, p.y)) continue;
      glowDisc(p.x, p.y, 7, LOOT_GLOW, 0.5);
    }

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
        const rx = Math.floor(p.x + Math.cos(ang) * r);
        const ry = Math.floor(p.y + Math.sin(ang) * r);
        if (inAnyPocket(guard, rx, ry)) continue;
        ctx.fillRect(rx, ry, 1, 1);
      }
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
    const guard = pockets();
    for (const p of particles) {
      const life = lifeRemaining(p.age, p.life);
      if (life <= 0) continue;
      if (inAnyPocket(guard, p.x, p.y)) continue;
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

  function comboLabel(): string {
    // Two decimals: the cap is x1.75 and one decimal prints an unreachable x1.8.
    // The word stays up; a bare x1.73 names no quantity.
    return `COMBO \u00d7${heldMult.value.toFixed(2)}`;
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
    return lanesTouching(box.top, box.top + box.height, view.groundY, LANE_COUNT).map((lane) => ({
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
    ctx.clearRect(0, 0, view.vw, view.vh);

    if (model.boss) {
      drawDungeonBackdrop(skin);
    } else {
      const far = backdropSkin(skin);
      const haze = depthHaze(skin);
      drawSky(skin);
      drawClouds(skin);
      drawBirds(sprites);
      drawRange(far);
      drawHills(ctx, view.vw, view.groundY, far.hillFar, null, scrollHillFar, view.groundY * 0.14, view.groundY * 0.34, 1, 4, haze);
      drawHills(
        ctx,
        view.vw,
        view.groundY,
        far.hillNear,
        far.hillLip,
        scrollHillNear,
        view.groundY * 0.11,
        view.groundY * 0.18,
        1.7,
        3,
        haze,
      );
      drawGrove(far);
      drawDrift(far);
      drawTreeline(sprites);
      drawSun(skin);
    }

    const jolt = model.reduceMotion ? NO_JOLT : shakeOffset(shake, clockSec);
    ctx.save();
    ctx.translate(Math.round(jolt.x), Math.round(jolt.y));

    if (model.boss) {
      drawDungeonFloor(skin);
    } else {
      drawGround(skin);
      drawFence(sprites, skin);
      drawProps(sprites);
    }
    drawMonsters(sprites);
    drawHeroGround();
    drawArcs();
    drawParticles();
    drawRests();
    drawStreaks();
    if (!model.boss) drawMotes(skin);
    // Last of the world layers, so nothing bright can ever be painted over the
    // one figure that must always read. The pocket test below is the second
    // line: it keeps effects from crowding the silhouette even from behind.
    drawHero();
    drawFloaters();
    if (!model.boss) drawForeground(sprites);
    drawMomentumMeter(skin);

    ctx.restore();

    displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    displayCtx.imageSmoothingEnabled = false;
    displayCtx.clearRect(0, 0, canvas.width, canvas.height);
    // Blit only the world band, offset down the display canvas: in portrait the
    // panels own the top and the road owns the thumb zone.
    const scale = canvas.width / view.vw;
    displayCtx.drawImage(
      buffer,
      0,
      0,
      view.vw,
      view.sceneBottomY,
      0,
      Math.round(view.sceneOffsetY * scale),
      canvas.width,
      Math.round(view.sceneBottomY * scale),
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
