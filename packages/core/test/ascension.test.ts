import { describe, expect, it } from 'vitest';
import {
  advance,
  ascendancyBossPayout,
  bossEtaSec,
  buyAscendancyNode,
  earningsMultiplier,
  enterPortal,
  EARNINGS_BONUS_PER_VICTORY,
  goldPerKill,
  heroDps,
  serialize,
  SKILL_IDS,
  zonesForRealm,
  type GameState,
} from '../src/index';
import { clone, portalReady } from './helpers';

/**
 * Stop within 10 ms of the victory swing — closer than one Road kill — so the
 * assertions see the ascension result and not the next realm's first steps.
 */
function advanceToVictory(s: GameState): void {
  const eta = bossEtaSec(s, 0);
  if (Number.isFinite(eta) && eta > 1) advance(s, eta - 1);
  for (let i = 0; i < 2000 && s.phase === 'boss'; i++) advance(s, 0.01);
  expect(s.phase).toBe('road');
}

/** Enter the portal and advance until the guardian falls. */
function felled(seed: number, bossSeconds: number): GameState {
  const s = portalReady(seed, bossSeconds);
  enterPortal(s);
  advanceToVictory(s);
  return s;
}

describe('the ascension transaction', () => {
  it('banks the boss payout plus the whole pending balance, exactly once', () => {
    const s = portalReady(11, 3600);
    const pending = s.ascendancy.pending;
    const payout = ascendancyBossPayout(s.realm);
    enterPortal(s);
    advanceToVictory(s);

    expect(s.ascendancy.banked).toBeCloseTo(pending + payout, 8);
    expect(s.ascendancy.pending).toBe(0);
    expect(s.ascendancy.victories).toBe(1);
  });

  it('resets realm-local power and starts the next realm on the Road at level 0', () => {
    const s = portalReady(11, 3600);
    s.hero.level = 30;
    s.hero.skills.cleave = 4;
    s.leagues = 12;
    enterPortal(s);
    advanceToVictory(s);

    expect(s.phase).toBe('road');
    expect(s.realm).toBe(1);
    expect(s.zone).toBe(0);
    expect(s.killsInZone).toBe(0);
    expect(s.portalReady).toBe(false);
    expect(s.gold).toBe(0);
    expect(s.hero.level).toBe(0);
    expect(s.hero.skills).toEqual(Object.fromEntries(SKILL_IDS.map((id) => [id, 0])));
    expect(s.gear).toEqual({ weapon: null, armor: null, trinket: null });
    expect(s.leagues).toBe(0);
    expect(s.boss.enteredAtSec).toBeNull();
    expect(s.momentum.value).toBe(0);
    expect(s.arcs).toEqual([]);
  });

  it('preserves banked Ascendancy, purchased nodes, collection, stats, and the RNG stream', () => {
    const s = portalReady(11, 3600);
    s.ascendancy.banked = 100;
    buyAscendancyNode(s, 'edge');
    const nodesBefore = { ...s.ascendancy.nodes };
    const bankedAfterBuy = s.ascendancy.banked;
    const gearFoundBefore = s.collection.gearFound;
    enterPortal(s);
    const rngBefore = s.rngState;
    const killIndexBefore = s.killIndex;
    advanceToVictory(s);

    expect(s.ascendancy.nodes).toEqual(nodesBefore);
    expect(s.ascendancy.banked).toBeGreaterThan(bankedAfterBuy);
    expect(s.ascendancy.victories).toBe(1);
    expect(s.collection.gearFound).toBe(gearFoundBefore);
    // The stream position survives ascension; it only advances on Road kills.
    expect(s.killIndex).toBe(killIndexBefore);
    expect(s.rngState).toBe(rngBefore);
  });

  it('increments the earnings bonus exactly once per victory, and never DPS', () => {
    const s = portalReady(11, 3600);
    enterPortal(s);
    advanceToVictory(s);

    expect(s.ascendancy.victories).toBe(1);
    expect(earningsMultiplier(s.ascendancy.victories)).toBeCloseTo(
      1 + EARNINGS_BONUS_PER_VICTORY,
      10,
    );

    // Isolate the bonus: the only difference between these two heroes is the
    // victory count, and it moves gold without moving damage.
    const withBonus = clone(s);
    const withoutBonus = clone(s);
    withoutBonus.ascendancy.victories = 0;
    expect(heroDps(withBonus)).toBe(heroDps(withoutBonus));
    expect(goldPerKill(withBonus)).toBeGreaterThan(goldPerKill(withoutBonus));
  });

  it('emits bossVictory then ascend, once each', () => {
    const s = portalReady(11, 3600);
    enterPortal(s);
    const events = advance(s, 86_400);
    const victories = events.filter((e) => e.type === 'bossVictory');
    const ascends = events.filter((e) => e.type === 'ascend');
    expect(victories).toHaveLength(1);
    expect(ascends).toHaveLength(1);
    expect(events.indexOf(victories[0]!)).toBeLessThan(events.indexOf(ascends[0]!));
    expect(ascends[0]).toMatchObject({ fromRealm: 0, toRealm: 1, victories: 1 });
  });
});

