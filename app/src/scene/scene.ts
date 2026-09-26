// The road scene: a full-bleed side-scrolling pixel world the HUD sits on top
// of. Presentation state only: every number it displays comes from the
// controller (DECISIONS.md #12). It renders into a small offscreen buffer and
// upscales with smoothing off, which is what keeps the pixels square everywhere.

import { GUARDIAN_BODY, rosterAt } from '../species';
import {
  shakeOffset,
  wrap,
} from './fx';
import { type ArcPoint } from '@wanderblade/core';
import {
  HERO_INK,
  LOOT_INK,
  REALM_SKIN_COUNT,
  backdropSkin,
  depthBandTones,
  depthHaze,
  foliageNotchAt,
  foregroundInk,
  grassClumpBlades,
  groundBladeOf,
  inFoliageLobe,
  inRun,
  lighten,
  mixHex,
  momentumLift,
  monsterInk,
  realmSkin,
  sceneryInk,
  sunHaloBands,
  type FoliageLobe,
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
} from './pixels';
import {
  PROP_SPAN,
  hash01,
  type Frame,
  type SceneModel,
  type SceneSprites,
  type SkinnedSprites,
} from './frame';
import { drawDungeonBackdrop, drawDungeonFloor } from './dungeon';
import { createViewport, layoutViewport, toScene as toSceneAt, type Chrome } from './geometry';
import { drawFloaters, drawMomentumMeter, drawParticles, drawRests, drawStreaks } from './overlay';
import { drawArcs, drawHero, drawHeroGround, drawMonsters, drawShadow } from './actors';
import { GROUND_BANDS, drawGroundBands, drawHills } from './road';
import {
  catchArc,
  createWorld,
  fightBand,
  step,
  strike,
  type WorldInput,
} from './world';
import {
  bakeSprite,
  context,
  drawSprite,
} from './sprites';
import {
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

const NO_JOLT = { x: 0, y: 0 };

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
  const world = createWorld();
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
  // Lazy, so a realm bakes on first use rather than at construction.
  const sprites: SceneSprites = {
    heroA,
    heroB,
    sword,
    coin,
    gem,
    get skinned() {
      return skinnedFor(model.region);
    },
  };
  /** What step and the spawners read; retargeted at the new model each frame. */
  const input: WorldInput = { view, model, skin: realmSkin(0), sprites };

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
    world.collectAnchor = { x: p.x, y: Math.max(2, p.y) };
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

  function strikeAt(clientX: number | null, clientY: number | null): ArcPoint | null {
    const at = clientX === null || clientY === null ? null : toScene(clientX, clientY);
    return strike(world, input, at);
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
  }

  /** Where the sun sits: far enough down that the widest halo band (sunHaloBands' 2.3x) clears the top edge. */
  function sunAt(): { x: number; y: number; r: number } {
    const r = Math.max(5, Math.floor(view.vw / 26));
    return { x: Math.floor(view.vw * 0.6), y: Math.max(Math.ceil(r * 2.45), Math.floor(view.groundY * 0.13)), r };
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
    const sun = sunAt();
    for (const band of sunHaloBands(sun.r)) {
      ctx.fillStyle = mixHex(skin.sun, skin.skyTop, band.skyMix);
      fillDisc(sun.x, sun.y, band.r);
    }
    ctx.fillStyle = skin.sun;
    fillDisc(sun.x, sun.y, sun.r);
  }

  /** A third depth on the horizon, behind the far hills. */
  function drawRange(skin: RealmSkin): void {
    ctx.fillStyle = skin.range;
    const baseY = view.groundY - Math.floor(view.groundY * 0.02);
    for (let x = 0; x < view.vw; x += 3) {
      const wx = x + world.scrollRange;
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
      const x = Math.floor(wrap(base - world.scrollClouds, span)) - view.vw;
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
      const x = Math.floor(wrap(b.x0 - world.scrollGround, PROP_SPAN));
      if (x > view.vw) continue;
      ctx.fillStyle = b.toneAlt ? skin.turfLip : blade;
      ctx.fillRect(x, b.y, 1, b.tall ? 3 : 2);
      if (b.dot) ctx.fillRect(x + 1, b.y + 1, 1, 1);
    }
    // Fringe standing proud of the horizon line. Its own fill: the blade loop
    // above leaves fillStyle on whichever tone it happened to end on.
    ctx.fillStyle = blade;
    for (const f of groundFringe) {
      const x = Math.floor(wrap(f.x0 - world.scrollGround, PROP_SPAN));
      if (x > view.vw) continue;
      ctx.fillRect(x, view.groundY - 1, 1, 1);
      if (f.tuft) ctx.fillRect(x, view.groundY - 2, 1, 1);
    }

    // Soil strata: long horizontal marks, not scattered dots.
    ctx.fillStyle = skin.soilDark;
    for (const s of groundStrata) {
      const x = Math.floor(wrap(s.x0 - world.scrollGround, PROP_SPAN));
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
        Math.floor(wrap(hash01(i * 6.13 + 3) * span - world.scrollRange * (1.7 + depth * 1.6), span)) - 30;
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

      // Tapered trunk with a root flare, a sunward lit edge and bark world.streaks.
      // Uniform grey-mauve columns with dead-straight sides were named outright.
      const barkH = Math.max(1, footY - crownY);
      // A streak runs. The first version rolled a dot per row at a fresh x and
      // left 38% of every trunk carrying a lone dark pixel with nothing beside
      // it - which is a scatter of 36px blocks at 6x, not grain.
      const barkStreaks = [0, 1].map((k) => ({
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
        for (const st of barkStreaks) {
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

  function drawTreeline(f: Frame, sprites: SkinnedSprites): void {
    const y = view.groundY + 1;
    const band = fightBand(world, input);
    for (const prop of props) {
      if (prop.kind !== 'tree') continue;
      const x = Math.floor(wrap(prop.at - world.scrollTrees, PROP_SPAN));
      if (x < -24 || x > view.vw + 24) continue;
      const sprite = sprites.trees[prop.variant] ?? sprites.trees[0]!;
      const half = sprite.width / 2;
      if (x + half > band.x0 && x - half < band.x1) continue;
      drawShadow(f, x, Math.round(sprite.width * 0.55));
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
      const x = Math.floor(wrap(hash01(i * 1.93) * span - world.clockSec * speed, span));
      if (x > view.vw + 4) continue;
      const fall = 9 + depth * 26;
      // Falls only through the wooded band; a leaf crossing open sky reads as
      // a dead pixel rather than as weather.
      const top = view.groundY * 0.42;
      const y = Math.floor(
        top +
          wrap(hash01(i * 8.11) * view.groundY + world.clockSec * fall, view.groundY - top - 4) +
          Math.sin(world.clockSec * 1.9 + i) * 3,
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
      const x = Math.floor(wrap(m.at - world.scrollTrees * 1.2, PROP_SPAN));
      if (x > view.vw) continue;
      const bobY = Math.sin(world.clockSec * 1.4 + m.phase) * 5;
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
    const sun = sunAt();
    for (let i = 0; i < 9; i++) {
      const x = Math.floor(wrap(hash01(i * 4.7) * span - world.scrollBirds, span)) - view.vw;
      if (x < -12 || x > view.vw + 12) continue;
      const y = Math.floor(hash01(i * 8.3) * view.groundY * 0.5) + 6;
      if (Math.hypot(x - sun.x, y - sun.y) < sun.r + 8) continue;
      const frame = Math.floor(world.clockSec * 5 + i) % 2;
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
      const x = Math.floor(wrap(hash01(i * 5.9 + 7) * PROP_SPAN - world.scrollFore * 0.72, PROP_SPAN));
      if (x < -20 || x > view.vw + 20) continue;
      const y = Math.floor(view.groundY + band * (0.42 + hash01(i * 3.3) * 0.5));
      drawSprite(ctx, sprites.fern, x, y);
    }
    // Nearest depth: double-size fronds at the frame edge, the layer the
    // camera actually passes through.
    const fern = sprites.fernNear;
    for (let i = 0; i < 14; i++) {
      const x = Math.floor(wrap(hash01(i * 9.1 + 21) * PROP_SPAN - world.scrollFore, PROP_SPAN));
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
  function drawFence(f: Frame, sprites: SkinnedSprites, skin: RealmSkin): void {
    const offset = wrap(world.scrollGround, FENCE_PITCH);
    const railY = view.groundY - 8;
    ctx.fillStyle = skin.bark;
    for (let x = -FENCE_PITCH; x < view.vw + FENCE_PITCH; x += FENCE_PITCH) {
      const px = Math.floor(x - offset);
      ctx.fillRect(px, railY, FENCE_PITCH, 1);
      ctx.fillRect(px, railY + 4, FENCE_PITCH, 1);
      drawShadow(f, px, sprites.fence.width + 2);
      drawSprite(ctx, sprites.fence, px, view.groundY + 1);
    }
  }

  function drawProps(f: Frame, sprites: SkinnedSprites): void {
    const band = fightBand(world, input);
    for (const prop of props) {
      if (prop.kind === 'tree') continue;
      const x = Math.floor(wrap(prop.at - world.scrollGround, PROP_SPAN));
      if (x < -30 || x > view.vw + 30) continue;
      // Grass and flowers are ground texture; a boulder is a third silhouette.
      if (prop.kind === 'rock' && x > band.x0 - 8 && x < band.x1 + 8) continue;
      switch (prop.kind) {
        case 'rock':
          drawShadow(f, x, sprites.rock.width);
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

  function draw(): void {
    const skin = realmSkin(model.region);
    const skinned = sprites.skinned;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, view.vw, view.vh);

    const f: Frame = { ctx, view, model, skin, sprites, world };

    if (model.boss) {
      drawDungeonBackdrop(f);
    } else {
      const far = backdropSkin(skin);
      const haze = depthHaze(skin);
      drawSky(skin);
      drawClouds(skin);
      drawBirds(skinned);
      drawRange(far);
      drawHills(ctx, view.vw, view.groundY, far.hillFar, null, world.scrollHillFar, view.groundY * 0.14, view.groundY * 0.34, 1, 4, haze);
      drawHills(
        ctx,
        view.vw,
        view.groundY,
        far.hillNear,
        far.hillLip,
        world.scrollHillNear,
        view.groundY * 0.11,
        view.groundY * 0.18,
        1.7,
        3,
        haze,
      );
      drawGrove(far);
      drawDrift(far);
      drawTreeline(f, skinned);
      drawSun(skin);
    }

    const jolt = model.reduceMotion ? NO_JOLT : shakeOffset(world.shake, world.clockSec);
    ctx.save();
    ctx.translate(Math.round(jolt.x), Math.round(jolt.y));

    if (model.boss) {
      drawDungeonFloor(f);
    } else {
      drawGround(skin);
      drawFence(f, skinned, skin);
      drawProps(f, skinned);
    }
    world.barSpans = drawMonsters(f);
    drawHeroGround(f);
    drawArcs(f);
    drawParticles(f);
    drawRests(f);
    drawStreaks(f);
    if (!model.boss) drawMotes(skin);
    // Last of the world layers, so nothing bright can ever be painted over the
    // one figure that must always read. The pocket test below is the second
    // line: it keeps effects from crowding the silhouette even from behind.
    drawHero(f);
    drawFloaters(f);
    if (!model.boss) drawForeground(skinned);
    drawMomentumMeter(f);

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
    input.model = model;
    input.skin = realmSkin(model.region);
    if (!model.paused) step(world, input, Math.min(dtSec, 0.1));
    draw();
  }

  function dispose(): void {
    window.removeEventListener('resize', onResize);
  }

  return {
    frame,
    strikeAt,
    catchArc: (bonusGold, upgraded) => catchArc(world, input, bonusGold, upgraded),
    setCollectAnchor,
    setSceneTop,
    setSceneRight,
    dispose,
  };
}
