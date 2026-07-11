import { afterEach, describe, expect, it } from 'vitest';
import { advance, initialState, serialize, summarizeEvents } from '@wanderblade/core';
import { clearSave, readSave, writeSave } from '../src/save';

// The save layer talks to the global `localStorage`, which Node's test env lacks.
// Back it with a tiny in-memory Map so writeSave/readSave round-trip for real.
class MemoryStorage {
  private readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

// Must mirror the private key/version inside save.ts to plant raw payloads.
const SAVE_KEY = 'wanderblade-save-v1';
const SAVE_VERSION = 1;

globalThis.localStorage = new MemoryStorage() as unknown as Storage;
const realDateNow = Date.now;

/** Wrap a value in a well-formed envelope carrying the given inner state string. */
function envelope(state: string, over: { version?: number; savedAt?: number } = {}): string {
  return JSON.stringify({
    version: over.version ?? SAVE_VERSION,
    savedAt: over.savedAt ?? Date.now(),
    state,
  });
}

afterEach(() => {
  Date.now = realDateNow;
  clearSave();
});

describe('writeSave / readSave round-trip', () => {
  it('returns a state deep-equal to the one persisted', () => {
    const s = initialState(4242);
    writeSave(s);

    const loaded = readSave();
    expect(loaded).not.toBeNull();
    expect(loaded!.state).toEqual(s);
    expect(typeof loaded!.savedAt).toBe('number');
    // The reconstituted state re-serializes identically — nothing was dropped.
    expect(serialize(loaded!.state)).toBe(serialize(s));
  });

  it('round-trips a mid-run state, preserving rngState and killIndex', () => {
    const s = initialState(77);
    advance(s, 3333.5);
    expect(s.killIndex).toBeGreaterThan(0);

    writeSave(s);
    const loaded = readSave();

    expect(loaded).not.toBeNull();
    expect(loaded!.state.rngState).toBe(s.rngState);
    expect(loaded!.state.killIndex).toBe(s.killIndex);
    expect(loaded!.state).toEqual(s);
  });
});

describe('readSave rejects unusable payloads (returns null, never throws)', () => {
  it('absent save', () => {
    expect(readSave()).toBeNull();
  });

  it('corrupt JSON', () => {
    localStorage.setItem(SAVE_KEY, '{ this is not json');
    expect(() => readSave()).not.toThrow();
    expect(readSave()).toBeNull();
  });

  it('wrong SAVE_VERSION', () => {
    localStorage.setItem(SAVE_KEY, envelope(serialize(initialState(1)), { version: 999 }));
    expect(readSave()).toBeNull();
  });

  it('parseable-but-empty inner state ({})', () => {
    localStorage.setItem(SAVE_KEY, envelope('{}'));
    expect(readSave()).toBeNull();
  });

  it('parseable-but-null inner state', () => {
    localStorage.setItem(SAVE_KEY, envelope('null'));
    expect(readSave()).toBeNull();
  });

  it('structurally-valid state with hero removed', () => {
    const state = initialState(9) as unknown as Record<string, unknown>;
    delete state.hero;
    localStorage.setItem(SAVE_KEY, envelope(JSON.stringify(state)));
    expect(readSave()).toBeNull();
  });

  it('structurally-valid state with a non-numeric field', () => {
    const state = initialState(9) as unknown as Record<string, unknown>;
    state.gold = 'lots';
    localStorage.setItem(SAVE_KEY, envelope(JSON.stringify(state)));
    expect(readSave()).toBeNull();
  });
});

describe('offline reconciliation smoke', () => {
  it('advances a save made in the past into a sane recap', () => {
    const s = initialState(2024);
    const eightHoursMs = 8 * 3600 * 1000;

    // Persist as though the tab was closed eight hours ago.
    Date.now = () => realDateNow() - eightHoursMs;
    writeSave(s);
    Date.now = realDateNow;

    const loaded = readSave();
    expect(loaded).not.toBeNull();

    const elapsedSec = Math.max(0, (Date.now() - loaded!.savedAt) / 1000);
    expect(elapsedSec).toBeGreaterThan(0);

    // Same code path the controller runs on a cold load.
    const recap = summarizeEvents(advance(loaded!.state, elapsedSec));
    expect(recap.kills).toBeGreaterThan(0);
    expect(recap.goldEarned).toBeGreaterThan(0);
    expect(recap.leaguesTraveled).toBeGreaterThan(0);
  });
});