describe('ascension is atomic and idempotent', () => {
  it('runs exactly once however the elapsed time is split', () => {
    const one = portalReady(11, 3600);
    enterPortal(one);
    advance(one, 86_400);

    const many = portalReady(11, 3600);
    enterPortal(many);
    for (let i = 0; i < 24; i++) advance(many, 3600);

    expect(one.ascendancy.victories).toBe(1);
    expect(many.ascendancy.victories).toBe(1);
    expect(serialize(many)).toBe(serialize(one));
  });

  it('runs exactly once across a save/reload boundary', () => {
    const s = portalReady(11, 3600);
    enterPortal(s);
    advance(s, 86_400);
    const bankedAfter = s.ascendancy.banked;

    const reloaded = clone(s);
    advance(reloaded, 86_400);
    expect(reloaded.ascendancy.victories).toBe(1);
    // The next realm earns gold, but no second banking happened.
    expect(reloaded.ascendancy.banked).toBe(bankedAfter);
    expect(reloaded.ascendancy.victories).toBe(1);
  });

  it('spends the remaining offline time on the next realm road', () => {
    const s = portalReady(11, 3600);
    enterPortal(s);
    // The guardian falls early in this window; the rest must be Road time.
    const events = advance(s, 86_400);
    const ascendAt = events.find((e) => e.type === 'ascend')?.timeSec;
    expect(ascendAt).toBeDefined();
    expect(ascendAt!).toBeLessThan(s.timeSec);

    const killsAfter = events.filter((e) => e.type === 'kill' && e.timeSec > ascendAt!);
    expect(killsAfter.length).toBeGreaterThan(0);
    expect(killsAfter.every((e) => e.type === 'kill' && e.realm === 1)).toBe(true);
    expect(s.gold).toBeGreaterThan(0);
    expect(s.realm).toBe(1);
  });

  it('chains multiple realms inside one advance', () => {
    const s = portalReady(11, 3600);
    enterPortal(s);
    advance(s, 86_400);
    expect(s.realm).toBe(1);
    // Walk realm 1's road, then fell its guardian too.
    for (let i = 0; i < 60 && !s.portalReady; i++) advance(s, 86_400);
    expect(s.portalReady).toBe(true);
    expect(s.ascendancy.victories).toBe(1);
  });
});

describe('pending Ascendancy accrual', () => {
  it('accrues on zone clears and stops once the portal is open', () => {
    const s = portalReady(11, 3600);
    s.zone = 0;
    s.killsInZone = 0;
    s.portalReady = false;
    s.ascendancy.pending = 0;

    // Walk the whole road: one grant per zone cleared, then nothing.
    for (let i = 0; i < 400 && !s.portalReady; i++) advance(s, 3600);
    expect(s.portalReady).toBe(true);
    const atPortal = s.ascendancy.pending;
    expect(atPortal).toBeGreaterThan(0);
    expect(s.collection.zonesCleared).toBe(zonesForRealm(0));

    advance(s, 7 * 86_400); // a week of overfarming a ready realm
    expect(s.ascendancy.pending).toBe(atPortal);
  });

  it('cannot be spent before it is banked', () => {
    const s = portalReady(11, 3600);
    s.ascendancy.pending = 1e6;
    s.ascendancy.banked = 0;
    expect(buyAscendancyNode(s, 'edge')).toBe(false);
    expect(s.ascendancy.pending).toBe(1e6);
  });
});

describe('the Ascendancy tree', () => {
  it('spends banked currency and raises DPS', () => {
    const s = portalReady(11, 3600);
    s.ascendancy.banked = 500;
    const dpsBefore = heroDps(s);
    expect(buyAscendancyNode(s, 'edge')).toBe(true);
    expect(s.ascendancy.banked).toBeLessThan(500);
    expect(heroDps(s)).toBeGreaterThan(dpsBefore);
  });

  it('refuses unknown nodes and unaffordable ranks, but never a rank for depth', () => {
    const s = portalReady(11, 3600);
    expect(buyAscendancyNode(s, 'nope')).toBe(false);
    s.ascendancy.banked = 0;
    expect(buyAscendancyNode(s, 'edge')).toBe(false);

    // Uncapped: banked Ascendancy always has somewhere to go, so the only
    // refusal left is not being able to pay for it.
    s.ascendancy.banked = 1e9;
    for (let i = 0; i < 500; i++) expect(buyAscendancyNode(s, 'edge')).toBe(true);
    expect(s.ascendancy.nodes.edge).toBe(500);

    s.ascendancy.banked = 0;
    const banked = s.ascendancy.banked;
    expect(buyAscendancyNode(s, 'edge')).toBe(false);
    expect(s.ascendancy.banked).toBe(banked);
    expect(s.ascendancy.nodes.edge).toBe(500);
  });

  it('carries its combat power into the next realm', () => {
    const bare = felled(11, 3600);
    const geared = felled(11, 3600);
    geared.ascendancy.banked += 1e6;
    for (let i = 0; i < 12; i++) buyAscendancyNode(geared, 'edge');
    expect(heroDps(geared)).toBeGreaterThan(heroDps(bare));
  });
});
