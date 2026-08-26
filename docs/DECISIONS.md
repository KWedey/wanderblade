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

> Superseded in part by #32: the gain is 1.19, and it absorbs the Ascendancy tree's compounding as well as the earnings bonus.

**Decision:** `bossHp(realm)` multiplies the realm's final-zone enemy by `bossHpMult` **and** `BOSS_REALM_GAIN^realm` (1.22).

**Why:** The automatic per-victory earnings bonus (`1.15^victories`) is gold-only, but gold buys hero levels, so it indirectly funds DPS. Unchecked, guardian fights collapsed from 53 minutes at realm 0 to 11.8 seconds by realm 39 — outside the 20–90 minute band by three orders of magnitude. A slightly faster boss curve absorbs the compounding and holds every realm in band across 30-day runs.

## 24. Portal entry policy: enter on a prepared build, and what P1/P5/P6 actually measure — 2026-08-25

**Decision:** The simulated player enters the portal when the previewed fight is at most 90 minutes (`PREPARED_MAX_ETA_SEC`), or after 3 days of preparation patience, whichever comes first. Three pacing validators pin their measurement definitions:

- **P1** (Road active vs idle) freezes both position *and* build — portal-ready, best-in-zone epics in every slot — so it isolates the income multiplier from the fact that active play also reaches richer zones. The unfrozen number is printed as context, not asserted.
- **P5** (realm start to portal) runs continuously, without session pauses, so it measures play time rather than wall clock.
- **P6** (boss duration) records `bossEtaSec(state, 1)` at entry — the fight's length at sustained momentum, the number the portal preview shows — because the band is stated in *active* minutes.

**Why:** Each of these validators initially failed against a correct engine because it measured the wrong quantity. P1 spread to 3.85x from build divergence, P5 counted idle gaps between sessions, and P6 counted wall clock for a mostly-idle player. Writing the measurement definition into the ADR keeps the band and the instrument from drifting apart again.

## 25. A loot-arc catch is a position hit test, never a queue — 2026-08-25

**Decision:** A Strike is `{ atSec, aim }`, where `aim` is a point in an arc space core defines (hero at the origin, apex one unit high) or `null`. Core computes every live arc's position at the strike's timestamp and catches the nearest arc inside `ARC_CATCH_RADIUS`; an exact tie goes to the older arc. A strike aimed at nothing catches nothing and still lands its swing and its momentum. Arc reach is derived from the kill index through a golden-ratio spread, so it consumes no RNG draw and leaves the kill-keyed stream untouched. The client renders `state.arcs` and reacts to the `arcCatch` event; it never decides a catch.

**Why:** The first implementation popped the oldest arc off the front of the queue with no spatial test at all. A tap at empty sky caught a coin, and a tap on the third coin caught the first — which removes position from the mechanic and makes Loot Arcs an auto-collect with extra steps. The layer earns its place only if *where and when* you strike decides what you get. Keeping the trajectory in core is what lets that stay deterministic: render timing never enters the rules, and identical timestamped aimed inputs still produce byte-identical results under any split.

**Also settled here:** `ARC_CATCH_MULT` is 1.15, not the 2.0 `docs/ACTIVE-PLAY.md` carried before anything was simulated. Momentum's ×1.75 and arc catching compound; 1.15 puts the Road-active ceiling at ≈2.0×, mid-band, measured at 1.95× with zero spread across five seeds. 2.0 would reach ~3.5× and break the 1.8–2.2× band it was written to satisfy.

## 26. Spend depth is a shipped requirement, not polish — 2026-08-25

**Decision:** The upgrade panel must carry **at least five priced rows at every moment of Road play, from the first minute**, and at least four of them affordable at 95% of looks. `purchaseOptions(state)` in `packages/core/src/shop.ts` is the single definition of a shop row, consumed by the client's panel, the simulator's purchase policy, and validator **P8**. Realm-local skills go from two capped tracks to **five uncapped ones** — two live at hero level 0, the rest at 2, 6 and 14 — bounded by an asymptotic value curve (`skillRankMult` rises toward `1 + SKILL_MAX_BONUS`) rather than a rank cap.

