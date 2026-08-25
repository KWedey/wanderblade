// Presentational flavor: region names, enemy/boss/gear names, and the mapping
// from a core GameEvent to a human log line. The core stays flavor-free; all of
// this is UI-only and never feeds back into game math.

import type { GameEvent, GearSlot, Rarity } from '@wanderblade/core';
import { zonesPerRealm } from '@wanderblade/core';
import { formatNumber } from './format';

/** One rendered log line. `kind` drives its CSS accent. */
export interface LogEntry {
  text: string;
  kind:
    | 'kill'
    | 'equip'
    | 'zone'
    | 'portal'
    | 'boss'
    | 'ascend'
    | 'info';
}

const REGION_NAMES = [
  'Greenwood',
  'Ruinfields',
  'Mistmarsh',
  'Ironhills',
  'Ember Wastes',
  'Dragon Peaks',
  "World's Edge",
];

const ROMAN = [
  '', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
  'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX',
];

function toRoman(n: number): string {
  return ROMAN[n] ?? String(n);
}

/** Named realm for a 0-based realm index; later realms count on past the named set. */
export function realmName(realm: number): string {
  const named = REGION_NAMES[realm];
  if (named) return named;
  const beyondIndex = realm - REGION_NAMES.length + 2;
  return `Beyond the Edge ${toRoman(beyondIndex)}`;
}

/** 1-based zone number within its realm (1..zonesPerRealm). */
export function zoneNumber(zone: number): number {
  return zone + 1;
}

export { zonesPerRealm };

const ENEMY_NAMES: string[][] = [
  ['Ashen Wolf', 'Bramble Boar', 'Thornback Lynx', 'Green Sprite', 'Moss Troll'],
  ['Rubble Golem', 'Tomb Wight', 'Cracked Sentinel', 'Dust Jackal', 'Fallen Squire'],
  ['Bog Lurker', 'Fen Serpent', 'Mire Hag', "Will-o'-Wisp", 'Marsh Drake'],
  ['Iron Kobold', 'Anvil Ogre', 'Rock Wyrm', 'Cragfang Bat', 'Forge Golem'],
  ['Cinder Imp', 'Ash Revenant', 'Magma Hound', 'Ember Wraith', 'Scorched Basilisk'],
  ['Wyvern', 'Frost Drake', 'Peak Roc', 'Storm Serpent', 'Ridge Dragon'],
  ['Void Sentinel', 'Edge Reaver', 'Star Wraith', 'Riftling', 'Astral Behemoth'],
];

const ENEMY_FALLBACK = ['Echo of the Void', 'Nameless Horror', 'Wandering Shade', 'Rift Beast'];

/** Deterministic-looking enemy name; presentational only, keyed off kill index. */
function enemyName(realm: number, killIndex: number): string {
  const pool = ENEMY_NAMES[realm] ?? ENEMY_FALLBACK;
  const idx = ((killIndex % pool.length) + pool.length) % pool.length;
  return pool[idx] ?? ENEMY_FALLBACK[0]!;
}

const BOSS_NAMES = [
  'the Greenwood Warden',
  'the Tomb King',
  'the Mire Witch',
  'the Anvil Colossus',
  'the Ashen Tyrant',
  'the Elder Wyrm',
  'the Edgewalker',
];

/** Named region boss; endless regions share a generic warden. */
export function bossName(region: number): string {
  return BOSS_NAMES[region] ?? 'the Warden of the Beyond';
}

const GEAR_NAMES: Record<GearSlot, Record<Rarity, string>> = {
  weapon: {
    common: 'Iron Blade',
    uncommon: 'Steel Saber',
    rare: 'Runed Longsword',
    epic: 'Dragonfang Greatsword',
  },
  armor: {
    common: 'Leather Jerkin',
    uncommon: 'Chain Hauberk',
    rare: 'Runed Plate',
    epic: 'Dragonscale Aegis',
  },
  trinket: {
    common: 'Copper Charm',
    uncommon: 'Silver Talisman',
    rare: 'Runed Sigil',
    epic: 'Dragon-Eye Amulet',
  },
};

/** Flavor name for a gear item by slot + rarity. */
export function gearName(slot: GearSlot, rarity: Rarity): string {
  return GEAR_NAMES[slot][rarity];
}

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
function article(word: string): string {
  const first = word[0]?.toLowerCase() ?? '';
  return VOWELS.has(first) ? 'an' : 'a';
}

/**
 * Turn a core event into a log line. Returns null for events we intentionally
 * don't surface (raw `drop` — the paired `equip` covers upgrades, and non-equip
 * drops are stowed silently for M2 gear-set collection).
 */
export function describeEvent(e: GameEvent): LogEntry | null {
  switch (e.type) {
    case 'kill': {
      const name = enemyName(e.realm, e.killIndex);
      return {
        kind: 'kill',
        text: `Felled ${article(name)} ${name} — +${formatNumber(e.gold)} gold`,
      };
    }
    case 'drop':
      return null;
    case 'equip':
      return {
        kind: 'equip',
        text: `Equipped ${gearName(e.slot, e.rarity)} (power ${formatNumber(e.power)})`,
      };
    case 'arcCatch':
      return null;
    case 'zone':
      return {
        kind: 'zone',
        text: `Pressed on — ${realmName(e.realm)} Zone ${zoneNumber(e.zone)}`,
      };
    case 'portalReady':
      return {
        kind: 'portal',
        text: `The portal stands open — ${bossName(e.realm)} waits beyond`,
      };
    case 'portalEnter':
      return { kind: 'portal', text: `Stepped through to face ${bossName(e.realm)}` };
    case 'abandon':
      return { kind: 'boss', text: `Withdrew from ${bossName(e.realm)} — the road again` };
    case 'bossVictory':
      return { kind: 'boss', text: `Slew ${bossName(e.realm)}!` };
    case 'ascend':
      return {
        kind: 'ascend',
        text: `Ascended — ${realmName(e.toRealm)} lies open (${formatNumber(e.banked)} Ascendancy banked)`,
      };
    default:
      return null;
  }
}

