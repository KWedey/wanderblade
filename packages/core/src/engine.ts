// The deterministic engine: state creation, purchases, the event-stepped
// `advance` loop, boss resolution, serialization, and recap summarization.
//
// Determinism contract (see docs/DECISIONS.md #6):
//   advance(s, a + b) produces the exact same state AND events as
//   advance(advance(s, a), b). All randomness flows through the seeded RNG,
//   consumed once per kill in kill-index order; the clock advances by kill time
//   (event-stepped), and sub-kill leftover time is carried on state.carrySec.

import {
  dropChance,
  gearPowerBase,
  gearPowerRate,
  RARITIES,
  RARITY_MULTIPLIERS,
  RARITY_WEIGHTS,
  GEAR_SLOTS,
  killsPerZone,
  zonesPerRegion,
  regionsCount,
  leaguePerKill,
  autoChallengeReadiness,
  bossRetryCooldownSec,
  minKillTimeSec,
  SKILLS,
} from './constants';
import { enemyGold, enemyHp, heroDps, levelCost, readiness, skillCost } from './formulas';
import { createRng, type Rng } from './rng';
import type {
  EventLog,
  GameEvent,
  GameState,
  GearSlot,
  Rarity,
  Recap,
} from './types';

/**
 * Max raw events retained per advance. A 10-day offline advance can be millions
 * of kills; retaining an event object each would be pathological. Beyond the cap
 * the granular event stream is truncated, but the aggregate `recap` (attached to
 * the returned array and mirrored in state.lifetime) stays exact.
 */
export const EVENT_CAP = 50_000;

/** Fresh state for a new run seeded with `seed`. */
export function initialState(seed: number): GameState {
  const s = seed >>> 0;
  const state: GameState = {
    seed: s,
    rngState: s,
    timeSec: 0,
    nextKillAtSec: 0,
    killIndex: 0,
    zone: 0,
    killsInZone: 0,
    leagues: 0,
    gold: 0,
    hero: { level: 0, skills: { cleave: 0, warcry: 0 } },
    gear: { weapon: null, armor: null, trinket: null },
    gate: { atGate: false, cooldownUntilSec: 0 },
    lifetime: { kills: 0, goldEarned: 0, bossKills: 0 },
    worldsEdgeReached: false,
  };
  // Prime the kill schedule: the first enemy completes at timeSec + killTime.
  state.nextKillAtSec = state.timeSec + killTime(state);
  return state;
}

/**
 * Seconds to kill the enemy in the hero's current zone at current DPS, clamped
 * to the walking floor `minKillTimeSec`. Also guards the endless-scaling tail:
 * past floating-point overflow hp/dps becomes Infinity/NaN, and clamping keeps
 * the road moving instead of stalling.
 */
export function killTime(state: GameState): number {
  const kt = enemyHp(state.zone) / heroDps(state);
  if (!Number.isFinite(kt) || kt < minKillTimeSec) return minKillTimeSec;
  return kt;
}

// --- Purchases -----------------------------------------------------------

/** Buy the next hero level. Mutates; returns false (no-op) if unaffordable. */
export function buyHeroLevel(state: GameState): boolean {
  const cost = levelCost(state.hero.level);
  if (state.gold < cost) return false;
  state.gold -= cost;
  state.hero.level += 1;
  return true;
}

/**
 * Buy the next rank of skill `id`. Mutates; returns false if the skill is
 * unknown, not yet unlocked (hero level too low), or unaffordable.
 */
export function buySkill(state: GameState, id: string): boolean {
  const def = SKILLS[id];
  if (!def) return false;
  if (state.hero.level < def.unlockLevel) return false;
  const current = state.hero.skills[id] ?? 0;
  if (current >= def.maxLevel) return false; // hard rank cap — skillMult is bounded
  const cost = skillCost(current);
  if (state.gold < cost) return false;
  state.gold -= cost;
  state.hero.skills[id] = current + 1;
  return true;
}

// --- RNG-driven helpers --------------------------------------------------

function pickSlot(r: number): GearSlot {
  const idx = Math.min(GEAR_SLOTS.length - 1, Math.floor(r * GEAR_SLOTS.length));
  // GEAR_SLOTS is a fixed 3-tuple; idx is always in-range.
  return GEAR_SLOTS[idx] as GearSlot;
}

function pickRarity(r: number): Rarity {
  const x = r * 100; // weights sum to 100
  let acc = 0;
  for (const rarity of RARITIES) {
    acc += RARITY_WEIGHTS[rarity];
    if (x < acc) return rarity;
  }
  return 'epic';
}

// --- advance internals ---------------------------------------------------

