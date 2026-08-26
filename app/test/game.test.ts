import { beforeEach, describe, expect, it } from 'vitest';
import type { Strike } from '@wanderblade/core';
import type { View } from '../src/view';

// Game reads two browser globals at construction (`window.matchMedia`) and one
// clock (`performance.now`). Both are stubbed here so the controller can be
// exercised without a DOM; the clock is frozen so a tap can land in the same
// instant as the last engine tick, which is the case under test.
let nowMs = 1000;
globalThis.window = {
  matchMedia: () => ({ matches: false }),
  // Read at construction for the `?stage=` dev staging query.
  location: { search: '' },
} as unknown as Window & typeof globalThis;
globalThis.performance = { now: () => nowMs } as unknown as Performance;

const stubView: View = {
  renderPanels: () => {},
  renderFrame: () => {},
  renderScene: () => {},
  catchArc: () => {},
  pushLog: () => {},
  showRecap: () => {},
  isRecapOpen: () => false,
  setSeed: () => {},
};

const { Game } = await import('../src/game');

/** The controller's private queue and state, the two things `advance` consumes. */
interface GameInternals {
  pendingStrikes: Strike[];
  state: { timeSec: number };
}

function newGame(): { game: InstanceType<typeof Game>; inner: GameInternals } {
  const game = new Game(stubView);
  return { game, inner: game as unknown as GameInternals };
}

describe('queued strikes satisfy what advance() requires of them', () => {
  beforeEach(() => {
    nowMs = 1000;
  });

  it('stamps a tap in the same clock instant as the last tick strictly ahead of it', () => {
    const { game, inner } = newGame();
    game.collectRecap(); // the one public call that re-grounds lastTickMs to now
    expect(inner.state.timeSec).toBe(0);

    game.strike(null);
    // advance() ignores anything at or before state.timeSec, so an equal
    // timestamp is a silently swallowed input, not a strike at t=0.
    expect(inner.pendingStrikes[0]!.atSec).toBeGreaterThan(inner.state.timeSec);
  });

  it('keeps a burst in the same instant strictly ascending', () => {
    const { game, inner } = newGame();
    game.collectRecap();
    for (let i = 0; i < 5; i++) game.strike({ x: 0.5, y: 1 });

    const stamps = inner.pendingStrikes.map((s) => s.atSec);
    expect(stamps).toHaveLength(5);
    for (let i = 1; i < stamps.length; i++) {
      expect(stamps[i]!).toBeGreaterThan(stamps[i - 1]!);
    }
    expect(stamps[0]!).toBeGreaterThan(inner.state.timeSec);
  });

  it('drops strikes banked before a suspension rather than replaying stale stamps', () => {
    const { game, inner } = newGame();
    game.collectRecap();
    game.strike(null);
    expect(inner.pendingStrikes).toHaveLength(1);

    // A suspended tab: reconciling the gap as offline time moves state.timeSec
    // past every queued stamp, so replaying them would hand advance() input it
    // can only discard.
    nowMs += 10 * 60 * 1000;
    game.timeWarp(600);
    expect(inner.state.timeSec).toBe(600);
    expect(inner.pendingStrikes).toEqual([]);
  });
});
