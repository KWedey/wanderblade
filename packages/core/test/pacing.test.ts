import { describe, expect, it } from 'vitest';
import {
  advance,
  BOSS_BAND_FULL_SEC,
  BOSS_BAND_REALM0_SEC,
  bossBand,
  bossEtaSec,
  bossHp,
  bossHpMultFor,
  bossHpMultFull,
  bossHpMultRealm0,
  deserialize,
  enterPortal,
  FULL_LENGTH_REALM,
  initialState,
  KILLS_PER_ZONE_FULL,
  KILLS_PER_ZONE_REALM0,
  killsPerZoneFor,
  leaguesPerKillFor,
  minKillTimeSec,
  PORTAL_BAND_FULL_SEC,
  PORTAL_BAND_REALM0_SEC,
  portalBand,
  realmRamp,
  serialize,
  ZONES_FULL,
  ZONES_REALM0,
  zonesForRealm,
} from '../src/index';

const REALMS = [0, 1, 2, 3, 4, 5, 6, 12, 50, 300];

function monotone(f: (realm: number) => number): void {
  for (let r = 0; r < 20; r++) expect(f(r + 1)).toBeGreaterThanOrEqual(f(r));
}

describe('realm length is a function of the realm index (docs/DECISIONS.md #63)', () => {
  it('ramps from the tutorial realm to the full ladder and then holds', () => {
    expect(realmRamp(0)).toBe(0);
    expect(realmRamp(FULL_LENGTH_REALM)).toBe(1);
    expect(realmRamp(FULL_LENGTH_REALM + 40)).toBe(1);
    expect(realmRamp(1)).toBeGreaterThan(0);
    expect(realmRamp(1)).toBeLessThan(1);
  });

  it('pins both ends of the zone and kill counts to their constants', () => {
    expect(zonesForRealm(0)).toBe(ZONES_REALM0);
    expect(killsPerZoneFor(0)).toBe(KILLS_PER_ZONE_REALM0);
    for (const r of [FULL_LENGTH_REALM, 9, 300]) {
      expect(zonesForRealm(r)).toBe(ZONES_FULL);
      expect(killsPerZoneFor(r)).toBe(KILLS_PER_ZONE_FULL);
    }
  });

  it('grows monotonically and stays integer between the ends', () => {
    monotone(zonesForRealm);
    monotone(killsPerZoneFor);
    monotone((r) => zonesForRealm(r) * killsPerZoneFor(r));
    for (const r of REALMS) {
      expect(Number.isInteger(zonesForRealm(r))).toBe(true);
      expect(Number.isInteger(killsPerZoneFor(r))).toBe(true);
      expect(zonesForRealm(r)).toBeGreaterThan(1);
      expect(killsPerZoneFor(r)).toBeGreaterThan(1);
    }
    expect(zonesForRealm(1)).toBeGreaterThan(zonesForRealm(0));
    expect(zonesForRealm(FULL_LENGTH_REALM - 1)).toBeLessThan(ZONES_FULL);
  });

  it('a zone is one league in every realm', () => {
    for (const r of REALMS) {
      expect(leaguesPerKillFor(r) * killsPerZoneFor(r)).toBeCloseTo(1, 12);
    }
  });

  it('the guardian multiple ramps between its two ends and never falls', () => {
    expect(bossHpMultFor(0)).toBeCloseTo(bossHpMultRealm0, 9);
    expect(bossHpMultFor(FULL_LENGTH_REALM)).toBeCloseTo(bossHpMultFull, 9);
    expect(bossHpMultFor(200)).toBeCloseTo(bossHpMultFull, 9);
    const lo = Math.min(bossHpMultRealm0, bossHpMultFull);
    const hi = Math.max(bossHpMultRealm0, bossHpMultFull);
    for (const r of REALMS) {
      expect(bossHpMultFor(r)).toBeGreaterThanOrEqual(lo - 1e-9);
      expect(bossHpMultFor(r)).toBeLessThanOrEqual(hi + 1e-9);
    }
  });
});

describe('the pacing bands ramp with the realm', () => {
  it('portal bands pin both ends and interpolate monotonically', () => {
    expect(portalBand(0)).toEqual(PORTAL_BAND_REALM0_SEC);
    expect(portalBand(FULL_LENGTH_REALM)).toEqual(PORTAL_BAND_FULL_SEC);
    expect(portalBand(77)).toEqual(PORTAL_BAND_FULL_SEC);
    monotone((r) => portalBand(r).active.minSec);
    monotone((r) => portalBand(r).active.maxSec);
    monotone((r) => portalBand(r).idle.minSec);
    monotone((r) => portalBand(r).idle.maxSec);
    for (const r of REALMS) {
      const b = portalBand(r);
      expect(b.active.minSec).toBeLessThan(b.active.maxSec);
      expect(b.idle.minSec).toBeLessThan(b.idle.maxSec);
      expect(b.active.maxSec).toBeLessThan(b.idle.maxSec);
    }
  });

  it('the guardian band pins both ends and interpolates monotonically', () => {
    expect(bossBand(0)).toEqual(BOSS_BAND_REALM0_SEC);
    expect(bossBand(FULL_LENGTH_REALM)).toEqual(BOSS_BAND_FULL_SEC);
    expect(bossBand(300)).toEqual(BOSS_BAND_FULL_SEC);
    monotone((r) => bossBand(r).minSec);
    monotone((r) => bossBand(r).maxSec);
    for (const r of REALMS) expect(bossBand(r).minSec).toBeLessThan(bossBand(r).maxSec);
  });

  it('the tutorial realm is a fraction of a full one on every axis', () => {
    expect(zonesForRealm(0) * killsPerZoneFor(0)).toBeLessThan(
      (zonesForRealm(FULL_LENGTH_REALM) * killsPerZoneFor(FULL_LENGTH_REALM)) / 5,
    );
    expect(portalBand(0).active.maxSec).toBeLessThanOrEqual(20 * 60);
    expect(portalBand(0).idle.maxSec).toBeLessThanOrEqual(80 * 60);
    expect(bossBand(0).maxSec).toBeLessThanOrEqual(6 * 60);
  });
});

