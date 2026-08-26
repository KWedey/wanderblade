import { describe, expect, it } from 'vitest';
import {
  abandonBoss,
  advance,
  buyAscendancyNode,
  buyHeroLevel,
  buySkill,
  enterPortal,
  initialState,
  zonesPerRealm,
} from '../src/index';
import { idleTo, nearPortal, portalReady, strikesAt } from './helpers';

// Subsumes the deleted gate.test.ts / boss.test.ts / autochallenge.test.ts:
// the readiness meter, the retry cooldown, and auto-challenge are gone, and the
// behaviour that replaces them is manual entry into a zero-income boss phase.
describe('phase exclusivity and manual entry', () => {
  it('starts on the Road with the portal shut', () => {
    const s = initialState(1);
    expect(s.phase).toBe('road');
    expect(s.portalReady).toBe(false);
    expect(s.boss.enteredAtSec).toBeNull();
  });

  it('refuses portal entry before the road is walked', () => {
    const s = idleTo(3, 600);
    expect(s.portalReady).toBe(false);
    expect(enterPortal(s).entered).toBe(false);
    expect(s.phase).toBe('road');
  });

  it('never enters the portal on its own, however long it advances', () => {
    const s = nearPortal(9, 60);
    // A week of pure idle: the portal opens on the first kill, but nothing
    // in advance may cross into the boss phase.
    advance(s, 7 * 86_400);
    expect(s.portalReady).toBe(true);
    expect(s.phase).toBe('road');
    expect(s.lifetime.ascensions).toBe(0);
  });

  it('never enters the portal on its own while the player is striking, either', () => {
    const s = nearPortal(9, 60);
    advance(s, 7 * 86_400);
    const t = s.timeSec;
    advance(s, 600, strikesAt(t, 600, 4));
    expect(s.phase).toBe('road');
  });

  it('enters only on the explicit action, at full guardian HP', () => {
    const s = portalReady(4, 4 * 3600);
    const res = enterPortal(s);
    expect(res.entered).toBe(true);
    expect(s.phase).toBe('boss');
    expect(s.boss.hpRemaining).toBe(s.boss.hpMax);
    expect(s.boss.enteredAtSec).toBe(s.timeSec);
    expect(res.events[0]).toMatchObject({ type: 'portalEnter', realm: 0 });
  });

  it('refuses a second entry while already in the boss phase', () => {
    const s = portalReady(4, 4 * 3600);
    enterPortal(s);
    expect(enterPortal(s).entered).toBe(false);
  });

  it('keeps farming the final zone once the portal is open, without advancing it', () => {
    const s = nearPortal(9, 60);
    advance(s, 3600);
    expect(s.portalReady).toBe(true);
    expect(s.zone).toBe(zonesPerRealm - 1);
    const killsBefore = s.lifetime.kills;
    advance(s, 3600);
    expect(s.lifetime.kills).toBeGreaterThan(killsBefore);
    expect(s.zone).toBe(zonesPerRealm - 1);
    expect(s.realm).toBe(0);
  });
});

