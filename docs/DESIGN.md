# Wanderblade — Design (GDD-lite)

Companion docs: [VISION.md](VISION.md) (why), [ECONOMY.md](ECONOMY.md) (numbers and simulation contract), [ROADMAP.md](ROADMAP.md) (when), [DECISIONS.md](DECISIONS.md) (decision history).

## Core loop

```mermaid
stateDiagram-v2
  [*] --> Road
  Road --> Road: Slay minions / earn / upgrade
  Road --> PortalBoss: Player manually enters portal
  PortalBoss --> Road: Player abandons / boss HP resets
  PortalBoss --> Ascension: Boss HP reaches zero
  Ascension --> Road: Bank rewards / unlock realm / reset run power
```

The hero is always in exactly one gameplay phase: **Road** or **Portal Boss**. Both phases progress online and offline and may last hours or days. Ascension is an atomic transition between them, not a third mode the player farms.

## World structure

- The world is divided into sequential **realms**. Each realm has its own road, threatened settlements, monster families, visual identity, and portal guardian.
- Monsters are emerging from portals and besieging the wider world. Towns and villages establish stakes and may appear as scenery, story beats, or discoveries; there is no town-management game.
- Road progress is divided into zones or waypoints for pacing and presentation. The portal becomes available when the realm's conditions are met, but entry is always manual.
- Defeating the guardian closes that realm's threat, unlocks the next realm, and immediately triggers ascension.
- The v1 realm sequence and exact portal conditions will be selected during content and economy design; they must not be encoded as lore-only assumptions in the engine.

## Content and SRD boundary

- The recognizable monster vocabulary is drawn from creatures explicitly present in **System Reference Document 5.2.1**, licensed under **CC-BY-4.0**.
- SRD inclusion is a whitelist, not permission to use material from other D&D books, settings, adventures, brands, or art.
- Wanderblade creates original creature art, animations, encounter groupings, stats, drops, portal lore, realm names, and boss presentation.
- [SRD-CONTENT.md](SRD-CONTENT.md) lists every approved SRD-derived name or description and reproduces the required attribution. See DECISIONS.md #17.
- Familiar examples include goblins, gnolls, and dragons only where the selected name/content is verified against the licensed SRD source.

## Phase 1 — The Road

The road is where the hero builds all temporary realm power.

### Automatic progression

- The hero walks forward and automatically fights endless portal minions.
- Kills grant gold, gear opportunities, collection progress, and **pending Ascendancy** according to the tuned economy.
- Offline and live auto-combat share the same deterministic engine path. Identical elapsed time, state, and player-action inputs must produce identical results.
- Idle-only players progress meaningfully but more slowly than players who engage in active sessions.

### Temporary realm build

- **Resets on ascension:** gold, hero level, equipped gear, temporary skill ranks, road/zone position, and other realm-local upgrades.
- Gear remains easy to evaluate: a stronger item is unambiguously stronger; collection completion must not require loadout math.
- Current-realm upgrades prepare the hero for one purpose: sustained DPS against the portal guardian.

### Active road play

Active play is a first-class design surface. The intended session is 15–30 minutes, once or twice a day, and playing attentively must provide a noticeable but bounded acceleration over idle progress.

The exact road interactions, reward mix, cadence, and target uplift are intentionally reserved for the next dedicated active-play design. The prior fixed bundle of Rally, Trailside Glints, and Roadside Discoveries is no longer binding. Any replacement must obey these contracts:

1. Active play is enjoyable in its own right, not repeated busywork.
2. Rewards are materially valuable and visible within one session.
3. Idle progress remains worthwhile and never becomes a punishment for closing the app.
4. Active actions layer onto deterministic baseline progression through explicit, auditable inputs.
5. The simulator must model representative idle and active player schedules before economy values ship.

## Phase 2 — Portal Boss

The portal guardian is an opt-in, persistent DPS encounter and the expression of the build assembled on the road.

### Entry

- Portal entry requires an explicit player action; there is no auto-challenge online or offline.
- The UI previews the guardian, current estimated duration, pending Ascendancy that will bank on victory, and the consequences of entering.
- Entering switches the hero out of road progression. Road kills, gold, loot, pending-Ascendancy accrual, and road movement stop.

