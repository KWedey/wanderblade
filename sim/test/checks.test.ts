import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as Core from '@wanderblade/core';
import type { GameState } from '@wanderblade/core';
import { DEFAULTS } from '../src/args';
import type { SimConfig } from '../src/types';

// Each check exists to catch an engine that drifts, leaks or couples. Only an
// engine that actually misbehaves can prove a check would notice, so the
// failing cases wrap the real core and inject one fault at a time.
const faults = vi.hoisted(() => ({
  driftOnShortAdvance: false,
  leakGoldOnAbandon: false,
  dpsFollowsVictories: false,
  reset(): void {
    this.driftOnShortAdvance = false;
    this.leakGoldOnAbandon = false;
    this.dpsFollowsVictories = false;
  },
}));

vi.mock('@wanderblade/core', async (importOriginal) => {
  const real = await importOriginal<typeof Core>();
  const advance: typeof real.advance = (s, seconds, strikes) => {
    const events = real.advance(s, seconds, strikes);
    if (faults.driftOnShortAdvance && seconds < 3600) s.gold += 1;
    return events;
  };
  const abandonBoss: typeof real.abandonBoss = (s) => {
    const r = real.abandonBoss(s);
    if (faults.leakGoldOnAbandon) s.gold += 1;
    return r;
  };
  const heroDps: typeof real.heroDps = (s) =>
    real.heroDps(s) + (faults.dpsFollowsVictories ? s.ascendancy.victories : 0);
  return { ...real, advance, abandonBoss, heroDps };
});

const { initialState } = await import('@wanderblade/core');
const { runPlayer, clone } = await import('../src/simulate');
const {
  abandonClean,
  earningsBonusIsolated,
  offlineMatchesLive,
  remainingTimeCarried,
  replayIdentical,
} = await import('../src/checks');

const config: SimConfig = { ...DEFAULTS, days: 1, seeds: 1 };

/**
 * Realm 0 played actively to the moment its portal opens — the fixture
 * simulateSeed uses. Built once here, before any test can arm a fault.
 */
const portalReady = runPlayer(1, config, {
  policy: 'road-active',
  entry: 'prompt',
  stopAtPortalReady: true,
  continuous: true,
}).state;
const ready = (): GameState => clone(portalReady);

beforeEach(() => faults.reset());

describe('C3 offlineMatchesLive', () => {
  it('passes when one 4h advance equals 57,600 client ticks', () => {
    const c = offlineMatchesLive(ready());
    expect(c.pass, c.detail).toBe(true);
    expect(c.detail).toContain('byte-identical');
  });

  it('fails when short advances drift from the long one', () => {
    faults.driftOnShortAdvance = true;
    expect(offlineMatchesLive(ready()).pass).toBe(false);
  });
});

describe('C4 replayIdentical', () => {
  it('passes when a 3-way split replays the single advance', () => {
    const c = replayIdentical(ready());
    expect(c.pass, c.detail).toBe(true);
    expect(c.detail).toMatch(/^\d+ strikes over 1h/);
  });

  it('fails when the split path drifts', () => {
    faults.driftOnShortAdvance = true;
    expect(replayIdentical(ready()).pass).toBe(false);
  });
});

describe('C5 abandonClean', () => {
  it('passes when abandoning restores boss HP and touches nothing else', () => {
    const c = abandonClean(ready());
    expect(c.pass, c.detail).toBe(true);
  });

  it('fails when abandoning leaks gold', () => {
    faults.leakGoldOnAbandon = true;
    const c = abandonClean(ready());
    expect(c.pass).toBe(false);
    expect(c.detail).toContain('gold changed');
  });

  it('fails on a state whose portal is not open', () => {
    const c = abandonClean(initialState(1));
    expect(c).toEqual({ pass: false, detail: 'could not enter the portal' });
  });
});

describe('C7 remainingTimeCarried', () => {
  it('passes when a mid-gap victory spends the rest of the gap on the next Road', () => {
    const c = remainingTimeCarried(ready());
    expect(c.pass, c.detail).toBe(true);
    expect(c.detail).toMatch(/then \d+ realm-1 kills in the same advance/);
  });

  it('fails when the guardian outlasts the 14-day gap', () => {
    const s = initialState(1);
    s.realm = 60;
    s.portalReady = true;
    const c = remainingTimeCarried(s);
    expect(c).toEqual({ pass: false, detail: 'the guardian did not fall inside 14 days' });
  });

  it('fails on a state whose portal is not open', () => {
    expect(remainingTimeCarried(initialState(1)).pass).toBe(false);
  });
});

describe('C8 earningsBonusIsolated', () => {
  it('passes when five more victories raise gold per kill and leave DPS alone', () => {
    const c = earningsBonusIsolated(ready());
    expect(c.pass, c.detail).toBe(true);
    expect(c.detail).toContain('DPS unchanged');
  });

  it('fails when DPS follows the victory count', () => {
    faults.dpsFollowsVictories = true;
    const c = earningsBonusIsolated(ready());
    expect(c).toEqual({ pass: false, detail: 'the earnings bonus moved DPS' });
  });
});
