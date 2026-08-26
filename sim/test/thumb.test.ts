import { describe, expect, it } from 'vitest';

import { runThumb, sweep, warmState, type Thumb } from '../src/thumb';

const OPTS = { seed: 7, seconds: 30, pxPerUnit: 31, seeds: 1 };

function thumb(over: Partial<Thumb> = {}): Thumb {
  return { latencyMs: 0, scatterPx: 0, tapsPerSec: 5, lead: 0, pick: 'apex', ...over };
}

describe('the harness measures the thumb, not itself', () => {
  // The calibration that matters: a thumb with no latency and no scatter is the
  // oracle, and the oracle catches nearly everything. Anchoring the aim to the
  // engine clock instead of the strike's own stamp leaves it half a tap stale
  // and reads as 1% — the game looking broken when the harness is.
  it('catches nearly everything with no latency and no scatter', () => {
    const r = runThumb(thumb(), OPTS, warmState(OPTS.seed));
    expect(r.aimed).toBeGreaterThan(50);
    expect(r.catchRate).toBeGreaterThan(0.9);
  });

  it('replays exactly for the same inputs', () => {
    const warm = warmState(OPTS.seed);
    const a = runThumb(thumb({ latencyMs: 120, scatterPx: 6 }), OPTS, warm);
    const b = runThumb(thumb({ latencyMs: 120, scatterPx: 6 }), OPTS, warm);
    expect(a.catches).toBe(b.catches);
    expect(a.goldPerSec).toBe(b.goldPerSec);
  });

  // Leading the coin perfectly is the same thing as having no latency, so this
  // pins the two axes against each other: if they ever disagree, one is wrong.
  it('cancels latency entirely at full prediction', () => {
    const warm = warmState(OPTS.seed);
    const slow = runThumb(thumb({ latencyMs: 400, lead: 1 }), OPTS, warm);
    const instant = runThumb(thumb({ latencyMs: 0, lead: 0 }), OPTS, warm);
    expect(slow.catchRate).toBeCloseTo(instant.catchRate, 6);
  });
});

describe('what the thumb costs', () => {
  it('loses catches as aim scatters', () => {
    const warm = warmState(OPTS.seed);
    const rates = [0, 4, 12].map(
      (scatterPx) => runThumb(thumb({ latencyMs: 200, scatterPx }), OPTS, warm).catchRate,
    );
    expect(rates[0]!).toBeGreaterThan(rates[1]!);
    expect(rates[1]!).toBeGreaterThan(rates[2]!);
  });

  // The finding this harness exists to protect. A coin at its apex has no
  // vertical speed, so a late strike still lands inside the catch radius; the
  // same strike aimed at a coin about to touch down misses by the height it
  // fell. Same mechanic, same latency, two different games.
  it('is far more forgiving of lag at the apex than near landing', () => {
    const warm = warmState(OPTS.seed);
    const at = (pick: 'landing' | 'apex'): number =>
      runThumb(thumb({ latencyMs: 250, pick }), OPTS, warm).catchRate;
    expect(at('apex')).toBeGreaterThan(0.5);
    expect(at('landing')).toBeLessThan(0.2);
  });
});

describe('the sweep', () => {
  it('returns one row per combination, in a stable order', () => {
    const axes = {
      latencyMs: [0, 200],
      scatterPx: [0],
      tapsPerSec: [5],
      lead: [0],
      pick: ['apex'] as ('landing' | 'apex')[],
    };
    const rows = sweep(axes, { ...OPTS, seconds: 20 });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.thumb.latencyMs)).toEqual([0, 200]);
  });

  it('reports every cell against the same idle baseline', () => {
    const rows = sweep(
      {
        latencyMs: [0],
        scatterPx: [0],
        tapsPerSec: [5],
        lead: [0],
        pick: ['apex'] as ('landing' | 'apex')[],
      },
      { ...OPTS, seconds: 20 },
    );
    expect(rows[0]!.vsIdle).toBeGreaterThan(1);
  });
});
