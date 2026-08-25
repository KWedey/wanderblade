# Decisions Log

ADR-style. Newest at the bottom. A decision stays until a later entry supersedes it.

---

## 1. Tech stack: TypeScript + web UI, wrapped with Capacitor — 2026-07-10

**Decision:** Build the game as a TypeScript web app (2D, UI-driven, canvas for the road diorama) and wrap with Capacitor for iOS/Android.
**Why:** Fastest iteration loop; testable directly in a browser during development; one codebase ships to both stores; idle games need no engine features (no 3D/physics). Precedent: Melvor Idle.
**Alternatives considered:** React Native/Expo (more native feel, slower iteration), Unity (visual power, heavy tooling — overkill), Godot (middle ground, still heavier than needed).

## 2. Ambition: prototype-first — 2026-07-10

**Decision:** Optimize for reaching a fun, playable core loop (M0–M1) before investing in polish, monetization, or store plans. M4 (ship prep) is explicitly optional until the prototype earns it.
**Why:** Whether the game is fun is the riskiest unknown; buy that information as cheaply as possible.

## 3. Concept: Wanderblade — 2026-07-10

**Decision:** A classic heroic-fantasy idle RPG: a lone wandering swordfighter crosses a transforming realm on foot toward World's Edge; auto-battle, loot, upgrades, region bosses; Bestiary/gear-set/zone-star collection; offline travel with a "Back on the Road" recap.
**Why:** Chosen from three brainstorm rounds (18 concepts, judged on taste-fit, appeal, feasibility).
**Binding taste corrections from rejected rounds (treat as constraints):**
- Round 1 rejected — manager/caretaker roles and cozy tone. → *Player IS the hero; no town management.*
- Round 2 rejected — grimdark tone and gimmick-led design. → *Heroic adventure tone; classic structure, execution over twists.*

## 4. Design docs live in the repo — 2026-07-10

**Decision:** `docs/` is the source of truth (VISION, DESIGN, ECONOMY, ROADMAP, DECISIONS). Docs evolve with the code in the same commits. No external planning tools.
**Why:** Zero drift; every future work session (human or agent) loads full context from the repo.

## 5. Sim-first economy — 2026-07-10

**Decision:** Game rules live in a UI-free `packages/core`; a `sim/` harness fast-forwards a bot player through days of game time. Economy constants only change alongside a passing sim run against ECONOMY.md pacing targets.
**Why:** Idle-game fun is 80% pacing math; simulation makes tuning take seconds instead of multi-day playtests, and sharing the rules package makes sim results true by construction.

## 6. Deterministic core with seeded, injectable RNG — 2026-07-10

**Decision:** All randomness in `packages/core` (drops, rarity rolls) flows through a seeded, injectable PRNG keyed to kill index; the clock advances event-stepped (per kill), not by wall-clock ticks. Offline progress and live play execute the same code path.
**Why:** The "offline sim == live play" requirement is impossible with naive randomness. This is an M0-gating architecture decision, not a tuning detail — it shapes `packages/core` from the first commit.

## 7. Prestige persistence: collections persist, power resets — 2026-07-10

**Decision:** On a "New Road" prestige: Bestiary records + mastery bonuses, gear-set completion, zone stars, titles, Trophy Hall, and Legend **persist**; hero level, gold, equipped gear power, and road progress **reset**.
**Why:** Collection/mastery is one of the two binding dopamine engines and is sold as the *permanent* long-horizon payoff — resetting it would gut the pillar; keeping run-power persistent would gut the fresh-run pull. Decided now (before prestige ships in M2) because the M1 save model must separate prestige-persistent from run-local state from day one.

## 8. Offline earnings: generous / no cap for the prototype — 2026-07-10

**Decision:** No offline earnings cap through M0–M1. The sim runs uncapped.
**Why:** "The hero kept walking" is Wanderblade's identity; a cap fights the fantasy. Provisional — revisit with M1 playtest evidence if uncapped returns trivialize walls.

## 9. Region bosses are opt-in gates with a Readiness meter and auto-challenge — 2026-07-10

