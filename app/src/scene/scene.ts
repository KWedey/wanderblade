// The road scene: a full-bleed side-scrolling pixel world that the HUD sits on
// top of. Owns only presentation state — parallax offsets, one monster, loot
// arcs, particles, floaters, camera shake. Every number it *displays* is handed
// to it by the controller; it invents no economy (DECISIONS.md #12).
//
// Rendering is done once into a small offscreen buffer at scene resolution,
// then upscaled with smoothing off. That single indirection is what makes the
// pixels square and identical everywhere instead of resolution-dependent mush.

import {
  ARC_CATCH_MULT,
  arcCaughtBy,
  arcInFlight,
  arcPosition,
  decayTo,
  floaterOffsetY,
  launchArc,
  lifeRemaining,
  shakeOffset,
  stepParticle,
  wrap,
  type Floater,
  type LootArc,
  type Particle,
} from './fx';
import {
  HERO_INK,
  LOOT_INK,
  monsterInk,
  OUTLINE_INK,
  realmSkin,
  REALM_SKIN_COUNT,
  sceneryInk,
  type RealmSkin,
} from './palette';
import {
  COIN,
  FENCE,
  FLOWER,
  GEM,
  HERO_WALK_A,
  HERO_WALK_B,
  MONSTER_SHAPES,
  ROCK,
  SWORD,
  TREE,
  TUFT,
} from './pixels';
import {
  bakeSprite,
  context,
  drawSprite,
  drawSpriteRotated,
  drawText,
  type BakedSprite,
} from './sprites';

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

export interface StrikeOutcome {
  /** The strike caught a loot arc in flight. */
  caughtArc: boolean;
  /** Base value of the caught arc (the catch pays ARC_CATCH_MULT of it). */
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
const SWING_ANIM_SEC = 0.26;
const SHAKE_DECAY = 9;
const MAX_SHAKE = 3.2;

const FLOATER_LIFE = 1.05;
const FLOATER_RISE = 22;
const STREAK_SEC = 0.5;
const CATCH_RADIUS = 26;

const PARTICLE_CAP = 220;
const FLOATER_CAP = 12;

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
}

interface Prop {
  kind: 'tree' | 'rock' | 'fence' | 'tuft' | 'flower';
  /** Position along the prop track, in scene units. */
  at: number;
  layer: 'tree' | 'ground';
}

/** Deterministic [0,1) hash — prop layout must not shimmer between frames. */
function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const PROP_SPAN = 1400;

function buildProps(): Prop[] {
  const props: Prop[] = [];
  for (let i = 0; i < 22; i++) {
    props.push({ kind: 'tree', at: hash01(i) * PROP_SPAN, layer: 'tree' });
  }
  for (let i = 0; i < 110; i++) {
    const r = hash01(i + 500);
    const kind: Prop['kind'] = r < 0.11 ? 'rock' : r < 0.3 ? 'flower' : 'tuft';
    props.push({ kind, at: hash01(i + 900) * PROP_SPAN, layer: 'ground' });
  }
  return props;
}

/** Fence posts march at a fixed pitch so the rails between them line up. */
const FENCE_PITCH = 74;

