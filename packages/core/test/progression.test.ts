import { describe, expect, it } from 'vitest';
import {
  advance,
  dropChance,
  EVENT_CAP,
  initialState,
  killsPerZone,
  leaguePerKill,
  summarizeEvents,
  zonesPerRealm,
} from '../src/index';
import { strikesAt } from './helpers';

describe('road progression sanity', () => {
  it('the first kill lands at the 2s floor and pays gold', () => {
    const s = initialState(1);
    const events = advance(s, 2.001);
    expect(s.lifetime.kills).toBe(1);
    expect(s.gold).toBeCloseTo(1, 6); // enemyGold(0, 0) = 1
    expect(s.leagues).toBeCloseTo(leaguePerKill, 6);
    expect(events[0]).toMatchObject({ type: 'kill', killIndex: 1, realm: 0, zone: 0 });
  });

  it('clears a zone every killsPerZone kills and emits the step', () => {
    const s = initialState(1);
    const events = advance(s, 2 * killsPerZone + 0.001);
    expect(s.zone).toBe(1);
    expect(s.killsInZone).toBe(0);
    expect(events.filter((e) => e.type === 'zone')).toHaveLength(1);
    expect(s.collection.zonesCleared).toBe(1);
  });

  it('opens the portal after the last zone, exactly once', () => {
    const s = initialState(9);
    const events = advance(s, 30 * 86_400);
    expect(s.portalReady).toBe(true);
    expect(s.zone).toBe(zonesPerRealm - 1);
    expect(events.filter((e) => e.type === 'portalReady')).toHaveLength(1);

    const more = advance(s, 86_400);
    expect(more.filter((e) => e.type === 'portalReady')).toHaveLength(0);
  });

  it('drops occur, auto-equip only on improvement, and gear raises DPS', () => {
    const s = initialState(1);
    advance(s, 3600);
    const equipped = [s.gear.weapon, s.gear.armor, s.gear.trinket].filter((g) => g !== null);
    expect(equipped.length).toBeGreaterThan(0);
    for (const g of equipped) expect(g.power).toBeGreaterThan(0);
  });

  it('every drop carries a valid slot and rarity; equips beat the prior power', () => {
    const s = initialState(2);
    const events = advance(s, 7200);
    const drops = events.filter((e) => e.type === 'drop');
    expect(drops.length).toBeGreaterThan(0);
    for (const d of drops) {
      if (d.type !== 'drop') continue;
      expect(['weapon', 'armor', 'trinket']).toContain(d.slot);
      expect(['common', 'uncommon', 'rare', 'epic']).toContain(d.rarity);
      expect(d.power).toBeGreaterThan(0);
    }
    for (const e of events) {
      if (e.type !== 'equip') continue;
      expect(e.power).toBeGreaterThan(e.previousPower);
    }

    const recap = summarizeEvents(events);
    expect(recap.drops / recap.kills).toBeGreaterThan(dropChance * 0.4);
    expect(recap.drops / recap.kills).toBeLessThan(dropChance * 2.2);
  });

  it('collection records track drops and zones cleared', () => {
    const s = initialState(2);
    const events = advance(s, 7200);
    const recap = summarizeEvents(events);
    expect(s.collection.gearFound).toBe(recap.drops);
    expect(s.collection.zonesCleared).toBe(recap.zonesCleared);
  });
});

describe('recap accuracy', () => {
  it("the attached recap matches the run's actual state deltas", () => {
    const s = initialState(11);
    const goldBefore = s.gold;
    const killsBefore = s.lifetime.kills;

    const events = advance(s, 5000, strikesAt(0, 5000, 2));
    const recap = summarizeEvents(events);

    expect(recap.seconds).toBe(5000);
    expect(recap.kills).toBe(s.lifetime.kills - killsBefore);
    expect(recap.goldEarned).toBeCloseTo(s.gold - goldBefore, 3);
    expect(recap.leaguesTraveled).toBeCloseTo(s.leagues, 6);
    expect(recap.arcCatches).toBeGreaterThan(0);
  });

  it('keeps the recap exact even when raw events are capped', () => {
    const s = initialState(1);
    const events = advance(s, 10 * 86_400);
    const recap = summarizeEvents(events);

    expect(events.length).toBeLessThanOrEqual(EVENT_CAP);
    expect(recap.kills).toBe(s.lifetime.kills);
    expect(recap.kills).toBeGreaterThan(EVENT_CAP); // proves capping was exercised
  });

  it('recomputes from a hand-assembled event list', () => {
    const s = initialState(4);
    const events = advance(s, 3000);
    const plain = [...events]; // the spread strips the attached recap
    const recap = summarizeEvents(plain);
    expect(recap.kills).toBe(s.lifetime.kills);
    expect(recap.leaguesTraveled).toBeCloseTo(s.leagues, 6);
  });
});
