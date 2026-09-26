// World-anchored HUD and effects drawn over the actors: floaters, the combo
// meter, landed coins and their streaks to the gold readout, particles.

import { COMBO_GAP, COMBO_METER_W, COMBO_SEGS, COMBO_SEG_W, comboBox, comboLabel } from './combo';
import { TIER_SCALE, type Frame } from './frame';
import { floaterOffsetY, inAnyPocket, lifeRemaining } from './fx';
import { OUTLINE_INK, mixHex } from './palette';
import { NUMERAL_FONT, textWidth } from './pixels';
import { drawSprite, drawText } from './sprites';
import { COMBO_LANE, FLOATER_RISE, laneBaseline } from './textlane';
import { STREAK_SEC, pockets } from './world';

export function drawMomentumMeter(f: Frame): void {
  const { ctx, model, skin, world } = f;
  // Hidden at rest: a full-width empty bar labelled x1.0 is the frame
  // announcing that nothing is happening.
  if (world.heldMomentum.value <= 0.02) return;
  const label = comboLabel(world.heldMult.value);
  const labelW = textWidth(label, 1, NUMERAL_FONT);
  const box = comboBox(world.heldMult.value);
  const y = laneBaseline(COMBO_LANE, f.view.groundY);
  const hot = world.heldMomentum.value > 0.7;

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
  const filled = Math.min(COMBO_SEGS, Math.round(world.heldMomentum.value * COMBO_SEGS));
  // At rest a row of dark cells reads as broken, not idle. A slow chase
  // light across the empty cells reads as armed and waiting.
  const chase = model.reduceMotion ? -1 : Math.floor(world.clockSec * 6) % COMBO_SEGS;
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

export function drawRests(f: Frame): void {
  const { ctx, world } = f;
  const { coin, gem } = f.sprites;
  for (const r of world.rests) {
    const sprite = r.gold ? coin : gem;
    // A short settling bounce, then it sits and glints.
    const t = Math.min(1, r.age / 0.22);
    const bounce = Math.round(Math.abs(Math.sin(t * Math.PI)) * -5 * (1 - t));
    drawSprite(ctx, sprite, r.x, r.y + bounce + sprite.height / 2);
    if (Math.sin(world.clockSec * 9 + r.spin) > 0.7) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.floor(r.x + 3), Math.floor(r.y - 6), 1, 1);
    }
  }
}

export function drawStreaks(f: Frame): void {
  const { ctx, world } = f;
  const { coin, gem } = f.sprites;
  for (const s of world.streaks) {
    const t = Math.min(1, s.age / STREAK_SEC);
    const eased = t * t;
    const x = s.x0 + (world.collectAnchor.x - s.x0) * eased;
    // Lift out of the ground before homing, so it reads as a throw not a slide.
    const y = s.y0 + (world.collectAnchor.y - s.y0) * eased - Math.sin(t * Math.PI) * 18;
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

export function drawParticles(f: Frame): void {
  const { ctx, world } = f;
  const guard = pockets(world, f);
  for (const p of world.particles) {
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

export function drawFloaters(f: Frame): void {
  const { ctx, world } = f;
  for (const fl of world.floaters) {
    const life = lifeRemaining(fl.age, fl.life);
    if (life <= 0) continue;
    const y = laneBaseline(fl.lane, f.view.groundY) + floaterOffsetY(fl.age, fl.life, FLOATER_RISE);
    drawText(ctx, fl.text, fl.x, y, {
      scale: TIER_SCALE[fl.tier],
      fill: fl.color,
      outline: OUTLINE_INK,
      font: NUMERAL_FONT,
    });
  }
}