describe('the engine walks the road the pacing functions describe', () => {
  it('opens realm 0 on its last zone after exactly its kills', () => {
    const s = initialState(3);
    let zoneEvents = 0;
    while (!s.portalReady && s.timeSec < 30 * 86_400) {
      zoneEvents += advance(s, 600).filter((e) => e.type === 'zone').length;
    }
    expect(s.portalReady).toBe(true);
    expect(s.zone).toBe(zonesForRealm(0) - 1);
    expect(zoneEvents).toBe(zonesForRealm(0) - 1);
    expect(s.collection.zonesCleared).toBe(zonesForRealm(0));
    expect(s.killIndex).toBeGreaterThanOrEqual(zonesForRealm(0) * killsPerZoneFor(0));
    expect(s.leagues).toBeGreaterThanOrEqual(zonesForRealm(0) - 1e-9);
  });

  it('the next realm has a longer road with more kills per zone', () => {
    const s = initialState(9);
    s.realm = 1;
    s.gear.weapon = { power: 1e12, rarity: 'epic', realm: 1, zone: 0 };
    s.nextActionAtSec = s.timeSec;
    const ev = advance(s, killsPerZoneFor(1) * minKillTimeSec + 30);
    const firstZone = ev.findIndex((e) => e.type === 'zone');
    expect(firstZone).toBeGreaterThan(0);
    expect(ev.slice(0, firstZone).filter((e) => e.type === 'kill')).toHaveLength(
      killsPerZoneFor(1),
    );
    expect(killsPerZoneFor(1)).toBeGreaterThan(killsPerZoneFor(0));
    expect(zonesForRealm(1)).toBeGreaterThan(zonesForRealm(0));
  });
});

describe('a save from a longer road loads onto today\'s', () => {
  function saved(realm: number, zone: number, killsInZone: number, portalReady = false): string {
    const s = initialState(21);
    s.realm = realm;
    s.zone = zone;
    s.killsInZone = killsInZone;
    s.portalReady = portalReady;
    return serialize(s);
  }

  it('clamps a zone past the end of the realm to the last zone with the portal open', () => {
    const s = deserialize(saved(0, 49, 700));
    expect(s.zone).toBe(zonesForRealm(0) - 1);
    expect(s.killsInZone).toBe(0);
    expect(s.portalReady).toBe(true);
    expect(s.realm).toBe(0);
  });

  it('opens the portal for a save on the last zone with more kills than the zone now holds', () => {
    const last = zonesForRealm(2) - 1;
    const s = deserialize(saved(2, last, killsPerZoneFor(2) + 300));
    expect(s.zone).toBe(last);
    expect(s.portalReady).toBe(true);
    expect(s.killsInZone).toBe(0);
  });

  it('trims kills that overshoot a mid-road zone so the very next kill clears it', () => {
    const s = deserialize(saved(1, 3, 1199));
    expect(s.zone).toBe(3);
    expect(s.killsInZone).toBe(killsPerZoneFor(1) - 1);
    expect(s.portalReady).toBe(false);
    const ev = advance(s, 5);
    expect(ev.find((e) => e.type === 'zone')).toMatchObject({ zone: 4 });
  });

  it('leaves a save inside today\'s road untouched', () => {
    const json = saved(3, 5, 17);
    expect(serialize(deserialize(json))).toBe(json);
  });

  it('keeps advancing after a clamped load, exactly like a road that reached the end', () => {
    const clamped = deserialize(saved(0, 49, 700));
    const walked = initialState(21);
    walked.zone = zonesForRealm(0) - 1;
    walked.killsInZone = 0;
    walked.portalReady = true;
    expect(serialize(clamped)).toBe(serialize(walked));
    const a = advance(clamped, 600);
    const b = advance(walked, 600);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(clamped.zone).toBe(zonesForRealm(0) - 1);
  });

  it('resizes a mid-fight guardian from the longer road, keeping its fraction of HP', () => {
    const s = initialState(21);
    s.zone = 49;
    s.portalReady = true;
    expect(enterPortal(s).entered).toBe(true);
    const oldHp = bossHp(0) * 1e8;
    s.boss = { hpRemaining: oldHp * 0.4, hpMax: oldHp, enteredAtSec: s.timeSec };
    const loaded = deserialize(serialize(s));
    expect(loaded.phase).toBe('boss');
    expect(loaded.zone).toBe(zonesForRealm(0) - 1);
    expect(loaded.boss.hpMax).toBe(bossHp(0));
    expect(loaded.boss.hpRemaining).toBeCloseTo(bossHp(0) * 0.4, 6);
    expect(bossEtaSec(loaded, 1)).toBeLessThan(bossEtaSec(s, 1) / 1e7);
  });

  it("leaves a fight on today's road byte-identical through a reload", () => {
    const s = initialState(21);
    s.zone = zonesForRealm(0) - 1;
    s.portalReady = true;
    expect(enterPortal(s).entered).toBe(true);
    advance(s, 30);
    const json = serialize(s);
    expect(serialize(deserialize(json))).toBe(json);
  });
});