describe('the boss phase pays nothing', () => {
  it('freezes gold, gear, road position, pending Ascendancy, and collection', () => {
    const s = portalReady(6, 4 * 3600);
    enterPortal(s);
    const before = {
      gold: s.gold,
      pending: s.ascendancy.pending,
      zone: s.zone,
      leagues: s.leagues,
      kills: s.lifetime.kills,
      gearFound: s.collection.gearFound,
      zonesCleared: s.collection.zonesCleared,
      weapon: s.gear.weapon?.power,
    };

    advance(s, 1800, strikesAt(s.timeSec, 1800, 4));

    expect(s.phase).toBe('boss');
    expect(s.gold).toBe(before.gold);
    expect(s.ascendancy.pending).toBe(before.pending);
    expect(s.zone).toBe(before.zone);
    expect(s.leagues).toBe(before.leagues);
    expect(s.lifetime.kills).toBe(before.kills);
    expect(s.collection.gearFound).toBe(before.gearFound);
    expect(s.collection.zonesCleared).toBe(before.zonesCleared);
    expect(s.gear.weapon?.power).toBe(before.weapon);
    // Damage is the one thing that did accrue.
    expect(s.boss.hpRemaining).toBeLessThan(s.boss.hpMax);
  });

  it('emits no Road events during the fight', () => {
    const s = portalReady(6, 4 * 3600);
    enterPortal(s);
    const events = advance(s, 1800, strikesAt(s.timeSec, 1800, 4));
    const roadTypes = ['kill', 'drop', 'equip', 'arcCatch', 'zone', 'portalReady'];
    expect(events.filter((e) => roadTypes.includes(e.type))).toEqual([]);
  });

  it('does not consume the RNG stream', () => {
    const s = portalReady(6, 4 * 3600);
    enterPortal(s);
    const rngBefore = s.rngState;
    const killIndexBefore = s.killIndex;
    advance(s, 3600);
    expect(s.rngState).toBe(rngBefore);
    expect(s.killIndex).toBe(killIndexBefore);
  });

  it('locks every purchase for the duration of the attempt', () => {
    const s = portalReady(6, 4 * 3600);
    s.gold = 1e9;
    s.hero.level = 20;
    s.ascendancy.banked = 1e6;
    enterPortal(s);

    expect(buyHeroLevel(s)).toBe(false);
    expect(buySkill(s, 'cleave')).toBe(false);
    expect(buyAscendancyNode(s, 'edge')).toBe(false);
    expect(s.hero.level).toBe(20);
    expect(s.ascendancy.nodes.edge).toBe(0);
  });

  it('has no death, enrage, or automatic failure — HP only ever falls', () => {
    const s = portalReady(6, 30 * 86_400);
    enterPortal(s);
    let last = s.boss.hpRemaining;
    for (let i = 0; i < 20; i++) {
      advance(s, 3600);
      expect(s.boss.hpRemaining).toBeLessThanOrEqual(last);
      last = s.boss.hpRemaining;
    }
    expect(s.phase).toBe('boss'); // a weak build simply takes longer
  });
});

describe('abandonment', () => {
  it('resets only boss damage, keeping the Road build and pending Ascendancy', () => {
    const s = portalReady(6, 4 * 3600);
    const goldBefore = s.gold;
    const pendingBefore = s.ascendancy.pending;
    const levelBefore = s.hero.level;
    enterPortal(s);
    advance(s, 600);
    expect(s.boss.hpRemaining).toBeLessThan(s.boss.hpMax);

    const res = abandonBoss(s);
    expect(res.abandoned).toBe(true);
    expect(s.phase).toBe('road');
    expect(s.portalReady).toBe(true);
    expect(s.gold).toBe(goldBefore);
    expect(s.ascendancy.pending).toBe(pendingBefore);
    expect(s.hero.level).toBe(levelBefore);
    expect(s.ascendancy.banked).toBe(0); // abandonment never banks
    expect(s.lifetime.ascensions).toBe(0);
  });

  it('restores full guardian HP on re-entry', () => {
    const s = portalReady(6, 4 * 3600);
    enterPortal(s);
    const full = s.boss.hpMax;
    advance(s, 600);
    abandonBoss(s);
    enterPortal(s);
    expect(s.boss.hpRemaining).toBe(full);
  });

  it('is a no-op on the Road', () => {
    const s = portalReady(6, 4 * 3600);
    expect(abandonBoss(s).abandoned).toBe(false);
  });

  it('resumes Road income immediately', () => {
    const s = portalReady(6, 4 * 3600);
    enterPortal(s);
    advance(s, 600);
    abandonBoss(s);
    const goldBefore = s.gold;
    advance(s, 600);
    expect(s.gold).toBeGreaterThan(goldBefore);
  });
});
