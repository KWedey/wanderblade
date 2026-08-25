// Presentational flavor: region names, enemy/boss/gear names, and the mapping
// from a core GameEvent to a human log line. The core stays flavor-free; all of
// this is UI-only and never feeds back into game math.

import type { GameEvent, GearSlot, Rarity } from '@wanderblade/core';
import { zonesPerRegion } from '@wanderblade/core';
import { formatNumber } from './format';

/** One rendered log line. `kind` drives its CSS accent. */
export interface LogEntry {
  text: string;
  kind:
    | 'kill'
    | 'equip'
    | 'zone'
    | 'region'
    | 'gate'
    | 'bossWin'
    | 'bossFail'
    | 'edge'
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

/** Named biome for a 0-based region index; endless regions become "Beyond the Edge II…". */
export function regionName(region: number): string {
  const named = REGION_NAMES[region];
  if (named) return named;
  // World's Edge is the last named region; the endless tail counts up from II.
  const beyondIndex = region - REGION_NAMES.length + 2;
  return `Beyond the Edge ${toRoman(beyondIndex)}`;
}

/** Region index that a global zone belongs to. */
export function regionOfZone(zone: number): number {
  return Math.floor(zone / zonesPerRegion);
}

/** 1-based zone number within its region (1..zonesPerRegion). */
export function zoneInRegion(zone: number): number {
  return (zone % zonesPerRegion) + 1;
}

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
function enemyName(zone: number, killIndex: number): string {
  const pool = ENEMY_NAMES[regionOfZone(zone)] ?? ENEMY_FALLBACK;
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
      const name = enemyName(e.zone, e.killIndex);
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
    case 'zone':
      return {
        kind: 'zone',
        text: `Pressed on — ${regionName(regionOfZone(e.zone))} Zone ${zoneInRegion(e.zone)}`,
      };
    case 'region':
      return { kind: 'region', text: `Entered ${regionName(e.region)}!` };
    case 'gate':
      return {
        kind: 'gate',
        text: `Reached the gate — ${bossName(e.region)} looms ahead`,
      };
    case 'bossWin':
      return {
        kind: 'bossWin',
        text: `Slew ${bossName(e.region)} — ${regionName(e.region + 1)} lies open`,
      };
    case 'bossFail':
      return {
        kind: 'bossFail',
        text: `${capitalize(bossName(e.region))} — too strong… for now`,
      };
    case 'edge':
      return { kind: 'edge', text: 'You reach World’s Edge — the road runs on beyond' };
    default:
      return null;
  }
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}
