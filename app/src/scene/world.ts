// Everything the scene animates between frames: the monster queue, the hero's
// swing, particles, floaters, landed coins and the scroll of every parallax
// band. Pure state and its step; nothing here touches a canvas.

import { arcHitIndex, arcPositionAt, type ArcPoint, type LootArc } from '@wanderblade/core';
import { rosterAt, speciesIndexAt } from '../species';
import {
  BLADE_REACH,
  BOSS_SCALE,
  LOOT_GLOW,
  PROP_SPAN,
  SWING_ANIM_SEC,
  SWINGS_PER_SEC,
  TIER_SCALE,
  damagePerSwing,
  formatShort,
  hash01,
  strideGain,
  swingInterval,
  type Frame,
  type SceneModel,
} from './frame';
import {
  ARC_UNIT_PX,
  arcSpaceFromScene,
  bodyPocket,
  decayTo,
  heroPocket,
  mergeTargetIndex,
  nudgeFromPocket,
  peakFollow,
  sceneFromArcSpace,
  stepParticle,
  wrap,
  type Floater,
  type FloaterTier,
  type HeroPocket,
  type Particle,
  type PeakState,
} from './fx';
import { comboSpans, type ComboAnchor } from './combo';
import type { Viewport } from './geometry';
import { NUMERAL_FONT, textWidth } from './pixels';
import { LANE_BASE_OFFSET, LANE_COUNT, LANE_STEP, placeRun, type LaneSpan } from './textlane';

/** Ground scroll in scene units/sec at momentum zero. */
const WALK_SPEED = 34;
/** Fraction of the kill spent closing the distance; the rest is the fight. */
const APPROACH_FRAC = 0.3;
/** Seconds the guardian spends walking out of its portal. Then it stands: its
 * health is a ten-minute fight, and marching it in over that reads as a road
 * approach rather than a duel. */
const BOSS_ENTRANCE_SEC = 1.1;
const SHAKE_DECAY = 9;
const MAX_SHAKE = 3.2;
const FLOATER_LIFE = 1.05;
/** White, not LOOT_GLOW: the catch number sits inside the shower it reports and dissolved into it. */
const TEXT_CATCH = '#ffffff';
const TEXT_DAMAGE = '#ffffff';
/** Cold steel, never white or gold: white sparks out-shone the hero, and gold made a coin vanish into its own shower. */
const SPARK_COLORS = ['#9badb7', '#696a6a', '#847e87'];
/** Sparks at the gold readout when a streak lands. */
const COLLECT_SPARKS = [LOOT_GLOW, '#ffffff'];
const MISS_SPARKS = 5;
/** Floor on the gap between damage numbers, whatever the tap rate. */
const DAMAGE_TEXT_INTERVAL_SEC = 0.28;
export const STREAK_SEC = 0.5;
const PARTICLE_CAP = 220;
const FLOATER_CAP = 12;
/** Scene units within which a second payout joins the run already there. */
const MERGE_RADIUS = 26;
/** How long the zone banner hangs in the lane. */
const ZONE_BANNER_SEC = 1.6;
/**
 * How far behind the engaged monster the next one in line waits. Wide enough
 * that the third one rests clear of the docked panel's edge rather than being
 * sliced by it, and that the frame reads as a duel with a queue behind it
 * instead of as a crowd.
 */
const QUEUE_GAP = 55;
/** Monsters visible at once: the one being fought, plus the queue behind it. */
const QUEUE_DEPTH = 5;
/** Half a road creature past the blade's reach: where the engaged one stands, and so where its coins fly from. */
const KILL_INSET = 10;
/** Landed coins on the road at once; the oldest is collected early past this. */
const REST_CAP = 40;
/** A coin that left the list this long after landing was seen to land; an older one was an offline return. */
const LANDED_WINDOW_SEC = 1;

/** The guardian is baked after the realm's roster, so it owns the last slot. */
const bossSlot = (region: number): number => rosterAt(region).length;

/**
 * A coin that has landed and is sitting on the road before it flies to the
 * counter. Without the pause a kill's loot is on screen for a heartbeat and
 * the road reads as empty between fights.
 */
export interface Rest {
  x: number;
  y: number;
  age: number;
  gold: boolean;
  spin: number;
}

export interface Streak {
  x0: number;
  y0: number;
  age: number;
  gold: boolean;
  spin: number;
}

