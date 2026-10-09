import { describe, expect, it } from 'vitest';

import { createHeldAim } from '../src/hold';

describe('a held strike aims where the thumb is now', () => {
  // The shipped bug: startHold closed over clientX/clientY from pointerdown and
  // pointermove was not listened to at all. A player sliding onto a different
  // coin kept striking the point they first touched, and aim is the whole
  // active layer — the harness measured 0.8% against 55.5% on the same tap.
  it('follows the pointer instead of the point it started at', () => {
    const aim = createHeldAim();
    aim.begin({ x: 10, y: 20 });
    expect(aim.target()).toEqual({ x: 10, y: 20 });
    aim.moved(140, 90);
    expect(aim.target()).toEqual({ x: 140, y: 90 });
    aim.moved(300, 40);
    expect(aim.target()).toEqual({ x: 300, y: 40 });
  });

  it('stops aiming once the thumb lifts', () => {
    const aim = createHeldAim();
    aim.begin({ x: 10, y: 20 });
    aim.end();
    expect(aim.held()).toBe(false);
    aim.moved(140, 90);
    expect(aim.target()).toBeNull();
  });

  // A keyboard hold has no pointer and relies on the scene's auto-aim. A mouse
  // drifting across the window while a key is down must not start steering it.
  it('leaves a keyboard hold on auto-aim however the mouse moves', () => {
    const aim = createHeldAim();
    aim.begin(null);
    expect(aim.held()).toBe(true);
    aim.moved(140, 90);
    expect(aim.target()).toBeNull();
  });

  it('forgets the previous hold when a new one begins', () => {
    const aim = createHeldAim();
    aim.begin({ x: 10, y: 20 });
    aim.moved(140, 90);
    aim.end();
    aim.begin({ x: 5, y: 5 });
    expect(aim.target()).toEqual({ x: 5, y: 5 });
  });
});
