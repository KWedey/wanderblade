# Wanderblade — Economy & Pacing

> **Rebaseline status (2026-08-11):** The M0 simulator and its passing results describe the implemented legacy gate economy. The approved active-forward Road → Portal Boss → Ascension design changes the progression topology, boss duration, reset cadence, persistent currency, and player schedule. Those results remain useful regression history but do **not** validate the new design. No new economy constant ships until the redesigned simulator passes newly approved targets.

## Economy principles

1. **The Road builds power.** Gold, gear, temporary upgrades, monster/gear collection progress, and pending Ascendancy are earned only on the road. Boss trophies and realm-completion records are awarded by victory, not boss-combat elapsed time.
2. **The boss proves power.** Portal-boss combat produces damage and nothing else: no gold, loot, Ascendancy, road movement, collection credit, or temporary buffs.
3. **Victory banks the run.** Pending Ascendancy becomes permanent only when the realm's portal guardian dies.
4. **Ascension creates a faster rebuild.** Each victory grants a permanent bonus to gold and passive/offline earnings, while persistent combat power comes only from purchased Ascendancy skills and passives.
5. **Active is faster; idle is real.** Active sessions materially accelerate road and boss progress. Zero-input play must still advance both phases over time.
6. **Simulation precedes tuning.** Economy changes require representative Road-idle, Road-active, Boss-idle, and Boss-active simulations.

## Resources

| Resource | Earned | Spent | On ascension |
|---|---|---|---|
| Gold | Road kills and road rewards | Realm-local levels and upgrades | Resets to 0 |
| Gear | Road drops and road rewards | Equipped automatically or by simple upgrade choice | Equipped power resets; collection record persists |
| Pending Ascendancy | Road progression; portal-boss victory adds a payout | Cannot be spent | Transfers exactly once to banked Ascendancy, then resets to 0 |
| Banked Ascendancy | Successful ascension | Permanent Ascendancy-tree skills and passives, spendable on the Road | Persists |
| Realm-completion earnings bonus | Portal-boss victory | Automatic; not spendable | Persists and stacks by a simulator-tuned rule |
| Collection records | Road discoveries and boss victory | Completion/mastery display | Persist; no hidden combat multiplier |

## Phase contract

| Behavior | Road | Portal Boss |
|---|---|---|
| Gold / gear / pending Ascendancy | Earned | Frozen |
| Road movement and collection credit | Advances | Frozen |
| Temporary and Ascendancy purchases | Allowed | Locked |
| Base combat | Auto, online and offline | Sustained DPS, online and offline |
| Active input | Reserved for active-road design | Bounded attack-speed boost |
| Exit | Manual portal entry when available | Victory or explicit abandonment |

Closing the app never changes phase. Offline reconciliation continues the active phase from the authoritative saved state.

## Portal and boss rules

- One realm consists of a Road followed by one portal guardian.
- When the portal becomes available, the hero may continue farming the realm's Road indefinitely until the player manually enters.
- Entering snapshots or otherwise freezes the committed build inputs needed for deterministic boss DPS; purchases remain locked during the attempt.
- Boss HP persists across app closes and has no regeneration, enrage timer, death state, or automatic failure.
- Abandonment restores boss HP to full and returns to the portal-ready Road with all road resources intact.
- If a boss dies during offline reconciliation, victory resolves at that simulated timestamp. The ascension transaction runs once, and any remaining elapsed time advances the newly unlocked Road. This preserves the single shared live/offline time model.

## Ascension transaction

Boss victory must be atomic and idempotent:

1. Add the boss payout to pending Ascendancy.
2. Add pending Ascendancy to the previously banked balance.
3. Clear pending Ascendancy.
4. Record realm completion, boss trophy, and collection history.
5. Increment the persistent gold/passive-earnings bonus exactly once.
6. Unlock the next realm.
7. Reset gold, hero level, equipped gear, temporary skill ranks, road position, and temporary buffs.
8. Preserve banked Ascendancy, purchased Ascendancy nodes, collection records, lifetime statistics, and the global deterministic RNG/kill sequence. App preferences remain outside the run reset.
9. Enter the next realm in Road mode at level 0.

