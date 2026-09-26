// The value every draw and step function reads for one frame, and the tuning
// they share. Nothing here is written during a draw; scene.ts assembles it.

import type { LootArc } from '@wanderblade/core';
import { formatNumber } from '../format';
import type { Viewport } from './geometry';
import type { RealmSkin } from './palette';
import type { BakedSprite } from './sprites';

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
   * True only in the Portal (DECISIONS.md #15): the scene swaps the road
   * diorama for an enclosed stone dungeon holding the guardian alone
   * (DECISIONS.md #58).
   */
  boss: boolean;
  /** Loot arcs in flight, straight off GameState — the scene never owns these. */
  arcs: readonly LootArc[];
  /** Engine clock the arcs are evaluated against. */
  timeSec: number;
}

/** Per-realm bakes; the hero, sword and loot never re-skin. */
export interface SkinnedSprites {
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

export interface SceneSprites {
  heroA: BakedSprite;
  heroB: BakedSprite;
  sword: BakedSprite;
  coin: BakedSprite;
  gem: BakedSprite;
  skinned: SkinnedSprites;
}

/** The subset of CanvasRenderingContext2D a flat-fill draw loop needs — narrow enough to fake in a test without a real canvas. */
export interface FillCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, w: number, h: number): void;
}

export interface Frame {
  ctx: CanvasRenderingContext2D;
  view: Viewport;
  model: SceneModel;
  skin: RealmSkin;
  sprites: SceneSprites;
  clockSec: number;
}

// --- Tuning shared across modules --------------------------------------

/** Air between blade and lead creature: just past the 19-unit tip so the lunge closes it, above 15 where the bodies touched at rest. */
export const BLADE_REACH = 20;
/** Guardian render scale in the dungeon — scale contrast against the hero is the point (DECISIONS.md #58). */
export const BOSS_SCALE = 2;
/** How far an actor's shadow is stepped toward night, against the props' 0.52. */
export const ACTOR_SHADOW = 0.74;
/** Seconds a thrown coin stays in the air, and so stays catchable. */
export const ARC_FLIGHT_SEC = 1.5;
export const LOOT_GLOW = '#fbf236';
/** Length of every scrolling prop track, in scene units. */
export const PROP_SPAN = 1400;
export const SWINGS_PER_SEC = 1.7;
export const SWING_ANIM_SEC = 0.32;

/** Deterministic [0,1) hash — prop layout must not shimmer between frames. */
export function hash01(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Seconds one animated swing stands for, at `attackSpeedMult`. */
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

/**
 * Compact number for in-world floaters, delegating past 1000 to the HUD's
 * formatter. A non-finite value says so in words: drawText skips glyphs its
 * face lacks, so an infinity sign would leave a silent hole in the frame.
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