### Combat

- Boss HP decreases from the hero's current sustained DPS and persists across sessions.
- Base boss damage advances offline using the same deterministic core as live play.
- Live tapping applies a relevant, bounded attack-speed boost. Exact input cadence, cap, decay, accessibility alternative, and uplift are part of the dedicated active-combat design.
- The fight has no enrage timer, death, retry cooldown, or automatic failure. A boss may take hours or days.
- No gold, gear, or Ascendancy is earned while the boss fight is active.
- Purchases and build changes are locked during boss combat; the fight tests the build committed at entry.

### Abandonment

- The player may abandon at any time.
- Abandoning resets that attempt's boss HP to full and returns the hero to the same realm road.
- Existing temporary road power and the realm's pending Ascendancy are preserved. Only boss-damage progress is forfeited.

### Victory

Boss HP reaching zero triggers one atomic ascension transaction:

1. Add the boss payout to the realm's pending Ascendancy.
2. Transfer the entire pending amount into banked Ascendancy.
3. Record the boss trophy, realm completion, and persistent collection progress.
4. Apply the realm-completion bonus to future gold and passive/offline earnings.
5. Unlock the next realm.
6. Reset all temporary realm power and begin the next road at level 0.

## Ascendancy and persistence

### Two balances

- **Banked Ascendancy** persists across realms and may be spent from the Ascendancy tree whenever the hero is on the road.
- **Pending Ascendancy** is earned during the current realm and displayed as an unclaimed total. It cannot be spent or persist independently; portal victory transfers it into banked Ascendancy during ascension.
- Abandoning a boss does not erase pending Ascendancy; victory is still required to bank it.
- Ascendancy purchases are locked during portal-boss combat.

### Permanent power

- The Ascendancy tree unlocks combat skills and passives. It is the primary source of persistent combat power.
- Every boss victory separately grants an automatic, persistent percentage bonus to gold and passive/offline earnings. It does **not** directly grant combat power.
- This automatic economy bonus ensures moving forward is more productive than farming one completed realm forever.
- Exact Ascendancy accrual, node costs, node effects, boss payout, and economy-bonus stacking require simulator tuning before implementation is considered balanced.

### Persistence matrix

| State | On boss abandonment | On boss victory / ascension |
|---|---|---|
| Gold, level, gear, temporary upgrades | Persist | Reset |
| Road position | Persist | Reset into next realm |
| Boss HP damage | Reset | Boss defeated |
| Pending Ascendancy | Persist, still unbanked | Boss payout added, then banked |
| Banked Ascendancy and purchased nodes | Persist | Persist |
| Realm-completion economy bonuses | Persist | Persist and increase |
| Bestiary, gear-set records, stars, trophies, titles | Persist | Persist and record victory |

## Collections

- **Bestiary:** persistent discovery and mastery records for monster species.
- **Gear sets:** persistent records of realm gear found, independent of equipped items resetting.
- **Realm stars:** boss defeated, gear set completed, and bestiary completed.
- **Boss trophies:** permanent proof of portal guardians slain.
- Collection records survive ascension. Any collection reward that affects combat must be implemented as an explicit Ascendancy-tree skill/passive; collections do not provide a separate or hidden DPS multiplier.

## Presentation