The realm-completion earnings bonus must not enter the hero-DPS formula. Ascendancy-tree combat nodes are the only persistent combat-power inputs.

## Active and idle pacing contract

The new intended play pattern is **one or two active sessions per day, each lasting 15–30 minutes**. The exact active interactions and boost magnitudes are a dedicated design and simulation milestone, so the former ≈1.5–2× gold-only overlay is not carried forward as an assumption.

Before tuning begins, the active-play design must select measurable targets for:

- Road-active progression versus the same elapsed Road-idle period.
- Boss-active completion time versus the same build with zero taps.
- Minimum useful progress from 8 h and 24 h Road-idle returns.
- Expected time from realm start to portal availability.
- Expected portal-boss durations for underprepared, prepared, and highly upgraded builds.
- Ascendancy earned from road time versus the boss payout.
- The advantage of ascending promptly over farming an already portal-ready realm.
- The number and value of decisions within a 15–30 minute active session.

Until those bands are approved and encoded as validators, terms such as “meaningful idle,” “good boost,” and “hours or days” are product direction, not claims of balanced implementation.

## Redesigned simulator contract

The simulator must continue to consume `packages/core` and preserve deterministic equivalence with the game client.

Required policies:

1. **Road idle:** no live actions; scheduled return/upgrade policy only.
2. **Road active:** the approved timestamped active-road actions during 15-, 20-, and 30-minute sessions.
3. **Boss idle:** zero taps; base DPS persists online/offline.
4. **Boss active:** the approved timestamped attack-speed actions, including cap and accessibility-equivalent input.
5. **Ascension policy:** manually enters portals according to explicit strategy, verifies victory banking/reset, and continues through multiple realms.
6. **Abandon policy:** exercises an underprepared attempt and verifies the cost of lost boss damage against additional road farming.

Required output includes realm start/portal-entry/boss-victory times, Road and Boss time, active time, gold and gear curves, pending and banked Ascendancy, tree purchases, realm-completion earnings bonuses, abandonments, boss time remaining at entry, and active-versus-idle uplift. Collection cadence is added in M4 when authoritative collection content exists.

Required correctness validators:

