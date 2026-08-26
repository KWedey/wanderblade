import { beforeEach, describe, expect, it } from 'vitest';
import {
  ASC_NODES,
  ASC_NODE_IDS,
  ascNodeCost,
  earningsMultiplier,
  enemyGold,
  goldPerKill,
  type GameState,
  type Strike,
} from '@wanderblade/core';
import type { View, ViewModel } from '../src/view';

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

describe('the march goal is a gradient, not a countdown', () => {
  interface GoalInternals {
    tick: () => void;
    state: { killsInZone: number };
  }

  /** Latest view model the controller painted, or a thrown error if it painted none. */
  function capture(): { view: View; latest: () => ViewModel } {
    let vm: ViewModel | null = null;
    const view: View = {
      ...stubView,
      renderPanels: (next: ViewModel) => {
        vm = next;
      },
    };
    return {
      view,
      latest: () => {
        if (vm === null) throw new Error('no view model was rendered');
        return vm;
      },
    };
  }

  function runToVM(advanceMs: number): ViewModel {
    const { view, latest } = capture();
    const inner = new Game(view) as unknown as GoalInternals;
    nowMs += advanceMs;
    inner.tick();
    return latest();
  }

  beforeEach(() => {
    nowMs = 1000;
  });

  // "946 kills to Zone 4" is arithmetically honest and reads as a wall: it is
  // a remainder, and a remainder only ever ticks down.
  it('names where and when, never how many kills are left', () => {
    const goal = runToVM(1000).marchGoal;
    expect(goal).toMatch(/^(Zone \d+|the Portal) in ~/);
    expect(goal).not.toMatch(/kills? to/);
  });

  it('reports a fraction of the leg travelled, inside its own track', () => {
    const progress = runToVM(1000).marchProgress;
    expect(progress).toBeGreaterThanOrEqual(0);
    expect(progress).toBeLessThanOrEqual(1);
  });

  it('fills as the zone is walked rather than emptying', () => {
    const { view, latest } = capture();
    const inner = new Game(view) as unknown as GoalInternals;
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      nowMs += 4000;
      inner.tick();
      seen.push(latest().marchProgress);
    }
    expect(seen[seen.length - 1]!).toBeGreaterThan(seen[0]!);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
  });
});

describe('the client carries no economy of its own', () => {
  interface PayoutInternals {
    tick: () => void;
    goldPerKill: number;
    state: GameState;
  }

  // `enemyGold` is the *base* payout; the engine credits it times the
  // per-victory earnings bonus. Caching the base understates the count-up
  // target, the per-second rate, and every row's "in ~X" wait by 50% at five
  // victories.
  it('caches the payout the engine credits, bonus and all', () => {
    nowMs = 1000;
    const inner = new Game(stubView) as unknown as PayoutInternals;
    inner.state.ascendancy.victories = 5;
    nowMs += 1000;
    inner.tick();

    expect(inner.goldPerKill).toBe(goldPerKill(inner.state));
    // Strictly above the base, so re-deriving from enemyGold fails here.
    expect(inner.goldPerKill).toBeGreaterThan(enemyGold(inner.state.realm, inner.state.zone));
  });
});

// buyAscendancyNode has been in core since the tree landed; the client never
// mentioned it, so the whole persistent-progression system had no UI at all.
describe('the Ascendancy tree the client now reaches', () => {
  interface AscInternals {
    tick: () => void;
    state: GameState;
    buyAscendancyNode: (id: string) => void;
  }

  function withBank(banked: number): { vm: () => ViewModel; inner: AscInternals } {
    let latest: ViewModel | null = null;
    const view: View = { ...stubView, renderPanels: (next) => (latest = next) };
    const inner = new Game(view) as unknown as AscInternals;
    inner.state.ascendancy.banked = banked;
    inner.tick();
    return {
      vm: () => {
        if (latest === null) throw new Error('no view model was rendered');
        return latest;
      },
      inner,
    };
  }

  beforeEach(() => {
    nowMs = 1000;
  });

  it('prices every node off core rather than off a second table', () => {
    const { vm } = withBank(0);
    const nodes = vm().ascendancy.nodes;
    expect(nodes.map((n) => n.id)).toEqual([...ASC_NODE_IDS]);
    for (const node of nodes) {
      expect(node.cost, node.id).toBe(ascNodeCost(node.id, node.rank));
      expect(node.name, node.id).toBe(ASC_NODES[node.id]!.name);
    }
  });

  it('calls a node affordable exactly when core would take the payment', () => {
    const edgeCost = ascNodeCost('edge', 0);
    expect(withBank(edgeCost - 1).vm().ascendancy.nodes[0]!.canAfford).toBe(false);
    expect(withBank(edgeCost).vm().ascendancy.nodes[0]!.canAfford).toBe(true);
  });

  it('spends the bank and takes the rank when the node is bought', () => {
    const cost = ascNodeCost('edge', 0);
    const { vm, inner } = withBank(cost + 5);
    inner.buyAscendancyNode('edge');
    inner.tick();

    const node = vm().ascendancy.nodes[0]!;
    expect(vm().ascendancy.banked).toBe(5);
    expect(node.rank).toBe(1);
    expect(node.cost).toBe(ascNodeCost('edge', 1));
    expect(node.multiplier).toBeGreaterThan(1);
  });

  it('leaves the bank alone when the node cannot be paid for', () => {
    const { vm, inner } = withBank(ascNodeCost('edge', 0) - 1);
    inner.buyAscendancyNode('edge');
    inner.tick();
    expect(vm().ascendancy.banked).toBe(ascNodeCost('edge', 0) - 1);
    expect(vm().ascendancy.nodes[0]!.rank).toBe(0);
  });

  // Guardrail 8: the automatic realm bonus multiplies gold and never damage.
  it('reports the realm-completion bonus as core computes it', () => {
    const { vm, inner } = withBank(0);
    inner.state.ascendancy.victories = 3;
    inner.tick();
    expect(vm().ascendancy.earningsMult).toBe(earningsMultiplier(3));
    expect(vm().ascendancy.victories).toBe(3);
  });
});
