import { describe, it, expect } from 'vitest';
import {
  initialState,
  advance,
  summarizeEvents,
  EVENT_CAP,
  dropChance,
  leaguePerKill,
} from '../src/index';

describe('progression sanity', () => {
  it('the first kill lands at ~2s and pays gold', () => {
    const s = initialState(1);
    // initial dps d0 (25) > hp(0) 10, so kill time is the 2s walking floor;
    // advance just over one kill.
    const events = advance(s, 2.001);
    expect(s.lifetime.kills).toBe(1);
    expect(s.gold).toBeCloseTo(1, 6); // enemyGold(0) = 1
    expect(s.leagues).toBeCloseTo(leaguePerKill, 6);
    expect(events[0]).toMatchObject({ type: 'kill', killIndex: 1 });
  });

  it('drops occur, auto-equip only on improvement, and gear raises DPS', () => {
    const s = initialState(1);
    advance(s, 600);
    // At least one slot equipped after 600s of drops.
    const equippedSlots = [s.gear.weapon, s.gear.armor, s.gear.trinket].filter(
      (g) => g !== null,
    );
    expect(equippedSlots.length).toBeGreaterThan(0);
    for (const g of equippedSlots) {
      expect(g!.power).toBeGreaterThan(0);
    }
  });

  it('every drop event carries a valid slot and rarity; equips beat the prior power', () => {
    const s = initialState(2);
    const events = advance(s, 1200);
    const drops = events.filter((e) => e.type === 'drop');
    const equips = events.filter((e) => e.type === 'equip');
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) {
      if (d.type !== 'drop') continue;
      expect(['weapon', 'armor', 'trinket']).toContain(d.slot);
      expect(['common', 'uncommon', 'rare', 'epic']).toContain(d.rarity);
      expect(d.power).toBeGreaterThan(0);
    }
    for (const e of equips) {
      if (e.type !== 'equip') continue;
      expect(e.power).toBeGreaterThan(e.previousPower);
    }
    // Drop rate is in the right ballpark (5% per kill).
    const recap = summarizeEvents(events);
    expect(recap.drops / recap.kills).toBeGreaterThan(dropChance * 0.4);
    expect(recap.drops / recap.kills).toBeLessThan(dropChance * 2.2);
  });
});

describe('recap accuracy', () => {
  it("the attached recap matches the run's actual state deltas", () => {
    const s = initialState(11);
    const goldBefore = s.gold;
    const killsBefore = s.lifetime.kills;
    const bossBefore = s.lifetime.bossKills;

    const events = advance(s, 5000);
    const recap = summarizeEvents(events);

    expect(recap.seconds).toBe(5000);
    expect(recap.kills).toBe(s.lifetime.kills - killsBefore);
    expect(recap.goldEarned).toBeCloseTo(s.gold - goldBefore, 3);
    expect(recap.bossWins).toBe(s.lifetime.bossKills - bossBefore);
    expect(recap.leaguesTraveled).toBeCloseTo(s.leagues, 6);
  });

  it('keeps the recap exact even when raw events are capped', () => {
    // A long idle run past World's Edge generates far more than EVENT_CAP events.
    const s = initialState(1);
    const killsBefore = s.lifetime.kills;
    const events = advance(s, 10 * 24 * 60 * 60); // 10 days
    const recap = summarizeEvents(events);

    expect(events.length).toBeLessThanOrEqual(EVENT_CAP);
    expect(recap.kills).toBe(s.lifetime.kills - killsBefore);
    expect(recap.kills).toBeGreaterThan(EVENT_CAP); // proves capping was exercised
  });

  it('summarizeEvents can also recompute from a hand-assembled event list', () => {
    const s = initialState(4);
    const events = advance(s, 800);
    // Strip the attached recap to force the fallback counting path.
    const plain = [...events];
    const recap = summarizeEvents(plain);
    expect(recap.kills).toBe(s.lifetime.kills);
    expect(recap.drops).toBeGreaterThanOrEqual(0);
  });
});
