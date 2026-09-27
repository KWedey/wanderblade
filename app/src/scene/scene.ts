// The road scene: a full-bleed side-scrolling pixel world the HUD sits on top
// of. Presentation state only: every number it displays comes from the
// controller (DECISIONS.md #12). It renders into a small offscreen buffer and
// upscales with smoothing off, which is what keeps the pixels square everywhere.

import { GUARDIAN_BODY, rosterAt } from '../species';
import { drawArcs, drawHero, drawHeroGround, drawMonsters } from './actors';
import { drawDungeonBackdrop, drawDungeonFloor } from './dungeon';
import { type Frame, type SceneModel, type SceneSprites, type SkinnedSprites } from './frame';
import { shakeOffset } from './fx';
import { createViewport, layoutViewport, toScene as toSceneAt, type Chrome } from './geometry';
import { drawFloaters, drawMomentumMeter, drawParticles, drawRests, drawStreaks } from './overlay';
import {
  HERO_INK,
  LOOT_INK,
  REALM_SKIN_COUNT,
  backdropSkin,
  dayFraction,
  depthHaze,
  foregroundInk,
  monsterInk,
  realmSkin,
  sceneryInk,
  zoneSkin,
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
import { buildGroundTexture, drawForeground, drawMotes, drawRoadBackdrop, drawRoadGround } from './road';
import { bakeSprite, context } from './sprites';
import { catchArc, createWorld, step, strike, type StrikeResult } from './world';

export type { SceneModel } from './frame';
export type { StrikeResult } from './world';

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
   * positionless Strike still swings and still builds momentum. `missed` says
   * it hit neither a creature nor a coin.
   */
  strikeAt(clientX: number | null, clientY: number | null): StrikeResult;
  /** Play the catch flourish for an `arcCatch` the engine resolved. */
  catchArc(bonusGold: number, upgraded: boolean): void;
  /** CSS pixels of chrome above the world band. */
  setSceneTop(cssPx: number): void;
  /** CSS pixels of chrome docked to the right of the road. */
  setSceneRight(cssPx: number): void;
  /** Viewport point loot streaks fly to — the HUD's gold readout. */
  setCollectAnchor(clientX: number, clientY: number): void;
  /** Viewport point the combo widget hangs from — the DPS readout's bottom-right corner. */
  setComboAnchor(clientX: number, clientY: number): void;
  dispose(): void;
}

const NO_JOLT = { x: 0, y: 0 };

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

  // --- Mutable scene state ---
  const view = createViewport();
  const chrome: Chrome = { topCss: 0, rightCss: 0 };
  const world = createWorld();
  let collectAnchorCss: { x: number; y: number } | null = null;
  let comboAnchorCss: { x: number; y: number } | null = null;
  const model: SceneModel = {
    region: 0,
    zone: 0,
    zonesInRealm: 1,
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
      return skinnedFor(f.model.region);
    },
  };
  /** The one frame value every draw and step reads; retargeted at the new model each frame. */
  const f: Frame = { ctx, view, model, skin: realmSkin(0), sprites, world, ground: { blades: [], fringe: [], strata: [] } };

  function resize(): void {
    layoutViewport(view, canvas, buffer, chrome, Math.min(window.devicePixelRatio || 1, 3));
    displayCtx.imageSmoothingEnabled = false;
    ctx.imageSmoothingEnabled = false;
    if (collectAnchorCss) setCollectAnchor(collectAnchorCss.x, collectAnchorCss.y);
    if (comboAnchorCss) setComboAnchor(comboAnchorCss.x, comboAnchorCss.y);
    f.ground = buildGroundTexture(view);
  }

  function setCollectAnchor(clientX: number, clientY: number): void {
    collectAnchorCss = { x: clientX, y: clientY };
    const p = toScene(clientX, clientY);
    // The gold counter sits above the band in portrait, so a coin would fly to
    // a point off the top of the world. Clamp it to the band's own edge.
    world.collectAnchor = { x: p.x, y: Math.max(2, p.y) };
  }

  function setComboAnchor(clientX: number, clientY: number): void {
    comboAnchorCss = { x: clientX, y: clientY };
    world.comboAnchor = toScene(clientX, clientY);
  }

  function toScene(clientX: number, clientY: number): { x: number; y: number } {
    return toSceneAt(view, canvas, clientX, clientY);
  }

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

  function strikeAt(clientX: number | null, clientY: number | null): StrikeResult {
    const at = clientX === null || clientY === null ? null : toScene(clientX, clientY);
    return strike(world, f, at);
  }

  // --- Drawing -----------------------------------------------------------

  function drawWorldLayer(): void {
    const { model } = f;
    const jolt = model.reduceMotion ? NO_JOLT : shakeOffset(world.shake, world.clockSec);
    ctx.save();
    ctx.translate(Math.round(jolt.x), Math.round(jolt.y));

    if (model.boss) drawDungeonFloor(f);
    else drawRoadGround(f);
    world.barSpans = drawMonsters(f);
    drawHeroGround(f);
    drawArcs(f);
    drawParticles(f);
    drawRests(f);
    drawStreaks(f);
    if (!model.boss) drawMotes(f);
    // Last of the world layers, so nothing bright can ever be painted over the
    // one figure that must always read; the pockets keep effects off it from behind.
    drawHero(f);
    drawFloaters(f);
    if (!model.boss) drawForeground(f);
    drawMomentumMeter(f);

    ctx.restore();
  }

  /** Blit only the world band, offset down the display canvas: in portrait the panels own the top. */
  function blit(): void {
    displayCtx.setTransform(1, 0, 0, 1, 0, 0);
    displayCtx.imageSmoothingEnabled = false;
    displayCtx.clearRect(0, 0, canvas.width, canvas.height);
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

  function draw(): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, view.vw, view.vh);
    if (f.model.boss) drawDungeonBackdrop(f);
    else drawRoadBackdrop(f, backdropSkin(f.skin), depthHaze(f.skin));
    drawWorldLayer();
    blit();
  }

  // One graded skin per zone, so the backdrop caches keyed on skin identity hold.
  const zoneSkins = new Map<string, RealmSkin>();
  function skinFor(next: SceneModel): RealmSkin {
    const key = `${next.region}:${next.zone}:${next.zonesInRealm}`;
    const hit = zoneSkins.get(key);
    if (hit) return hit;
    const graded = zoneSkin(realmSkin(next.region), dayFraction(next.zone, next.zonesInRealm));
    zoneSkins.set(key, graded);
    return graded;
  }

  function frame(dtSec: number, next: SceneModel): void {
    f.model = next;
    f.skin = skinFor(next);
    if (!next.paused) step(world, f, Math.min(dtSec, 0.1));
    draw();
  }

  function dispose(): void {
    window.removeEventListener('resize', onResize);
  }

  return {
    frame,
    strikeAt,
    catchArc: (bonusGold, upgraded) => catchArc(world, f, bonusGold, upgraded),
    setCollectAnchor,
    setComboAnchor,
    setSceneTop,
    setSceneRight,
    dispose,
  };
}