**Decision:** Bosses are discrete, challengeable set-piece events at region Gates, not passive HP walls. While parked at a gate the hero farms the approach zone at full income. A deterministic Readiness meter (`dps × 30 s / bossHP`) makes "am I ready?" one glance; failure is painless with a short retry cooldown; **auto-challenge (default on)** fires at ~110% Readiness — offline too — so pure-idle players always break through.
**Why:** The passive-wall design could eat a whole offline session producing near-zero visible progress. Opt-in gates keep income flowing at walls, turn bosses into watchable events, and give check-ins their one meaningful decision — while auto-challenge closes the "idle player stalls forever" hole. (Origin: creator's brainstorm; evaluated and adopted with the safety net.)

## 10. Road Play: active layer is live-only, additive, never required — 2026-07-10

**Decision:** v1 active layer = **Trailside Glints** (tap loot arcs for bonus gold, jackpot glints folded in) + **Roadside Discoveries** (~1 per check-in: tap a passing shrine/chest for a reward or Wayfarer's Log entry). Both are live-only overlays on the seeded kill/drop stream. The sim models the idle baseline only, and all pacing targets must pass with zero taps; watching actively earns ≈1.5–2× with diminishing returns. Heroic Finisher and Focus the Hunt are deferred candidates; Perfect Parry rejected (stress/redundancy).
**Why:** Fills the "nothing to do while traveling" gap Idle Slayer solved — while explicitly rejecting Idle Slayer's late-game mistake of making active play near-mandatory, which drew community backlash and would violate the check-in pillar.

## 11. Prestige rhythm: many roads — 2026-07-10

**Decision:** Frequent, light, penalty-free resets. First New Road becomes attractive ~day 2–3 at the first hard wall; the second run re-reaches the prior frontier in ~20–30% wall-clock; **World's Edge is a multi-run goal**. Earn model: `Legend = floor(L0 · (1.30^z_max − 1))`, previewed via an always-visible unearned-Legend bar before any commit. Spend: a small permanent tree (~6–8 nodes, no re-buys, no respec). Constants tuned by the M2 sim.
**Why:** The creator wants prestige as *relief* when scaling overwhelms plus replayability/stickiness — the frequent-reset shape (proven by Idle Slayer's Ascension) serves both, and the visible-preview framing makes resets read as claiming power, not losing progress. Rejected: rare/weighty endgame prestige (weaker relief valve, weaker stickiness).

## 12. Living numbers: display-side interpolation, no economy rebase — 2026-07-11

**Decision:** The "numbers feel dead" problem (M1a playtest) is fixed entirely in the display layer: the gold counter is a full-digit odometer (`formatGold`) whose target includes the current enemy's *accruing partial gold*, extrapolated between engine ticks and snapped to engine truth on each kill; a gold/sec readout and a goal-gradient strip (nearest waypoint + cheapest-buy ETA) keep a next goal always visible. Frame-rate-independent smoothing (`1 − e^(−k·dt)`). **No economy constant changed and no sim re-run was needed.** Affordability always reads real `state.gold`, never the displayed value.
**Why:** A ×100 constants rebase is ratio-invariant but costs a mandatory sim re-run and ~9 zones of float-overflow headroom for zero churn benefit; a ×100 *display* multiplier is progress cosplay that self-destructs against the compact formatter within ~10 kills. The honest odometer delivers visibly rolling 1s/10s/100s at the current scale with zero economy risk. `minKillTimeSec` stays 2 (lowering it is a real economy change — revisit only if the phone playtest says pace still drags).
**Alternatives considered:** economy ×100 rebase (rejected: sim cost + overflow headroom), display-only ×100 multiplier (rejected: fake, formatter-defeating), faster kill floor (deferred: real economy change, needs its own sim run).

## 13. Art direction: vibrant 16-bit "Pixel & Parchment" — 2026-07-11

**Decision:** Replace the M1a glassmorphism/dashboard look with a vibrant 16-bit pixel style: DB32 palette, hard edges (no border-radius, no smooth gradients, no blur or glow), carved-wood panels with hard offset shadows, segmented meters, and self-hosted OFL pixel fonts — Pixelify Sans for UI text, VT323 (mono) for every load-bearing number so the odometer rolls without jitter. Scene art (M1b Phase 3+) targets the Secret of Mana / Shovel Knight register on the same palette; `image-rendering: pixelated` from day one.
**Why:** The owner's M1a verdict: the polished/futuristic skin contradicted the heroic-fantasy pillar. Literal NES 8-bit was rejected — its color starvation drifts grimdark/cheap against pillar 2 ("vibrant and dangerous"); 16-bit keeps pixel charm with a heroic-adventure palette. Mono numerals are a legibility guarantee for the fast counter (decorative pixel faces shimmer when digits roll).
**Supersedes:** the implied production-polish reference bar in VISION.md's original wording (now amended).

## 14. Session philosophy: active-forward idle RPG — 2026-08-11

**Decision:** Wanderblade targets one or two **15–30 minute active sessions per day**. Active play must be enjoyable and materially accelerate progression. Idle play remains a complete, worthwhile path at a slower rate; closing the game must never make time feel wasted.

**Why:** The short-check-in prototype protected idle value but made active play feel secondary. The desired game should be something players want to visit and play, with Idle Slayer as the structural reference: activity matters without invalidating passive progress.

**Supersedes:** Decision #10's fixed Road Play bundle, its “optional overlay” framing, and the former 30–90-second check-in guardrail. The exact active mechanics and uplift are intentionally delegated to the M1R.2 design-and-simulation gate rather than selected in this ADR.

## 15. Portal guardians: manual, persistent, zero-income boss phase — 2026-08-11

**Decision:** Each realm has two mutually exclusive phases. On the **Road**, the hero earns and upgrades while fighting portal minions. The player may manually enter the **Portal Boss** phase when the portal is available. Boss HP persists online and offline; live tapping provides a bounded attack-speed boost. The fight has no death, enrage, timeout, retry cooldown, or automatic failure. Boss combat grants no gold, gear, Ascendancy, road progress, collection credit, or temporary buffs. The player may abandon, resetting boss HP while preserving the Road build and pending Ascendancy.

Portal entry is never automatic. When the portal is available, the player may continue farming the Road indefinitely before committing. Purchases are locked during the boss attempt. If the boss dies during offline reconciliation, victory resolves at that timestamp and remaining elapsed time advances the next realm's Road after ascension.

**Why:** The Road should be where a build is created and the boss should be its sustained DPS expression. A long, persistent commitment produces a clearer two-stage identity than a 30-second readiness check, while abandonment avoids death or hard failure.

**Supersedes:** Decision #9 in full, including readiness, auto-challenge, short set-piece resolution, failure, cooldown, and gate-farming behavior.

## 16. Realm victory is ascension; Ascendancy is the persistent economy — 2026-08-11

**Decision:** Defeating a portal guardian immediately unlocks the next realm and triggers an atomic ascension. Gold, hero level, equipped gear, temporary skill ranks, road position, and temporary buffs reset. Banked Ascendancy, purchased Ascendancy nodes, realm-completion earnings bonuses, lifetime statistics, and collection records persist. App preferences are not run state and are unaffected.

Ascendancy uses two balances. **Pending Ascendancy** is earned on the current Road and cannot be spent or permanently saved. Boss victory adds its payout and transfers the full pending amount into **banked Ascendancy** exactly once. Banked Ascendancy may be spent on the Road for permanent combat skills and passives. Every realm victory also grants an automatic persistent percentage bonus to gold and passive/offline earnings; that automatic bonus never modifies DPS. Persistent combat power comes through explicit Ascendancy-tree skills and passives, not a hidden collection multiplier.

**Why:** Victory must offer a clear reason to leave a farmable realm and accept a reset. The player gets a new place, permanent choices, a faster economy, and lasting records, while each realm retains the satisfying rebuild from level 0.

**Supersedes:** Decision #11's voluntary frontier-based New Road rhythm and Legend formula. It partially supersedes Decision #7: the reset/persistent collection split remains, but ascension occurs only on boss victory, the currency is Ascendancy, temporary skill ranks reset, and collection records do not silently add combat power.

## 17. D&D SRD 5.2.1 is a monster-content whitelist — 2026-08-11

**Decision:** Wanderblade may use recognizable creature names and other content explicitly available in **System Reference Document 5.2.1** under **Creative Commons Attribution 4.0 International (CC-BY-4.0)**. The repository will maintain a provenance roster and the required attribution/NOTICE before SRD-derived content ships. Monster art, stats, encounter design, realm lore, portal lore, progression, and presentation are original unless separately licensed.

Content from D&D books, settings, adventures, brands, or art that is not in the selected SRD is outside scope. Every sourced element must be verified against the official SRD artifact rather than assumed available because it appears in D&D.

**Why:** Familiar goblins, gnolls, dragons, and other open-licensed fantasy creatures give the world immediate legibility without tying Wanderblade to tabletop mechanics or relying on protected material outside the SRD.

## 18. Companions are a post-v1 design, not current architecture — 2026-08-11

**Decision:** A future expansion may explore companions shaped around familiar fighter, mage, priest, and thief roles. No v1 companion combat, party UI, party economy, or save schema will be built preemptively. If explored later, the player remains the central hero and the system must avoid manager gameplay and loadout spreadsheets.

**Why:** A party could become a meaningful major upgrade system, but designing for it now would expand every current system before the solo-hero Road/Boss/Ascension loop is proven.

## 19. Momentum drives attack speed only; the extra Strike swing is folded into the curve — 2026-08-25

**Decision:** A Strike adds `MOMENTUM_PER_STRIKE` (0.10) to a decaying momentum meter (2 s half-life, capped at `MOMENTUM_MAX_BONUS` = +75% attack speed). Momentum multiplies **attack speed only** — never gold, never damage per swing. The Road's gold layer is loot arcs instead: every kill credits full base gold immediately, and catching the arc within `ARC_FLIGHT_SEC` pays the `ARC_CATCH_MULT` (1.15x) increment on top. `docs/ACTIVE-PLAY.md`'s "each Strike also lands an extra swing" is expressed by the momentum curve rather than as a separate per-strike hit.

**Why:** Applying momentum to attack speed *and* gold, then compounding arc catches on top, reaches ~4.8x at cap — incompatible with the approved 1.8–2.2x Road band. An unbounded per-strike swing has no cap at all, so no strike rate could satisfy a bounded band. Speed-only momentum times arc catching lands at 1.75 x 1.15 ~= 2.0x, the middle of the band, and keeps idle whole (idle forfeits only the catch increment).

## 20. The schedule is `nextActionAtSec`, one absolute clock for both phases — 2026-08-25

**Decision:** `GameState.nextKillAtSec` becomes `nextActionAtSec`: the absolute timestamp of the next Road kill *or* the next boss swing, depending on `phase`. `advance` merges that schedule with the sorted strike timestamps and processes whichever is earlier; ties resolve strike-first. Strikes outside `(timeSec, timeSec + seconds]` are ignored, so any split hands each strike to exactly one half. Momentum is stored as a `(value, atSec)` pair and rewritten only at strike and arc-catch instants, so its decay operands are identical under any split.

**Why:** Decision #6 forbids a relative time carry. Boss combat therefore runs as discrete swings on the same absolute schedule rather than `hp -= dps * dt`, which would re-accumulate floats differently per split. Lazily-decayed momentum is the same trick: never integrate over an interval, only evaluate at instants that both splits share.

## 21. Realms are ratio-identical: one `REALM_STEP` scales every realm-local quantity — 2026-08-25

**Decision:** `realmScale(realm) = REALM_STEP^realm` (8x) multiplies enemy HP, enemy gold, gear power, hero base damage, hero level cost, and skill cost. A realm therefore plays identically to realm 0 at a different absolute magnitude, and every pacing band is realm-invariant by construction.

**Why:** Ascension resets level, gold, and gear but not the realm index. Without a single shared scale the rebuild in realm 5 is a different game from the rebuild in realm 0, and each band would need per-realm tuning. One constant makes P1–P7 hold for every realm the sim reaches.

## 22. Pending Ascendancy accrues per zone cleared, never per second — 2026-08-25

**Decision:** Zone clears credit `ascendancyPerZone(realm)` pending Ascendancy. Once the realm is portal-ready, further kills credit nothing: `completeZone` resets `killsInZone` and returns before touching road progress, collection, or pending. Boss victory adds `ascendancyBossPayout(realm)` and transfers the full pending balance to banked, exactly once.

**Why:** Without the early return, farming an already-open realm kept crediting zone clears forever, so an infinite Road beat ascending and P7 ("ascending promptly beats farming a ready realm twice as long") was unwinnable. Position-gated accrual makes the reward for staying strictly gold, which is what ascension is supposed to trade away.

## 23. `BOSS_REALM_GAIN` rubber-bands guardians against the earnings bonus — 2026-08-25

**Decision:** `bossHp(realm)` multiplies the realm's final-zone enemy by `bossHpMult` **and** `BOSS_REALM_GAIN^realm` (1.22).

**Why:** The automatic per-victory earnings bonus (`1.15^victories`) is gold-only, but gold buys hero levels, so it indirectly funds DPS. Unchecked, guardian fights collapsed from 53 minutes at realm 0 to 11.8 seconds by realm 39 — outside the 20–90 minute band by three orders of magnitude. A slightly faster boss curve absorbs the compounding and holds every realm in band across 30-day runs.

## 24. Portal entry policy: enter on a prepared build, and what P1/P5/P6 actually measure — 2026-08-25

**Decision:** The simulated player enters the portal when the previewed fight is at most 90 minutes (`PREPARED_MAX_ETA_SEC`), or after 3 days of preparation patience, whichever comes first. Three pacing validators pin their measurement definitions:

- **P1** (Road active vs idle) freezes both position *and* build — portal-ready, best-in-zone epics in every slot — so it isolates the income multiplier from the fact that active play also reaches richer zones. The unfrozen number is printed as context, not asserted.
- **P5** (realm start to portal) runs continuously, without session pauses, so it measures play time rather than wall clock.
- **P6** (boss duration) records `bossEtaSec(state, 1)` at entry — the fight's length at sustained momentum, the number the portal preview shows — because the band is stated in *active* minutes.

**Why:** Each of these validators initially failed against a correct engine because it measured the wrong quantity. P1 spread to 3.85x from build divergence, P5 counted idle gaps between sessions, and P6 counted wall clock for a mostly-idle player. Writing the measurement definition into the ADR keeps the band and the instrument from drifting apart again.
