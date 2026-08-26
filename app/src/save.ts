// localStorage persistence for the run. The envelope wraps the core's own
// serialized state string with a schema version and a wall-clock timestamp so
// a cold load can compute offline elapsed time and advance the same code path.

import { deserialize, serialize, GEAR_SLOTS, type GameState } from '@wanderblade/core';

const SAVE_KEY = 'wanderblade-save-v1';
const SAVE_VERSION = 1;
/**
 * Earliest wall clock a real save can carry. The offline gap is
 * `Date.now() - savedAt`, so a corrupt or epoch-0 timestamp asks `advance` for
 * decades of kills and freezes the first load. This rejects garbage; it is not
 * a cap on a genuine absence (docs/DECISIONS.md #8).
 */
const EARLIEST_SAVED_AT_MS = 1_577_836_800_000;

interface SaveEnvelope {
  version: number;
  savedAt: number;
  state: string;
}

/** A successfully loaded save: deserialized state plus when it was written. */
export interface LoadedSave {
  state: GameState;
  savedAt: number;
}

/** Persist the current state under the versioned key. */
export function writeSave(state: GameState): void {
  const envelope: SaveEnvelope = {
    version: SAVE_VERSION,
    savedAt: Date.now(),
    state: serialize(state),
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(envelope));
  } catch {
    // Storage unavailable (private mode / quota) — the run simply won't persist.
  }
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** A gear slot is either empty (null) or a well-formed item the view can paint. */
function isValidGearItem(v: unknown): boolean {
  if (v === null) return true;
  if (typeof v !== 'object') return false;
  const item = v as Record<string, unknown>;
  return isFiniteNumber(item.power) && typeof item.rarity === 'string' && isFiniteNumber(item.zone);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Set `key` only when the save has no opinion about it at all. */
function fill(on: Record<string, unknown>, key: string, value: unknown): void {
  if (on[key] === undefined) on[key] = value;
}

/**
 * Fill in fields the save predates. A field added after a save was written is
 * absent, not wrong, and discarding the save for it deletes the player's run —
 * the worst outcome this file can produce. Absent is filled; present-but-wrong
 * still fails `isValidState` below, because that is corruption, not age.
 */
function backfill(v: unknown): void {
  if (!isObject(v)) return;
  fill(v, 'phase', 'road');
  fill(v, 'portalReady', false);
  fill(v, 'arcs', []);
  fill(v, 'boss', { hpRemaining: 0, hpMax: 0, enteredAtSec: null });
  fill(v, 'momentum', { value: 0, atSec: 0 });
  fill(v, 'ascendancy', {});
  fill(v, 'collection', {});
  fill(v, 'lifetime', {});
  fill(v, 'gear', {});

  if (isObject(v.hero)) fill(v.hero, 'skills', {});
  if (isObject(v.gear)) for (const slot of GEAR_SLOTS) fill(v.gear, slot, null);
  if (isObject(v.ascendancy)) {
    for (const key of ['pending', 'banked', 'victories']) fill(v.ascendancy, key, 0);
    fill(v.ascendancy, 'nodes', {});
  }
  if (isObject(v.collection)) {
    for (const key of ['bossTrophies', 'gearFound', 'zonesCleared']) fill(v.collection, key, 0);
  }
  if (isObject(v.lifetime)) {
    for (const key of ['kills', 'goldEarned', 'ascensions']) fill(v.lifetime, key, 0);
  }
}

/**
 * Runtime shape-guard for a deserialized GameState. `deserialize` is a bare
 * JSON.parse, so a same-version but partial or hand-edited payload ('{}', 'null',
 * a missing hero/gate) would parse cleanly and then crash the first render or
 * `advance`. Validate exactly the fields the app and engine dereference; on any
 * miss the caller treats it as a fresh run.
 */
function isValidState(v: unknown): v is GameState {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;

  // Flat numeric fields the engine advances and the view reads every frame.
  if (
    !isFiniteNumber(s.seed) ||
    !isFiniteNumber(s.rngState) ||
    !isFiniteNumber(s.timeSec) ||
    !isFiniteNumber(s.nextActionAtSec) ||
    !isFiniteNumber(s.killIndex) ||
    !isFiniteNumber(s.realm) ||
    !isFiniteNumber(s.zone) ||
    !isFiniteNumber(s.killsInZone) ||
    !isFiniteNumber(s.leagues) ||
    !isFiniteNumber(s.gold)
  ) {
    return false;
  }
  if (s.phase !== 'road' && s.phase !== 'boss') return false;
  if (typeof s.portalReady !== 'boolean') return false;
  if (!Array.isArray(s.arcs)) return false;

  // hero.level + the skills map (skillMult iterates its values).
  const hero = s.hero as Record<string, unknown> | null;
  if (typeof hero !== 'object' || hero === null || !isFiniteNumber(hero.level)) return false;
  const skills = hero.skills as Record<string, unknown> | null;
  if (typeof skills !== 'object' || skills === null) return false;
  for (const level of Object.values(skills)) {
    if (!isFiniteNumber(level)) return false;
  }

  // gear: every slot present, each empty or a well-formed item.
  const gear = s.gear as Record<string, unknown> | null;
  if (typeof gear !== 'object' || gear === null) return false;
  for (const slot of GEAR_SLOTS) {
    if (!(slot in gear) || !isValidGearItem(gear[slot])) return false;
  }

  // Objects the engine mutates in place during advance.
  const boss = s.boss as Record<string, unknown> | null;
  if (typeof boss !== 'object' || boss === null) return false;
  if (!isFiniteNumber(boss.hpRemaining) || !isFiniteNumber(boss.hpMax)) return false;
  if (boss.enteredAtSec !== null && !isFiniteNumber(boss.enteredAtSec)) return false;

  const momentum = s.momentum as Record<string, unknown> | null;
  if (typeof momentum !== 'object' || momentum === null) return false;
  if (!isFiniteNumber(momentum.value) || !isFiniteNumber(momentum.atSec)) return false;

  const asc = s.ascendancy as Record<string, unknown> | null;
  if (typeof asc !== 'object' || asc === null) return false;
  if (
    !isFiniteNumber(asc.pending) ||
    !isFiniteNumber(asc.banked) ||
    !isFiniteNumber(asc.victories)
  ) {
    return false;
  }
  const nodes = asc.nodes as Record<string, unknown> | null;
  if (typeof nodes !== 'object' || nodes === null) return false;
  for (const rank of Object.values(nodes)) {
    if (!isFiniteNumber(rank)) return false;
  }

  const collection = s.collection as Record<string, unknown> | null;
  if (typeof collection !== 'object' || collection === null) return false;
  if (
    !isFiniteNumber(collection.bossTrophies) ||
    !isFiniteNumber(collection.gearFound) ||
    !isFiniteNumber(collection.zonesCleared)
  ) {
    return false;
  }

  const lifetime = s.lifetime as Record<string, unknown> | null;
  if (typeof lifetime !== 'object' || lifetime === null) return false;
  if (
    !isFiniteNumber(lifetime.kills) ||
    !isFiniteNumber(lifetime.goldEarned) ||
    !isFiniteNumber(lifetime.ascensions)
  ) {
    return false;
  }

  return true;
}

/** Read and deserialize the save, or null if absent/unreadable/wrong version. */
export function readSave(): LoadedSave | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const envelope = JSON.parse(raw) as SaveEnvelope;
    if (
      !envelope ||
      envelope.version !== SAVE_VERSION ||
      typeof envelope.state !== 'string' ||
      !isFiniteNumber(envelope.savedAt) ||
      envelope.savedAt < EARLIEST_SAVED_AT_MS
    ) {
      return null;
    }
    const state: unknown = deserialize(envelope.state);
    backfill(state);
    if (!isValidState(state)) return null;
    return { state, savedAt: envelope.savedAt };
  } catch {
    return null;
  }
}

/** Remove the save entirely (used by the debug Reset action). */
export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clean up if storage is unavailable.
  }
}
