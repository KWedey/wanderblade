import { describe, expect, it } from 'vitest';
import {
  abandonBoss,
  advance,
  clockAfter,
  dropChanceFor,
  enterPortal,
  EVENT_CAP,
  initialState,
  killsPerZoneFor,
  leaguesPerKillFor,
  speciesFor,
  speciesIndex,
  summarizeEvents,
  zonesForRealm,
  type EventLog,
  type GameEvent,
  type Recap,
} from '../src/index';
import { aimAtOldestArc, nearPortal, ROAD_KILL0_SEC } from './helpers';

describe('road progression sanity', () => {
  it('the first kill lands on schedule and pays gold', () => {
    const s = initialState(1);
    const events = advance(s, ROAD_KILL0_SEC + 1e-6);
    expect(s.killIndex).toBe(1);
    // enemyGold(0, 0) = 1, scaled by which monster this kill was
    expect(s.gold).toBeCloseTo(speciesFor(1).goldMult, 6);
    expect(s.leagues).toBeCloseTo(leaguesPerKillFor(0), 6);
    expect(events[0]).toMatchObject({
      type: 'kill',
      killIndex: 1,
      realm: 0,
      zone: 0,
      species: speciesIndex(1),
    });
  });

  it('clears a zone every killsPerZone kills and emits the step', () => {
    const s = initialState(1);
    const events: GameEvent[] = [];
    while (s.zone === 0 && s.timeSec < 200_000) events.push(...advance(s, 60));

    expect(s.zone).toBe(1);
    expect(s.collection.zonesCleared).toBe(1);
    const step = events.findIndex((e) => e.type === 'zone');
    expect(step).toBeGreaterThanOrEqual(0);
    expect(events.slice(0, step).filter((e) => e.type === 'kill')).toHaveLength(killsPerZoneFor(0));
    expect(events.filter((e) => e.type === 'zone')).toHaveLength(1);
  });

  it('opens the portal after the last zone, exactly once', () => {
    const s = nearPortal(9, 1);
    const events = advance(s, 5);
    expect(s.portalReady).toBe(true);
    expect(s.zone).toBe(zonesForRealm(0) - 1);
    expect(events.filter((e) => e.type === 'portalReady')).toHaveLength(1);

    const more = advance(s, 3600);
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
    // The drop is announced before what it did: every equipped drop is followed
    // by its own equip, and every equip on the Road follows its drop.
    let equips = 0;
    for (const [i, e] of events.entries()) {
      if (e.type === 'drop' && e.equipped) {
        expect(events[i + 1]).toMatchObject({ type: 'equip', slot: e.slot, power: e.power });
        equips += 1;
      }
    }
    expect(equips).toBeGreaterThan(0);
    expect(events.filter((e) => e.type === 'equip')).toHaveLength(equips);

    const recap = summarizeEvents(events);
    expect(recap.drops / recap.kills).toBeGreaterThan(dropChanceFor(0) * 0.4);
    expect(recap.drops / recap.kills).toBeLessThan(dropChanceFor(0) * 2.2);
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
    const killsBefore = s.killIndex;

    // Aimed strikes, so the recap has catch gold in it as well as kill gold.
    const events: GameEvent[] = [];
    for (let t = 0.5; t <= 5000 + 1e-9; t += 0.5) {
      events.push(...advance(s, t - s.timeSec, [{ atSec: t, aim: aimAtOldestArc(s, t) }]));
    }
    const recap = summarizeEvents(events);

    expect(recap.kills).toBe(s.killIndex - killsBefore);
    expect(recap.goldEarned).toBeCloseTo(s.gold - goldBefore, 3);
    expect(recap.leaguesTraveled).toBeCloseTo(s.leagues, 6);
    expect(recap.arcCatches).toBeGreaterThan(0);
  });

  it('keeps the recap exact even when raw events are capped', () => {
    const s = initialState(1);
    const events = advance(s, 10 * 86_400);
    const recap = summarizeEvents(events);

    expect(events.length).toBeLessThanOrEqual(EVENT_CAP);
    expect(recap.kills).toBe(s.killIndex);
    expect(recap.kills).toBeGreaterThan(EVENT_CAP); // proves capping was exercised
  });

  it('recomputes from a hand-assembled event list', () => {
    const s = initialState(4);
    const events = advance(s, 3000);
    expect(events.recap.seconds).toBe(3000);

    const plain = [...events]; // the spread strips the attached recap
    const recap = summarizeEvents(plain);
    expect(recap.kills).toBe(s.killIndex);
    expect(recap.leaguesTraveled).toBeCloseTo(s.leagues, 6);
    // Recomputed seconds come from the last event, so they trail the advance.
    expect(recap.seconds).toBeGreaterThan(0);
    expect(recap.seconds).toBeLessThanOrEqual(3000);
  });

  /**
   * Zone clears, the portal-opening clear, catches, and a whole guardian
   * attempt are all in the stream; the recount has to see every one of them
   * the way the attached recap did.
   */
  it('recounts Ascendancy, the portal-opening zone, and boss damage from the stream', () => {
    const s = nearPortal(9, 1);
    const stretch: GameEvent[] = [];
    const exact = emptyTotals();
    const fold = (events: EventLog): void => {
      stretch.push(...events);
      add(exact, events.recap);
    };

    fold(advance(s, 5));
    expect(s.portalReady).toBe(true);
    for (let i = 0; i < 120; i++) {
      const at = clockAfter(s.timeSec, 0.5);
      fold(advance(s, 0.5, [{ atSec: at, aim: aimAtOldestArc(s, at) }]));
    }
    const entry = enterPortal(s);
    expect(entry.entered).toBe(true);
    stretch.push(...entry.events);
    fold(advance(s, 120));
    stretch.push(...abandonBoss(s).events);
    fold(advance(s, 60));
    stretch.push(...enterPortal(s).events);
    while (s.phase === 'boss') fold(advance(s, 3600));

    const recount = summarizeEvents(stretch);
    expect(recount.zonesCleared).toBe(exact.zonesCleared);
    expect(recount.zonesCleared).toBeGreaterThan(0);
    expect(recount.pendingAscendancyEarned).toBeCloseTo(exact.pendingAscendancyEarned, 9);
    expect(recount.pendingAscendancyEarned).toBeGreaterThan(0);
    // Swing damage is summed one swing at a time; a difference of HP is one
    // subtraction, so the two agree to float precision, not to the unit.
    expect(recount.bossDamage / exact.bossDamage).toBeCloseTo(1, 9);
    expect(recount.bossDamage).toBeGreaterThan(0);
    expect(recount.victories).toBe(1);
  });
});

function emptyTotals(): Pick<Recap, 'zonesCleared' | 'pendingAscendancyEarned' | 'bossDamage'> {
  return { zonesCleared: 0, pendingAscendancyEarned: 0, bossDamage: 0 };
}

function add(into: ReturnType<typeof emptyTotals>, recap: Recap): void {
  into.zonesCleared += recap.zonesCleared;
  into.pendingAscendancyEarned += recap.pendingAscendancyEarned;
  into.bossDamage += recap.bossDamage;
}