/** A zone marker riding the ground scroll past the hero. */
export interface Signpost {
  x: number;
  /** 1-based, as the log names it. */
  zone: number;
}

/** A creature in its death phase: still drawn, no longer fought. */
export interface Fallen {
  sprite: number;
  x: number;
  age: number;
}

/** Seconds a corpse takes to go down — inside core's 0.35 s kill floor, so the next duel is never hidden behind the last. */
export const DEATH_SEC = 0.14;

export interface Monster {
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

export interface World {
  clockSec: number;
  scrollGround: number;
  scrollTrees: number;
  scrollHillNear: number;
  scrollHillFar: number;
  scrollClouds: number;
  scrollRange: number;
  scrollFore: number;
  scrollBirds: number;
  /** Peak-held momentum and multiplier, so the readout never sags below the cap. */
  heldMomentum: PeakState;
  heldMult: PeakState;
  shake: number;
  swingCooldown: number;
  swingAnim: number;
  dustCooldown: number;
  damageTextCooldown: number;
  /** Scene clock the guardian appeared at, for its one walk out of the rift. */
  bossEnteredAtSec: number;
  /**
   * Index 0 is the monster the engine is actually killing; the rest are the
   * kills queued behind it, walking in. One duel in an empty field is what the
   * road looked like before, and it read as a paused screen.
   */
  queue: Monster[];
  fallen: Fallen[];
  signposts: Signpost[];
  lastZone: number;
  lastKills: number;
  deathBurstQueued: boolean;
  particles: Particle[];
  floaters: Floater[];
  rests: Rest[];
  streaks: Streak[];
  /** Arcs the last frame drew, so a coin that leaves the list can be told landed from caught. */
  seenArcs: readonly LootArc[];
  /** Catches the engine reported that the arc list has not yet been seen without. */
  catchesToAbsorb: number;
  /** Scene point loot streaks fly to — the HUD's gold readout. */
  collectAnchor: { x: number; y: number };
  /** Scene point the combo widget hangs from — the HUD's DPS readout. */
  comboAnchor: ComboAnchor;
  /** Scene coords of the last aimed strike, so a catch pays out where it was earned. */
  lastAim: { x: number; y: number } | null;
  /** Lanes the engaged monster's health bar sat across last frame; floaters route around them. */
  barSpans: LaneSpan[];
}

/** What the step and the spawners read but never write. */
export type WorldInput = Pick<Frame, 'view' | 'model' | 'skin' | 'sprites'>;

export function createWorld(): World {
  return {
    clockSec: 0,
    scrollGround: 0,
    scrollTrees: 0,
    scrollHillNear: 0,
    scrollHillFar: 0,
    scrollClouds: 0,
    scrollRange: 0,
    scrollFore: 0,
    scrollBirds: 0,
    heldMomentum: { value: 0, holdLeftSec: 0 },
    heldMult: { value: 1, holdLeftSec: 0 },
    shake: 0,
    swingCooldown: 0,
    swingAnim: 0,
    dustCooldown: 0,
    damageTextCooldown: 0,
    bossEnteredAtSec: 0,
    queue: [],
    fallen: [],
    signposts: [],
    lastZone: -1,
    lastKills: -1,
    deathBurstQueued: false,
    particles: [],
    floaters: [],
    rests: [],
    streaks: [],
    seenArcs: [],
    catchesToAbsorb: 0,
    collectAnchor: { x: 0, y: 0 },
    comboAnchor: null,
    lastAim: null,
    barSpans: [],
  };
}

// --- Spawning ----------------------------------------------------------

function addParticle(w: World, p: Particle): void {
  if (w.particles.length >= PARTICLE_CAP) w.particles.shift();
  w.particles.push(p);
}

function floaterSpan(f: Floater): LaneSpan {
  const w = textWidth(f.text, TIER_SCALE[f.tier], NUMERAL_FONT);
  return { x: f.x - w / 2, w, lane: f.lane };
}

/**
 * `y` on the incoming floater is a wish, not a position: it picks the lane to
 * start looking from, and the allocator moves it to the nearest free one.
 */
function addFloater(w: World, input: WorldInput, raw: Omit<Floater, 'lane'>): void {
  const { floaters } = w;
  const { groundY } = input.view;
  if (floaters.length >= FLOATER_CAP) floaters.shift();
  // The numeral face is uppercase-only: every string that reaches it is a
  // number plus a magnitude suffix, and folding here means no call site can
  // punch a hole in a payout by passing a lowercase 'a'.
  const f = { ...raw, text: raw.text.toUpperCase() };
  const width = textWidth(f.text, TIER_SCALE[f.tier], NUMERAL_FONT);
  const wish = Math.round((groundY - LANE_BASE_OFFSET - f.y) / LANE_STEP);
  const preferred = Math.max(0, Math.min(LANE_COUNT - 1, wish));
  const taken = floaters.map(floaterSpan);
  const evictable = taken.length;
  if (w.heldMomentum.value > 0.02) {
    taken.push(...comboSpans(w.heldMult.value, w.comboAnchor, input.view.worldRightX, groundY));
  }
  taken.push(...w.barSpans);
  const { lane, evict } = placeRun(f.x - width / 2, width, taken, LANE_COUNT, 3, preferred, evictable);
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
function payout(w: World, input: WorldInput, p: Payout): void {
  const { floaters } = w;
  const at = mergeTargetIndex(floaters, p.tier, p.x, MERGE_RADIUS);
  const total = at < 0 ? p.value : floaters[at]!.value + p.value;
  if (at >= 0) floaters.splice(at, 1);
  addFloater(w, input, {
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

function burst(w: World, x: number, y: number, count: number, colors: string[], speed: number): void {
  const { clockSec } = w;
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + hash01(clockSec * 60 + i) * 0.9;
    const s = speed * (0.45 + hash01(i * 7.3 + clockSec) * 0.8);
    addParticle(w, {
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
function enqueueMonster(w: World, input: WorldInput, killIndex: number): void {
  w.queue.push({
    sprite: speciesIndexAt(input.model.region, killIndex),
    x: input.view.worldRightX + 30,
    flash: 0,
    recoil: 0,
    bob: hash01(killIndex) * Math.PI * 2,
    spread: 0,
  });
}

/** The guardian renders at BOSS_SCALE (DECISIONS.md #58); every place that reasons about its on-screen size shares this. */
export function leadScale(model: SceneModel): number {
  return model.boss ? BOSS_SCALE : 1;
}

/** Half the lead's sprite, plus whatever its group spread pulls forward. */
function engageInset(w: World, input: WorldInput): number {
  const lead = w.queue[0];
  if (!lead) return 12;
  const sprite = input.sprites.skinned.monsters[lead.sprite];
  return Math.round((sprite ? sprite.width * leadScale(input.model) : 20) / 2) - lead.spread;
}

/**
 * The strip the fight is staged in, from the hero's back foot to the far
 * edge of the creature he is swinging at. Nothing on the ground plane may
 * stand in it: a pine between the two bodies is exactly the clutter that
 * made the frame read as a collision rather than a duel.
 */
export function fightBand(w: World, input: WorldInput): { x0: number; x1: number } {
  const lead = w.queue[0];
  const sprite = lead ? input.sprites.skinned.monsters[lead.sprite] : undefined;
  const width = sprite ? sprite.width : 20;
  const cx = lead ? lead.x + lead.spread : input.view.heroX + BLADE_REACH;
  return { x0: input.view.heroX - 12, x1: cx + width / 2 + 6 };
}

/** The box no spark, coin, mote or number may be drawn inside. */
export function pocket(input: WorldInput): HeroPocket {
  const { heroA } = input.sprites;
  return heroPocket(input.view.heroX, input.view.groundY, heroA.width, heroA.height);
}

/**
 * Hero and the creature under the blade. Both silhouettes have to survive the
 * effect that celebrates the hit; a frame where the victim cannot be named is
 * the frame that stops answering who is hitting whom.
 */
export function pockets(w: World, input: WorldInput): HeroPocket[] {
  const out = [pocket(input)];
  const lead = w.queue[0];
  const sprite = lead ? input.sprites.skinned.monsters[lead.sprite] : null;
  if (lead && sprite) {
    const scale = leadScale(input.model);
    out.push(bodyPocket(lead.x + lead.spread, input.view.groundY, sprite.width * scale, sprite.height * scale));
  }
  return out;
}

function killMonster(w: World, input: WorldInput): void {
  const { skin, view } = input;
  const lead = w.queue[0];
  const x = lead ? lead.x + lead.spread : view.heroX + BLADE_REACH;
  const y = view.groundY;
  burst(w, x, y - 10, 14, [skin.monBody, skin.monBodyDark, ...SPARK_COLORS], 130);
  // One burst at the contact pixel; a crossed white mark reads as a mouse cursor.
  burst(w, x, y - 12, 10, ['#ffffff', ...SPARK_COLORS], 62);
  w.shake = Math.min(MAX_SHAKE, w.shake + 2.1);

  const dead = w.queue.shift();
  if (dead) w.fallen.push({ sprite: dead.sprite, x, age: 0 });
  // Damage numbers belong to the thing that took the hit; a corpse's number
  // left hanging in the air reads as unowned UI.
  for (let i = w.floaters.length - 1; i >= 0; i--) {
    if (w.floaters[i]!.owned) w.floaters.splice(i, 1);
  }
}

/** Swing the blade. Returns whether a creature was in reach to take the hit. */
function swing(w: World, input: WorldInput, fromStrike: boolean): boolean {
  const { model, view } = input;
  // At a maxed speed node and full momentum the cadence outruns a fixed
  // 0.32s animation, and overlapping swings read as a blur rather than as
  // faster hits. The stroke shortens to fit its own interval instead.
  w.swingAnim = Math.min(SWING_ANIM_SEC, swingInterval(model.attackSpeedMult) * 0.9);
  const lead = w.queue[0];
  if (!lead || lead.x - engageInset(w, input) > view.heroX + BLADE_REACH + 16) return false;

  const leadSprite = input.sprites.skinned.monsters[lead.sprite];
  // Contact and damage-number placement have to land on the scaled silhouette, not the sprite's raw box.
  const scale = leadScale(model);
  const leadHeight = leadSprite ? leadSprite.height * scale : 16;
  // On the creature's body, past its near edge: a burst beside the hero beats
  // his silhouette even when it paints behind him.
  const contactX = lead.x + lead.spread + Math.round(leadSprite ? leadSprite.width * scale * 0.2 : 3);
  const contactY = view.groundY - Math.round(leadHeight * 0.55);
  lead.flash = 0.05;
  lead.recoil = fromStrike ? 5 : 3;
  burst(w, contactX, contactY, fromStrike ? 9 : 5, SPARK_COLORS, 105);
  w.shake = Math.min(MAX_SHAKE, w.shake + (fromStrike ? 1.5 : 0.7));

  // Only the player's own strikes get a number: auto-swings land several a
  // second and numbering them buries the one hit the player caused.
  if (!fromStrike) return true;
  // A fast tapper out-runs the floater's lifetime and the numbers pile into
  // an illegible column; the flash and sparks already confirm every hit.
  if (w.damageTextCooldown > 0) return true;
  w.damageTextCooldown = DAMAGE_TEXT_INTERVAL_SEC;
  // Honest: real DPS across the interval this swing represents.
  const damage = damagePerSwing(model.dps, model.attackSpeedMult);
  if (damage < 0.05) return true;
  // Above the monster's head, not beside its ribs: the blade sweeps through
  // contact height and a number there is inside the arc.
  payout(w, input, {
    x: lead.x + lead.spread,
    y: view.groundY - leadHeight - 6,
    life: 0.5,
    value: damage,
    label: (v) => formatShort(v),
    color: TEXT_DAMAGE,
    tier: 'damage',
    owned: true,
  });
  return true;
}

/**
 * A whiff: a short steel slash at the tap point, cut diagonally so it cannot
 * be read as the round burst a hit makes. Kept out of the hero's pocket.
 */
function missAt(w: World, input: WorldInput, x: number, y: number): void {
  const at = nudgeFromPocket(pocket(input), x, y);
  for (let i = 0; i < MISS_SPARKS; i++) {
    const along = i / (MISS_SPARKS - 1) - 0.5;
    addParticle(w, {
      x: at.x + along * 10,
      y: at.y - along * 6,
      vx: 70 + along * 40,
      vy: -30 - along * 30,
      age: 0,
      life: 0.14 + hash01(i * 2.3 + w.clockSec) * 0.08,
      size: 1,
      color: SPARK_COLORS[i % SPARK_COLORS.length]!,
      gravity: 0.2,
    });
  }
}

/** Scene x the engaged creature is killed at: arcs launch here and the road ahead runs right of it. */
export function killPointX(view: Viewport): number {
  return view.heroX + BLADE_REACH + KILL_INSET;
}

/** A tap's scene point into core's arc space. The exact inverse of fromArcSpace, which is what draws the coins. */
export function toArcSpace(view: Viewport, px: number, py: number): ArcPoint {
  return arcSpaceFromScene(px, py, killPointX(view), view.arcBaseY, ARC_UNIT_PX);
}

export function fromArcSpace(view: Viewport, ax: number, ay: number): { x: number; y: number } {
  return sceneFromArcSpace(ax, ay, killPointX(view), view.arcBaseY, ARC_UNIT_PX);
}

/** Every live arc's scene position, straight from core's trajectory. */
export function arcScreenPoints(input: WorldInput): { x: number; y: number; spin: number }[] {
  const { model, view } = input;
  const out: { x: number; y: number; spin: number }[] = [];
  for (const arc of model.arcs) {
    const a = arcPositionAt(arc, model.timeSec);
    if (!a) continue;
    const p = fromArcSpace(view, a.x, a.y);
    out.push({ x: p.x, y: p.y, spin: arc.expiresAtSec * 9 });
  }
  return out;
}

/**
 * Arc-space point of the live arc nearest the hero, if any. A keyboard or
 * held strike has no pointer to aim with, and an unaimed strike can never
 * catch: keyboard play was hard-capped at x1.43 against touch's x2.0 while
 * ACTIVE-PLAY.md promises holding reaches the same ceiling as tapping.
 */
function autoAim(input: WorldInput): ArcPoint | null {
  const { view } = input;
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const p of arcScreenPoints(input)) {
    const dx = p.x - view.heroX;
    const dy = p.y - view.arcBaseY;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best ? toArcSpace(view, best.x, best.y) : null;
}

export interface StrikeResult {
  /** Where the strike landed in core's arc space, or null when it had no position. */
  aim: ArcPoint | null;
  /** No creature in reach and, by core's own hit test, no coin under the aim. */
  missed: boolean;
}

/**
 * A Strike at scene point `at`, or unaimed when null. The engine decides the
 * catch on its next tick; the whiff is read now off the same hit test, on the
 * arcs as drawn, because a miss that answers a tenth of a second late reads
 * as no answer at all.
 */
export function strike(w: World, input: WorldInput, at: { x: number; y: number } | null): StrikeResult {
  const { model, view } = input;
  // Restart the auto-attack cadence rather than zeroing it — zero would go
  // negative on the very next step() and fire an immediate duplicate swing.
  w.swingCooldown = 1 / SWINGS_PER_SEC;
  const connected = swing(w, input, true);

  const aim = at ? toArcSpace(view, at.x, at.y) : autoAim(input);
  const point = at ?? (aim ? fromArcSpace(view, aim.x, aim.y) : null);
  w.lastAim = point;
  const caught = aim !== null && arcHitIndex(model.arcs, aim, model.timeSec) >= 0;
  const missed = !connected && !caught;
  if (missed) {
    const spark = point ?? { x: view.heroX + BLADE_REACH, y: view.groundY - 14 };
    missAt(w, input, spark.x, spark.y);
  }
  return { aim, missed };
}

/**
 * The engine caught an arc. The number is the bonus it actually paid, and it
 * lands where the player tapped: paying it out at the hero meant tapping A
 * and reading the reward at B, so the loop never visibly closed.
 */
export function catchArc(w: World, input: WorldInput, bonusGold: number, upgraded: boolean): void {
  const { skin, view } = input;
  w.catchesToAbsorb++;
  const guard = pocket(input);
  const aim = w.lastAim ?? { x: view.heroX + 24, y: view.groundY - 30 };
  const at = nudgeFromPocket(guard, aim.x, aim.y);
  payout(w, input, {
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
    addFloater(w, input, {
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
  burst(w, at.x, at.y + 4, 12, ['#ffffff', skin.accent, LOOT_GLOW], 150);
  w.shake = Math.min(MAX_SHAKE, w.shake + 1.2);
}

// --- Simulation --------------------------------------------------------

function advanceScroll(w: World, input: WorldInput, speed: number, dtSec: number): void {
  const { vw } = input.view;
  w.scrollGround = wrap(w.scrollGround + speed * dtSec, PROP_SPAN);
  w.scrollTrees = wrap(w.scrollTrees + speed * 0.55 * dtSec, PROP_SPAN);
  w.scrollHillNear = wrap(w.scrollHillNear + speed * 0.28 * dtSec, vw * 4);
  w.scrollHillFar = wrap(w.scrollHillFar + speed * 0.13 * dtSec, vw * 4);
  w.scrollClouds = wrap(w.scrollClouds + speed * 0.05 * dtSec, vw * 3);
  w.scrollRange = wrap(w.scrollRange + speed * 0.07 * dtSec, vw * 4);
  // Faster than the ground: the foreground is nearer than the road is.
  w.scrollFore = wrap(w.scrollFore + speed * 1.75 * dtSec, PROP_SPAN);
  w.scrollBirds = wrap(w.scrollBirds + (speed * 0.12 + 9) * dtSec, vw * 3);
}

/**
 * Coins that left the engine's list since last frame. A catch was announced
 * through catchArc and is absorbed; anything else landed, and sits on the road
 * where core's trajectory put it down until the hero walks over it.
 */
function settleArcs(w: World, input: WorldInput): void {
  const { model, view } = input;
  const live = new Set(model.arcs);
  for (const arc of w.seenArcs) {
    if (live.has(arc)) continue;
    if (w.catchesToAbsorb > 0) {
      w.catchesToAbsorb--;
      continue;
    }
    const since = model.timeSec - arc.expiresAtSec;
    if (since < 0 || since > LANDED_WINDOW_SEC) continue;
    const at = fromArcSpace(view, arc.landingX, 0);
    if (w.rests.length >= REST_CAP) {
      const oldest = w.rests.shift()!;
      w.streaks.push({ x0: oldest.x, y0: oldest.y, age: 0, gold: oldest.gold, spin: oldest.spin });
    }
    w.rests.push({ x: at.x, y: at.y, age: 0, gold: arc.gear === null, spin: arc.expiresAtSec * 9 });
  }
  w.seenArcs = model.arcs;
}

/** A kill landed in the engine — the scene never decides this. Offline returns jump thousands of kills; play one death. */
function playKills(w: World, input: WorldInput): void {
  const { model } = input;
  if (w.lastKills < 0) {
    w.lastKills = model.kills;
  } else if (model.kills > w.lastKills) {
    w.deathBurstQueued = true;
    w.lastKills = model.kills;
  }
  if (w.deathBurstQueued) {
    w.deathBurstQueued = false;
    killMonster(w, input);
  }
}

/**
 * The engine crossed a zone line — the scene never decides this. A signpost
 * walks in from the road ahead and the lane announces it; an offline return
 * that jumped forty zones plants one post, not forty.
 */
function playZone(w: World, input: WorldInput): void {
  const { model, view } = input;
  if (w.lastZone < 0 || model.boss) {
    w.lastZone = model.zone;
    return;
  }
  if (model.zone === w.lastZone) return;
  const advanced = model.zone > w.lastZone;
  w.lastZone = model.zone;
  if (!advanced) return;
  w.signposts.push({ x: view.worldRightX + 12, zone: model.zone + 1 });
  addFloater(w, input, {
    x: view.heroX + 30,
    y: view.groundY - 60,
    age: 0,
    life: ZONE_BANNER_SEC,
    text: `ZONE ${model.zone + 1}`,
    color: '#ffffff',
    tier: 'payout',
    owned: false,
    value: 0,
  });
}

/** The road keeps QUEUE_DEPTH creatures walking in; the Portal holds one guardian, and it stays. */
function fillQueue(w: World, input: WorldInput): void {
  const { model, view } = input;
  const { queue } = w;
  if (model.boss) {
    if (queue.length !== 1 || queue[0]!.sprite !== bossSlot(model.region)) {
      queue.length = 0;
      queue.push({ sprite: bossSlot(model.region), x: view.worldRightX + 30, flash: 0, recoil: 0, bob: 0, spread: 0 });
      w.bossEnteredAtSec = w.clockSec;
    }
  } else {
    if (queue[0]?.sprite === bossSlot(model.region)) queue.length = 0;
    while (queue.length < QUEUE_DEPTH) enqueueMonster(w, input, model.kills + queue.length);
  }
}

/**
 * The lead's position follows the engine's kill progress so it arrives as
 * the kill resolves. The guardian instead walks out over BOSS_ENTRANCE_SEC
 * and stands: a ten-minute march on remaining health reads as a road approach.
 */
function placeQueue(w: World, input: WorldInput, dtSec: number): void {
  const { model, view } = input;
  const closing = model.boss
    ? Math.min(1, (w.clockSec - w.bossEnteredAtSec) / BOSS_ENTRANCE_SEC)
    : null;
  const t = closing ?? Math.min(1, model.killProgress / APPROACH_FRAC);
  const eased = 1 - (1 - t) * (1 - t);
  // Stop the creature's near edge at the blade, not its centre: a fixed
  // centre-to-centre gap put a wide crawler inside the hero and a narrow one
  // out of reach.
  const stop = view.heroX + BLADE_REACH + engageInset(w, input);
  const leadTarget = view.worldRightX + 20 + (stop - (view.worldRightX + 20)) * eased;
  for (let i = 0; i < w.queue.length; i++) {
    const m = w.queue[i]!;
    const target = i === 0 ? leadTarget : leadTarget + i * QUEUE_GAP;
    m.x = i === 0 ? target + m.recoil : decayTo(m.x, target, 2.4, dtSec);
    m.recoil = decayTo(m.recoil, 0, 12, dtSec);
    m.flash = Math.max(0, m.flash - dtSec);
    m.bob += dtSec * 7;
  }
}

/** Boot dust: the ground-speed read. Frequency tracks momentum, so a hot streak visibly kicks up more of it. */
function kickDust(w: World, input: WorldInput, dtSec: number): void {
  const { model, skin, view } = input;
  w.dustCooldown -= dtSec;
  if (w.dustCooldown > 0 || model.reduceMotion) return;
  const { clockSec } = w;
  w.dustCooldown = 0.16 / model.momentumMult;
  addParticle(w, {
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

/** Auto-attack cadence off core's own attack speed, so the Ascendancy speed node is visible in the blade. */
function autoSwing(w: World, input: WorldInput, dtSec: number): void {
  w.swingCooldown -= dtSec * input.model.attackSpeedMult;
  if (w.swingCooldown <= 0) {
    w.swingCooldown += 1 / SWINGS_PER_SEC;
    if (w.queue.length > 0) swing(w, input, false);
  }
}

function ageEffects(w: World, heroX: number, speed: number, dtSec: number): void {
  const { particles, floaters, rests, streaks } = w;
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
    // Landed coins ride the road back to the hero, who picks them up as he walks over them.
    r.x -= speed * dtSec;
    if (r.x <= heroX || r.x < -10) {
      streaks.push({ x0: r.x, y0: r.y, age: 0, gold: r.gold, spin: r.spin });
      rests.splice(i, 1);
    }
  }

  for (let i = w.fallen.length - 1; i >= 0; i--) {
    const c = w.fallen[i]!;
    c.age += dtSec;
    if (c.age >= DEATH_SEC) w.fallen.splice(i, 1);
  }

  for (let i = w.signposts.length - 1; i >= 0; i--) {
    const sign = w.signposts[i]!;
    sign.x -= speed * dtSec;
    if (sign.x < -20) w.signposts.splice(i, 1);
  }

  for (let i = streaks.length - 1; i >= 0; i--) {
    const s = streaks[i]!;
    s.age += dtSec;
    s.spin += dtSec * 14;
    if (s.age >= STREAK_SEC) {
      burst(w, w.collectAnchor.x, w.collectAnchor.y, 5, COLLECT_SPARKS, 60);
      streaks.splice(i, 1);
    }
  }
}

export function step(w: World, input: WorldInput, dtSec: number): void {
  const { model } = input;
  w.clockSec += dtSec;
  w.heldMomentum = peakFollow(w.heldMomentum, model.momentum, dtSec);
  w.heldMult = peakFollow(w.heldMult, model.momentumMult, dtSec);

  const speed = WALK_SPEED * strideGain(model.momentumMult);
  advanceScroll(w, input, speed, dtSec);

  w.shake = decayTo(w.shake, 0, SHAKE_DECAY, dtSec);
  w.damageTextCooldown = Math.max(0, w.damageTextCooldown - dtSec);
  w.swingAnim = Math.max(0, w.swingAnim - dtSec);

  playKills(w, input);
  playZone(w, input);
  settleArcs(w, input);
  fillQueue(w, input);
  placeQueue(w, input, dtSec);
  kickDust(w, input, dtSec);
  autoSwing(w, input, dtSec);
  ageEffects(w, input.view.heroX, speed, dtSec);
}
