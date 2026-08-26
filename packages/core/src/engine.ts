// Determinism contract (docs/DECISIONS.md #6): advance(s, a + b) produces the
// exact same state AND events as advance(advance(s, a), b) — including strike
// inputs, phase transitions, and ascension.

import {
  ARC_CATCH_MULT,
  ASC_NODE_IDS,
  ASC_NODES,
  dropChance,
  GEAR_SLOTS,
  killsPerZone,
  leaguePerKill,
  MOMENTUM_PER_STRIKE,
  RARITIES,
  RARITY_WEIGHTS,
  SKILL_IDS,
  SKILLS,
  zonesPerRealm,
} from './constants';
import {
  ascendancyBossPayout,
  ascendancyPerZone,
  ascNodeCost,
  bossHp,
  damagePerSwing,
  gearPower,
  goldPerKill,
  killTime,
  levelCost,
  skillCost,
  swingInterval,
} from './formulas';
import { arcHitIndex, arcsForKill } from './arcs';
import { addMomentum, momentumAt } from './momentum';
import { createRng, type Rng } from './rng';
import type {
  EventLog,
  GameEvent,
  GameState,
  GearSlot,
  LootArc,
  Rarity,
  Recap,
  Strike,
} from './types';

/**
 * Max raw events retained per advance. A 10-day offline advance is hundreds of
 * thousands of kills; the granular stream truncates past the cap while the
 * attached `recap` stays exact.
 */
export const EVENT_CAP = 50_000;

/** Every id at rank 0 — derived from the id list, so a new entry cannot be missed. */
function zeroRanks(ids: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of ids) out[id] = 0;
  return out;
}

/** Fresh state for a new run seeded with `seed`. */
export function initialState(seed: number): GameState {
  const s = seed >>> 0;
  const state: GameState = {
    seed: s,
    rngState: s,
    timeSec: 0,
    nextActionAtSec: 0,
    killIndex: 0,
    phase: 'road',
    realm: 0,
    zone: 0,
    killsInZone: 0,
    portalReady: false,
    leagues: 0,
    gold: 0,
    hero: { level: 0, skills: zeroRanks(SKILL_IDS) },
    gear: { weapon: null, armor: null, trinket: null },
    boss: { hpRemaining: 0, hpMax: 0, enteredAtSec: null },
    ascendancy: { pending: 0, banked: 0, nodes: zeroRanks(ASC_NODE_IDS), victories: 0 },
    momentum: { value: 0, atSec: 0 },
    arcs: [],
    collection: { bossTrophies: 0, gearFound: 0, zonesCleared: 0 },
    lifetime: { kills: 0, goldEarned: 0, ascensions: 0, abandons: 0, bossDamage: 0 },
  };
  state.nextActionAtSec = state.timeSec + killTime(state, 0);
  return state;
}

// --- Purchases -----------------------------------------------------------

/** Every purchase is locked for the duration of a guardian attempt. */
function purchasesLocked(state: GameState): boolean {
  return state.phase === 'boss';
}

/** Buy the next hero level. Mutates; returns false (no-op) if refused. */
export function buyHeroLevel(state: GameState): boolean {
  if (purchasesLocked(state)) return false;
  const cost = levelCost(state.hero.level, state.realm);
  if (!(state.gold >= cost)) return false;
  state.gold -= cost;
  state.hero.level += 1;
  return true;
}

/** Buy the next rank of realm-local skill `id`. */
export function buySkill(state: GameState, id: string): boolean {
  if (purchasesLocked(state)) return false;
  const def = SKILLS[id];
  if (!def) return false;
  if (state.hero.level < def.unlockLevel) return false;
  const current = state.hero.skills[id] ?? 0;
  const cost = skillCost(current, state.realm);
  if (!(state.gold >= cost)) return false;
  state.gold -= cost;
  state.hero.skills[id] = current + 1;
  return true;
}

/** Spend banked Ascendancy on the next rank of tree node `id`. */
export function buyAscendancyNode(state: GameState, id: string): boolean {
  if (purchasesLocked(state)) return false;
  const def = ASC_NODES[id];
  if (!def) return false;
  const rank = state.ascendancy.nodes[id] ?? 0;
  const cost = ascNodeCost(id, rank);
  if (!Number.isFinite(cost) || !(state.ascendancy.banked >= cost)) return false;
  state.ascendancy.banked -= cost;
  state.ascendancy.nodes[id] = rank + 1;
  return true;
}

