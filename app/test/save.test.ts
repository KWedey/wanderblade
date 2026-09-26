import { afterEach, describe, expect, it } from 'vitest';
import {
  advance,
  deserialize,
  EVENT_CAP,
  initialState,
  serialize,
  summarizeEvents,
} from '@wanderblade/core';
import { clearSave, migrate, readSave, SAVE_VERSION, writeSave } from '../src/save';

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
}

// Must mirror the private key inside save.ts to plant raw payloads.
const SAVE_KEY = 'wanderblade-save-v1';

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

  it('implausible savedAt — the offline gap advance() is asked for comes from it', () => {
    // Accepting these hands the first tick decades of elapsed seconds, which
    // `advance` faithfully replays as tens of millions of kills.
    for (const savedAt of [0, -1, 946_684_800_000]) {
      localStorage.setItem(SAVE_KEY, envelope(serialize(initialState(1)), { savedAt }));
      expect(readSave()).toBeNull();
    }
    // A plausible one still loads.
    localStorage.setItem(SAVE_KEY, envelope(serialize(initialState(1))));
    expect(readSave()).not.toBeNull();
  });
});

// An envelope version is a schema, not a password. An older one is carried
// forward step by step; only a version this build has never seen is refused,
// because a downgrade cannot know what the newer fields mean.
describe('envelope migration', () => {
  it('round-trips a current-version envelope through the chain untouched', () => {
    const state = initialState(31);
    state.gold = 777;
    const raw = JSON.parse(envelope(serialize(state), { version: 1 })) as Record<string, unknown>;
    const out = migrate(raw);
    expect(out).not.toBeNull();
    expect(out!.version).toBe(SAVE_VERSION);
    expect(out!.savedAt).toBe(raw.savedAt);
    expect(out!.state).toBe(raw.state);

    localStorage.setItem(SAVE_KEY, JSON.stringify(raw));
    expect(readSave()!.state.gold).toBe(777);
  });

  it('discards an envelope from a newer build rather than guessing at it', () => {
    const newer = { version: SAVE_VERSION + 1, savedAt: Date.now(), state: serialize(initialState(1)) };
    expect(migrate(newer)).toBeNull();
    localStorage.setItem(SAVE_KEY, JSON.stringify(newer));
    expect(readSave()).toBeNull();
  });

  it('discards an envelope with no version, or one no step can reach', () => {
    expect(migrate({ savedAt: Date.now(), state: '{}' })).toBeNull();
    expect(migrate({ version: 0, savedAt: Date.now(), state: '{}' })).toBeNull();
    expect(migrate({ version: 'one', savedAt: Date.now(), state: '{}' })).toBeNull();
    expect(migrate(null)).toBeNull();
  });

  it('refuses an envelope whose payload is not a string', () => {
    expect(migrate({ version: SAVE_VERSION, savedAt: Date.now(), state: { gold: 1 } })).toBeNull();
    expect(migrate({ version: SAVE_VERSION, savedAt: 'yesterday', state: '{}' })).toBeNull();
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

// A field added after a save was written is absent, not corrupt. Discarding the
// save for that deletes the run — a player losing everything to a version bump
// is the worst bug this file can produce, and every M1R field would have done
// it: dropping any one of them made readSave() return null.
describe('a save older than the schema still loads', () => {
  /** The state a real client wrote, with `path` removed the way age removes it. */
  function withoutField(path: string): Record<string, unknown> {
    const state = initialState(7);
    state.gold = 4321;
    state.hero.level = 9;
    writeSave(state);
    const outer = JSON.parse(localStorage.getItem(SAVE_KEY)!) as { state: string };
    const inner = JSON.parse(outer.state) as Record<string, unknown>;
    const [head, tail] = path.split('.');
    if (tail) delete (inner[head!] as Record<string, unknown>)[tail];
    else delete inner[head!];
    localStorage.setItem(SAVE_KEY, envelope(JSON.stringify(inner)));
    return inner;
  }

  const AGED = [
    'phase',
    'portalReady',
    'arcs',
    'boss',
    'momentum',
    'ascendancy',
    'collection',
    'lifetime',
    'gear',
    'ascendancy.pending',
    'collection.zonesCleared',
    'lifetime.ascensions',
    'hero.skills',
  ];

  it.each(AGED)('keeps the run when %s is missing', (path) => {
    withoutField(path);
    const loaded = readSave();
    expect(loaded, `${path} wiped the save`).not.toBeNull();
    expect(loaded!.state.gold).toBe(4321);
    expect(loaded!.state.hero.level).toBe(9);
  });

  it('fills the missing field with a value the engine can advance', () => {
    withoutField('ascendancy');
    const loaded = readSave()!;
    expect(loaded.state.ascendancy).toEqual({ pending: 0, banked: 0, victories: 0, nodes: {} });
    expect(() => advance(loaded.state, 60)).not.toThrow();
  });

  it('keeps banked Ascendancy when only the newer field is missing', () => {
    const inner = withoutField('ascendancy.pending');
    expect((inner.ascendancy as Record<string, unknown>).banked).toBe(0);
    const loaded = readSave()!;
    expect(loaded.state.ascendancy.pending).toBe(0);
  });

  // Age fills a gap; corruption still fails. A field that is present and wrong
  // is not an old save, and trusting it crashes the first frame instead.
  it('still discards a save whose fields are present and wrong', () => {
    const state = initialState(7);
    writeSave(state);
    const outer = JSON.parse(localStorage.getItem(SAVE_KEY)!) as { state: string };
    const inner = JSON.parse(outer.state) as Record<string, unknown>;
    inner.ascendancy = { pending: 'lots', banked: 0, victories: 0, nodes: {} };
    localStorage.setItem(SAVE_KEY, envelope(JSON.stringify(inner)));
    expect(readSave()).toBeNull();
  });

  it('still discards a save with no run in it at all', () => {
    localStorage.setItem(SAVE_KEY, envelope(JSON.stringify({ gold: 5 })));
    expect(readSave()).toBeNull();
  });
});

// The determinism contract says a 10-day gap is the same `advance` call as a
// live tick. That holds in core; the client adds a JSON round-trip between the
// two, and a save that rounded rngState or timeSec would diverge silently —
// offline progress quietly different from the run the player left.
describe('a saved run resumes exactly where a live one would be', () => {
  function afterGap(gapSec: number): { offline: string; live: string } {
    const start = initialState(11);
    advance(start, 900);

    const live = deserialize(serialize(start));
    advance(live, gapSec);

    writeSave(start);
    const loaded = readSave()!;
    advance(loaded.state, gapSec);
    return { offline: serialize(loaded.state), live: serialize(live) };
  }

  it.each([60, 8 * 3600, 24 * 3600, 10 * 24 * 3600])(
    'matches a live run byte for byte across %i seconds',
    (gapSec) => {
      const { offline, live } = afterGap(gapSec);
      expect(offline).toBe(live);
    },
  );

  it('carries the exact recap past the raw event cap', () => {
    const state = initialState(11);
    const events = advance(state, 10 * 24 * 3600);
    const recap = summarizeEvents(events);
    let fromArray = 0;
    for (const e of events) if (e.type === 'kill') fromArray += 1;

    expect(events.length).toBe(EVENT_CAP);
    expect(fromArray).toBeLessThan(recap.kills);
    // The number the recap card shows is the run, not the surviving slice.
    expect(recap.kills).toBeGreaterThan(1_000_000);
    expect(recap.goldEarned).toBeCloseTo(state.gold, 0);
  });
});

// A phone that crosses a timezone, or a hand-set clock, hands the client a
// negative gap. It must be a no-op, never a rewind or a NaN.
describe('a clock that goes backwards', () => {
  it('advances nothing and changes nothing', () => {
    const state = initialState(5);
    advance(state, 600);
    const before = serialize(state);
    const events = advance(state, -3600);
    expect(events).toHaveLength(0);
    expect(serialize(state)).toBe(before);
  });

  it('is clamped before it ever reaches the engine', () => {
    const state = initialState(5);
    writeSave(state);
    const raw = JSON.parse(localStorage.getItem(SAVE_KEY)!) as Record<string, unknown>;
    raw.savedAt = Date.now() + 6 * 3600 * 1000;
    localStorage.setItem(SAVE_KEY, JSON.stringify(raw));
    const loaded = readSave()!;
    // What game.ts computes for the gap.
    expect(Math.max(0, (Date.now() - loaded.savedAt) / 1000)).toBe(0);
  });
});
