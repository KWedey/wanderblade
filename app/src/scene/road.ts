// The road diorama: sky, hills, turf and everything that scrolls past the hero.

import { drawShadow } from './actors';
import { PROP_SPAN, hash01, type FillCtx, type Frame } from './frame';
import { wrap } from './fx';
import type { Viewport } from './geometry';
import {
  clampHillStep,
  depthBandTones,
  foliageNotchAt,
  grassClumpBlades,
  groundBladeOf,
  hillBaseInk,
  inFoliageLobe,
  inRun,
  lighten,
  mixHex,
  momentumLift,
  sunHaloBands,
  type FoliageLobe,
  type RealmSkin,
} from './palette';
import { drawSprite } from './sprites';
import { fightBand } from './world';

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

const PROPS = buildProps();
const MOTES = buildMotes();

interface GroundBlade { x0: number; y: number; toneAlt: boolean; tall: boolean; dot: boolean }
interface GroundFringe { x0: number; tuft: boolean }
interface GroundStrata { x0: number; y: number; len: number }

/** Grass blades, fringe dots and soil strata: a function of index and turf geometry, baked once per resize rather than re-hashed every frame. */
export interface GroundTexture {
  blades: GroundBlade[];
  fringe: GroundFringe[];
  strata: GroundStrata[];
}

export function buildGroundTexture(view: Viewport): GroundTexture {
  const belowH = Math.max(8, view.sceneBottomY - view.groundY);
  const turfH = Math.max(6, Math.floor(belowH * 0.76));

  const groundBlades: GroundBlade[] = [];
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

  const groundFringe: GroundFringe[] = [];
  for (let i = 0; i < 140; i++) {
    groundFringe.push({ x0: hash01(i * 6.3 + 11) * PROP_SPAN, tuft: i % 3 === 0 });
  }

  const groundStrata: GroundStrata[] = [];
  for (let i = 0; i < 46; i++) {
    groundStrata.push({
      x0: hash01(i * 2.3) * PROP_SPAN,
      y: view.groundY + turfH + 3 + Math.floor(hash01(i * 7.7) * Math.max(1, belowH - turfH - 4)),
      len: 4 + Math.floor(hash01(i) * 8),
    });
  }
  return { blades: groundBlades, fringe: groundFringe, strata: groundStrata };
}

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
export const GROUND_BANDS = 4;

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

function band(f: Frame, y: number, h: number, color: string): void {
  if (h <= 0) return;
  const { ctx, view } = f;
  ctx.fillStyle = color;
  ctx.fillRect(0, y, view.vw, h);
}

export function drawSky(f: Frame): void {
  const { skin, view } = f;
  const skyH = view.groundY;
  const midY = Math.floor(skyH * 0.74);
  const hazeY = Math.floor(skyH * 0.92);
  band(f, 0, midY, skin.skyTop);
  band(f, midY, hazeY - midY, skin.skyMid);
  band(f, hazeY, skyH - hazeY, skin.skyHaze);
}

/** Where the sun sits: far enough down that the widest halo band (sunHaloBands' 2.3x) clears the top edge. */
export function sunAt(view: Viewport): { x: number; y: number; r: number } {
  const r = Math.max(5, Math.floor(view.vw / 26));
  return { x: Math.floor(view.vw * 0.6), y: Math.max(Math.ceil(r * 2.45), Math.floor(view.groundY * 0.13)), r };
}