// --- Phase actions -------------------------------------------------------

/**
 * Enter the portal. Always an explicit player action — nothing in `advance`
 * calls this, online or offline (docs/DECISIONS.md #15).
 */
export function enterPortal(state: GameState): { entered: boolean; events: GameEvent[] } {
  const events: GameEvent[] = [];
  if (state.phase !== 'road' || !state.portalReady) return { entered: false, events };

  const hp = bossHp(state.realm);
  state.phase = 'boss';
  state.boss = { hpRemaining: hp, hpMax: hp, enteredAtSec: state.timeSec };
  state.arcs = [];
  state.nextActionAtSec =
    state.timeSec + swingInterval(state, momentumAt(state.momentum, state.timeSec));
  events.push({ type: 'portalEnter', timeSec: state.timeSec, realm: state.realm, bossHp: hp });
  return { entered: true, events };
}

/** Abandon the attempt: guardian HP resets, the Road build is untouched. */
export function abandonBoss(state: GameState): { abandoned: boolean; events: GameEvent[] } {
  const events: GameEvent[] = [];
  if (state.phase !== 'boss') return { abandoned: false, events };

  events.push({
    type: 'abandon',
    timeSec: state.timeSec,
    realm: state.realm,
    hpRemaining: state.boss.hpRemaining,
  });
  state.lifetime.abandons += 1;
  state.phase = 'road';
  state.boss = { hpRemaining: 0, hpMax: 0, enteredAtSec: null };
  state.nextActionAtSec =
    state.timeSec + killTime(state, momentumAt(state.momentum, state.timeSec));
  return { abandoned: true, events };
}

// --- RNG-driven helpers --------------------------------------------------

