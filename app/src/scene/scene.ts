// The road scene: a full-bleed side-scrolling pixel world that the HUD sits on
// top of. Owns only presentation state — parallax offsets, one monster, loot
// arcs, particles, floaters, camera shake. Every number it *displays* is handed
// to it by the controller; it invents no economy (DECISIONS.md #12).
//
// Rendering is done once into a small offscreen buffer at scene resolution,
// then upscaled with smoothing off. That single indirection is what makes the
// pixels square and identical everywhere instead of resolution-dependent mush.

import { formatNumber } from '../format';
import { ditherAt, falloff, momentumLift, ringFalloff } from './light';
import {
  arcApexHeight,
  arcSpaceFromScene,
  arcCaughtBy,
  arcInFlight,
  arcPosition,
  decayTo,
  floaterOffsetY,
  launchArc,
  lifeRemaining,
  liftForFlight,
  shakeOffset,
  stepParticle,
  wrap,
  type Floater,
  type FloaterTier,
  type LootArc,
  type Particle,
} from './fx';
import {
  HERO_INK,
  LOOT_INK,
  OUTLINE_INK,
  REALM_SKIN_COUNT,
  lighten,
  mixHex,
  monsterInk,
  realmSkin,
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
  GLYPH_H,
  HERO_WALK_A,
  HERO_WALK_B,
  MONSTER_SHAPES,
  ROCK,
  SWARM_SHAPE,
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
  /** World frozen behind the recap modal. */
  paused: boolean;
  reduceMotion: boolean;
}

/**
 * Where a Strike landed, in the engine's arc space: hero at the origin, x
 * along the road, arc apex at y = 1. The scene renders arcs and reports the
 * pointer; the engine decides what a Strike hits. Scene units never cross
 * this boundary, so a resize or a scale change cannot move a hit.
 */
export interface AimPoint {
  x: number;
  y: number;
}

export interface StrikeOutcome {
  /**
   * The tap position in arc space, or null when the Strike had no position
   * (keyboard, or a tap that could not be located). A positionless Strike is
   * still a real Strike: it swings and it builds momentum.
   */
  aim: AimPoint | null;
  /** The scene's local catch read. Provisional: the engine owns the decision. */
  caughtArc: boolean;
  /** Base gold of the caught arc; the bonus it pays is the engine's to decide. */
  caughtValue: number;
}

export interface Scene {
  frame(dtSec: number, model: SceneModel): void;
  /** Register a Strike at a viewport point (or at the hero, when unpositioned). */
  strikeAt(clientX: number | null, clientY: number | null): StrikeOutcome;
  /** Viewport point loot streaks fly to — the HUD's gold readout. */
  setCollectAnchor(clientX: number, clientY: number): void;
  dispose(): void;
}

// --- Tuning --------------------------------------------------------------

/** Scene units across the viewport, before integer-scale rounding. */
const TARGET_SCENE_WIDTH = 300;
const MIN_PIXEL_SCALE = 2;
const MAX_PIXEL_SCALE = 8;

/** Ground scroll in scene units/sec at momentum zero. */
const WALK_SPEED = 34;
const HERO_X_FRAC = 0.24;
/** Gap between hero and monster once the monster has closed, as a share of the
 * scene width — a fixed pixel gap crowds a phone and wastes a desktop frame. */
const ENGAGE_GAP_FRAC = 0.15;
const MIN_ENGAGE_GAP = 26;
/** Fraction of the kill spent closing the distance; the rest is the fight. */
const APPROACH_FRAC = 0.45;

const SWINGS_PER_SEC = 1.7;
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
const TEXT_PAYOUT = '#fbf236';
const TEXT_CATCH = '#fbf236';
const TEXT_DAMAGE = '#ffffff';
const LOOT_GLOW = '#fbf236';
const RIM_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];
const IMPACT_GLOW = '#ffffff';

/** Floor on the gap between damage numbers, whatever the tap rate. */
const DAMAGE_TEXT_INTERVAL_SEC = 0.28;
const STREAK_SEC = 0.5;
const CATCH_RADIUS = 26;

const PARTICLE_CAP = 220;
const FLOATER_CAP = 12;

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
  shape: number;
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