/** A filled circle, scanline by scanline — mass, not an outline. */
function fillDisc(f: Frame, cx: number, cy: number, r: number): void {
  const { ctx, view } = f;
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
export function drawSun(f: Frame): void {
  const { ctx, skin } = f;
  const sun = sunAt(f.view);
  for (const band of sunHaloBands(sun.r)) {
    ctx.fillStyle = mixHex(skin.sun, skin.skyTop, band.skyMix);
    fillDisc(f, sun.x, sun.y, band.r);
  }
  ctx.fillStyle = skin.sun;
  fillDisc(f, sun.x, sun.y, sun.r);
}

/** A third depth on the horizon, behind the far hills. */
export function drawRange(f: Frame, skin: RealmSkin): void {
  const { ctx, view, world } = f;
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

export function drawClouds(f: Frame): void {
  const { ctx, skin, view, world } = f;
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

export function drawGround(f: Frame): void {
  const { ctx, model, skin, view, world } = f;
  const { blades: groundBlades, fringe: groundFringe, strata: groundStrata } = f.ground;
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
  for (const fr of groundFringe) {
    const x = Math.floor(wrap(fr.x0 - world.scrollGround, PROP_SPAN));
    if (x > view.vw) continue;
    ctx.fillRect(x, view.groundY - 1, 1, 1);
    if (fr.tuft) ctx.fillRect(x, view.groundY - 2, 1, 1);
  }

  // Soil strata: long horizontal marks, not scattered dots.
  ctx.fillStyle = skin.soilDark;
  for (const s of groundStrata) {
    const x = Math.floor(wrap(s.x0 - world.scrollGround, PROP_SPAN));
    if (x > view.vw) continue;
    ctx.fillRect(x, s.y, s.len, 1);
  }
}

interface GroveTree {
  i: number;
  x: number;
  trunkW: number;
  crownY: number;
  footY: number;
}

interface GroveInks {
  bark: string;
  barkLit: string;
  barkDark: string;
  leaf: string;
  leafDark: string;
  leafLite: string;
}

/**
 * Distance sets value and height together: the far rank used to tower over
 * the near one at nearly its saturation, so thirty trees read as one flat
 * sheet. Foliage holds its hue harder than bark, or the far canopies come out
 * the grey-white of the clouds behind them.
 */
function groveInks(skin: RealmSkin, depth: number): GroveInks {
  const haze = skin.skyHaze;
  const fade = 0.4 - depth * 0.32;
  const leafFade = fade * 0.42;
  return {
    bark: mixHex(skin.bark, haze, fade),
    barkLit: mixHex(lighten(skin.bark, 0.4), haze, fade),
    barkDark: mixHex(mixHex(skin.bark, '#000000', 0.4), haze, fade),
    leafDark: mixHex(skin.leafDark, haze, leafFade),
    leaf: mixHex(skin.leaf, haze, leafFade),
    // Lightening the leaf by a third walked it to the clouds' grey-green.
    leafLite: mixHex(lighten(skin.leaf, 0.18), haze, leafFade),
  };
}

/** Tapered trunk with a root flare, a sunward lit edge and bark streaks: uniform straight-sided columns were named outright. */
function drawTrunk(ctx: CanvasRenderingContext2D, t: GroveTree, inks: GroveInks): void {
  const { i, x, trunkW, crownY, footY } = t;
  const barkH = Math.max(1, footY - crownY);
  // A streak is a run, not a dot per row: at 6x a lone dark pixel is a 36px block, not grain.
  const streaks = [0, 1].map((k) => ({
    dx: 1 + Math.floor(hash01(i * 4.3 + k * 2.1) * Math.max(1, trunkW - 2)),
    from: Math.floor(hash01(i * 7.9 + k * 3.3) * barkH * 0.5),
    len: Math.round(barkH * (0.22 + hash01(i * 2.7 + k * 5.9) * 0.34)),
  }));
  for (let y = crownY; y < footY; y++) {
    const f = (y - crownY) / barkH;
    const flare = f > 0.9 ? Math.round((f - 0.9) * 10 * 2) : 0;
    const w = trunkW + flare;
    ctx.fillStyle = inks.bark;
    ctx.fillRect(x - flare, y, w, 1);
    ctx.fillStyle = inks.barkLit;
    ctx.fillRect(x + w - flare - 1, y, 1, 1);
    ctx.fillStyle = inks.barkDark;
    for (const st of streaks) {
      if (inRun(y - crownY, st.from, st.len)) ctx.fillRect(x + st.dx, y, 1, 1);
    }
  }
}

/** One bough growing out of the bole and tapering: started a pixel clear of the trunk it read as a wire across the sky. */
function drawBough(ctx: CanvasRenderingContext2D, t: GroveTree, inks: GroveInks): void {
  const { i, x, trunkW, crownY } = t;
  const boughSide = hash01(i * 8.3) > 0.5 ? 1 : -1;
  const boughLen = trunkW + 3;
  ctx.fillStyle = inks.barkDark;
  for (let n = 0; n < boughLen; n++) {
    const bx = boughSide > 0 ? x + trunkW - 1 + n : x - n;
    const thick = n < 2 ? 3 : n < boughLen - 2 ? 2 : 1;
    ctx.fillRect(bx, crownY + 5 - Math.round(n * 0.9), 1, thick);
  }
}

/**
 * A crown with a profile, not a stack of slabs. Width follows a lobed sine up
 * the mass and every row is notched, so the silhouette breaks instead of
 * stepping in clean 90-degree corners.
 */
function drawCrown(ctx: CanvasRenderingContext2D, t: GroveTree, inks: GroveInks): void {
  const { i, x, trunkW, crownY } = t;
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
    const tt = k / crownH;
    const prof = Math.sin(Math.PI * (0.16 + tt * 0.8));
    const notch = Math.round(foliageNotchAt(k, crownLobes));
    const half = Math.max(1, Math.round((crownW / 2) * prof) + notch);
    const lx = cx - half;
    const w = half * 2;
    ctx.fillStyle = inks.leaf;
    ctx.fillRect(lx, y, w, 1);
    // Sun is upper right: the lit face is the far side of the upper mass,
    // and the underside of the crown carries the whole shadow.
    if (tt > 0.35) {
      ctx.fillStyle = inks.leafLite;
      ctx.fillRect(lx + Math.round(w * 0.58), y, Math.max(1, Math.round(w * 0.42)), 1);
    }
    if (tt < 0.22 || inFoliageLobe(k, shadeLobes)) {
      ctx.fillStyle = inks.leafDark;
      ctx.fillRect(lx, y, Math.max(1, Math.round(w * 0.34)), 1);
    }
  }
}

/**
 * Standing timber between hills and road. Half-empty sky is a camera problem
 * no number of clouds fixes: trunks run off the top and canopies close the
 * upper band, so the camera reads as inside the world.
 */
export function drawGrove(f: Frame, skin: RealmSkin): void {
  const { ctx, view, world } = f;
  const span = view.vw * 2;
  const footY = view.groundY - Math.floor(view.groundY * 0.02);
  for (let i = 0; i < 30; i++) {
    const depth = hash01(i * 2.9);
    const x =
      Math.floor(wrap(hash01(i * 6.13 + 3) * span - world.scrollRange * (1.7 + depth * 1.6), span)) - 30;
    if (x < -60 || x > view.vw + 60) continue;
    const trunkW = 3 + Math.floor(depth * 6);
    // The hero's column stays clear: a trunk sharing his width made him half-read as part of the tree.
    if (x + trunkW > view.heroX - 12 && x < view.heroX + 12) continue;
    // Near crowns run off the top edge; far ones close well inside it. A canopy nobody can see is a pole.
    const crownY = Math.floor(view.groundY * (0.66 - depth * 0.5));
    const tree: GroveTree = { i, x, trunkW, crownY, footY };
    const inks = groveInks(skin, depth);

    // Cast shadow. A trunk meeting turf on a clean line reads as a decal.
    ctx.fillStyle = mixHex(skin.turf, '#000000', 0.3);
    ctx.fillRect(x - trunkW, footY - 1, trunkW * 3, 2);
    drawTrunk(ctx, tree, inks);
    drawBough(ctx, tree, inks);
    drawCrown(ctx, tree, inks);
  }
}

export function drawTreeline(f: Frame): void {
  const { ctx, view, world } = f;
  const sprites = f.sprites.skinned;
  const y = view.groundY + 1;
  const band = fightBand(world, f);
  for (const prop of PROPS) {
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
export function drawDrift(f: Frame, skin: RealmSkin): void {
  const { ctx, model, view, world } = f;
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

export function drawMotes(f: Frame): void {
  const { ctx, model, skin, view, world } = f;
  if (model.reduceMotion) return;
  for (const m of MOTES) {
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
export function drawBirds(f: Frame): void {
  const { ctx, view, world } = f;
  const sprites = f.sprites.skinned;
  const span = view.vw * 3;
  const sun = sunAt(view);
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
export function drawForeground(f: Frame): void {
  const { ctx, view, world } = f;
  const sprites = f.sprites.skinned;
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
export function drawFence(f: Frame): void {
  const { ctx, skin, view, world } = f;
  const sprites = f.sprites.skinned;
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

export function drawProps(f: Frame): void {
  const { ctx, view, world } = f;
  const sprites = f.sprites.skinned;
  const band = fightBand(world, f);
  for (const prop of PROPS) {
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

/** Sky to sun, back to front — the layers the camera never jolts. */
export function drawRoadBackdrop(f: Frame, far: RealmSkin, haze: string): void {
  const { ctx, view, world } = f;
  drawSky(f);
  drawClouds(f);
  drawBirds(f);
  drawRange(f, far);
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
  drawGrove(f, far);
  drawDrift(f, far);
  drawTreeline(f);
  drawSun(f);
}

/** The turf and what stands on it, drawn inside the camera jolt. */
export function drawRoadGround(f: Frame): void {
  drawGround(f);
  drawFence(f);
  drawProps(f);
}