**Why:** A blind critic ranked the early-game frame second of six and named the reason: the reference bar shows five things to buy with prices right now, and Wanderblade showed one buyable upgrade and two greyed locks. Measured before changing anything, gold bought exactly one thing — Hero Level — for essentially the whole game: `pricedCount` sat at 4 for every realm sampled, because both skills reached rank 10 within about five minutes and read `MAX` forever after. `docs/ECONOMY.md`'s pacing contract asks for "the number and value of decisions within a 15–30 minute active session", and one decision is not a number.

A rank cap and a bounded value curve answer the same question twice, and the cap was the half putting `MAX` on screen. Removing it is what keeps a row buyable forever while `skillMult` stays finite. Five tracks at `SKILL_MAX_BONUS` 0.176 reach the same 2.25× ceiling the two capped tracks had, which is why the pacing bands did not move: P1 stayed at 1.85–1.91.

**Measured** (`npm run sim -- --seeds 3 --days 90`, 124,657 looks): 6 priced rows at the leanest look, ≥4 affordable at 99.8% of looks, under two affordable for 0.14% of looks, longest such stretch 2.5 min.

**On the starvation clauses.** Their ceilings — 1% of looks, 5 minutes — were set from that first measurement, not chosen in advance, and the distribution is why: every long stretch sits at the same point in a realm, the deliberate spend-down just before committing to a guardian. Emptying your own wallet on purpose is not an empty shop. The bar passes that and still fails loudly on a real stall, which in the capped-tree game ran to hours. The first draft of this clause measured first-to-last starved *sample*, which reported 0.0s for a stretch seen once and hid the real 2.5 min entirely; it now brackets a stretch by the window it sits inside, so the figure errs long rather than short.

The sampler is uncapped. It previously stopped at 20,000 samples, which fell around realm 11–14 of 85 and reported 19,985 looks with a 0.0s worst drought — four fifths of the run, including every late realm Decision #27 is about, went unmeasured while the report still printed a large `n`. The 60.0s drought the full run exposes is one idle sample interval and sits exactly on P8's ceiling.

## 27. The Ascendancy tree is uncapped, and its price curve is linear — 2026-08-25

**Decision:** `ascNodeCost(id, rank) = costBase * (1 + ASC_COST_STEP * rank)` — **linear in rank, with no cap** — and a node's damage or gear-power effect **compounds** per rank rather than adding. Persistent attack speed is the single exception: it rises toward `1 + ASC_SPEED_MAX_BONUS` and stops. `BOSS_REALM_GAIN` stays 1.22 (lowered to 1.19 by #32).

**Why:** At 90 days P6 failed from **realm 45** (95.8 min against a 90-minute ceiling, running away to 179 min by realm 51, identical on every seed). The cause was the tree being a bounded sink: 32 total ranks, fully bought by realm 39, leaving **18,829 banked Ascendancy unspendable**. Past that point hero persistent power grew only ×1.12/realm from the earnings bonus against a guardian growing ×1.22/realm — a ~9%/realm deficit compounding forever. The entry gate hid it by making the player farm a portal-ready realm, where Decision #22 credits no Ascendancy at all; that stall grew 15h → 27 → 39 → 52 → 63 → 76h until the three-day patience cap ran out and P6 broke.

No value of `BOSS_REALM_GAIN` fixes it. Hero persistent-power growth is fast while the tree is being bought and flat once it caps, and a constant cannot track a curve whose slope changes; lowering it re-creates Decision #23's collapse in the early realms, which already sit at the band floor.

The cost curve is the shape that matters. Ascendancy income per realm grows linearly (`ASC_REALM_GROWTH`), so lifetime banked grows with realm **squared**. A geometric price can only buy **logarithmic** rank growth — it saturates by construction. A linear price makes reachable rank grow **linearly** with the realm, and a compounding per-rank effect then makes tree power grow **exponentially**, the same shape as `bossHp`. One `BOSS_REALM_GAIN` now holds every realm instead of a window of them.

**Why speed is the exception:** momentum and tree speed divide *through* the idle kill-time floor, so an unbounded speed multiplier means unbounded event steps per simulated second — a long offline gap would never finish reconciling. Measured: with speed uncapped a 90-day single-seed run took over 15 minutes and a realm-199 guardian test hung outright; bounded, the same run takes 91 seconds. Damage and gear power carry the unbounded growth, where the kill-time floor absorbs them.

**Measured:** `npm run sim -- --seeds 3 --days 90` → ALL PASS, 18 validators × 3 seeds. P6 85/85 realms in band with no trend. The portal-ready-to-entry wait is bounded and plateauing at ~29h (mean 16.2h across 85 realms) instead of diverging, and banked Ascendancy ends at 21 rather than 18,829.

