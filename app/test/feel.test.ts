import { describe, expect, it, vi } from 'vitest';

import { createFeel, type Cue } from '../src/feel';

const CUES: Cue[] = ['strike', 'kill', 'catch', 'buy', 'victory'];

describe('createFeel without an AudioContext', () => {
  it('is silent rather than throwing when the platform has none', () => {
    vi.stubGlobal('window', {});
    const feel = createFeel();
    for (const cue of CUES) expect(() => feel.play(cue)).not.toThrow();
    feel.dispose();
    vi.unstubAllGlobals();
  });

  it('still buzzes when the device vibrates but cannot make sound', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { vibrate });
    const feel = createFeel();
    feel.play('kill');
    expect(vibrate).toHaveBeenCalledTimes(1);
    feel.dispose();
    vi.unstubAllGlobals();
  });

  it('survives a device that refuses to vibrate', () => {
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('blocked by user gesture policy');
      },
    });
    const feel = createFeel();
    expect(() => feel.play('strike')).not.toThrow();
    feel.dispose();
    vi.unstubAllGlobals();
  });
});

describe('hit-stop ranks the beats', () => {
  const feel = createFeel({ muted: true, haptics: false });

  it('gives every cue a finite, non-negative freeze', () => {
    for (const cue of CUES) {
      const stop = feel.hitStopSec(cue);
      expect(Number.isFinite(stop), cue).toBe(true);
      expect(stop, cue).toBeGreaterThanOrEqual(0);
    }
  });

  // A kill has to land heavier than the swing that caused it, or every beat
  // in a combo feels identical and the scene reads as one flat stream.
  it('stops longer for a kill than for a swing, and longest for a victory', () => {
    expect(feel.hitStopSec('kill')).toBeGreaterThan(feel.hitStopSec('strike'));
    expect(feel.hitStopSec('victory')).toBeGreaterThan(feel.hitStopSec('kill'));
  });

  it('never freezes the scene long enough to read as a stall', () => {
    for (const cue of CUES) expect(feel.hitStopSec(cue), cue).toBeLessThan(0.2);
  });

  it('does not stop the scene for a purchase, which is not an impact', () => {
    expect(feel.hitStopSec('buy')).toBe(0);
  });
});

describe('muting', () => {
  it('reports what it was constructed with and honours a change', () => {
    vi.stubGlobal('window', {});
    const feel = createFeel({ muted: true, haptics: false });
    expect(feel.muted()).toBe(true);
    feel.setMuted(false);
    expect(feel.muted()).toBe(false);
    feel.dispose();
    vi.unstubAllGlobals();
  });

  it('keeps haptics off when the caller opted out', () => {
    const vibrate = vi.fn();
    vi.stubGlobal('window', {});
    vi.stubGlobal('navigator', { vibrate });
    const feel = createFeel({ haptics: false });
    feel.play('kill');
    expect(vibrate).not.toHaveBeenCalled();
    feel.dispose();
    vi.unstubAllGlobals();
  });
});
