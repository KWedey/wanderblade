// The figures on the ground plane: the hero and his blade, the monster queue,
// coins in flight, and the contact shadows and light pools under them.

import { ACTOR_SHADOW, LOOT_GLOW, SWING_ANIM_SEC, type Frame } from './frame';
import { inAnyPocket } from './fx';
import { OUTLINE_INK, glowRingRadii, lighten, momentumLift } from './palette';
import { drawShadow } from './road';
import { drawSprite, drawSpriteRotated } from './sprites';
import { LANE_COUNT, lanesTouching, type LaneSpan } from './textlane';
import { arcScreenPoints, leadScale, pockets } from './world';

/**
 * Concentric hard rings, not a dither: one world pixel is a 36px block at
 * desktop scale, so a 34% dither is a scatter of loose dots. At this scale
 * intensity has to be shape.
 */
function glowDisc(f: Frame, cx: number, cy: number, r: number, color: string, gain = 1): void {
  if (r <= 0 || gain <= 0) return;
  const { ctx, view } = f;
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
function litPool(f: Frame, cx: number, r: number, color: string, gain: number): void {
  if (gain <= 0) return;
  const { ctx, view } = f;
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

/** The hero's own light and contact shadow. Ground decals, so they stay under everything. */
export function drawHeroGround(f: Frame): void {
  const { model, view, sprites } = f;
  // The hero stands in his own light. White read as salt scattered on the
  // grass, so the pool is a lit tone of the ground he is actually on.
  const lit = f.skin;
  litPool(
    f,
    view.heroX,
    20,
    lighten(model.boss ? lit.rock : lit.turf, 0.42),
    Math.min(0.6, 0.16 + momentumLift(model.momentum) * 1.5),
  );
  // Sized from the sprite, deeper than the props, so his contact reads as his.
  drawShadow(f, view.heroX, sprites.heroA.width - 2, ACTOR_SHADOW);
}

export function drawHero(f: Frame): void {
  const { ctx, model, view, world } = f;
  const { heroA, heroB, sword } = f.sprites;
  const stride = model.reduceMotion ? 0 : Math.floor(world.clockSec * 7 * model.momentumMult) % 2;
  const sprite = stride === 0 ? heroA : heroB;
  const bob = model.reduceMotion ? 0 : Math.floor(Math.sin(world.clockSec * 14) * 0.6);
  // No rim pass: a second ring of the darkest ink reads as a blob at thumbnail size.
  drawSprite(ctx, sprite, view.heroX, view.groundY + bob, false);

  // The blade sweeps a real arc; nearest-neighbour rotation keeps it pixelated.
  // Winds up to -72 deg and finishes level at +10, contact height on the
  // creature: a wider sweep ended in the dirt past the monster.
  const t = world.swingAnim / SWING_ANIM_SEC;
  const angle = world.swingAnim > 0 ? -1.25 + (1 - t) * 1.42 : -0.3;
  const handX = view.heroX + 5;
  // The grip rides just above the belt, sized from the sprite so a taller hero keeps the blade at his hip.
  const handY = view.groundY + bob - Math.round(heroA.height * 0.42);
  drawSpriteRotated(ctx, sword, handX, handY, angle, 2, 2);

  if (world.swingAnim > 0) {
    // A crescent that tapers along the sweep and thins as the swing ends;
    // a ring of equal blobs reads as a broken sprite, not a blade trail.
    const steps = 10;
    for (let i = 0; i < steps; i++) {
      const along = i / (steps - 1);
      const a = angle + along * 1.15;
      const r = 13 + along * 5;
      // Thick at the blade, one pixel at the tail; brightest at the leading
      // edge and dimmer behind it.
      const thick = Math.max(1, Math.round((1 - along) * 3 * t));
      if (thick <= 0) continue;
      ctx.fillStyle = along < 0.35 ? '#ffffff' : along < 0.7 ? '#cbdbfc' : '#9badb7';
      ctx.fillRect(
        Math.floor(handX + Math.cos(a) * r),
        Math.floor(handY + Math.sin(a) * r),
        thick,
        thick,
      );
    }
  }
}

/** Draws the queue back to front and returns the lanes the engaged creature's health bar covers. */
export function drawMonsters(f: Frame): LaneSpan[] {
  const { ctx, model, view, world } = f;
  const sprites = f.sprites.skinned;
  let barSpans: LaneSpan[] = [];
  // Back to front, so the one being fought overlaps the line behind it.
  for (let i = world.queue.length - 1; i >= 0; i--) {
    const m = world.queue[i]!;
    const sprite = sprites.monsters[m.sprite] ?? sprites.monsters[0]!;
    const bob = model.reduceMotion ? 0 : Math.round(Math.sin(m.bob) * 1.2);
    // The engaged creature lunges at the hero rather than standing and
    // waiting to be hit; a struck one is kicked back. Both come off the
    // transform, so no extra sprite frames are needed to stop it reading
    // as a statue. Recoil already rides on m.x; only the lunge is added here.
    const lunge =
      i === 0 && !model.reduceMotion
        ? Math.round(Math.max(0, Math.sin(world.clockSec * 3.4 + m.bob)) ** 2 * 6)
        : model.reduceMotion
          ? 0
          : // Queued creatures sway on their own phase, so two of a kind never share a pose.
            Math.round(Math.sin(world.clockSec * 1.6 + m.bob * 2.3) * 2);
    const x = m.x + m.spread - lunge;
    if (x < -40 || x > view.worldRightX + 60) continue;
    // Its shadow, sprite and health bar all have to scale with it together.
    const scale = i === 0 ? leadScale(model) : 1;
    drawShadow(f, x, (sprite.width - 2) * scale, i === 0 ? ACTOR_SHADOW : undefined);
    drawSprite(ctx, sprite, x, view.groundY + bob, true, false, scale);
    // The flash lights the creature rather than replacing it: a solid white
    // silhouette for a third of all frames reads as a missing sprite.
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
    // A mid value, not another near-black: ring and trough both darker than
    // the turf is a solid black slab across a nearly-dead creature's shoulders.
    ctx.fillStyle = '#847e87';
    ctx.fillRect(bx, by, w, 2);
    // Never the accent: a yellow bar over a creature read as a wind-up
    // telegraph rather than as its health.
    ctx.fillStyle = remaining < 0.3 ? '#d95763' : '#6abe30';
    ctx.fillRect(bx, by, Math.max(0, Math.round(w * remaining)), 2);
  }
  return barSpans;
}

export function drawArcs(f: Frame): void {
  const { ctx, world } = f;
  const { coin } = f.sprites;
  const points = arcScreenPoints(f);
  // The coin itself is core's - it is catchable, so it is never hidden. Its
  // halo and ring are ours, and a dozen of them overlapping turned the kill
  // into a 180px wall of yellow with the creature somewhere inside it.
  const guard = pockets(world, f);
  // Loot in flight is the brightest thing in the scene; it should light the
  // air around it, not sit on the backdrop as a flat disc.
  for (const p of points) {
    if (inAnyPocket(guard, p.x, p.y)) continue;
    glowDisc(f, p.x, p.y, 7, LOOT_GLOW, 0.5);
  }

  for (const p of points) {
    const sprite = coin;
    // Squash the coin on its spin so it reads as tumbling metal.
    const squash = Math.abs(Math.cos(p.spin + world.clockSec * 9));
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
    const pulse = (Math.sin(world.clockSec * 12 + p.spin) + 1) / 2;
    ctx.fillStyle = pulse > 0.5 ? '#ffffff' : '#fbf236';
    const r = 7;
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2 + world.clockSec * 3;
      const rx = Math.floor(p.x + Math.cos(ang) * r);
      const ry = Math.floor(p.y + Math.sin(ang) * r);
      if (inAnyPocket(guard, rx, ry)) continue;
      ctx.fillRect(rx, ry, 1, 1);
    }
  }
}