**Supersedes:** the capped three-node tree in Decision #16's implementation. The pending/banked split, the gold-only earnings bonus, and Guardrail 8 are unchanged — persistent combat power still comes only from explicit Ascendancy purchases.

## 28. P7 measures Ascendancy earned, not the balance left over — 2026-08-25

**Decision:** P7 compares `banked + pending + ascSpent(nodes)` between the prompt and overfarm policies. `ascSpent` sums every rank price actually paid, and is tested against what the engine deducted.

**Why:** P7 compared the leftover banked balance, which was a fair proxy only while the tree was capped and the balance was pure unspent residue. Against an uncapped sink it measures *who spent less*, and it inverted for that reason alone — prompt 2196 against overfarm 2312, with the band and the game both unchanged. On the corrected instrument the same run reads prompt 110,635 against overfarm 103,165. The band did not move; the instrument was wrong.

## 29. The engine's overflow frontier is pinned — 2026-08-25

**Decision:** `packages/core/test/magnitude.test.ts` asserts that every client-facing scalar is finite at realm 199, and pins the two frontiers where finiteness ends: `bossHp` overflows first at **realm 301** (297 before #32 lowered `bossHpMult`), and the hero level ladder tops out at **2102 at realm 199** and **659 at realm 296** because level and realm multiply in both `heroBaseDamage` and `levelCost`.

**Why:** A late-game capture showed gold rendering as `1.0637e+278` and a portal panel reading `Infinityd NaNh`, and the question was whether the client-side formatter fixes were papering over real overflow in core. They were not — core is finite and exact at those magnitudes. But there is a real cliff past it: at that frontier a guardian's HP is `Infinity` and no build can ever fell it, which is a soft-lock rather than a rendering problem. `docs/ECONOMY.md` requires detecting non-finite values before they reach client state, so the frontier is now a test that fails if a constant change drags it toward realms a player can reach.

## 30. A kill's payout is thrown as several coins, and the split lives in core — 2026-08-25

**Decision:** Every Road kill throws `ARC_SPLIT_MIN`–`ARC_SPLIT_MAX` (2–4) coins rather than one arc, staggered `ARC_STAGGER_SEC` (0.12 s) apart, each with its own reach. `arcsForKill(killIndex, gold, launchSec, gear)` in `packages/core/src/arcs.ts` produces them; count, stagger and landing point are all derived from the kill index, so they consume no RNG draw and the renderer never chooses them. Coin values sum to the kill's payout **exactly** — the last coin carries the residual rather than a rounded share. `ARC_CATCH_MULT` applies **per coin**, so catching some of a kill is a partial catch. Gear rides the first coin; a drop cannot be halved.

**Why:** The reference bar's screen carries a continuous stream of loot while Wanderblade paid once per kill, so its air was full of weather where the bar's is full of earning. Splitting the payout is what puts earning in the air without changing what a kill is worth.

**`ARC_CATCH_MULT` moves 1.15 → 1.6, and the reason is not the number of coins.** The binding constraint is the **strike rate**, not arc availability: the reference player strikes 3.3×/s against 4.2 kills/s, and measurement confirms **0.999 catches per strike** — every aimed strike already connects. Splitting a payout across n coins therefore divides each catch by n and buys no additional catches. At 1.15 the split measured **1.75–1.76×** Road-active, below the 1.8 floor; at 1.6 it measures **1.91–1.95×, mean 1.93**, mid-band. This supersedes the 1.15 that Decision #25 settled for an un-split arc; that value was correct for the payout shape it was measured against.

**Also fixed here:** `pruneArcs` took a leading prefix of the arc list, which assumed arcs expire in the order they were created. Staggering breaks that — one kill's later coins outlive the next kill's first — so it now filters. The old form would have leaked landed arcs into the save rather than mis-crediting, but it would have leaked.

## 31. Active play is banded in Ascendancy, not gold — 2026-08-25

> Superseded in part by #33: the shipped band is **1.6–2.4×** with first ascension **≥1.20× sooner** (`PERMANENT_RATIO_MIN` / `PERMANENT_RATIO_MAX` / `PERMANENT_SOONER_MIN` in `sim/src/probes.ts`), re-derived from six seeds — 2.16 / 1.96 / 1.81 / 1.63 / 1.93 / 1.97, mean 1.91. The 1.8–2.4× and ≥1.25× below were measured on three seeds before #33 gave the five skills five price curves.

**Decision:** The headline pacing band is **1.8–2.4× lifetime Ascendancy** over a 30-day horizon plus **first ascension ≥1.25× sooner** (validator P10). The 1.8–2.2× Road gold band survives as P1, a supporting band, not the claim that active play matters. `docs/ACTIVE-PLAY.md` carries the superseded note.

**Why:** A playtest reported 5,144 → 391M gold across eight hours of sleep. Our constants hit the gold band exactly — 2.07× measured, P1 green on every seed — and the result was still that one night dwarfed a 30-minute session. That is not a tuning miss; it is the band measuring the wrong quantity. Gold is wiped by every ascension and idle accrues it for as many hours as there are in a night, so **no** multiplier on gold survives the comparison. Ascendancy per realm is bounded by realms completed, which is the one axis where 20 attended minutes and 8 unattended hours are commensurable.

**The ceiling is as load-bearing as the floor.** VISION pillar 4 requires idle-only play to stay meaningfully productive; at 3× the idle player is a spectator. Measured 2.05× / 2.14× / 2.09× on seeds 1–3, first ascension 1.34× / 1.40× / 1.36× sooner.

**Tree depth is reported, not banded.** Ranks are bought when the player opens the app, so "time to 20 tree ranks" lands on a session boundary and quantises to half a day — 3.50d vs 4.50d on all three seeds. Both runs share that schedule so the ratio is honest, but half-day resolution cannot carry a band. Lifetime Ascendancy is the same claim at usable resolution: cumulative node cost is quadratic in rank, so 2.09× the Ascendancy is ≈1.45× the tree depth.

**This band failed on the old constants.** At `bossHpMult` 30000 the ratio was **1.10×** — below the floor — because only 31 realms completed in 30 days and lifetime Ascendancy degenerated into a realm count. Decision #32 is what made the statistic informative.

## 32. The Road has to be able to reach the guardian it opens — 2026-08-25

**Decision:** `bossHpMult` 30000 → **5600** and `BOSS_REALM_GAIN` 1.22 → **1.19**. The guardian band moves from 20–90 to **15–90 active minutes**. Validator **P9** is added: the portal may not sit open on a finished Road for more than 24 hours, no realm may take more than 3 days, and the share of Road time spent waiting is reported. This supersedes the 1.22 that Decisions #23 and #27 settled.

**Why:** Clearing all 50 zones did not build a hero who could face the realm's guardian. At realm 9 the portal opened with the fight previewed at **18 hours**; the modelled player then farmed the last zone for **13 hours** — earning no Ascendancy, seeing no new content (ADR #22) — until the preview fell to 32 minutes. Across 30 realms that was **56% of all Road time** spent waiting, and it was the reason every downstream statistic was uninformative: realm length was pinned at 23.4 h by the session schedule rather than by the economy.

The gap was a **shape** problem, not a level one. It widened ~1.29× per realm, so no single `bossHpMult` closes it. `BOSS_REALM_GAIN` was set against the earnings bonus alone (#23); it also has to cover the Ascendancy tree's compounding damage (#27), which only bites once ranks accumulate. Swept over 30-day runs: gain 1.16 peaks at 41 min then decays to 14 by realm 60; 1.22 rides the 90-minute ceiling and reaches only 51 realms; **1.19 rises from 16 minutes to a ~70-minute plateau and holds it** — 95/95 realms in band, min 16.1, max 90.0.

**The floor moved to 15 because a shorter first guardian is better onboarding.** Realm 0's fight is **16.1 minutes**, so a new player's first ascension fits inside one session. Realms 1–94 all sit at 20 minutes or above; 15 is a floor for the opening realm, not a loosening.

**Result:** longest portal wait **14.74 h → 17.5 m**, waiting share **56% → 0%**, slowest realm **1.01 d → 0.50 d**, realms in 30 days **31 → 95**.

**Also fixed here:** the simulator's `prompt` entry strategy only checked the portal at session boundaries, so a portal opening mid-gap waited up to 11.7 h for the next session while the Road kept building power — which trivialised the fight it then measured (0.1 min by realm 37). `prompt` now means prompt. Separately, `vitest.config.ts` raises `testTimeout` 30 s → 180 s: the many-way split across a ten-day gap is ~40 s of real work and was failing on `main` as a timeout, not an assertion.

## 33. Five skills, five curves — and a panel that is never all grey — 2026-08-25

**Decision:** `SkillDef` carries its own `costBase`, `costRate`, `maxBonus` and `decay`. `skillCost(id, rank, realm)` and `skillRankMult(id, rank)` take the skill they are pricing. The shared `skillCostBase` / `skillCostRate` / `SKILL_MAX_BONUS` / `SKILL_RANK_DECAY` constants are gone; `SKILL_MULT_CEILING` is derived from the roster. Validator **P8** gains a hard clause: at least one row affordable at every look, never merely most of them.

| Skill | Unlock | Rank-0 | Rate | Ceiling | Decay |
|---|---|---|---|---|---|
| Cleave | 0 | 35 | 1.12 | +12% | 0.78 |
| Warcry | 0 | 60 | 1.19 | +23% | 0.93 |
| Riposte | 2 | 110 | 1.15 | +17% | 0.86 |
| Sunder | 6 | 190 | 1.13 | +27% | 0.95 |
| Second Wind | 14 | 300 | 1.21 | +10% | 0.72 |

**Why:** All five cost 50 gold at rank 0, grew at 1.15, and approached the same +17.6%, so they converged on the same rank and were one decision printed five times. Breadth without difference is not breadth. Cheap-and-shallow through dear-and-deep: Cleave is the row a broke hero can always afford and has paid out most of its value by rank 10; Sunder costs six times as much to start but has the slowest price growth and the highest ceiling, so it is the track a rich hero keeps feeding. Second Wind is a burst — dear, small, and 95% paid by rank 10.

**The ceilings still multiply to 2.25×**, the same total the uniform tracks reached, which is why P1–P7 did not move. What did move is P10: first ascension went 1.34× → 1.22× sooner, because a 35-gold opening row helps the idle player too. The band was re-derived from six seeds rather than kept.

**Staggering the prices is the mechanism behind the new P8 clause.** An all-grey panel answers "what do I spend on next" with "nothing". With one shared price every row greys together; with a 35-to-300 spread the cheap track is buyable long before the dear one. `packages/core/test/shop.test.ts` pins it at the engine: from a fresh ascension at realms 0–60, an affordable row is back on the panel in under 60 seconds.

**Also settled here:** a geometric price overflows to Infinity eventually, and an Infinity price is a MAX label wearing a different hat. `magnitude.test.ts` pins each track's frontier — 3,694 (Second Wind) to 6,232 (Cleave) — against realm-local ranks that peak in the low hundreds and reset every ascension.

## 34. The realm ladder ends at 300, and the portal says so — 2026-08-25

**Decision:** `enterPortal` returns `{ entered, reason, events }` where `reason` is `'not-ready'`, `'unwinnable'`, or `null`. It **refuses to open** when `bossHp(realm)` is not finite. Realm 300 is the last winnable realm. The simulator ends a run at the frontier and reports it rather than accumulating wait time against P9.

**Why:** Past realm 300 a guardian's HP is `Infinity`. The old code entered anyway and started a fight no build can ever end — a soft-lock, with the boss ETA reading `Infinity` and the portal panel showing nothing actionable. A closed portal is a state the client can explain; an endless fight is not.

**Why a horizon rather than a representation that survives.** `bossHp` overflows at realm 301, but `enemyHp` follows at 330, `gearPower` at 331, `enemyGold` at 333 and `levelCost` at 341. Carrying `bossHp` in a mantissa/exponent pair buys 30 realms and leaves the wall standing, so a real fix is a big-number representation through the whole economy — an M2+ project with its own determinism contract, not a guard. The guard is what makes the wall a defined edge instead of a hang.

**The frontier realm is not sampled as play.** A Road whose guardian can never be felled has no reward at the end of it, so the simulator stops on *arrival* at that realm rather than after walking it. Walking it cost P8 its margin at 90 days — 4,356 of 4,372 lean panel looks came from realm 301 alone, dragging the 95% clause to 94.8% while realms 0–300 sat at 100%.

**It is reachable.** A 90-day run at 3 seeds reaches **realm 301**. This is a real endgame boundary at roughly three months of steady play, not a theoretical one. `packages/core/test/magnitude.test.ts` pins entry succeeding at realm 300 and refusing at 301, 302, 400 and 5000, with the Road left untouched by the refusal.
