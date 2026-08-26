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
    | 'region'
    | 'gate'
    | 'bossWin'
    | 'bossFail'
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

/**
 * Named biome for a 0-based region index. The endless tail relaps the same
 * biomes with a lap numeral rather than becoming "Beyond the Edge N", because
 * the scene's skins cycle on this same list: a generic name over a specific
 * picture put the words in a fight with the art ("Beyond the Edge" over a
 * sunny meadow). Name and skin now always agree by construction.
 */
export function regionName(region: number): string {
  const r = region < 0 ? 0 : region;
  const biome = REGION_NAMES[r % REGION_NAMES.length]!;
  const lap = Math.floor(r / REGION_NAMES.length);
  return lap === 0 ? biome : `${biome} ${toRoman(lap + 1)}`;
}

/** The scene skins and these names must stay index-aligned. */
export const REGION_NAME_COUNT = REGION_NAMES.length;

/** Region index that a global zone belongs to. */
export function regionOfZone(zone: number): number {
  return Math.floor(zone / zonesPerRealm);
}

/** 1-based zone number within its realm (1..zonesPerRealm). */
export function zoneInRegion(zone: number): number {
  return (zone % zonesPerRealm) + 1;
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
        text: `Pressed on — ${regionName(e.realm)} Zone ${e.zone + 1}`,
      };
    case 'arcCatch':
      return {
        kind: 'kill',
        text: `Snatched it mid-air — +${formatNumber(e.bonusGold)} gold${
          e.upgraded ? ', and the loot came up a tier' : ''
        }`,
      };
    case 'portalReady':
      return {
        kind: 'gate',
        text: `The road runs out — ${bossName(e.realm)} waits beyond the portal`,
      };
    case 'portalEnter':
      return {
        kind: 'region',
        text: `Stepped through — ${capitalize(bossName(e.realm))} turns to face you`,
      };
    case 'abandon':
      return {
        kind: 'bossFail',
        text: `Withdrew from ${bossName(e.realm)} — its wounds keep`,
      };
    case 'bossVictory':
      return {
        kind: 'bossWin',
        text: `Slew ${bossName(e.realm)} — +${formatNumber(
          e.payout + e.pendingBanked,
        )} Ascendancy banked`,
      };
    case 'ascend':
      return {
        kind: 'region',
        text: `The realm ascends — ${regionName(e.toRealm)} opens ahead`,
      };
    default:
      return null;
  }
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}