- No automatic portal entry online or offline.
- No resource classified as Road income changes during boss elapsed time.
- Equal zero-input state and elapsed time produce equal boss HP online and offline.
- Identical timestamped active inputs produce identical results.
- Abandonment resets only boss progress and never banks Ascendancy.
- Victory banks, rewards, resets, and unlocks exactly once, including across save/reload boundaries.
- Remaining offline time after victory advances the next realm Road.
- Persistent earnings bonuses affect the documented income paths and never DPS.
- The four player policies meet the approved pacing bands across multiple seeds and multi-realm runs.
- The upgrade panel offers at least five priced rows at every look and four affordable at 95% of them (**P8**), so "the number and value of decisions within a 15–30 minute active session" is a measured quantity rather than an intention. Measured on the minimum for priced rows, which gold cannot move, and at 95% for affordable ones, because the greedy purchase policy empties the wallet the instant it can (`docs/DECISIONS.md` #26).
- The portal never sits open on a finished Road for longer than 24 hours, no realm takes longer than 3 days, and the share of Road time spent waiting rather than progressing is reported (**P9**). This is what catches a guardian curve the Road cannot reach: before `docs/DECISIONS.md` #32 the bot farmed a cleared realm for 14.7 hours — 56% of its Road time — because the guardian was ~34× beyond the build the Road delivered.
- Active play earns 1.4–2.3× the Ascendancy of an idle player at the **14-day checkpoint** and reaches its first ascension at least 1.20× sooner (**P10**). The checkpoint is fixed rather than taken at the run length, so every run reports the same comparable number and the default `npm run sim` evaluates the band it prints. The ratio holds across the playable ladder — 1.84× at 14 days, 1.91× at 30. Past **content end** it stops being a pacing number at all: the active run stops at the realm-300 ceiling around day 76 with its earned total frozen, so any later reading divides a constant by a growing one and falls away as a hyperbola. `npm run sim -- --days 90 --seeds 1` prints the multiple at every checkpoint and blanks the ones past content end rather than carrying a frozen value forward (`docs/DECISIONS.md` #48). The band is in the currency that survives an ascension; the ceiling protects idle-only play (VISION pillar 4) as much as the floor protects active play (`docs/DECISIONS.md` #31).

## Determinism and numerical safety

- `packages/core` remains pure TypeScript with no UI or platform dependencies.
- Randomness remains seeded and injectable, keyed to the global kill sequence.
- Road and boss progression use event-stepped time so split advances equal one combined advance.
- Active actions are explicit timestamped inputs; frame rate and render timing are not game rules.
- Ascension does not reset the global RNG/kill sequence.
- Multi-realm simulations must detect non-finite HP, DPS, currency, duration, and multiplier values before they reach client state.

## Current progression formulas

These are the shipped values, each carrying a passing sim run (`docs/DECISIONS.md` #5).

| Quantity | Formula |
|---|---|
| Realm scale | `REALM_STEP^realm`, `REALM_STEP` = 8 |
| Enemy HP | `10 · realmScale · 1.55^z` |
| Enemy gold | `1 · realmScale · 1.48^z · SPECIES[i].goldMult` — roster mean exactly 1 |
| Coin share | `gold · coinWeight(i) / Σ coinWeight` over the kill's coins, `COIN_SHARE_SPREAD` 0.45 — the kill total is exactly unchanged |
| Gear power | `2 · realmScale · 1.55^z · RARITY_MULTIPLIERS[rarity] · SLOT_POWER[slot]` — weapon 1.15 / armor 1.00 / trinket 0.85, mean exactly 1 |
| Hero base damage | `25 · 1.12^level · realmScale` |
| Hero level cost | `10 · 1.15^level · realmScale` |
| Skill rank cost | `def.costBase · def.costRate^rank · realmScale` — **per skill**: 35/1.12, 60/1.19, 110/1.15, 190/1.13, 300/1.21 |
| Skill value | `skillRankMult(id, rank) = 1 + def.maxBonus · (1 − def.decay^rank)` — **per skill**: 0.12/0.78, 0.23/0.93, 0.17/0.86, 0.27/0.95, 0.10/0.72. Ceilings multiply to 2.25× |
| Guardian HP | `bossHpMult · enemyHp(realm, 49) · BOSS_REALM_GAIN^realm`, 5600 / 1.19 |
| Ascendancy node cost | `costBase · (1 + ASC_COST_STEP · rank)`, `ASC_COST_STEP` = 0.5 — **linear, uncapped** |
| Ascendancy damage / gear effect | `(1 + perRank)^rank`, perRank 0.037 — compounding, unbounded |
| Ascendancy speed effect | `1 + ASC_SPEED_MAX_BONUS · (1 − ASC_SPEED_DECAY^rank)`, 0.6 / 0.9 — **bounded** |
| Earnings bonus | `1.15^victories`, gold and passive earnings only, never DPS |

Two of those shapes are load-bearing rather than tuning, and `docs/DECISIONS.md` #27 carries the argument:

- The Ascendancy price is **linear** because income per realm grows linearly, so lifetime banked grows with realm squared. A linear price buys rank growth that is linear in the realm; a geometric one buys only logarithmic growth and saturates, which is what broke P6 at realm 45.
- Persistent attack speed is the **one bounded** effect. Speed divides through the idle kill-time floor, so unbounded speed means unbounded event steps per simulated second and an offline gap that never finishes reconciling.

### Numerical frontier

**The current hard horizon is realm 300.** It is the last realm whose guardian has finite HP; at realm 301 `bossHp` is `Infinity` and `enterPortal` refuses with `reason: 'unwinnable'` rather than opening a fight no build can end (`docs/DECISIONS.md` #34). A steady active player reaches it on **day 74.8–78.9** (seeds 1–3: 76.31, 78.90, 74.80) and an idle player on **day 91.5–92.1** — a boundary a real player meets at roughly two and a half months, not a theoretical one. Reaching it ends the run: there is no reward at the end of that Road, so the simulator stops rather than sampling it as play (`docs/DECISIONS.md` #48).

⚠️ **This is an arithmetic wall, not a designed ending, and the game must reach a designed ending or a defined endless mode before it reaches this.** That is M4 realm-sequence work — `docs/VISION.md` sells "World's Edge" as the long-horizon destination — and it is recorded here so nobody rediscovers the wall by accident.

The rest of the economy follows close behind: `enemyHp` overflows at realm 330, `gearPower` at 330, `enemyGold` at 333, `levelCost` at 341. Carrying `bossHp` alone in a wider representation buys 30 realms and leaves the wall standing, so a representation that survives means a big-number layer through the whole economy with its own determinism contract.

Every client-facing scalar is finite and exact at realm 199, and the hero level ladder tops out at 2102 at realm 199 and 659 at realm 296. `packages/core/test/magnitude.test.ts` pins every frontier above — including entry succeeding at realm 300 and refusing at 301 — so a constant change cannot quietly move them.

## Implemented legacy baseline (historical reference)

The M0/M1a economy the legacy simulator was tuned against, kept for reference — the readiness window and auto-challenge below were deleted in M1R.3 (`docs/DECISIONS.md` #14–#15):

- `hp(z) = 10 · 1.55^z`
- `gold(z) = 1 · 1.48^z`
- Hero base damage `= 25 · 1.12^level`
- Gear power tracks `1.55^z`, one formula for all three slots (superseded by `SLOT_POWER`, `docs/DECISIONS.md` #40)
- Hero level cost `= 10 · 1.15^level`
- Skill cost `= 50 · 1.15^skillLevel`
- Drop chance `= 0.006` per kill (the earlier 5% value was the untuned v0 guess)
- Boss HP multiplier `= 60`, 30-second readiness window, and auto-challenge at 110%
- Minimum kill time `= 2 s`

The legacy simulator passed its six 10-day M0 validators across three seeds. That evidence proves the old deterministic engine and gate economy met their old targets; it does not justify carrying readiness bosses, auto-challenge, gate farming, the old Legend curve, or short-check-in validators into the redesigned game.

## Follow-up decisions — all decided

Every item this section once listed as open has an ADR in `docs/DECISIONS.md`.

| Item | Deciding ADR |
|---|---|
| Active road mechanics | #19 momentum, #25 catch hit test, #30 coin split, #46 coin values, #50 catch ellipse |
| Active-versus-idle bands | #31 banded in Ascendancy, #39 measured at 14 days, #48 content end |
| Boss tap cap, decay, cadence, accessibility input | #19 one momentum curve and hold-to-autostrike, #15 boss phase |
| Multitouch policy | #25 one Strike, one aim, one hit test |
| Realm length and portal availability | #24 entry policy, #32 the Road reaches its guardian |
| Boss HP curve and duration bands | #23 `BOSS_REALM_GAIN`, #24 what P5/P6 measure |
| Pending-Ascendancy accrual | #22 per zone cleared |
| Overfarming controls and boss payout | #28 P7 measures Ascendancy earned |
| Tree economy | #27 uncapped, linear price |
| Per-victory earnings bonus and stacking | #21 ratio-identical realms, #23 rubber-band |
| Offline cap policy | #8 no cap, unchanged by #14 |