- The Road screen remains a side-scrolling pixel diorama with a visible hero, enemies, drops, goals, and upgrades.
- The Portal Boss screen is a distinct locked-combat presentation centered on boss HP, hero DPS, estimated time remaining, and active attack-speed input.
- The art register remains vibrant 16-bit **Pixel & Parchment**: DB32 palette, hard edges, wood/parchment chrome, Pixelify Sans UI, and VT323 numerals (DECISIONS.md #13).
- Display interpolation never feeds back into the engine. Affordability, rewards, boss HP, and ascension use authoritative core state.

## Screens

1. **Road** — diorama, hero, road encounters, gold, pending Ascendancy, temporary upgrades, and the manual portal-entry flow.
2. **Portal Boss** — persistent boss combat, HP/duration feedback, tapping interaction, and Abandon action.
3. **Hero** — current realm level, gear, temporary skills, and persistent Ascendancy unlocks.
4. **Collection** — Bestiary, gear-set records, realm stars, and boss trophies.
5. **World** — completed realms, current realm, threatened settlements, next portal, banked Ascendancy, and the Ascendancy tree.
6. **Return recap** — road earnings while away or boss damage dealt while away; never claims road income during boss combat.
7. **World's Edge** — the state at the end of the realm ladder. Specified below.

### World's Edge — the state at realm 300

**The requirement:** a player who finishes realm 300 must see something that reads as *the end of the current world*, never a portal button that quietly does nothing. `enterPortal` returning `reason: 'unwinnable'` is an engine value, not a design (`docs/DECISIONS.md` #34); this is the design it has to carry. Core work is done — the client work is `builder-visual-3`'s.

**What the player sees, and what it must not be:**

| The Road behaves normally | It keeps paying gold, dropping gear, and clearing zones. Nothing is taken away, and nothing hangs. |
| The portal is visibly closed, not broken | It reads as sealed or spent — a thing that has ended — never as a greyed-out button or a failed tap. Tapping it explains, it does not shrug. |
| The recap is a conclusion | Realms cleared, guardians felled, Bestiary completion, total banked Ascendancy. The run is *finished*, not stuck. |
| The hero is at the edge of the map | `docs/VISION.md` already sells "World's Edge" as the long-horizon destination. This is that place, and it should look like arriving somewhere rather than hitting a limit. |

**What it must never be:** a modal that says "maximum realm reached", a number that stops incrementing without comment, an error, or a portal that accepts a tap and does nothing. A player who cannot tell whether they finished the game or found a bug will conclude it is a bug, and they will be right to.

**This is a placeholder for a real ending, and it is scheduled.** `docs/ROADMAP.md` M4 owes the world a designed conclusion — or a defined endless mode — at or before realm 300. Until that lands, World's Edge is what stands between a player and a wall.

## Deferred expansion: companions

A future major system may add companions inspired by the familiar fighter, mage, priest, and thief party shape. This is not a v1 commitment. If pursued, the player remains the central hero and companions must not turn the game into party administration, loadout spreadsheets, or a manager fantasy. Companion mechanics require their own design, economy simulation, and persistence decision.

## Open design work

These are explicit follow-up designs, not implied implementation details:

- The active road-play mechanic set, input cadence, session arc, and measurable active-versus-idle uplift.
- Portal availability conditions and the information used to estimate boss duration before entry.
- Boss HP curves, expected attempt durations, tap attack-speed behavior, and accessibility alternative.
- Pending-Ascendancy accrual, boss payout, tree topology, node costs/effects, and anti-overfarming curve.
- Per-ascension gold/passive-income bonus and stacking formula.
- Realm sequence, SRD-verified monster roster, portal guardians, and original setting treatment.
- **What a gear slot means.** `gearPower(realm, zone, rarity)` has no slot term, and `gearPowerTotal` is a plain sum, so weapon, armor and trinket are three draws from one distribution — the panel showing identical power for all three is the model, not a bug. Differentiating them needs a mechanical role first: there is no defence stat for armor to feed and no utility layer for a trinket, so a per-slot weight added now would be an arbitrary balance decision. Blocked on the M4 gear-set and Bestiary design.
- **Per-zone monster identity.** Landed in core (ADR #37): a kill carries a species index, pays that species' share of the zone rate, and rolls its drop against that species' weight; `collection.speciesKills` records them. Enemy HP is still uniform, because kill time is the clock. What remains is M4 content — the SRD roster, names and provenance. *Superseded description of the old state:* The engine had none: `enemyHp(realm, zone)` and `enemyGold(realm, zone)` are pure functions of position, `GameState` carries no monster field, and a drop's rarity is rolled from the kill-keyed stream with no reference to what died. A Bestiary and differentiated drops therefore need core work before content: a monster identity on the kill, carried into the drop roll and into `collection`. Nothing about the current model blocks it — the RNG is already keyed per kill — but it is a core change, not a content table.
