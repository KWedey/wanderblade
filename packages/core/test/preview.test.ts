import { describe, expect, it } from 'vitest';
import {
  advance,
  bossEtaSec,
  bossHp,
  enterPortal,
  gearPower,
  GEAR_SLOTS,
  initialState,
  zonesPerRealm,
  type GameState,
} from '../src/index';

/** A portal-ready Road state in `realm` whose build can actually fell the guardian. */
function readyIn(realm: number, gearZone = zonesPerRealm - 1): GameState {
  const s = initialState(9);
  s.realm = realm;
  s.zone = zonesPerRealm - 1;
  s.killsInZone = 0;
  s.portalReady = true;
  s.hero.level = 120;
  for (const slot of GEAR_SLOTS) {
    const power = gearPower(realm, gearZone, 'epic', slot);
    s.gear[slot] = { power, rarity: 'epic', realm, zone: gearZone };
  }
  s.ascendancy.nodes = { edge: realm, heft: realm, fury: realm };
  s.ascendancy.victories = realm;
  return s;
}

/** Fight to the death at `momentum`, in small steps, and return the elapsed time. */
function fightOut(s: GameState, momentum: number, capSec: number): number | null {
  const start = s.timeSec;
  const rate = momentum > 0 ? 4 : 0;
  let next = s.timeSec;
  while (s.phase === 'boss' && s.timeSec - start < capSec) {
    const step = Math.min(30, capSec - (s.timeSec - start));
    if (rate > 0) {
      const strikes = [];
      for (let t = next; t < s.timeSec + step; t += 1 / rate) {
        strikes.push({ atSec: t, aim: null });
      }
      next = s.timeSec + step;
      advance(s, step, strikes);
    } else {
      advance(s, step);
    }
  }
  return s.phase === 'boss' ? null : s.timeSec - start;
}

describe('the portal preview is the number the player commits on', () => {
  it('previews the fight the portal would start, not zero, while on the Road', () => {
    for (const realm of [0, 1, 3, 7]) {
      const s = readyIn(realm);
      expect(s.phase).toBe('road');
      expect(s.boss.hpRemaining).toBe(0);

      const preview = bossEtaSec(s, 1);
      expect(preview).toBeGreaterThan(0);
      expect(Number.isFinite(preview)).toBe(true);
    }
  });

  it('matches, on entry, the estimate it showed a moment earlier', () => {
    for (const realm of [0, 2, 5]) {
      const s = readyIn(realm);
      const preview = bossEtaSec(s, 1);
      expect(enterPortal(s).entered).toBe(true);
      expect(bossEtaSec(s, 1)).toBeCloseTo(preview, 6);
      expect(s.boss.hpMax).toBe(bossHp(realm));
    }
  });

  it('predicts how long the fight actually takes, at the momentum it assumes', () => {
    for (const realm of [0, 2, 4]) {
      const s = readyIn(realm);
      const idlePreview = bossEtaSec(s, 0);
      expect(Number.isFinite(idlePreview)).toBe(true);
      expect(enterPortal(s).entered).toBe(true);

      const actual = fightOut(s, 0, idlePreview * 4 + 600);
      expect(actual).not.toBeNull();
      // Swings are discrete, so the last one overshoots by less than one swing.
      expect(actual as number).toBeGreaterThan(idlePreview * 0.95);
      expect(actual as number).toBeLessThan(idlePreview * 1.05 + 2);
    }
  });

  it('falls only as the guardian loses HP, never jumping to zero mid-fight', () => {
    const s = readyIn(2);
    expect(enterPortal(s).entered).toBe(true);
    let prev = bossEtaSec(s, 0);
    for (let i = 0; i < 40 && s.phase === 'boss'; i++) {
      advance(s, 30);
      if (s.phase !== 'boss') break;
      const now = bossEtaSec(s, 0);
      expect(now).toBeLessThanOrEqual(prev + 1e-6);
      expect(now).toBeGreaterThan(0);
      prev = now;
    }
  });

  it('reports an unknowable guardian as Infinity, never as zero', () => {
    // Zero is the one wrong answer that reads as an invitation to commit.
    const s = readyIn(0);
    expect(enterPortal(s).entered).toBe(true);
    for (const hp of [Number.POSITIVE_INFINITY, Number.NaN]) {
      s.boss.hpRemaining = hp;
      expect(bossEtaSec(s, 1)).toBe(Infinity);
    }
  });

  it('never previews zero for a realm whose guardian HP has overflowed', () => {
    const s = readyIn(0);
    s.realm = 400; // past the bossHp overflow frontier pinned in magnitude.test.ts
    expect(Number.isFinite(bossHp(s.realm))).toBe(false);
    expect(bossEtaSec(s, 1)).toBe(Infinity);
    expect(bossEtaSec(s, 0)).toBe(Infinity);
  });
});