function emptyRecap(seconds: number): Recap {
  return {
    seconds,
    kills: 0,
    goldEarned: 0,
    drops: 0,
    equips: 0,
    zonesEntered: 0,
    regionsEntered: 0,
    bossWins: 0,
    leaguesTraveled: 0,
  };
}

function emit(events: GameEvent[], e: GameEvent): void {
  if (events.length < EVENT_CAP) events.push(e);
}

/** Win the current gate's boss: award the star, open the road, move on. */
function winBoss(
  state: GameState,
  events: GameEvent[],
  recap: Recap,
  clock: number,
): void {
  const region = Math.floor(state.zone / zonesPerRegion);
  state.lifetime.bossKills += 1;
  state.gate.atGate = false;
  state.gate.cooldownUntilSec = 0;
  recap.bossWins += 1;
  emit(events, { type: 'bossWin', timeSec: clock, region, zone: state.zone });

  const nextZone = (region + 1) * zonesPerRegion;
  if (region >= regionsCount - 1 && !state.worldsEdgeReached) {
    // The defined realm's finale boss (region index regionsCount-1, World's Edge)
    // falls → set the flag and emit the one-time 'edge' event. Gates continue past
    // here (see completeZone); this fires exactly once, on the first crossing.
    state.worldsEdgeReached = true;
    emit(events, { type: 'edge', timeSec: clock, zone: nextZone });
  }
  state.zone = nextZone;
  state.killsInZone = 0;
  recap.regionsEntered += 1;
  emit(events, { type: 'region', timeSec: clock, region: region + 1, zone: nextZone });
}

/** Auto-challenge fires offline too: at a gate, ready, and off cooldown. */
function tryAutoChallenge(
  state: GameState,
  events: GameEvent[],
  recap: Recap,
  clock: number,
): void {
  if (!state.gate.atGate) return;
  if (clock < state.gate.cooldownUntilSec) return;
  if (readiness(state) >= autoChallengeReadiness) {
    // Auto-challenge only fires at >= 1.1, and a win needs only >= 1.0, so it
    // always wins — no auto-failure path.
    winBoss(state, events, recap, clock);
  }
}

/** A cleared zone: form a gate (region end) or step into the next zone. */
function completeZone(
  state: GameState,
  events: GameEvent[],
  recap: Recap,
  clock: number,
): void {
  const z = state.zone;
  const region = Math.floor(z / zonesPerRegion);
  const isRegionEnd = z % zonesPerRegion === zonesPerRegion - 1;

  if (isRegionEnd) {
    // Every region ends at a gate — including the endless tail beyond World's
    // Edge. Park here: keep farming this zone (gold + drops), leagues pause until
    // the boss falls. Gates are the anti-runaway wall as much as the anti-stall
    // one: they force gear to catch up before the road can continue.
    state.gate.atGate = true;
    emit(events, { type: 'gate', timeSec: clock, region, zone: z });
    return;
  }

  // Normal step forward within a region.
  const nextZone = z + 1;
  state.zone = nextZone;
  state.killsInZone = 0;
  recap.zonesEntered += 1;
  emit(events, {
    type: 'zone',
    timeSec: clock,
    zone: nextZone,
    region: Math.floor(nextZone / zonesPerRegion),
  });
  if (nextZone % zonesPerRegion === 0) {
    const newRegion = nextZone / zonesPerRegion;
    recap.regionsEntered += 1;
    emit(events, { type: 'region', timeSec: clock, region: newRegion, zone: nextZone });
  }
}

/** Process exactly one kill: gold, drop roll, then leagues/zone (unless parked). */
function processKill(
  state: GameState,
  rng: Rng,
  events: GameEvent[],
  recap: Recap,
  clock: number,
): void {
  state.killIndex += 1;
  const z = state.zone;

  const gold = enemyGold(z);
  state.gold += gold;
  state.lifetime.kills += 1;
  state.lifetime.goldEarned += gold;
  recap.kills += 1;
  recap.goldEarned += gold;
  emit(events, { type: 'kill', timeSec: clock, zone: z, killIndex: state.killIndex, gold });

  // Drop roll — one RNG draw every kill (keeps the stream keyed to killIndex),
  // two more only when a drop actually occurs.
  if (rng.next() < dropChance) {
    const slot = pickSlot(rng.next());
    const rarity = pickRarity(rng.next());
    const power = gearPowerBase * Math.pow(gearPowerRate, z) * RARITY_MULTIPLIERS[rarity];
    recap.drops += 1;
    const current = state.gear[slot];
    const equipped = current === null || power > current.power;
    emit(events, { type: 'drop', timeSec: clock, zone: z, slot, rarity, power, equipped });
    if (equipped) {
      const previousPower = current ? current.power : 0;
      state.gear[slot] = { power, rarity, zone: z };
      recap.equips += 1;
      emit(events, { type: 'equip', timeSec: clock, slot, power, rarity, previousPower });
    }
  }

  // Leagues + zone progress only while marching (paused while parked at a gate;
  // gate income — gold and drops above — keeps flowing).
  if (!state.gate.atGate) {
    state.leagues += leaguePerKill;
    recap.leaguesTraveled += leaguePerKill;
    state.killsInZone += 1;
    if (state.killsInZone >= killsPerZone) {
      completeZone(state, events, recap, clock);
    }
  }
}