/** How far behind the engaged monster the next one in line waits. */
const QUEUE_GAP = 34;
/** Monsters visible at once: the one being fought, plus the queue behind it. */
const QUEUE_DEPTH = 5;

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
    const built: SkinnedSprites = {
      monsters: MONSTER_SHAPES.map((m, i) => bakeSprite(m, monsterInk(skin, i))),
      trees: [TREE, TREE_TALL, TREE_WIDE].map((t) => bakeSprite(t, sInk)),
      rock: bakeSprite(ROCK, sInk),
      fence: bakeSprite(FENCE, sInk),
      tuft: bakeSprite(TUFT, sInk),
      flower: bakeSprite(FLOWER, sInk),
      fern: bakeSprite(FERN, sInk),
      birds: [BIRD_UP, BIRD_DOWN].map((b) => bakeSprite(b, sInk)),
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
  /**
   * Lowest scene row the player can actually see. In portrait the panel sheet
   * covers the bottom half, so world-anchored HUD (the momentum meter) has to
   * sit above it rather than at the canvas edge.
   */
  let sceneBottomY = 100;
  let heroX = 24;
  let engageGap = MIN_ENGAGE_GAP;

  let clockSec = 0;
  let scrollGround = 0;
  let scrollTrees = 0;
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

  const arcs: LootArc[] = [];
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
    paused: false,
    reduceMotion: false,
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

    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    displayCtx.imageSmoothingEnabled = false;
    ctx.imageSmoothingEnabled = false;

    // Portrait docks the panel sheet to the bottom half, so the horizon rides
    // high; landscape gives the world the whole frame.
    const landscape = cssW / cssH >= 1;
    groundY = Math.floor(vh * (landscape ? 0.72 : 0.33));
    arcBaseY = groundY - 2;
    sceneBottomY = landscape ? vh : Math.floor(vh * 0.48);
    heroX = Math.floor(vw * (landscape ? HERO_X_FRAC : 0.3));
    engageGap = Math.max(MIN_ENGAGE_GAP, Math.floor(vw * ENGAGE_GAP_FRAC));
    if (collectAnchorCss) setCollectAnchor(collectAnchorCss.x, collectAnchorCss.y);
    buildGroundTexture();
  }

  function setCollectAnchor(clientX: number, clientY: number): void {
    collectAnchorCss = { x: clientX, y: clientY };
    const rect = canvas.getBoundingClientRect();
    collectAnchor = {
      x: (clientX - rect.left) / pixelScale,
      y: (clientY - rect.top) / pixelScale,
    };
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
    const w = textWidth(f.text, TIER_SCALE[f.tier]);
    return { x: f.x - w / 2, w, lane: f.lane };
  }

  /**
   * `y` on the incoming floater is a wish, not a position: it picks the lane to
   * start looking from, and the allocator moves it to the nearest free one.
   */
  function addFloater(f: Omit<Floater, 'lane'>): void {
    if (floaters.length >= FLOATER_CAP) floaters.shift();
    const w = textWidth(f.text, TIER_SCALE[f.tier]);
    const wish = Math.round((groundY - LANE_BASE_OFFSET - f.y) / LANE_STEP);
    const preferred = Math.max(0, Math.min(LANE_COUNT - 1, wish));
    const taken = floaters.map(floaterSpan);
    if (model.momentum > 0.02) taken.push(comboSpan());
    const { lane, evict } = placeRun(f.x - w / 2, w, taken, LANE_COUNT, 3, preferred);
    // Descending, so each splice leaves the lower indices valid. The combo
    // widget rides past the end of `floaters` and is never evictable.
    for (const index of [...evict].sort((a, b) => b - a)) {
      if (index < floaters.length) floaters.splice(index, 1);
    }
    floaters.push({ ...f, lane });
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

  /** Append one monster (or a swarm of three) to the back of the queue. */
  function enqueueMonster(seed: number): void {
    // r^0.6 biases the roll up the roster, so a big silhouette is usually on
    // screen — the thing the scene was judged hardest on.
    const roll = Math.pow(hash01(seed * 1.37 + model.region), 0.6);
    let shape = Math.min(MONSTER_SHAPES.length - 1, Math.floor(roll * MONSTER_SHAPES.length));
    // Three of one species queued reads as a spawner, not a road. Step off a
    // shape already standing in line rather than re-rolling, which would only
    // collide again at the same rate.
    let guard = 0;
    while (queue.some((q) => q.shape === shape) && guard < MONSTER_SHAPES.length) {
      shape = (shape + 1) % MONSTER_SHAPES.length;
      guard++;
    }
    const count = shape === SWARM_SHAPE ? 3 : 1;
    for (let i = 0; i < count; i++) {
      queue.push({
        shape,
        x: vw + 30 + i * 12,
        flash: 0,
        recoil: 0,
        bob: hash01(seed + i) * Math.PI * 2,
        spread: count === 1 ? 0 : (i - 1) * 11,
      });
    }
  }

  function killMonster(skin: RealmSkin): void {
    const lead = queue[0];
    const x = lead ? lead.x + lead.spread : heroX + engageGap;
    const y = groundY;
    burst(x, y - 10, 14, [skin.monBody, skin.monBodyDark, '#ffffff', skin.accent], 130);
    impacts.push({ x, y: y - 12, age: 0, life: 0.34 });
    shake = Math.min(MAX_SHAKE, shake + 2.1);

    // The payout leaves the corpse on a visible arc; catching it mid-flight is
    // the whole active-play verb (docs/ACTIVE-PLAY.md).
    const gold = model.goldPerKill;
    if (gold > 0) {
      const seed = model.kills;
      arcs.push(
        launchArc(
          x,
          arcBaseY,
          -(14 + hash01(seed) * 40),
          arcBaseY,
          liftForFlight(arcBaseY, arcBaseY, ARC_FLIGHT_SEC),
          gold,
          'gold',
          hash01(seed * 5.5) * Math.PI * 2,
        ),
      );
    }
    queue.shift();
    // Damage numbers belong to the thing that took the hit; a corpse's number
    // left hanging in the air reads as unowned UI.
    for (let i = floaters.length - 1; i >= 0; i--) {
      if (floaters[i]!.owned) floaters.splice(i, 1);
    }
  }

  function resolveArc(arc: LootArc, caught: boolean): void {
    const p = arcPosition(arc, Math.min(arc.age, arc.flightSec));
    const skin = realmSkin(model.region);
    if (caught) {
      // Anchored to the hero, not to the point in the air where the tap
      // landed. A word floating in open sky belongs to nothing on screen.
      addFloater({
        x: heroX + 6,
        y: groundY - 30,
        age: 0,
        life: FLOATER_LIFE,
        text: 'CAUGHT!',
        color: TEXT_CATCH,
        tier: 'catch',
        owned: false,
      });
      burst(p.x, p.y, 12, ['#ffffff', skin.accent, '#fbf236'], 150);
      shake = Math.min(MAX_SHAKE, shake + 1.2);
    } else if (arc.value >= 0.05) {
      addFloater({
        x: p.x,
        y: p.y - 14,
        age: 0,
        life: 0.8,
        text: `+${formatShort(arc.value)}`,
        color: TEXT_PAYOUT,
        tier: 'payout',
        owned: false,
      });
    }
    if (caught) {
      streaks.push({ x0: p.x, y0: p.y, age: 0, gold: arc.kind === 'gold', spin: arc.spin });
    } else {
      rests.push({ x: p.x, y: groundY - 3, age: 0, gold: arc.kind === 'gold', spin: arc.spin });
    }
  }

  function swing(fromStrike: boolean): void {
    swingAnim = SWING_ANIM_SEC;
    const skin = realmSkin(model.region);
    const lead = queue[0];
    if (!lead || lead.x > heroX + engageGap + 14) return;

    const leadSprite = skinnedFor(model.region).monsters[lead.shape];
    const leadHeight = leadSprite ? leadSprite.height : 16;
    const contactX = lead.x + lead.spread - 6;
    const contactY = groundY - Math.round(leadHeight * 0.55);
    lead.flash = 0.05;
    lead.recoil = fromStrike ? 5 : 3;
    burst(contactX, contactY, fromStrike ? 9 : 5, ['#ffffff', skin.accent, skin.monBody], 105);
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
    const damage = model.dps * (1 / (SWINGS_PER_SEC * model.momentumMult));
    if (damage < 0.05) return;
    addFloater({
      // Above the monster's head, not beside its ribs: the blade sweeps
      // through contact height and a number there is inside the arc.
      x: lead.x + lead.spread,
      y: groundY - leadHeight - 6,
      age: 0,
      life: 0.5,
      text: formatShort(damage),
      color: TEXT_DAMAGE,
      tier: 'damage',
      owned: true,
    });
  }

  function toArcSpace(px: number, py: number): AimPoint {
    return arcSpaceFromScene(px, py, heroX, arcBaseY, arcApexHeight(ARC_FLIGHT_SEC));
  }

  function strikeAt(clientX: number | null, clientY: number | null): StrikeOutcome {
    heroFlash = 0.12;
    // Restart the auto-attack cadence rather than zeroing it — zero would go
    // negative on the very next step() and fire an immediate duplicate swing.
    swingCooldown = 1 / SWINGS_PER_SEC;
    swing(true);

    if (clientX === null || clientY === null) {
      return { aim: null, caughtArc: false, caughtValue: 0 };
    }
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) / pixelScale;
    const py = (clientY - rect.top) / pixelScale;
    const aim = toArcSpace(px, py);

    for (const arc of arcs) {
      if (!arcCaughtBy(arc, px, py, CATCH_RADIUS)) continue;
      arc.caught = true;
      resolveArc(arc, true);
      return { aim, caughtArc: true, caughtValue: arc.value };
    }
    return { aim, caughtArc: false, caughtValue: 0 };
  }

  // --- Simulation --------------------------------------------------------

  function step(dtSec: number): void {
    const skin = realmSkin(model.region);
    clockSec += dtSec;

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

    while (queue.length < QUEUE_DEPTH) enqueueMonster(model.kills + queue.length);

    // The engaged monster's position is driven by the engine's kill progress,
    // so it reaches the hero exactly when the kill resolves. Everyone behind it
    // just walks to their slot in the line.
    const t = Math.min(1, model.killProgress / APPROACH_FRAC);
    const eased = 1 - (1 - t) * (1 - t);
    const leadTarget = vw + 20 + (heroX + engageGap - (vw + 20)) * eased;
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

    // Auto-attack cadence: idle play still swings, momentum just speeds it up.
    swingCooldown -= dtSec * model.momentumMult;
    if (swingCooldown <= 0) {
      swingCooldown += 1 / SWINGS_PER_SEC;
      if (queue.length > 0) swing(false);
    }

    for (let i = arcs.length - 1; i >= 0; i--) {
      const arc = arcs[i]!;
      if (arc.caught) {
        arcs.splice(i, 1);
        continue;
      }
      arc.age += dtSec;
      arc.spin += dtSec * 9;
      if (!arcInFlight(arc)) {
        resolveArc(arc, false);
        arcs.splice(i, 1);
      }
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

    // Blade texture over the whole turf band — the single biggest reason a flat
    // fill reads as ground rather than as a colored rectangle. Positions are
    // baked by buildGroundTexture(); only the scroll offset moves per frame.
    for (const b of groundBlades) {
      const x = Math.floor(wrap(b.x0 - scrollGround, PROP_SPAN));
      if (x > vw) continue;
      ctx.fillStyle = b.toneAlt ? skin.turfLip : skin.grassBlade;
      ctx.fillRect(x, b.y, 1, b.tall ? 3 : 2);
      if (b.dot) ctx.fillRect(x + 1, b.y + 1, 1, 1);
    }
    // Fringe standing proud of the horizon line. Its own fill: the blade loop
    // above leaves fillStyle on whichever tone it happened to end on.
    ctx.fillStyle = skin.grassBlade;
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
      const fade = 0.58 - depth * 0.4;
      const bark = mixHex(skin.bark, haze, fade);
      const barkDark = mixHex(mixHex(skin.bark, '#000000', 0.4), haze, fade);
      const leafDark = mixHex(skin.leafDark, haze, fade * 0.9);
      const leaf = mixHex(skin.leaf, haze, fade * 0.9);
      const leafLite = mixHex(lighten(skin.leaf, 0.3), haze, fade * 0.9);
      const crownY = Math.floor(groundY * (0.2 + depth * 0.3));

      // Cast shadow. A trunk meeting turf on a clean line reads as a decal.
      ctx.fillStyle = mixHex(skin.turf, '#000000', 0.3);
      ctx.fillRect(x - trunkW, footY - 1, trunkW * 3, 2);

      // Tapered trunk with a root flare and vertical bark streaks. Uniform
      // grey-mauve columns with dead-straight sides were named outright.
      for (let y = crownY; y < footY; y++) {
        const f = (y - crownY) / Math.max(1, footY - crownY);
        const flare = f > 0.9 ? Math.round((f - 0.9) * 10 * 2) : 0;
        const w = trunkW + flare;
        ctx.fillStyle = bark;
        ctx.fillRect(x - flare, y, w, 1);
        if (hash01(i * 3.1 + y * 0.37) > 0.62) {
          ctx.fillStyle = barkDark;
          ctx.fillRect(x + 1 + Math.floor(hash01(y * 1.7 + i) * Math.max(1, w - 2)), y, 1, 1);
        }
      }

      // Canopy as broken clumps, not centred slabs. Each row is one to three
      // sub-rects at hashed offsets so the silhouette notches instead of
      // stepping in clean 90-degree corners.
      const cx = x + Math.floor(trunkW / 2);
      const cw = trunkW * 3 + 10;
      for (let k = 0; k < 8; k++) {
        const y = crownY - k * 6;
        if (y + 7 < 0) break;
        const rowW = Math.max(5, Math.floor(cw * (1 - k * 0.06)));
        const lobes = 1 + Math.floor(hash01(i * 4.3 + k * 2.9) * 3);
        for (let n = 0; n < lobes; n++) {
          const t = lobes === 1 ? 0.5 : n / (lobes - 1);
          const lw = Math.max(4, Math.floor(rowW * (0.42 + hash01(i * 7.7 + k + n) * 0.5)));
          const lx = Math.round(cx - rowW / 2 + t * (rowW - lw) + (hash01(i + k * 5.1 + n) - 0.5) * 5);
          ctx.fillStyle = k === 0 ? leafDark : k > 5 ? leafLite : leaf;
          ctx.fillRect(lx, y - 7, lw, 8);
          // Shadowed underside on the lowest clump of each lobe.
          if (k < 2) {
            ctx.fillStyle = leafDark;
            ctx.fillRect(lx, y, lw, 1);
          }
        }
      }
    }
  }

  function drawTreeline(sprites: SkinnedSprites): void {
    const y = groundY + 1;
    for (const prop of props) {
      if (prop.kind !== 'tree') continue;
      const x = Math.floor(wrap(prop.at - scrollTrees, PROP_SPAN));
      if (x < -24 || x > vw + 24) continue;
      drawSprite(ctx, sprites.trees[prop.variant] ?? sprites.trees[0]!, x, y);
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
    const fern = sprites.fern;
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
      drawSprite(ctx, sprites.fence, px, groundY + 1);
    }
  }

  function drawProps(sprites: SkinnedSprites): void {
    for (const prop of props) {
      if (prop.kind === 'tree') continue;
      const x = Math.floor(wrap(prop.at - scrollGround, PROP_SPAN));
      if (x < -30 || x > vw + 30) continue;
      switch (prop.kind) {
        case 'rock':
          drawShadow(x, sprites.rock.width);
          drawSprite(ctx, sprites.rock, x, groundY + 1);
          break;
        case 'tuft':
          drawSprite(ctx, sprites.tuft, x, groundY + 2);
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

  /** A dithered ring: the shockwave read of an impact, no blur needed. */
  function glowRing(cx: number, cy: number, r: number, width: number, color: string, gain = 1): void {
    if (r <= 0 || gain <= 0) return;
    const outer = r + width;
    const x0 = Math.max(0, Math.floor(cx - outer));
    const x1 = Math.min(vw - 1, Math.ceil(cx + outer));
    const y0 = Math.max(0, Math.floor(cy - outer));
    const y1 = Math.min(sceneBottomY - 1, Math.ceil(cy + outer));
    ctx.fillStyle = color;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (!ditherAt(x, y, ringFalloff(d, r, width) * gain)) continue;
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

  function drawShadow(x: number, width: number): void {
    ctx.fillStyle = 'rgba(26, 28, 44, 0.28)';
    ctx.fillRect(Math.floor(x - width / 2), groundY, width, 2);
  }

  function drawHero(): void {
    // The hero stands in his own light. White read as salt scattered on the
    // grass, so the pool is a lit tone of the turf itself.
    const lit = realmSkin(model.region);
    litPool(
      heroX,
      20,
      lighten(lit.turf, 0.42),
      Math.min(0.6, 0.16 + momentumLift(model.momentum) * 1.5),
    );

    const stride = model.reduceMotion ? 0 : Math.floor(clockSec * 7 * model.momentumMult) % 2;
    const sprite = stride === 0 ? heroA : heroB;
    const bob = model.reduceMotion ? 0 : Math.floor(Math.sin(clockSec * 14) * 0.6);
    drawShadow(heroX, 12);
    // Rim first, sprite over it: a one-pixel halo of the sky's own light so the
    // figure never sinks into whatever value the ground happens to be.
    ctx.globalAlpha = 0.85;
    for (const [dx, dy] of RIM_OFFSETS) {
      drawSprite(ctx, sprite, heroX + dx, groundY + bob + dy, false, true);
    }
    ctx.globalAlpha = 1;
    drawSprite(ctx, sprite, heroX, groundY + bob, false);
    if (heroFlash > 0.06) {
      ctx.globalAlpha = 0.5;
      drawSprite(ctx, sprite, heroX, groundY + bob, false, true);
      ctx.globalAlpha = 1;
    }

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

  function drawMonsters(sprites: SkinnedSprites): void {
    // Back to front, so the one being fought overlaps the line behind it.
    for (let i = queue.length - 1; i >= 0; i--) {
      const m = queue[i]!;
      const sprite = sprites.monsters[m.shape] ?? sprites.monsters[0]!;
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
      if (x < -40 || x > vw + 60) continue;
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
      const remaining = Math.max(0, 1 - model.killProgress);
      if (remaining >= 1 || remaining <= 0.02) continue;
      const w = sprite.width;
      const bx = Math.floor(x - w / 2);
      const by = groundY - sprite.height - 2 + bob;
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

  function drawArcs(): void {
    // Loot in flight is the brightest thing in the scene; it should light the
    // air around it, not sit on the backdrop as a flat disc.
    for (const arc of arcs) {
      const p = arcPosition(arc, arc.age);
      glowDisc(p.x, p.y, 7, LOOT_GLOW, 0.5);
    }

    for (const arc of arcs) {
      const p = arcPosition(arc, arc.age);
      const sprite = arc.kind === 'gold' ? coin : gem;
      // Squash the coin on its spin so it reads as tumbling metal.
      const squash = Math.abs(Math.cos(arc.spin));
      const w = Math.max(2, Math.round(sprite.width * (0.35 + squash * 0.65)));
      ctx.drawImage(
        sprite.image,
        Math.floor(p.x - w / 2),
        Math.floor(p.y - sprite.height / 2),
        w,
        sprite.height,
      );
      // Catch affordance: a bright ring pulse while the arc is still catchable.
      if (arcInFlight(arc)) {
        const pulse = (Math.sin(clockSec * 12 + arc.spin) + 1) / 2;
        ctx.fillStyle = pulse > 0.5 ? '#ffffff' : '#fbf236';
        const r = 7;
        for (let a = 0; a < 8; a++) {
          const ang = (a / 8) * Math.PI * 2 + clockSec * 3;
          ctx.fillRect(Math.floor(p.x + Math.cos(ang) * r), Math.floor(p.y + Math.sin(ang) * r), 1, 1);
        }
      }
    }
  }

  /** Expanding dithered shockwave at each kill. */
  function drawImpacts(): void {
    for (const im of impacts) {
      const t = im.age / im.life;
      glowRing(im.x, im.y, 4 + t * 22, 3, IMPACT_GLOW, (1 - t) * 0.85);
      litPool(im.x, 16, IMPACT_GLOW, (1 - t) * 0.4);
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
    for (const p of particles) {
      const life = lifeRemaining(p.age, p.life);
      if (life <= 0) continue;
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
      drawText(ctx, f.text, f.x, y, TIER_SCALE[f.tier], f.color, OUTLINE_INK, 'center');
    }
  }

  /** Segments, cells and label on one row: a widget, not a banner. */
  const COMBO_SEGS = 6;
  const COMBO_SEG_W = 3;
  const COMBO_GAP = 1;
  const COMBO_METER_W = COMBO_SEGS * (COMBO_SEG_W + COMBO_GAP) - COMBO_GAP;

  function comboLabel(): string {
    return `\u00d7${model.momentumMult.toFixed(1)}`;
  }

  /** The lane the widget occupies, so floaters route around it. */
  function comboSpan(): LaneSpan {
    const w = textWidth(comboLabel(), 1) + 3 + COMBO_METER_W;
    return { x: Math.floor(heroX + 3 - w / 2), w, lane: COMBO_LANE };
  }

  function drawMomentumMeter(skin: RealmSkin): void {
    // Hidden at rest: a full-width empty bar labelled x1.0 is the frame
    // announcing that nothing is happening.
    if (model.momentum <= 0.02) return;
    const label = comboLabel();
    const labelW = textWidth(label, 1);
    const span = comboSpan();
    const y = laneY(COMBO_LANE);
    const hot = model.momentum > 0.7;

    // Opaque plate: anything that does reach this band reads as behind a
    // widget rather than as garbled type.
    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(span.x - 2, y - 2, span.w + 4, GLYPH_H + 4);

    drawText(ctx, label, span.x, y, 1, hot ? '#ffffff' : skin.accent, null, 'left');

    const meterX = span.x + labelW + 3;
    const meterY = y + 1;
    const filled = Math.round(model.momentum * COMBO_SEGS);
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
      ctx.fillRect(meterX + i * (COMBO_SEG_W + COMBO_GAP), meterY, COMBO_SEG_W, GLYPH_H - 2);
    }
  }

  function draw(): void {
    const skin = realmSkin(model.region);
    const sprites = skinnedFor(model.region);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    drawSky(skin);
    drawClouds(skin);
    drawBirds(sprites);
    drawRange(skin);
    drawHills(skin.hillFar, null, scrollHillFar, groundY * 0.14, groundY * 0.34, 1, 4);
    drawHills(skin.hillNear, skin.hillLip, scrollHillNear, groundY * 0.11, groundY * 0.18, 1.7, 3);
    drawGrove(skin);
    drawDrift(skin);
    drawTreeline(sprites);

    const jolt = model.reduceMotion ? { x: 0, y: 0 } : shakeOffset(shake, clockSec);
    ctx.save();
    ctx.translate(Math.round(jolt.x), Math.round(jolt.y));

    drawGround(skin);
    drawFence(sprites, skin);
    drawProps(sprites);
    drawMonsters(sprites);
    drawHero();
    drawArcs();
    drawParticles();
    drawImpacts();
    drawRests();
    drawStreaks();
    drawMotes(skin);
    drawFloaters();
    drawForeground(sprites);
    drawMomentumMeter(skin);

    ctx.restore();

    displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    displayCtx.imageSmoothingEnabled = false;
    displayCtx.clearRect(0, 0, canvas.width, canvas.height);
    displayCtx.drawImage(buffer, 0, 0, vw, vh, 0, 0, canvas.width, canvas.height);
  }

  function frame(dtSec: number, next: SceneModel): void {
    model = next;
    if (!model.paused) step(Math.min(dtSec, 0.1));
    draw();
  }

  function dispose(): void {
    window.removeEventListener('resize', onResize);
  }

  return { frame, strikeAt, setCollectAnchor, dispose };
}

/**
 * Compact number for in-world floaters. Delegates past 1000 to the HUD's
 * formatter: its own ladder stopped at T, so a staged late run printed
 * "2.5866247188821906E+295T" across the middle of the frame.
 */
function formatShort(n: number): string {
  if (n < 10) return n.toFixed(1);
  if (n < 1000) return String(Math.round(n));
  return formatNumber(n);
}