interface SkinnedSprites {
  monsters: BakedSprite[];
  tree: BakedSprite;
  rock: BakedSprite;
  fence: BakedSprite;
  tuft: BakedSprite;
  flower: BakedSprite;
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
    const mInk = monsterInk(skin);
    const sInk = sceneryInk(skin);
    const built: SkinnedSprites = {
      monsters: MONSTER_SHAPES.map((m) => bakeSprite(m, mInk)),
      tree: bakeSprite(TREE, sInk),
      rock: bakeSprite(ROCK, sInk),
      fence: bakeSprite(FENCE, sInk),
      tuft: bakeSprite(TUFT, sInk),
      flower: bakeSprite(FLOWER, sInk),
    };
    skinCache.set(key, built);
    return built;
  }

  const props = buildProps();

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
    for (let i = 0; i < 2200; i++) {
      const depth = hash01(i * 1.7);
      groundBlades.push({
        x0: hash01(i * 4.1 + 3) * PROP_SPAN,
        y: groundY + 3 + Math.floor(depth * (turfH - 4)),
        toneAlt: i % 3 === 0,
        tall: depth < 0.45,
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

  let shake = 0;
  let swingCooldown = 0;
  let swingAnim = 0;
  let heroFlash = 0;
  let dustCooldown = 0;

  let monster: Monster | null = null;
  let lastKills = -1;
  let deathBurstQueued = false;

  const arcs: LootArc[] = [];
  const particles: Particle[] = [];
  const floaters: Floater[] = [];
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

  function addFloater(f: Floater): void {
    if (floaters.length >= FLOATER_CAP) floaters.shift();
    floaters.push(f);
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

  function spawnMonster(): void {
    monster = {
      shape: Math.floor(hash01(model.kills * 1.37 + model.region) * MONSTER_SHAPES.length),
      x: vw + 20,
      flash: 0,
      recoil: 0,
      bob: hash01(model.kills) * Math.PI * 2,
    };
  }

  function killMonster(skin: RealmSkin): void {
    const x = monster ? monster.x : heroX + engageGap;
    const y = groundY;
    burst(x, y - 10, 14, [skin.monBody, skin.monBodyDark, '#ffffff', skin.accent], 130);
    shake = Math.min(MAX_SHAKE, shake + 2.1);

    // The payout leaves the corpse on a visible arc; catching it mid-flight is
    // the whole active-play verb (docs/ACTIVE-PLAY.md).
    const gold = model.goldPerKill;
    if (gold > 0) {
      // The payout is thrown as three coins whose values sum to it exactly —
      // more weight on screen, not more money.
      const pieces = 3;
      for (let i = 0; i < pieces; i++) {
        const seed = model.kills * 3 + i;
        arcs.push(
          launchArc(
            x,
            y - 10,
            -(10 + hash01(seed) * 46),
            groundY - 2,
            120 + hash01(seed * 2.1) * 70,
            gold / pieces,
            'gold',
            hash01(seed * 5.5) * Math.PI * 2,
          ),
        );
      }
    }
    monster = null;
  }

  function resolveArc(arc: LootArc, caught: boolean): void {
    const p = arcPosition(arc, Math.min(arc.age, arc.flightSec));
    const skin = realmSkin(model.region);
    if (caught) {
      addFloater({
        x: p.x,
        y: p.y - 10,
        age: 0,
        life: FLOATER_LIFE,
        text: `×${ARC_CATCH_MULT}`,
        color: '#ffffff',
        big: true,
      });
      burst(p.x, p.y, 12, ['#ffffff', skin.accent, '#fbf236'], 150);
      shake = Math.min(MAX_SHAKE, shake + 1.2);
    } else if (arc.value >= 0.05) {
      addFloater({
        x: p.x,
        y: p.y - 6,
        age: 0,
        life: 0.8,
        text: `+${formatShort(arc.value)}`,
        color: '#fbf236',
        big: false,
      });
    }
    streaks.push({ x0: p.x, y0: p.y, age: 0, gold: arc.kind === 'gold', spin: arc.spin });
  }

  function swing(fromStrike: boolean): void {
    swingAnim = SWING_ANIM_SEC;
    const skin = realmSkin(model.region);
    if (!monster || monster.x > heroX + engageGap + 14) return;

    const contactX = monster.x - 6;
    const contactY = groundY - 12;
    monster.flash = 0.09;
    monster.recoil = fromStrike ? 5 : 3;
    burst(contactX, contactY, fromStrike ? 9 : 5, ['#ffffff', skin.accent, skin.monBody], 105);
    shake = Math.min(MAX_SHAKE, shake + (fromStrike ? 1.5 : 0.7));

    // Only the player's own strikes get a number. Auto-swings land several a
    // second; numbering them all stacks into an unreadable pile and buries the
    // one hit the player actually caused.
    if (!fromStrike) return;
    // Honest: real DPS across the interval this swing represents.
    const damage = model.dps * (1 / (SWINGS_PER_SEC * model.momentumMult));
    if (damage < 0.05) return;
    addFloater({
      x: contactX + Math.round((hash01(clockSec * 31) - 0.5) * 40),
      y: contactY - 6 - Math.round(hash01(clockSec * 17) * 10),
      age: 0,
      life: 0.5,
      text: formatShort(damage),
      color: '#ffffff',
      big: false,
    });
  }

  function strikeAt(clientX: number | null, clientY: number | null): StrikeOutcome {
    heroFlash = 0.12;
    // Restart the auto-attack cadence rather than zeroing it — zero would go
    // negative on the very next step() and fire an immediate duplicate swing.
    swingCooldown = 1 / SWINGS_PER_SEC;
    swing(true);

    if (clientX === null || clientY === null) return { caughtArc: false, caughtValue: 0 };
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) / pixelScale;
    const py = (clientY - rect.top) / pixelScale;

    for (const arc of arcs) {
      if (!arcCaughtBy(arc, px, py, CATCH_RADIUS)) continue;
      arc.caught = true;
      resolveArc(arc, true);
      return { caughtArc: true, caughtValue: arc.value };
    }
    return { caughtArc: false, caughtValue: 0 };
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

    shake = decayTo(shake, 0, SHAKE_DECAY, dtSec);
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

    if (!monster) spawnMonster();
    if (monster) {
      // Position is driven by the engine's kill progress, so the monster always
      // reaches the hero exactly when the kill resolves.
      const t = Math.min(1, model.killProgress / APPROACH_FRAC);
      const eased = 1 - (1 - t) * (1 - t);
      const target = vw + 20 + (heroX + engageGap - (vw + 20)) * eased;
      monster.x = target + monster.recoil;
      monster.recoil = decayTo(monster.recoil, 0, 12, dtSec);
      monster.flash = Math.max(0, monster.flash - dtSec);
      monster.bob += dtSec * 7;
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
      if (monster) swing(false);
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

    for (let i = particles.length - 1; i >= 0; i--) {
      if (!stepParticle(particles[i]!, dtSec)) particles.splice(i, 1);
    }

    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]!;
      f.age += dtSec;
      if (f.age >= f.life) floaters.splice(i, 1);
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
    const sx = Math.floor(vw * 0.6);
    const sy = Math.floor(skyH * 0.17);
    ctx.fillStyle = skin.sun;
    const r = Math.max(5, Math.floor(vw / 26));
    for (let dy = -r; dy <= r; dy++) {
      const half = Math.floor(Math.sqrt(Math.max(0, r * r - dy * dy)));
      ctx.fillRect(sx - half, sy + dy, half * 2 + 1, 1);
    }
  }

  function drawClouds(skin: RealmSkin): void {
    const span = vw * 3;
    ctx.fillStyle = skin.cloud;
    for (let i = 0; i < 10; i++) {
      const base = hash01(i * 3.7) * span;
      const x = Math.floor(wrap(base - scrollClouds, span)) - vw;
      const y = Math.floor(hash01(i * 9.1) * groundY * 0.5) + 4;
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
    ctx.fillStyle = skin.turf;
    ctx.fillRect(0, groundY, vw, turfH);
    ctx.fillStyle = skin.turfLip;
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
      ctx.fillRect(x, b.y, 1, b.tall ? 2 : 1);
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
  function drawTreeline(sprites: SkinnedSprites): void {
    const y = groundY + 1;
    for (const prop of props) {
      if (prop.kind !== 'tree') continue;
      const x = Math.floor(wrap(prop.at - scrollTrees, PROP_SPAN));
      if (x < -20 || x > vw + 20) continue;
      drawSprite(ctx, sprites.tree, x, y);
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
          drawSprite(ctx, sprites.rock, x, groundY + 3);
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

  function drawShadow(x: number, width: number): void {
    ctx.fillStyle = 'rgba(26, 28, 44, 0.28)';
    ctx.fillRect(Math.floor(x - width / 2), groundY, width, 2);
  }

  function drawHero(): void {
    const stride = model.reduceMotion ? 0 : Math.floor(clockSec * 7 * model.momentumMult) % 2;
    const sprite = stride === 0 ? heroA : heroB;
    const bob = model.reduceMotion ? 0 : Math.floor(Math.sin(clockSec * 14) * 0.6);
    drawShadow(heroX, 12);
    drawSprite(ctx, sprite, heroX, groundY + bob, false, heroFlash > 0.06);

    // The blade sweeps through a real arc; nearest-neighbour rotation keeps it
    // pixelated rather than feathering into an anti-aliased smear.
    // Rests raised and forward; the swing sweeps down through the monster.
    const t = swingAnim / SWING_ANIM_SEC;
    const angle = swingAnim > 0 ? -1.8 + (1 - t) * 2.4 : -0.85;
    const handX = heroX + 5;
    const handY = groundY + bob - 9;
    drawSpriteRotated(ctx, sword, handX, handY, angle, 2, 2);

    if (swingAnim > 0) {
      // Crescent trail: chunky arc segments, brightest at the leading edge.
      ctx.fillStyle = t > 0.5 ? '#ffffff' : '#eec39a';
      const steps = 7;
      for (let i = 0; i < steps; i++) {
        const a = angle + (i / steps) * 0.9;
        const r = 15 + (i % 2);
        ctx.fillRect(
          Math.floor(handX + Math.cos(a) * r),
          Math.floor(handY + Math.sin(a) * r),
          2,
          2,
        );
      }
    }
  }

  function drawMonster(sprites: SkinnedSprites, skin: RealmSkin): void {
    if (!monster) return;
    const sprite = sprites.monsters[monster.shape] ?? sprites.monsters[0]!;
    const bob = model.reduceMotion ? 0 : Math.round(Math.sin(monster.bob) * 1.2);
    drawShadow(monster.x, sprite.width - 2);
    drawSprite(ctx, sprite, monster.x, groundY + bob, true, monster.flash > 0);

    // HP pips fall with the engine's kill progress — not a separate timer.
    const remaining = Math.max(0, 1 - model.killProgress);
    if (remaining < 1) {
      const w = sprite.width;
      const x = Math.floor(monster.x - w / 2);
      const y = groundY - sprite.height - 5 + bob;
      ctx.fillStyle = OUTLINE_INK;
      ctx.fillRect(x - 1, y - 1, w + 2, 4);
      ctx.fillStyle = '#45283c';
      ctx.fillRect(x, y, w, 2);
      ctx.fillStyle = remaining < 0.3 ? '#d95763' : skin.accent;
      ctx.fillRect(x, y, Math.max(0, Math.round(w * remaining)), 2);
    }
  }

  function drawArcs(): void {
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
      const y = f.y + floaterOffsetY(f.age, f.life, FLOATER_RISE);
      drawText(ctx, f.text, f.x, y, f.big ? 2 : 1, f.color, OUTLINE_INK, 'center');
    }
  }

  function drawMomentumMeter(skin: RealmSkin): void {
    const segs = 14;
    const segW = 4;
    const segH = 5;
    const gap = 1;
    const totalW = segs * (segW + gap) - gap;
    const cx = Math.floor(vw * 0.5);
    const x = Math.floor(cx - totalW / 2);
    const y = sceneBottomY - 16;
    const hot = model.momentum > 0.7;

    ctx.fillStyle = OUTLINE_INK;
    ctx.fillRect(x - 3, y - 3, totalW + 6, segH + 6);
    const filled = Math.round(model.momentum * segs);
    for (let i = 0; i < segs; i++) {
      ctx.fillStyle = i < filled ? (i >= segs - 3 ? '#ffffff' : skin.accent) : '#3d3846';
      ctx.fillRect(x + i * (segW + gap), y, segW, segH);
    }
    drawText(
      ctx,
      `×${model.momentumMult.toFixed(1)}`,
      cx,
      y - 13,
      1,
      hot ? '#ffffff' : skin.accent,
      OUTLINE_INK,
      'center',
    );
  }

  function draw(): void {
    const skin = realmSkin(model.region);
    const sprites = skinnedFor(model.region);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, vw, vh);

    drawSky(skin);
    drawClouds(skin);
    drawHills(skin.hillFar, null, scrollHillFar, groundY * 0.12, groundY * 0.24, 1, 4);
    drawHills(skin.hillNear, skin.hillLip, scrollHillNear, groundY * 0.09, groundY * 0.12, 1.7, 3);
    drawTreeline(sprites);

    const jolt = model.reduceMotion ? { x: 0, y: 0 } : shakeOffset(shake, clockSec);
    ctx.save();
    ctx.translate(Math.round(jolt.x), Math.round(jolt.y));

    drawGround(skin);
    drawFence(sprites, skin);
    drawProps(sprites);
    drawMonster(sprites, skin);
    drawHero();
    drawArcs();
    drawParticles();
    drawStreaks();
    drawFloaters();
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

/** Compact number for in-world floaters; the HUD keeps the precise formatter. */
function formatShort(n: number): string {
  if (n < 10) return n.toFixed(1);
  if (n < 1000) return String(Math.round(n));
  if (n < 1e6) return `${(n / 1e3).toFixed(1)}K`;
  if (n < 1e9) return `${(n / 1e6).toFixed(1)}M`;
  if (n < 1e12) return `${(n / 1e9).toFixed(1)}B`;
  return `${(n / 1e12).toFixed(1)}T`;
}