function pickSlot(r: number): GearSlot {
  const idx = Math.min(GEAR_SLOTS.length - 1, Math.floor(r * GEAR_SLOTS.length));
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

/** One tier up the rarity ladder; the top tier stays put. */
function upgradeRarity(r: Rarity): Rarity {
  const i = RARITIES.indexOf(r);
  return RARITIES[Math.min(RARITIES.length - 1, i + 1)] ?? r;
}

// --- advance internals ---------------------------------------------------

function emptyRecap(seconds: number): Recap {
  return {
    seconds,
    kills: 0,
    goldEarned: 0,
    drops: 0,
    equips: 0,
    arcCatches: 0,
    zonesCleared: 0,
    pendingAscendancyEarned: 0,
    bossDamage: 0,
    victories: 0,
    leaguesTraveled: 0,
  };
}

function emit(events: GameEvent[], e: GameEvent): void {
  if (events.length < EVENT_CAP) events.push(e);
}

/** Equip `power` in `slot` if it beats what is worn. */
function tryEquip(
  state: GameState,
  events: GameEvent[],
  recap: Recap,
  clock: number,
  slot: GearSlot,
  rarity: Rarity,
  power: number,
): boolean {
  const current = state.gear[slot];
  if (current !== null && !(power > current.power)) return false;
  const previousPower = current ? current.power : 0;
  state.gear[slot] = { power, rarity, realm: state.realm, zone: state.zone };
  recap.equips += 1;
  emit(events, { type: 'equip', timeSec: clock, slot, power, rarity, previousPower });
  return true;
}

/**
 * Drop arcs that have already landed. Uncaught arcs cost the player nothing.
 * Staggering means one kill's later coins can outlive the next kill's first,
 * so the list is not sorted by expiry and a leading-prefix splice would leak.
 */
function pruneArcs(state: GameState, clock: number): void {
  if (state.arcs.length === 0) return;
  let write = 0;
  for (let read = 0; read < state.arcs.length; read++) {
    const arc = state.arcs[read] as LootArc;
    if (arc.expiresAtSec <= clock) continue;
    state.arcs[write] = arc;
    write += 1;
  }
  state.arcs.length = write;
}

/** Process exactly one Road kill: gold, drop roll, arc, leagues, zone. */
function processKill(
  state: GameState,
  rng: Rng,
  events: GameEvent[],
  recap: Recap,
  clock: number,
): void {
  state.killIndex += 1;
  const realm = state.realm;
  const z = state.zone;

  pruneArcs(state, clock);

  const gold = goldPerKill(state);
  state.gold += gold;
  state.lifetime.kills += 1;
  state.lifetime.goldEarned += gold;
  recap.kills += 1;
  recap.goldEarned += gold;
  // Built only under the cap: a ten-day gap is millions of kills, and the
  // object churn — not the math — is what makes reconciliation slow.
  if (events.length < EVENT_CAP) {
    events.push({ type: 'kill', timeSec: clock, realm, zone: z, killIndex: state.killIndex, gold });
  }

  // One RNG draw every kill keeps the stream keyed to killIndex; two more only
  // when a drop actually occurs.
  let arcGear: LootArc['gear'] = null;
  if (rng.next() < dropChance) {
    const slot = pickSlot(rng.next());
    const rarity = pickRarity(rng.next());
    const power = gearPower(realm, z, rarity);
    recap.drops += 1;
    state.collection.gearFound += 1;
    const equipped = tryEquip(state, events, recap, clock, slot, rarity, power);
    emit(events, { type: 'drop', timeSec: clock, realm, zone: z, slot, rarity, power, equipped });
    arcGear = { slot, rarity, realm, zone: z };
  }

  state.arcs.push(...arcsForKill(state.killIndex, gold, clock, arcGear));

  state.leagues += leaguePerKill;
  recap.leaguesTraveled += leaguePerKill;
  state.killsInZone += 1;
  if (state.killsInZone >= killsPerZone) {
    completeZone(state, events, recap, clock);
  }
}

/**
 * A cleared zone: bank its pending Ascendancy, then step forward — or, on the
 * realm's last zone, open the portal and keep farming here.
 */
function completeZone(
  state: GameState,
  events: GameEvent[],
  recap: Recap,
  clock: number,
): void {
  state.killsInZone = 0;

  // Road progress and pending Ascendancy accrue per zone cleared, never per
  // second, so farming an already-open realm earns neither however long it runs.
  if (state.portalReady) return;

  state.collection.zonesCleared += 1;
  recap.zonesCleared += 1;
  const asc = ascendancyPerZone(state.realm);
  state.ascendancy.pending += asc;
  recap.pendingAscendancyEarned += asc;

  if (state.zone >= zonesPerRealm - 1) {
    state.portalReady = true;
    emit(events, { type: 'portalReady', timeSec: clock, realm: state.realm });
    return;
  }

  state.zone += 1;
  emit(events, { type: 'zone', timeSec: clock, realm: state.realm, zone: state.zone });
}

/**
 * The ascension transaction (docs/ECONOMY.md). Atomic and idempotent by
 * construction: it runs at the swing that empties the guardian, and its first
 * act is to leave the boss phase, so no later swing can re-enter it.
 */
function ascend(state: GameState, events: GameEvent[], recap: Recap, clock: number): void {
  const fromRealm = state.realm;
  const payout = ascendancyBossPayout(fromRealm);

  state.ascendancy.pending += payout;
  const pendingBanked = state.ascendancy.pending;
  state.ascendancy.banked += pendingBanked;
  state.ascendancy.pending = 0;
  state.ascendancy.victories += 1;

  state.collection.bossTrophies += 1;
  state.lifetime.ascensions += 1;
  recap.victories += 1;
  emit(events, { type: 'bossVictory', timeSec: clock, realm: fromRealm, payout, pendingBanked });

  // Realm-local power resets; banked Ascendancy, nodes, collection, lifetime
  // stats, and the RNG stream all survive.
  state.phase = 'road';
  state.realm = fromRealm + 1;
  state.zone = 0;
  state.killsInZone = 0;
  state.portalReady = false;
  state.leagues = 0;
  state.gold = 0;
  state.hero = { level: 0, skills: zeroRanks(SKILL_IDS) };
  state.gear = { weapon: null, armor: null, trinket: null };
  state.boss = { hpRemaining: 0, hpMax: 0, enteredAtSec: null };
  state.momentum = { value: 0, atSec: clock };
  state.arcs = [];

  emit(events, {
    type: 'ascend',
    timeSec: clock,
    fromRealm,
    toRealm: state.realm,
    banked: state.ascendancy.banked,
    victories: state.ascendancy.victories,
  });
}

/** Process exactly one hero swing at the guardian. */
function processSwing(
  state: GameState,
  events: GameEvent[],
  recap: Recap,
  clock: number,
): void {
  const dmg = damagePerSwing(state);
  const dealt = Math.min(state.boss.hpRemaining, Number.isFinite(dmg) ? dmg : 0);
  state.boss.hpRemaining -= dealt;
  state.lifetime.bossDamage += dealt;
  recap.bossDamage += dealt;
  if (state.boss.hpRemaining <= 0) {
    ascend(state, events, recap, clock);
  }
}

/** A Strike: momentum on the shared curve, plus an arc catch on the Road. */
function processStrike(
  state: GameState,
  events: GameEvent[],
  recap: Recap,
  strike: Strike,
): void {
  const clock = strike.atSec;
  state.momentum = addMomentum(state.momentum, clock, MOMENTUM_PER_STRIKE);
  if (state.phase !== 'road') return;

  // A strike that catches nothing still swings and still builds momentum.
  pruneArcs(state, clock);
  if (!strike.aim) return;
  const hit = arcHitIndex(state.arcs, strike.aim, clock);
  if (hit < 0) return;
  const arc = state.arcs.splice(hit, 1)[0];
  if (!arc) return;

  const bonus = arc.gold * (ARC_CATCH_MULT - 1);
  state.gold += bonus;
  state.lifetime.goldEarned += bonus;
  recap.goldEarned += bonus;
  recap.arcCatches += 1;

  let upgraded = false;
  if (arc.gear) {
    const rarity = upgradeRarity(arc.gear.rarity);
    if (rarity !== arc.gear.rarity) {
      upgraded = tryEquip(
        state,
        events,
        recap,
        clock,
        arc.gear.slot,
        rarity,
        gearPower(arc.gear.realm, arc.gear.zone, rarity),
      );
    }
  }
  emit(events, { type: 'arcCatch', timeSec: clock, bonusGold: bonus, upgraded });
}

/** Re-prime the action schedule for the phase the hero is now in. */
function scheduleNext(state: GameState, clock: number): void {
  const m = momentumAt(state.momentum, clock);
  state.nextActionAtSec =
    clock + (state.phase === 'road' ? killTime(state, m) : swingInterval(state, m));
}

/**
 * THE engine, event-stepped per kill or swing with `strikes` merged in by
 * timestamp. `strikes` must be sorted ascending; timestamps outside
 * `(timeSec, timeSec + seconds]` are ignored, so splitting an interval hands
 * each strike to exactly one half. Ties resolve strike-first.
 */
export function advance(
  state: GameState,
  seconds: number,
  strikes: readonly Strike[] = [],
): GameEvent[] {
  const events: EventLog = [];
  const recap = emptyRecap(Math.max(0, seconds));

  if (!(seconds > 0)) {
    events.recap = recap;
    return events;
  }

  const rng = createRng(state.rngState);
  const start = state.timeSec;
  const target = start + seconds;

  let si = 0;
  while (si < strikes.length && (strikes[si] as Strike).atSec <= start) si += 1;

  for (;;) {
    const strike = si < strikes.length ? (strikes[si] as Strike) : null;
    const nextStrike = strike ? strike.atSec : Infinity;
    const strikeDue = nextStrike <= target;
    const actionDue = state.nextActionAtSec <= target;
    if (!strikeDue && !actionDue) break;

    if (strike && strikeDue && (!actionDue || nextStrike <= state.nextActionAtSec)) {
      processStrike(state, events, recap, strike);
      si += 1;
      continue;
    }

    const clock = state.nextActionAtSec;
    if (state.phase === 'road') {
      processKill(state, rng, events, recap, clock);
    } else {
      processSwing(state, events, recap, clock);
    }
    scheduleNext(state, clock);
  }

  state.timeSec = target;
  state.rngState = rng.getState();
  events.recap = recap;
  return events;
}

// --- Serialization -------------------------------------------------------

/** Serialize state to a JSON string (round-trips exactly, incl. rngState). */
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
      case 'arcCatch':
        recap.arcCatches += 1;
        recap.goldEarned += e.bonusGold;
        break;
      case 'zone':
        recap.zonesCleared += 1;
        break;
      case 'bossVictory':
        recap.victories += 1;
        break;
      case 'portalReady':
      case 'portalEnter':
      case 'abandon':
      case 'ascend':
        break;
    }
  }
  if (Number.isFinite(minTime) && Number.isFinite(maxTime)) {
    recap.seconds = maxTime - minTime;
  }
  return recap;
}
