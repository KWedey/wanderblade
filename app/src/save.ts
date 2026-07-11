// localStorage persistence for the run. The envelope wraps the core's own
// serialized state string with a schema version and a wall-clock timestamp so
// a cold load can compute offline elapsed time and advance the same code path.

import { deserialize, serialize, type GameState } from '@wanderblade/core';

const SAVE_KEY = 'wanderblade-save-v1';
const SAVE_VERSION = 1;

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
      typeof envelope.savedAt !== 'number'
    ) {
      return null;
    }
    return { state: deserialize(envelope.state), savedAt: envelope.savedAt };
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