/**
 * THE engine. Advances `state` by `seconds` of game time, event-stepped per
 * kill. Mutates `state`; returns the events that occurred, with the exact recap
 * attached (see EventLog). Deterministic and offline-safe: auto-challenge,
 * zone/region transitions, and endless post-edge scaling all happen in here.
 */
export function advance(state: GameState, seconds: number): GameEvent[] {
  const events: EventLog = [];
  const recap = emptyRecap(Math.max(0, seconds));

  if (!(seconds > 0)) {
    events.recap = recap;
    return events;
  }

  const rng = createRng(state.rngState);
  const target = state.timeSec + seconds;

  // Process every kill scheduled to complete at or before the target time. The
  // schedule (state.nextKillAtSec) is absolute and accumulated one kill at a
  // time across all advances, so splitting the interval processes the exact same
  // kills against the exact same target — the determinism guarantee.
  while (state.nextKillAtSec <= target) {
    const clock = state.nextKillAtSec;
    processKill(state, rng, events, recap, clock);
    if (state.gate.atGate) {
      tryAutoChallenge(state, events, recap, clock);
    }
    // Schedule the next kill (in the possibly-new zone/region).
    state.nextKillAtSec += killTime(state);
  }

  state.timeSec = target;
  state.rngState = rng.getState();
  events.recap = recap;
  return events;
}

/**
 * Explicit (player-initiated) boss challenge. Wins iff readiness >= 1.0.
 * Respects the retry cooldown and requires being parked at a gate.
 * Returns the outcome plus the events emitted.
 */
export function challengeBoss(state: GameState): { won: boolean; events: GameEvent[] } {
  const events: GameEvent[] = [];
  if (!state.gate.atGate) return { won: false, events };
  if (state.timeSec < state.gate.cooldownUntilSec) return { won: false, events };

  const region = Math.floor(state.zone / zonesPerRegion);
  const r = readiness(state);
  if (r >= 1.0) {
    winBoss(state, events, emptyRecap(0), state.timeSec);
    return { won: true, events };
  }
  state.gate.cooldownUntilSec = state.timeSec + bossRetryCooldownSec;
  emit(events, {
    type: 'bossFail',
    timeSec: state.timeSec,
    region,
    zone: state.zone,
    readiness: r,
    cooldownUntilSec: state.gate.cooldownUntilSec,
  });
  return { won: false, events };
}

// --- Serialization -------------------------------------------------------

/** Serialize state to a JSON string (round-trips exactly, incl. rngState/killIndex). */
export function serialize(state: GameState): string {
  return JSON.stringify(state);
}

/** Parse a state produced by `serialize`. */
export function deserialize(json: string): GameState {
  return JSON.parse(json) as GameState;
}

// --- Recap ---------------------------------------------------------------

/**
 * Aggregate a stretch of events into a Recap. Prefers the exact recap attached
 * by `advance` (accurate even when the raw event array was capped); falls back
 * to counting from the events for hand-assembled arrays.
 */
export function summarizeEvents(events: GameEvent[]): Recap {
  const attached = (events as EventLog).recap;
  if (attached) return { ...attached };

  const recap = emptyRecap(0);
  let minTime = Infinity;
  let maxTime = -Infinity;
  for (const e of events) {
    if (e.timeSec < minTime) minTime = e.timeSec;
    if (e.timeSec > maxTime) maxTime = e.timeSec;
    switch (e.type) {
      case 'kill':
        recap.kills += 1;
        recap.goldEarned += e.gold;
        recap.leaguesTraveled += leaguePerKill;
        break;
      case 'drop':
        recap.drops += 1;
        break;
      case 'equip':
        recap.equips += 1;
        break;
      case 'zone':
        recap.zonesEntered += 1;
        break;
      case 'region':
        recap.regionsEntered += 1;
        break;
      case 'bossWin':
        recap.bossWins += 1;
        break;
      case 'gate':
      case 'bossFail':
      case 'edge':
        break;
    }
  }
  if (Number.isFinite(minTime) && Number.isFinite(maxTime)) {
    recap.seconds = maxTime - minTime;
  }
  return recap;
}
