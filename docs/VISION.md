# Wanderblade — Vision

*One blade, one long road, and a world of monsters between you and the portal.*

**Working title:** Wanderblade
**Platform:** iOS / Android (TypeScript + web UI, wrapped with Capacitor)
**Status:** M1 redesign — the grey-box loop and Living Road HUD exist; the active-forward realm and portal-boss loop is the next implementation milestone. See [ROADMAP.md](ROADMAP.md).

## The fantasy

You are a wandering swordfighter trying to save a fantasy world under siege. Monsters pour from portals across the realm, threatening roads, villages, and towns. In each realm, the hero travels the road, cuts through endless waves of recognizable fantasy creatures, gathers gear, and develops enough power to confront the portal's guardian.

Entering the portal is a deliberate commitment. The road and its rewards fall away, leaving the hero locked in a sustained duel with a great boss. The fight may last hours or days, online or offline. Victory closes the threat, opens the next realm, and begins a fresh ascent from level 0—faster and richer because of what the hero permanently earned before.

The world draws its recognizable monster vocabulary from creatures available in the Dungeons & Dragons System Reference Document 5.2.1 under CC-BY-4.0. Wanderblade uses its own setting, art, progression, combat math, and encounter design; it is not an implementation of tabletop D&D rules.

## The session

Wanderblade is designed to be actively enjoyable for **15–30 minutes once or twice a day**, while remaining a real idle game between visits.

On the road, a player can:

1. Watch the hero advance through endless waves and collect the offline haul.
2. Spend gold, equip stronger drops, and develop the current realm build.
3. Engage with live road mechanics that materially accelerate progress without making idle time worthless.
4. Review pending Ascendancy, persistent collections, and preparation for the portal guardian.
5. Manually enter the portal when willing to commit the build to a boss fight.

During a portal boss, the hero earns no road gold, loot, or Ascendancy. Base DPS continues offline. Active tapping increases attack speed and shortens the fight. There is no death or automatic failure: the player either persists to victory or abandons the attempt, forfeiting boss damage and returning to the road.

## Design pillars

1. **You are the hero.** One growing character the player identifies with. Never a manager and never a town administrator.
2. **Heroic adventure tone.** Vibrant and dangerous—bright roads, threatened settlements, monster-filled wilds, and imposing portal guardians. Never grimdark and never cozy-cute.
3. **Classic idle RPG, actively fun.** Auto-battle, loot, upgrades, resets, and rising numbers form the foundation. Active play is a first-class source of fun and meaningful acceleration, not decorative tapping.
4. **Idle time still matters.** The hero makes worthwhile progress while the game is closed, including persistent damage during a portal boss. Active players advance faster; idle-only players still move forward.
5. **Two complementary power rhythms.** Temporary realm power is built through gold, levels, gear, and road upgrades. Permanent growth comes through Ascendancy, realm-completion economy bonuses, and lasting collection records.
6. **Bosses express the build.** A portal guardian is a long-form DPS test and a voluntary commitment, not a short readiness check. Victory is the ascension event that unlocks the next realm and resets temporary power.
7. **Recognizable fantasy, original world.** SRD-listed creatures provide a familiar bestiary vocabulary. Wanderblade's lore, visuals, systems, balance, and presentation remain its own.

## Reference bar

- **Idle Slayer** — active sessions that are fun and materially productive inside a game that continues to matter while idle.
- **Vibrant 16-bit pixel fantasy (Secret of Mana / Shovel Knight register)** — sunlit pixel biomes, chunky readable UI, and numbers that roll (DECISIONS.md #13).
- **Classic side-scrolling auto-battlers** — an immediately legible road, auto-combat, loot, and upgrade loop.
- **D&D SRD 5.2.1 monster vocabulary** — recognizable goblins, gnolls, dragons, and other open-licensed creatures, used with original Wanderblade art and encounter design.

## Anti-goals

- No manager/overseer gameplay and no town-management layer. Towns and villages support the stakes and lore unless a later design gives them a hero-centered purpose.
- No grimdark tone—no despair-first world, corpse spectacle, or hopelessness.
- No gimmick-led design; the classic progression loop must carry the game.
- No idle mode that feels fake or punitive. Closing the game must still produce meaningful progress.
- No automatic portal entry, automatic realm completion, death spiral, or involuntary ascension.
- No income during portal-boss combat. The road builds power; the boss proves it.
- No spreadsheet loadout math or trap upgrades as a progression requirement.
- No non-SRD D&D settings, characters, monsters, art, or lore presented as available under the SRD license.
