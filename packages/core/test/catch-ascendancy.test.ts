import { describe, expect, it } from 'vitest';
import {
  advance,
  ascendancyPerCatch,
  ascendancyPerZone,
  ASC_CATCHES_PER_ZONE,
  enterPortal,
  summarizeEvents,
  type GameEvent,
  type GameState,
} from '../src/index';
import { aimAtOldestArc, clone, portalReady, roadAt } from './helpers';

function catches(events: GameEvent[]): Array<Extract<GameEvent, { type: 'arcCatch' }>> {
  return events.filter((e): e is Extract<GameEvent, { type: 'arcCatch' }> => e.type === 'arcCatch');
}

/** Strike at `rate` for `seconds`, aiming at whatever coin is in the air. */
function playAimed(s: GameState, seconds: number, rate: number): GameEvent[] {
  const out: GameEvent[] = [];
  const end = s.timeSec + seconds;
  const step = 1 / rate;
  let next = s.timeSec + step;
  while (next <= end + 1e-12) {
    out.push(...advance(s, next - s.timeSec, [{ atSec: next, aim: aimAtOldestArc(s, next) }]));
    next += step;
  }
  if (end > s.timeSec) out.push(...advance(s, end - s.timeSec));
  return out;
}

describe('catching a coin buys permanent power, not just gold', () => {
  it('credits pending Ascendancy worth a fraction of a zone clear', () => {
    for (const realm of [0, 1, 5, 20]) {
      expect(ascendancyPerCatch(realm)).toBeCloseTo(
        ascendancyPerZone(realm) / ASC_CATCHES_PER_ZONE,
        12,
      );
      expect(ascendancyPerCatch(realm)).toBeGreaterThan(0);
    }
  });

  it('pays the catch on the event and on the balance, and they agree', () => {
    const s = roadAt(11, 5, 0.4);
    const before = s.ascendancy.pending;
    const events = playAimed(s, 60, 4);
    const caught = catches(events);
    expect(caught.length).toBeGreaterThan(0);

    const paid = caught.reduce((t, e) => t + e.ascendancy, 0);
    expect(paid).toBeGreaterThan(0);
    for (const e of caught) {
      expect(e.ascendancy).toBeCloseTo(ascendancyPerCatch(s.realm), 12);
    }
    // Zone clears also credit, so catches account for their own share exactly.
    expect(s.ascendancy.pending - before).toBeGreaterThanOrEqual(paid - 1e-9);
  });

  it('earns strictly more Ascendancy than the same span left idle', () => {
    const base = roadAt(11, 5, 0.4);
    const idle = clone(base);
    advance(idle, 300);
    const active = clone(base);
    playAimed(active, 300, 4);

    expect(active.ascendancy.pending).toBeGreaterThan(idle.ascendancy.pending);
  });

  it('leaves idle Ascendancy exactly as it was — catches add, never replace', () => {
    const s = roadAt(11, 5, 0.4);
    const before = clone(s);
    advance(s, 600);
    const untouched = clone(before);
    advance(untouched, 600);
    expect(s.ascendancy.pending).toBe(untouched.ascendancy.pending);
    expect(s.ascendancy.pending).toBeGreaterThan(0);
  });

  it('pays nothing once the realm is portal-ready (DECISIONS #22)', () => {
    const s = portalReady(11, 4 * 3600);
    expect(s.portalReady).toBe(true);
    const before = s.ascendancy.pending;

    const events = playAimed(s, 600, 4);
    const caught = catches(events);
    expect(caught.length).toBeGreaterThan(0);
    for (const e of caught) expect(e.ascendancy).toBe(0);
    expect(s.ascendancy.pending).toBe(before);
  });

  it('cannot be farmed forever on an open portal, however long it runs', () => {
    const s = portalReady(11, 4 * 3600);
    const before = s.ascendancy.pending;
    playAimed(s, 4 * 3600, 4);
    expect(s.ascendancy.pending).toBe(before);
  });

  it('pays nothing during a guardian attempt', () => {
    const s = portalReady(12, 6 * 3600);
    expect(enterPortal(s).entered).toBe(true);
    const before = s.ascendancy.pending;
    const events = playAimed(s, 600, 4);
    expect(catches(events)).toHaveLength(0);
    expect(s.ascendancy.pending).toBe(before);
  });

  it('is split-invariant: the same strikes in two halves pay the same', () => {
    const whole = roadAt(11, 5, 0.4);
    playAimed(whole, 240, 4);

    const halves = roadAt(11, 5, 0.4);
    playAimed(halves, 120, 4);
    playAimed(halves, 120, 4);

    expect(halves.ascendancy.pending).toBe(whole.ascendancy.pending);
    expect(halves.gold).toBe(whole.gold);
    expect(halves.killIndex).toBe(whole.killIndex);
  });

  it('counts into the recap, so a capped event stream still reports it', () => {
    const s = roadAt(11, 5, 0.4);
    advance(s, 0.45); // one kill, so there are coins in the air to aim at
    expect(s.arcs.length).toBeGreaterThan(0);

    const at = s.timeSec + 0.05;
    const before = s.ascendancy.pending;
    const events = advance(s, 0.1, [{ atSec: at, aim: aimAtOldestArc(s, at) }]);

    const recap = summarizeEvents(events);
    expect(recap.arcCatches).toBe(1);
    expect(recap.pendingAscendancyEarned).toBeCloseTo(
      s.ascendancy.pending - before,
      12,
    );
  });
});
