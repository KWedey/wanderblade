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

**Decision:** The simulated player enters the portal when the previewed fight is at most 90 minutes (`PREPARED_MAX_ETA_SEC`, since folded into `BOSS_MAX_SEC` in `sim/src/policy.ts`), or after 3 days of preparation patience, whichever comes first. Three pacing validators pin their measurement definitions:

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

> Superseded in part by #39: the band is 1.4–2.3x, stated at a fixed 14-day checkpoint.

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

## 35. The catch window is constant in time, not in distance — 2026-08-25

**Decision:** `ARC_CATCH_RADIUS` (a fixed 0.12 arc units) is replaced by `ARC_CATCH_SEC` = **0.14 s**. `arcCatchRadius(arc, atSec) = ARC_CATCH_SEC · arcSpeedAt(arc, atSec)`, so the forgiveness a player gets is the same number of milliseconds anywhere along a coin's flight. `arcHitIndex` now compares distance as a fraction of each arc's own radius, so the coin a strike is most clearly inside wins.

**Why:** The geometry made *which coin you reach for* matter more than how fast you reacted. A coin's vertical speed passes through zero at the apex, so a late strike still lands inside a fixed radius; near the ground `|dy/dt|` peaks and the same strike misses by the height the coin fell in the meantime. Measured here, one coin alone in the air at a 50 ms reach:

| | apex | near landing |
|---|---|---|
| fixed radius | 6/6 reaches | **3/6 reaches** |
| constant time | 6/6 | **6/6** |

And in play with several coins up, at a 250 ms human reach: apex **36.0%** vs landing **18.5%** before, **30.8%** vs **29.6%** after — a 1.95× penalty for reaching at the wrong moment, down to 1.04×.

**A 100× cliff on undocumented knowledge does not sort players into skilled and unskilled.** It sorts them into *found it* and *concluded the mechanic is fake*, and the second group is right about what they experienced. Guardrail 3 bans gimmick-led design and a hidden apex-timing trick is a gimmick; guardrail 4 wants active play materially faster, not conditionally faster on a secret.

**0.14 s is the value that keeps aim honest.** At mid-reach it makes the apex radius 0.093, near the old 0.12, so apex play barely moves; near the ground it opens to 0.385, which is what closes the gap. A tap at empty sky still catches nothing, and wild aim — 0.5 units of scatter, over three times the old radius — falls to under a fifth of a modest thumb's rate. A window wide enough to forgive a full 250 ms everywhere would make any tap near the ground catch a neighbouring coin, which is mercy that has eaten the mechanic.

`packages/core/test/thumb.test.ts` is the acceptance test and holds the table above.

## 36. The starvation and dead-time clauses are proven to bite — 2026-08-25

**Decision:** `sim/test/sim.test.ts` feeds the pre-fix measurements straight into `runPacing` and asserts the verdict flips. P8 fails on `minAffordable: 0` and on a four-hour drought; P9 fails on the pre-fix dead time (14.74 h longest wait, **56%** of Road time waiting, 1.01 d slowest realm), on a cadence past three days, and on a portal parked open for 76 hours.

**Why:** A ceiling set from a measured distribution is only trustworthy if we can see it reject the thing it was written to catch. If a clause passes on both the broken and the fixed numbers it is decoration, and nobody finds that out until it fails to catch the next regression. Pinning it as a test rather than as a one-off run means a later tuning pass cannot widen the clause into decoration without turning something red.

## 37. A zone is monsters, not one monster repeated — 2026-08-25

**Decision:** `SPECIES` in `packages/core/src/constants.ts` is a roster of variation *slots* carrying `goldMult` and `dropMult`. `speciesIndex(killIndex)` picks one, derived from the kill index through a third irrational so it **consumes no RNG draw**. A kill pays `goldPerKill(state) · goldMult` and rolls its drop against `dropChance · dropMult`. The `kill` event carries `species`, and `collection.speciesKills` counts them — the Bestiary's substrate.

**Why:** Every monster in a zone paid identically, so an event log read `+220M gold` beside three different creature names and a blind reviewer filed it under *"repeated or stubbed-looking content — reads as a hardcoded constant"*. They were right about what they saw. `docs/VISION.md` pillar 5 makes the Bestiary one of the two dopamine engines, and a bestiary of numerically indistinguishable creatures has nothing to collect.

**No band moved, by construction.** `goldMult` sums to exactly the roster length, so mean payout per kill is unchanged; the sim reads ALL PASS on 20 validators × 6 seeds either way. `dropMult` deliberately does not track gold — the richest monster is not the most generous one, which is what makes the roster worth learning.

**Enemy HP is deliberately left uniform.** Kill time is the clock (`nextActionAtSec`), and varying HP per kill perturbs the load-bearing invariant for a payoff nothing on screen shows. Gold and drop weight are the entire visible surface of what the reviewer saw.

**These are slots, not creatures.** The SRD roster, names, and provenance are M4 content under `docs/SRD-CONTENT.md`; what lives in core is the shape a zone's monsters vary along, so the content drop is a table and not a core change.

**Save compatibility:** `deserialize` defaults `speciesKills` to `[]`, and `app/src/save.ts` accepts its absence rather than discarding the run over a field that did not exist when the save was written.

## 38. Creature colour belongs to the species; the realm identifies itself in the backdrop — 2026-08-25

**Decision:** `monsterInk(body, ground)` takes the **species' own** hex. Hue and saturation come from it and never move. Only **value** answers the realm: the mid tone is pushed off the ground's lightness by `MIN_BODY_CONTRAST` (0.17), plus `SAME_HUE_CONTRAST` (0.16) more when the creature shares that ground's hue. Sprites bake per **roster slot**, not per silhouette, so a realm that fields one silhouette twice gets two species in two colours.

**Why:** colour was previously derived from `RealmSkin.monBody` and hue-turned by silhouette index, so one creature was purple in Greenwood and orange in Ember Wastes. A Bestiary needs stable identities, and a player learns a threat by sight or not at all. Realm identity is already carried by sky, hills, foliage, ground and rock — five layers that own the frame's area.

**How separation is kept without hue.** The medium's own answer: value and a hard outline. A hue-blind contrast rule fielded a dark-teal Green Sprite on green grass at 0.17 apart that still read as a smear, which is why the rule is hue-aware.

**No saturation floor.** A `Math.max(sat, 0.42)` floor manufactured colour that was not in the species: the Ashen Wolf's near-grey carries a faint violet cast, and the floor fielded a vivid purple wolf under a log line reading *Ashen Wolf*. Saturation is the species' exactly.

**Realm floors are untouched.** `MIN_VALUE_SPREAD` 0.42, `MIN_SKY_LIGHTNESS` 0.58 and `MIN_ACCENT_LIGHTNESS` 0.55 are backdrop rules and still run over 500 realms. `RealmSkin.monBody` / `monBodyDark` now feed only the kill burst.

**Tests:** `app/test/species.test.ts` — one species is byte-identical across every realm it appears in; hue holds from a 0.1 ground to a 0.9 one; every creature clears its own turf by `MIN_BODY_CONTRAST`; no realm fields two creatures of one colour. Each was proved to fail against the behaviour it replaces.
## 39. A pacing band is measured at the checkpoint it was set at — 2026-08-25

**Decision:** `PERMANENT_HORIZON_SEC` is a **fixed checkpoint**, 14 days, not `min(horizon, run length)`. Every run reports the ratio taken at the same moment, so the numbers are comparable across runs. A run that stops short reports the ratio and marks it **not banded**, naming both the horizon it reached and the one the band is stated at. P10's sooner-clause is horizon-free and stays banded on every run, so a short run still asserts something real.

The band moves with its horizon: **1.4–2.3× at 14 days**, from six seeds measuring 1.87 / 1.53 / 1.96 / 1.78 / 1.78 / 2.11, mean 1.84. This supersedes the 1.6–2.4× stated at 30 days in #31, which was the same claim taken at a different moment. It also supersedes commit `91b03d9`, which fixed the same bug the other way — probe always reaching 30 days, CLI default raised to 30. That commit's message still describes a default that is no longer in force; this decision is what is live.

**Why:** Bare `npm run sim` — 3 seeds × 14 days, the command everyone types — printed `FAIL P10` on 2 of 3 seeds. Nothing was wrong with the economy. The band was derived from 30-day runs while `min()` quietly took the measurement at 14, so the validator judged a 14-day number against a 30-day bar.

**A validator that cannot pass at the default is worse than no validator.** A red line that means *"you used the wrong flags"* teaches people that red is noise, and the next red line — the real one — gets the same shrug. The fix belongs in the default, never in the band.

**Why 14 and not a longer default:** the ratio is not monotonic in horizon, so no single number is *the* ratio and the band has to name its moment. 14 days is the default run, which makes `npm run sim` self-consistent, and it is a more useful product question than 30 — closer to the window retention is actually argued over.

**The shape, measured on one set of constants** — three seeds, both policies, ratios taken from the same pair of runs so nothing is confounded:

| day | 3 | 7 | 10 | **14** | 21 | **30** | 38 | 45 | 90 |
|---|---|---|---|---|---|---|---|---|---|
| mean | 1.99 | 1.73 | 1.69 | **1.79** | 1.97 | **2.07** | 2.00 | 1.92 | 1.17 |
| spread | .03 | .13 | .43 | .43 | .53 | .41 | .31 | .22 | — |

It is a **hump**: a trough near day 10, a peak near day 30, then a slow decline into the collapse at the end of the ladder. The rise from 14 to 30 is not seed noise — every seed rises individually (1.87→2.14, 1.53→1.83, 1.96→2.24).

**Why it humps.** Ascendancy per realm *grows* with realm depth, so being N realms ahead is worth more the deeper both players are. Early on the active player's lead is a few shallow realms and the ratio sags toward the per-realm payout both are earning. As the lead widens in realms that are each worth more — 165 realms against 121 by day 45 — the premium compounds and the ratio climbs. It falls again only when the leader runs out of ladder: both converge on realm 301, the active player stops earning first, and the idle player closes to 1.17 by day 90.

**14 sits on the rising limb, which is the conservative side of the hump** — it understates the advantage a committed player eventually holds, and a floor that understates is the right kind of wrong. Day 10 is the one checkpoint to avoid: same spread as 14 with a lower mean, right in the trough.

**The day-90 collapse is the realm-300 wall of #34 seen from the economy side**, not a property of the horizon. Two independent systems hit the same ceiling.

**Numbers taken across a constants change are not comparable.** An earlier draft read the gap between 1.84 and 1.91 as a horizon effect; they were measured before and after #35 and #37. Every figure above comes from one constant set.

`sim/test/sim.test.ts` pins all four cases: in-band passes, out-of-band fails, a short run leaves the ratio unbanded and says so, and a short run still fails on a weak sooner-clause so it cannot pass vacuously.

**Superseded by #48** — the fixed 14-day checkpoint stands, but P10 is not banded past content end (day 76).

## 40. A gear slot is worth a different amount — 2026-08-26

**Decision:** `gearPower` takes the slot: `gearPower(realm, z, rarity, slot)`, multiplied by `SLOT_POWER` — **weapon 1.15, armor 1.00, trinket 0.85**. The table sums to exactly `GEAR_SLOTS.length`, so a matched kit is worth precisely what it was unweighted. This is the #37 pattern — a mean-1 multiplier table, no RNG draw, no band moves.

**Why:** a blind reviewer filed a real bug against the shipped frame: *"Weapon `Runed Longsword power 6.84B` and Armor `Runed Plate power 6.84B` are accidentally identical values."* It was not a rendering fault. One formula fed all three slots, so any two drops rolled at the same realm, zone and rarity produced bit-identical numbers. Measured over 542 snapshots: **43.2%** carried at least one identical pair, weapon/armor alone 17.3%, all three 1.1%. At ~9–10 drops per zone across 3 slots, collisions are the normal case, not an edge one.

**The total is unchanged in expectation, measured rather than argued.** `gearPowerTotal` at portal entry, after ÷ before, across 67 matched realm milestones on 3 seeds: **mean 1.0053, median 1.0000**, min 0.4046, max 1.6625, with 38/67 (57%) inside ±5%. The wide per-milestone spread is drop RNG once the two trajectories diverge; the median of exactly 1.0000 is the evidence that nothing was added. It is not an item-by-item identity — the weights cancel only when all three slots hold equal base power, so a single snapshot can move either way. `constants.ts` states it the same way.

**The collision rate is measured after, not asserted.** Re-running the same harness: `BEFORE weights 1/1/1 snaps 542 anyPairIdentical 43.2%` → `AFTER weights 1.15/1/0.85 snaps 545 anyPairIdentical 0.0%`.

**Cost:** `gearPower`'s overflow frontier moves 331 → **330**, because weapon's 1.15× tips one realm earlier. Still well past the realm-300 horizon of #34, so it changes nothing reachable. `packages/core/test/magnitude.test.ts` is repinned; `packages/core/test/slots.test.ts` holds the mean-1 proof, the no-collision proof and split-invariance.

## 41. `state.arcs` holds only coins still in the air — 2026-08-26

**Decision:** `advance` prunes the arc list once more at its own **absolute** `target` clock, after the kill/strike loop. Every arc in `state.arcs` is now guaranteed un-landed: `arc.expiresAtSec > state.timeSec`.

**Why:** kills and strikes each pruned at their own clock, so an advance that ended between two kills left the coins that landed in the gap sitting in the list, reporting no position. Under the client's real 250 ms tick that was a steady 2–3 dead coins, permanently. Bounded, so never a leak — but a field whose contents are *partly* meaningless is an invitation to write a second reader that filters it, and then the two readers disagree. `app/` has already grown four duplicate economies that way, one of them live and paying the wrong rate.

**Why an absolute clock and not an elapsed carry.** Pruning mutates state, so it has to survive #6. Removing everything expired by an absolute clock is monotone and idempotent in that clock, so the extra prune a split performs at its own boundary removes a subset of what the final prune removes and both runs end with an identical list. An elapsed carry does not have that property — it is the same trap as the relative "time remaining" the kill schedule refuses. Pruning cannot change a payout either way: gold is credited at the kill and catching adds `ARC_CATCH_MULT` on top, so an uncaught coin costs nothing, and `arcHitIndex` already skips arcs with no current position.

**The probe is proven to fire.** `packages/core/test/arcprune.test.ts`, three deliberate breakages:

| Breakage | Result |
|---|---|
| Prune removed | 3 behaviour tests red |
| Prune against a relative carry (`target - seconds`) | split-invariance red, plus the 3 |
| Prune one flight too eager (`target + ARC_FLIGHT_SEC`) | all 6 red, including the over-prune guard |

**One test was rewritten because it could not fail.** The first draft asserted landed coins *accumulate* across many short advances. They do not — the per-kill prune bounds the residue at one kill period's worth, so the test passed with the fix disabled. Measured before rewriting: 2–3 dead coins at every slice size from 0.25 s to 2.5 s, flat rather than growing. It now runs the client's own 250 ms tick and asserts the residue is zero.

**`performance.test.ts` tightens with it.** Its window helper asserted the bound only above, because landed coins made the lower side untrue. It is now two-sided.

**Two things the prune exposed, both pre-existing.**

*The `busyRoad()` fixture in `packages/core/test/thumb.test.ts` is not busy.* It sets `hero.level` and `zone` by hand without recomputing the kill schedule, so it lands **one** kill and then idles 27 seconds. The three arcs it left behind were all already down — #35's geometry assertions were reading real numbers off dead coins, which is why they never noticed. `liveArcRoad()` (`roadAt(17, 20, 0.3)`, ~13 coins genuinely airborne) is the honest fixture, and the two tests this prune broke now use it. **The other four are left on the old fixture deliberately**: swapping them strengthens five tests and turns `degrades with aim error` red on a true measurement, which is a re-calibration of what a test asserts rather than a fixture fix.

*Aim stops mattering once the Road is busy.* Measured on `roadAt(17, 20, killSec)`, catch rate against aim scatter, 250 ms latency, 400 taps:

| Coins airborne | Perfect aim | ±0.12 | ±0.25 | ±0.50 | ±1.00 |
|---|---|---|---|---|---|
| 2.7 | 0.261 | 0.405 | 0.379 | 0.270 | 0.131 |
| 5.8 | 0.500 | 0.520 | 0.552 | 0.468 | 0.268 |
| 13.4 | 0.830 | 0.868 | 0.853 | 0.730 | 0.385 |
| 18.2 | 0.932 | 0.917 | 0.915 | 0.818 | 0.405 |

Scatter of ±0.5 — half the whole reach range — costs **12%** of catches at 18 coins. The mechanism is #35's own: the window is `ARC_CATCH_SEC · speed`, and near landing speed is ≈2.75, so the radius is **0.385** against a reach range of 1.0. Two landing coins blanket the play area. This is the price #35 paid for equal forgiveness in time, it deepens as kills speed up, and it is what P1's 1.8–2.2× active multiplier is currently buying in late zones. Open for a ruling; no constant changed here.

*The sim-side acceptance test now averages 8 seeds.* Landing catch rate spans 0.387–0.800 across seeds 1–8 and the apex/landing ratio spans 0.76–2.47, so the single-seed read was an instrument fault of the same shape as #39's horizon. Mean landing 0.542, mean ratio 1.61. Pinning the radius back to a flat 0.12 drops mean landing to **0.019**, so the averaged form has far more margin than the single-seed one it replaces.

## 42. A bitmap glyph needs a bigger box, never a smaller face — 2026-08-26

**Decision:** when panel or HUD text renders in the webfont instead of the bitmap face, the fix is to widen the box, never to step the glyphs down. `paintElement` falls back to the webfont whenever the bitmap cannot fit at `MIN_UI_SCALE`, and the box it is measured against was sized by the browser from *the webfont*, which is narrower. So the failure reports itself as "the type is too big" when the truth is "the box is too small".

**Why:** three consecutive blind critics named "two type systems in one frame" and none of us could find more than one instance at a time. Nine elements were falling back. Measured, box against what the bitmap actually needs:

| element | text | box | bitmap needs |
|---|---|---|---|
| `.zone` | `Zone 49/50` | 56px | 118px |
| `.leagues` | `48.8 leagues` | 67px | 142px |
| `.gold-rate` | `+425M/s` | 67px | 123px |
| `.asc-open-label` | `Ascendancy` | 93px | 118px |
| `.hud-label` | `DPS` | 28px | 34px |

The webfont measured every one of those boxes at **47–82%** of what the bitmap face needs to draw the same string.

**Three ways a box gets mis-sized, all of them fixed at the box:**

- **Content-sized parents.** A shrink-wrapped flex or grid item is exactly as wide as the webfont needed. A `nowrap` leaf claims the room instead, bounded by the nearest *positioned* ancestor — a fence someone drew on purpose — not by its immediate parent, which is usually shrink-wrapped to the same webfont measurement.
- **`text-transform`.** The browser measures the transformed string; `textContent` is untransformed. Nine uppercased labels were drawn mixed-case in boxes sized for caps. That width mismatch is what a judge read as `ASOCNDANOY`.
- **Generated content.** `::before`/`::after` never appears in `textContent`, so the bitmap layer cannot see it. The mark stays webfont and prints *over* the bitmap beside it. Banned outright, and `app/test/typegrid.test.ts` fails on any non-empty `content:` rule.

**Cost:** claiming width can push a sibling. The claim is opt-in via `white-space: nowrap`, and `qa:mobile` reports `webfontFallbacks`, `hudOverPanel` and `overflowingX` on every viewport so an over-claim is visible in the same run that proves the fallback is gone.

## 43. The thumb model may not reach for a coin that will be gone — 2026-08-26

**Decision:** `target()` in `sim/src/thumb.ts` takes the moment the **strike resolves** as its "still in the air" test, not the moment the player aimed. `runThumb` reports `doomed`: aimed taps whose chosen coin had landed before the strike landed. It must be **zero**.

**Why:** `aimAt = sawAt + lead · latency`, so at the default `lead: 0` it *is* `sawAt`, and `target(frame.arcs, sawAt, aimAt, pick)` passed the same timestamp twice. The guard the doc comment describes — "nobody throws at a coin that will have landed" — collapsed into `seenP` evaluated twice and did nothing. Measured at seed 7, 250 ms latency: **148 of 150 aimed taps** committed to a coin already on the ground.

It hid because it is invisible at `lead: 1`, where `aimAt` equals `strikeAt` and the guard was accidentally correct all along. `leaves full prediction exactly where it was` stays green when the bug is reintroduced, which is what pins that.

**Why only the landing pick showed it.** The landing pick chooses the coin nearest the ground as seen 250 ms earlier — by construction the one most likely to be gone. Apex coins sit at mid-flight and survive the latency, so apex read 95–97% throughout and only landing moved. That asymmetry was the tell.

**What it was mistaken for.** `bdd06ba`'s slot weights turned the test red and looked like the cause. They were the trigger, not the fault: they shifted seed 7's kill interval, which changed how often an *incidental* coin happened to sit under the stale aim point. Catches on the landing pick were almost entirely incidental — the intended coin was out of window on every tap (displacement/radius 1.51). Two other hypotheses were measured and are wrong:

| Hypothesis | Measurement | Verdict |
|---|---|---|
| More coins airborne per tap | 17.1 → **15.1** after the weights | Backwards |
| `ARC_STAGGER_SEC` no longer spacing arrivals | landing 0.713 / 0.753 / **0.387** / 0.253 at stagger 0.04 / 0.08 / 0.12 / 0.20 | Real sensitivity, but a symptom |
| Aliasing against the 5 Hz tap grid | landing 0.376–0.516 across 3–8 taps/s | Too small to explain it |

The stagger sensitivity disappears once the guard is right, because it was setting the spacing of the incidental coins the bot was relying on.

**The sample was never going to converge.** Landing ran 39.3% at 30 s to 72.4% at 960 s and was still climbing, because the run deepens during the sample and incidental catches scale with coin density. Fixed: **0.873 at 30 s to 0.926 at 480 s**, ratio 1.08–1.16. A sample that has to be lengthened to pass is hiding something; this is what it was hiding.

**Result, single seed 7, the test's own config, assertion untouched:**

| | apex | landing | ratio |
|---|---|---|---|
| Before | 0.953 | 0.387 | 2.42 |
| After | 0.987 | 0.873 | **1.13** |

Across seeds 1–8 the ratio was 0.76–2.47 and is now **1.05–1.35** — the spread was the artifact, not the seed.

**Probes proven to fire.** Reverting the guard to `aimAt`: `doomed` 148/150, both new tests red, and the original assertion red at 0.387. Pinning `arcCatchRadius` back to a flat 0.12 (#35's cliff): landing **0.033**, so that test still cannot pass if the cliff returns.

## 44. A wrong frame of reference is escaped by a different measurement, not more of the same — 2026-08-26

**Decision:** when a measurement keeps confirming a conclusion the frame contradicts, stop measuring and change what is being measured. Paint the thing a colour nothing else in the frame uses, plant a decoy, or read the registered listeners rather than the propagated event.

**Why:** "the hero has no ground shadow" survived four measured attempts. Every crop sampled to answer it contained a full-width dark stripe that read as terrain, so each sample confirmed "no shadow here" and raised confidence without touching the error. Painting `drawShadow` magenta for one capture ended it in a single frame: the magenta ran edge to edge. The hero had a shadow all along — every prop casts at the same one depth, and enough of them tile into a continuous band, so nothing in it reads as cast by anything.

**The same failure is behind most of what has been expensive here:** a gate read out of another agent's `/tmp` log, a capture taken from the wrong port, a thumb sample moved to a horizon that does not exist, `qa:wiring`'s first draft dispatching a `pointermove` and checking it propagated — propagation does not depend on anyone listening, so it would have passed on the build that shipped broken.

**How to apply:** more measurement of the same kind cannot escape a wrong frame of reference; a different kind can. This is the same rule as #38's "every probe ships a mechanism proving it still fires" — a probe that cannot fail and a measurement that cannot surprise you are one bug.

## 45. A log line breaks where its meaning breaks — 2026-08-26

**Decision:** `wrapPixelText` honours a no-break joint (U+00A0) as one wrappable unit, and `flavor.ts` binds each authored phrase — the creature's name, and the whole reward. A phrase too wide for the box alone has its own joints broken, and only its own.

**Why:** the judge read

```
Felled a Thornback Lynx — +171M
gold
```

A number without its unit is not a smaller reward, it is debris. Measured, the box cannot be the fix here the way #42's was:

| | glyphs needed | box |
|---|---|---|
| `Felled a Thornback Lynx — +171M gold` (the judged frame) | 430px | 415px |
| `Felled a Cracked Sentinel — +345B gold` (longest name, longest number) | 454px | 415px |
| the same entry on a landscape phone | 454px | **222px** |

Abbreviating buys the desktop and not the phone — stripping the article and the unit word gets to 370px, still 148px over at 222. So the line has to break, and it breaks before the em dash rather than inside the reward.

**Breaking per phrase, not per line, is the part worth keeping.** An all-or-nothing retry unbound `+345B gold` because `Dragonfang Greatsword` did not fit the same box. Each phrase now yields on its own account, which is why `(power 345B)` survives a gear name that does not.

**The probe fires.** Joining `bind()`'s parts with an ordinary space turns `never strands a reward's unit` red at 4 of 5 viewports — every one whose panel is narrow enough to wrap. It stays green on the iPad, where nothing wraps at all.

**Cost:** a held joint reaches the accessibility tree as U+00A0. Screen readers speak it as a space, and it never reaches the glyph layer — `plainText` normalises it before `unsupported()` and before every blit — so `FONT` and `FONT_COVERAGE` are untouched.

## 46. A kill's coins are not all worth the same — 2026-08-26

**Decision:** `arcsForKill` weights each coin's share by `coinWeight(killIndex · ARC_SPLIT_MAX + i)`, an irrational-indexed sequence spanning `1 ± COIN_SHARE_SPREAD` (**0.45**), then normalises by the kill's own weight sum. Derived, not rolled — no RNG draw, indexed exactly like `arcLandingX`, so a save reconstructs the coins and the kill-keyed stream is untouched.

**Why:** a blind judge filed the log repeating `Snatched it mid-air – +19.0M gold` verbatim two rows apart and called it a bug. It was not a display fault and not a coincidence. With an even split, a coin is worth `goldPerKill × SPECIES[i].goldMult ÷ splitCount`, and `goldPerKill` is constant inside a zone — so the entire payout vocabulary of a zone is **5 species × 3 split counts = 15 numbers**, cycled forever. The judge inferred something true about the model.

**Measured as displayed, not exactly** — two coins differing by 0.01% print the same string, so the exact count is not the acceptance criterion. 5 seeds, 2000 catches, values through `formatNumber`:

| | even split | weighted |
|---|---|---|
| distinct exact values | 19 | 400 |
| **distinct as displayed** | **15** | **284** |
| adjacent rows identical | 5.8% | **0.0%** |
| a repeat within 5 rows | 23.2% | **1.0%** |

**The kill total is unchanged exactly, not in expectation.** Normalising by the weight sum means a kill pays precisely what it paid before — stronger than #40's gear case, and asserted exactly in `arcs.test.ts` rather than sampled. The catch payout is the part that could have drifted, since `ARC_CATCH_MULT` applies per coin and a fat coin pays more: mean bonus over 2000 catches is **502.73 → 501.95, a 0.155% difference**, so catches are not drawn to the fat coins. **Reach does not predict worth, measured rather than argued** — if it did, a player could farm fat coins by aiming at one spot and P1 would drift. Over 899,998 coins, Pearson *r* between `landingX` and share is **0.000013**, and the mean share in every reach decile is **1.000** to three places. There is no spot on the road worth aiming at.

**It survives rounding.** Over 200,000 kills / 599,996 coins, **zero** kills have two coins printing the same at three significant figures, and the closest adjacent pair differs by **2.24%** — three significant figures need about 0.5%, so the margin is real rather than a value that happens to round apart.

**One arithmetic trap, recorded because the first draft got it backwards.** Normalising can push a share slightly *outside* the raw `1 ± spread` band, not inside it: a fat coin beside two lean ones divides by a sum below `n`. Measured envelope is **0.5544 … 1.4528** over 500k kills, and the test pins that rather than the constant.

## 47. Flight length cannot move the aim problem, and the sim reports `intended` — 2026-08-26

**Decision:** `ARC_FLIGHT_SEC` stays **1.5**. `npm run sim` now prints an **ACTIVE THUMB** block reporting catch rate beside `aimed coin` — the share of catches that took the coin the player went for. Reported, never banded.

**Why flight length is not a lever, and it is arithmetic rather than a measurement.** The displacement that defeats an aimed tap is `latency × speed`; the catch radius is `ARC_CATCH_SEC × speed`. Their ratio is **`latency / ARC_CATCH_SEC`** — speed cancels. `ARC_FLIGHT_SEC` changes only speed, so it cannot move the ratio at all. That is the same scale-freedom that makes #35's window constant in time, seen from the other side.

Measured with the shipped circular window, the real engine path, 250 ms, 400 taps:

| `ARC_FLIGHT_SEC` | coins airborne | landing rate | landing `intended` | ±1.0 |
|---|---|---|---|---|
| **1.5** (control) | 18.2 | 0.93 | **0%** | 0.13 |
| 2.25 | 29.1 | 0.75 | **0%** | 0.07 |
| 3.0 | 40.0 | 0.69 | **0%** | 0.07 |
| 6.0 | 82.8 | 0.34 | **0%** | 0.05 |

`intended` is 0% at every length, exactly as the cancellation predicts.

**With the ellipse of #45 it moves a little, and not where it was hoped.** Landing `intended` 34% → **42%** at flight 4.5, and the apex comes off 0% only to **1%**. The apex curvature offset does shrink as predicted — `4·Δp²`, so 0.111 at flight 1.5 becomes 0.028 at flight 3.0, well inside `ARC_CATCH_PERP` — but a longer flight also multiplies the coins in the air (18 → 40), and a neighbour then outscores the aimed coin instead. The lever trades curvature for density and nets out.

**Declined on feel as well as numbers.** At flight 3.0 a coin hangs for three seconds with forty on screen at once; at 4.5 there are sixty-one. That is floating debris, not a thrown purse. The latency profile also turns erratic — at flight 4.0 a 150 ms player catches 0.20 while a 100 ms player catches 1.00 — which is the reflex-lottery shape #45 rejected compensation for.

**Why `intended` is printed and not banded.** Catch *rate* answers "is active play faster". It cannot answer "is active play skilful", because in a dense field a tap that misses its coin lands on a neighbour. The shipped block makes the gap visible on every run:

```
  latency  pick                          catch rate   aimed coin
    0 ms  landing                   0.97         100%
  250 ms  landing                   0.83           0%
  250 ms  apex                      0.97           0%
  250 ms  landing, sloppy aim       0.58          19%
```

The last row is the whole problem in one line: **sloppy aim scores 19% where perfect aim scores 0%**, because scatter accidentally compensates for a systematically late tap. No band is attached — a metric that can go red becomes a thing to tune, and this one is evidence.

**One implementation note worth keeping.** The caught coin is identified by matching `bonusGold`, not by splitting the advance around the strike. `advance` skips a strike stamped exactly at its start, so stopping the clock on the strike instant silently drops it and every catch rate reads zero. Coin shares are spread per-coin (#44), so the match is near-unique — acceptable for a reported number, never for an assertion.

**Correction (2026-09-25):** two cross-references above point at the wrong ADRs. "The ellipse of #45" is the ellipse of **#50**; "#45" is the log-wrapping decision. "Spread per-coin (#44)" is the coin-value spread of **#46**. The text is left as written.

## 48. Content end is day 76, and no ratio past it measures pacing — 2026-08-26

**Decision:** The realm-300 ceiling of #34 has a date: a steady active player reaches it on **day 74.8–78.9**, an idle player on **day 91.5–92.1**. No economy constant moves. The sim now labels content end wherever a horizon number is printed beside it, because a bare ratio taken past that point reads as a pacing failure and is not one.

**What was reported.** A day-by-day active/idle multiple showed `1.92` at day 75 and `1.17` at day 90, against P10's stated band of `1.4–2.3x`. Read as a collapse in the tail of an otherwise healthy curve.

**It is a cliff, and the cliff is #34.** `bossHp(300)` is `4.629411143378215e+307`; `bossHp(301)` is `Infinity` — the float64 exponent runs out between them, with `Number.MAX_VALUE` at `1.7976931348623157e+308`. `enterPortal` refuses realm 301 with `'unwinnable'` (`packages/core/src/engine.ts:154`), and the simulator stops the run there (`sim/src/simulate.ts:312-314`) because a Road with no reward at its end is not play.

**The tail is arithmetic, not behaviour.** The active run's earned total freezes at `1.5561e6` on arrival. Predicting the multiple as `frozen / idleEarned(t)` reproduces the measured curve exactly:

| day | measured multiple | `frozen / idle` | difference |
|---|---|---|---|
| 75 | 1.780 | — | still earning |
| 77.5 | 1.726 | 1.726 | **0.0e+0** |
| 80 | 1.600 | 1.600 | **0.0e+0** |
| 85 | 1.389 | 1.389 | **0.0e+0** |
| 90 | **1.218** | 1.218 | **0.0e+0** |
| 92.5 | 1.166 | 1.166 | **0.0e+0** |

Seven checkpoints at zero difference. There is no economy behaviour in that slope to diagnose — it is one constant over a growing denominator, which is a hyperbola by construction.

Across five seeds every run reaches realm 301: active stops at days 74.80 / 74.97 / 76.31 / 76.74 / 78.90, idle at 91.53–92.05. The 12.8–17.3 day gap **is** active play working; it is the reward for playing, seen after both players have run out of ladder.

**P10 never read the number.** `PERMANENT_HORIZON_SEC = 14 * SEC_PER_DAY` (`sim/src/probes.ts:287`) and `measuredAtSec = Math.min(PERMANENT_HORIZON_SEC, shortest)` (`:438`) — the fixed checkpoint of #39. A run that meets the frontier stops there, so `shortest` already caps the reading at content end and the band can never be applied past it. Day 90 is outside the band's *numeric range* and is not a band reading.

**This supersedes one sentence of #39.** `docs/DECISIONS.md:357` ends:

> *"It falls again only when the leader runs out of ladder: both converge on realm 301, the active player stops earning first, and the idle player closes to 1.17 by day 90."*

**That reading is superseded.** Nothing *converges* and the idle player does not *close*: the active player's total stops moving at the frontier and the idle player's keeps growing against a fixed number. A convergence is two rates meeting; this is one rate against zero. The same sentence's mechanism — the leader running out of ladder — is right, and stays.

Superseded with it: the `1.17` in the day-90 column of the table at `:352`. Per the log's own rule that history is superseded rather than edited, that row stands as written; the live reading now comes from the sweep, which blanks the checkpoint instead of filling it.

**What #39 got right, and this ADR does not overturn.** #39 already named the cause — *"the day-90 collapse is the realm-300 wall of #34 seen from the economy side, not a property of the horizon"*. What this adds is proof, a date, and the narrower correction above: **a day-90 cell does not belong in a row of pacing ratios.** `1.17` is a true statement about who holds more Ascendancy at day 90; it is not a statement about what active play buys per unit time, which is what every other cell in that row measures and what the band is stated in. Printed beside them it reads as the same kind of number, and that is how it was misread — twice.

**Why no constant moves.** Tuning here would fit the economy to a comparison taken fourteen days after one side ran out of content — the same error class #39 was written to prevent. The lever would also be aimed at the wrong layer: the ceiling is an artifact of float64 range, not a designed stopping point, and the big-number work that addresses it is parked for M4 by #34.

**The sweep ships, so the table above is reproducible rather than quoted.** `npm run sim -- --days 90 --seeds 1` prints the active/idle multiple at every checkpoint inside the run, and blanks the ones it cannot take:

```
   horizon sweep: active/idle Ascendancy per checkpoint (reported, never banded)
     3.00d 1.99x   7.00d 1.62x   14.00d 1.82x   21.00d 1.99x   30.00d 2.14x
     45.00d 1.92x   60.00d 1.81x   75.00d 1.78x   90.00d —
     — = not measurable: past content end — a run stopped at realm 301 at 76.31d,
         so a later ratio would divide a frozen total by a growing one
```

The guard is the point of it. `earnedAt` carries the last trail value forward, so an unguarded checkpoint past a run's end reports a frozen numerator over a growing denominator — which is how `1.17x` was produced in the first place. Removing the guard makes the 3-day checkpoint of a run that stopped at 0.5 days report `0.137x`, and the probe test that asserts it reads no-data goes red.

Reported and never banded, for the reason #47 gives: a curve that can go red becomes a thing to tune, and this one is evidence.

**The curve that prompted this ADR is #39's own table**, not a lost generator — **three** seeds averaged (`:348`, and its per-seed list at `:356` names three), where the block above is one seed. `npm run sim -- --days 90 --seeds 3` now prints the live version, and every seed blanks day 90 at its own frontier (76.31d / 78.90d / 74.80d):

| day | 3 | 7 | **14** | 21 | 30 | 45 | 60 | 75 | 90 |
|---|---|---|---|---|---|---|---|---|---|
| **live mean** | 2.00 | 1.66 | **1.81** | 1.99 | 2.06 | 1.92 | 1.81 | 1.78 | **—** |
| #39's mean | 1.99 | 1.73 | 1.79 | 1.97 | 2.07 | 1.92 | — | — | 1.17 |

The hump survives, and day 14 sits in band on both. **This is not a controlled comparison** and must not be read as one: four value-changing constants commits separate the rows (`d3d2c42`, `93c2b6e`, `bdd06ba`, `b5a6885`), which is exactly what #39's own closing paragraph warns about. The rows are printed together because the live one is now reproducible, not because their difference means anything. The zero-residual reconstruction above depends on neither — it is internal to one run.

**What changed alongside it — the label.** `RunResult` and `SeedResult` carry `frontierSec` beside `frontierRealm`; `PermanentUplift` carries `contentEndRealm` / `contentEndSec`. The seed report names the realm *and* the day and states the consequence, and P10's detail appends `[capped at content end — realm N at Td]`. The clause labels and never excuses: the band still fails a bad ratio at the checkpoint, asserted directly.

**The ceiling was already pinned, and that is what makes this safe.** `packages/core/test/magnitude.test.ts:136` asserts the first non-finite realm is exactly 301, and `:192` asserts realm 300 opens while 301, 302, 400 and 5000 refuse with `'unwinnable'` and leave the Road untouched. A growth constant that drags the frontier toward reachable realms fails there. This ADR adds the player-time reading those tests do not carry; it does not add a second copy of them.


**Correction (2026-09-25):** the `sim/src/probes.ts` line numbers cited above have moved. `PERMANENT_HORIZON_SEC` is now at `:289` and the `measuredAtSec` clamp at `:493`. Grep for the names rather than trusting a line.

## 49. Provenance recorded, not renamed — the 18 folklore-adjacent names stay — 2026-08-26

**Decision:** `docs/SRD-CONTENT.md` now records provenance for the 18 shipped creature names (`app/src/species.ts`) whose base word also names, or resembles, an SRD 5.2.1 monster — option A of `.omc/blockers/srd-monster-name-provenance.md`, approved by Kyle. No name changes, no code changes, no player-visible strings touched.

**Why keep them.** SRD 5.2.1 is CC-BY-4.0; using its monster names with attribution is licensed, and the attribution `docs/SRD-CONTENT.md` already carries satisfies it. The gap rule 2 flagged was process, not licence — the names were adopted without recording where they came from. Renaming would touch customer-facing strings, Bestiary collection records, and any save that stores a name, to buy nothing the licence already grants.

**What was actually verified.** Every SRD entry and page was checked against the official artifact (`https://media.dndbeyond.com/compendium-images/srd/5.2/SRD_CC_v5.2.1.pdf`) by full-text search, not memory or a third-party wiki:

| Bucket | Count | Names |
|---|---|---|
| Matching SRD 5.2.1 stat block | 10 | Wyvern, Iron Kobold, Anvil Ogre, Tomb Wight, Will-o'-Wisp, Cinder Imp, Moss Troll, Green Sprite, Star Wraith, Ember Wraith |
| Generic folklore, predates D&D, no SRD entry | 8 | Mire Hag, Rock Wyrm, Frost Drake, Marsh Drake, Forge Golem, Rubble Golem, Ash Revenant, Astral Behemoth |
| Neither (would need a rename) | 0 | — |

Four base words — Wyrm, Drake, Revenant, Behemoth — do not appear anywhere in the SRD 5.2.1 text at all (confirmed by full-document search, not just its index), and each is a documented pre-D&D word (Old English/Norse "wyrm," archaic English "drake," gothic-literature "revenant," biblical "behemoth"). Compounds where only the base word is the SRD or folklore term ("Iron Kobold" → kobold) record the base word only; the modifier is original Wanderblade and is never claimed as adapted.

**Count correction.** The task named "17 names"; the list it enumerated, and the actual matching set in `species.ts`, is 18 — Star Wraith and Ember Wraith are two names sharing one SRD base word. All 18 are in the roster, not 17.
**Correction (2026-09-25):** `.omc/blockers/srd-monster-name-provenance.md` was never committed (`.omc/` is gitignored) and no copy exists. The licensing analysis it held is now written into `docs/SRD-CONTENT.md` §Why the names stay.

## 50. The catch window separates being late from aiming badly — 2026-08-26

**Decision:** `ARC_CATCH_SEC` 0.14 → **0.30** (along the coin's path) and a new `ARC_CATCH_PERP` = **0.10** (across it). `arcHitIndex` scores an ellipse aligned to `arcHeadingAt` instead of a circle.

**The clause that parked this is replaced, approved by Kyle.** `degrades with aim error` asserted that a wild tap catches under 20% of coins. It cannot: coins sit ~0.12 units apart in a roughly 1-unit field, so a "miss" lands on a neighbour, and the clause only passes at about one coin airborne — which contradicts the loot stream the arcs exist to be. It was measuring **coin density**, not the catch window. The subsuming test is the same `it` block, asserting the same intent on `intended` — the share of catches that took the coin actually aimed at.

**Bounded to ±0.5 on measurement, not on preference.** `intended` degrades cleanly across the human aim range and then turns around:

| aim scatter | 0 | 0.12 | 0.25 | 0.50 | **1.00** |
|---|---|---|---|---|---|
| `intended` | 0.339 | 0.233 | 0.121 | 0.104 | **0.286** |

The rise is a sample collapse, not skill. Catches by scatter: **398 / 343 / 315 / 230 / 35**. The 0.286 is **10 catches out of 35**, sitting beside 24-out-of-230 at ±0.5 — a ratio on a seventh of the sample, not a comparable measurement. Asserting across it would have replaced one clause that measured an artifact with another that did, so the test stops at ±0.5 and says why.

**One wrong mechanism was published here and is corrected.** The first version of this ADR and its test comment said `thumbAim` scatters at 0.5–1.0× the radius, so only short scatters still catch. It does not: `thumb.test.ts:82-83` offsets by exactly `scatter` and varies only the angle. There are no short scatters. The bound was right for a reason nobody had established — the number was measured, the explanation was assumed.

**Proven able to fail.** Widening `ARC_CATCH_PERP` to 0.30 — the circle this ADR replaced — drops `intended` at perfect aim from **0.339 to 0.013** and reds the first assertion by name.

**Why:** one circle at one instant is simultaneously the aim tolerance and the timing tolerance, so tightening either tightens both. That is why #43 found no value of `ARC_CATCH_SEC` that made aim matter without turning the mechanic into a reflex-time lottery. Latency displaces a tap **along** the path; a stray tap scatters in **every** direction. Splitting the axes is the shape the physics implied, and it is not a cap — the along-path window is still constant in time at every speed, so #35 is untouched.

**Measured with real catches**, `liveArcRoad()`, 250 ms, 400 taps:

| | circle (0.14) | ellipse (0.30 / 0.10) |
|---|---|---|
| landing rate | 0.93 | 1.00 |
| landing `intended` | **0%** | **34%** |
| apex `intended` | 0% | **0%** |
| ±0.5 scatter | 0.71 | 0.54 |
| ±1.0 scatter | 0.125 | 0.12 |
| rate at 100–450 ms latency | — | **flat 1.00** |

**A correction, because the first number reported was wrong.** An earlier harness read `intended` at 97%. It called `advance(state, dt, [])` with an **empty strike array**, so caught coins were never removed and the same coin was re-aimed at every tap. With real catches it is **34%**. The lesson is the session's own: a harness that does not perform the action it measures will flatter it, and the fix is to drive the real engine path rather than a model of it.

**Where this shape does not work, quantified.** At the apex `intended` stays **0%**, and the number is the parabola's own curvature: over a 250 ms window the seen position sits **0.111** across the tangent at p=0.5, against 0.014–0.047 near the ground. Widening `ARC_CATCH_PERP` past 0.111 does not rescue it — 0% at 0.10, 0.14, 0.18 and 0.24 — because a neighbour then scores lower than the aimed coin. Pinned as a known limit in `thumb.test.ts` rather than left to be rediscovered.

**Lag compensation was tried first and rejected.** Evaluating the aim at `clock − LAG` is deterministic (a constant, no wall clock) and never catches an unthrown coin (`arcPositionAt` is null before launch, measured 0 across every value). It took `intended` to 97% and, with a 0.05 window, passed every acceptance condition. It was rejected on a measurement nobody asked for: catch rate against the player's **actual** reaction time is a narrow spike — **0.087 at 150 ms, 1.000 at 250 ms, 0.022 at 300 ms**. It rewards having the reflexes the constant assumes and punishes a fast player worse than a slow one. Experiment preserved on `exp/catch-lag`.

**Still red: `degrades with aim error` at 0.2308 against its 0.2 bar.** #43 showed that clause is a statement about coin density — it only becomes true at roughly one coin in the air, which contradicts the Loot Arc design. Replacing it is a rewrite of what a test asserts, which is the user's call and not an agent's, so the branch is parked rather than merged.

## 51. Value answers every surface a creature is seen against, not just the turf — 2026-08-26

**Decision:** `monsterInk` takes the realm's rock as well as its turf and pushes the mid tone clear of both. The hue premium of #38 is charged against the turf only; a rock gets the flat `MIN_BODY_CONTRAST`.

**Why:** "The enemy's dark grey lower mass merges with the grey rock cluster and reads as an outcrop the hero happens to be standing next to." Measured, the Ashen Wolf sat **0.045** in lightness from the boulder behind it while clearing the grass by a comfortable 0.173 — #38's rule was right and was being applied to one of the two surfaces.

**Charging the hue premium twice is what made this expensive.** With the full `MIN_BODY_CONTRAST + hue` demanded of both surfaces, **19 of 35 species moved** and several bright ones flipped to near-black — a Thornback Lynx at 0.178. The turf fills the frame under the creature, so sharing its hue is fatal there; a rock is a prop it happens to stand beside, and value alone separates it. Flat demand on the rock: **6 of 35 move**, worst gap against either surface **0.169**.

| | before | after | vs turf | vs rock |
|---|---|---|---|---|
| Ashen Wolf | 0.618 | 0.273 | 0.173 | 0.390 |
| Thornback Lynx | 0.712 | 0.833 | 0.388 | 0.171 |
| Iron Kobold | 0.545 | 0.204 | 0.171 | 0.459 |
| Cragfang Bat | 0.651 | 0.833 | 0.459 | 0.171 |

**A pale creature only kept its identity because the reach widened.** At `REACH_PALE` 0.82 the Lynx could not clear the rock on the bright side and the nearest solution was 0.178 — an orange cat rendered near-black. 0.84 puts the bright answer in range, and the rule picks the value closest to the species' own.

**Widening it exposed an older fault.** `bodyLight` and `bodySpec` had a ceiling each, 0.92 and 0.88, and above mid 0.76 they crossed: the facet meant to be catching the light came out **darker** than the band beneath it. `bodySpec` is now built off `bodyLight`, so the ramp is ordered by construction. The Anvil Ogre had been shipping at 0.69 < 0.84 < 0.92 < 0.88 since it was authored.

**Both probes fire.** Dropping the rock from the reference list turns `stands every creature clear of the rock it stands beside` red naming the Ashen Wolf at 0.045; restoring the two independent ceilings turns `ramps every creature's four inks in one direction` red naming the Anvil Ogre.

**Judged at the size it ships at.** Rendered at the phone's own `pixelScale` of 2 — the roster at ~40px beside a rock of the realm's own colour — rather than magnified. Magnification is what hid the lowercase `g` for two rounds.

## 52. Pine crowns and grass tufts carry their texture as runs, not a fresh roll per unit — 2026-08-26

**Decision:** `foliageNotchAt`/`inFoliageLobe` (`palette.ts`) replace the crown's per-row `hash01` silhouette notch and per-row 14% dark-fleck roll with 4 silhouette lobes and 2 shadow lobes per tree — each a `{from, len}` run, same idiom as the bark streaks in #d0a6427. `grassClumpBlades` gives each `tuft` prop 2-3 overlapping blades plus y jitter instead of one stamped sprite on a fixed baseline.

**Why:** Gauntlet round 34 (`.gauntlet/verdict34.md`, img-2, ranked #1/4) named two flaws in the same family already fixed once: "pine canopies have a jagged, notched silhouette edge — reads as dithering noise, not foliage," and "grass tufts look like isolated pasted blades, not a continuous ground texture." Both were an independent random value drawn every row or every instance, with no run connecting neighbours — the exact defect shape #d0a6427 fixed in bark and glow.

**Two canopy defects, not one.** The silhouette notch (`scene.ts`, was `(hash01(i*9.4+k*1.7)-0.5)*7`) could jump the edge up to 7px between adjacent rows. A second, separate per-row roll (`hash01(i*3.7+k*5.3) > 0.86`) painted a dark fleck on ~14% of rows independently — the same disease, one row further down in the same loop. Fixing only the first left `qa:speckle` nearly flat; fixing both moved it.

**Measured with `qa:speckle --right 1456`** on a static `?stage=mid&seed=7` frame, own dev server, `visual/canopy@ca0c337`:

| | lone marks | % of frame | y540-810 band |
|---|---|---|---|
| before | 785 | 1.84% | 480 (4.44%) |
| after silhouette fix only | 779 | 1.82% | 489 (4.53%) |
| after both canopy fixes | 746 | 1.75% | 463 (4.29%) |

⚠️ **Retracted as evidence — this table is inside its own instrument's noise.** Three captures taken back to back on one unchanged commit read **763 / 780 / 773**, and a fourth read 797: a spread of ~34 marks at fixed code. The claimed improvement is 39, and the silhouette-only row's 6 is not distinguishable from nothing. The scene animates, so each capture samples a different frame — the same reason raw pixel diffing was rejected two paragraphs below, applied one paragraph too late.

**What is still evidence for the canopy:** the lobe geometry itself. `foliageNotchAt` is a pure function with tests pinning that adjacent rows cannot jump the way an independent roll did, and reverting it reds them. That the silhouette is smoother is proven; that the frame carries measurably fewer lone marks is not.

**`qa:speckle` is the wrong instrument for the grass claim, and says so itself** — its help text disclaims discrete sprite instances as expected-lone. Confirmed: after the clump fix the count rose to 781 (1.83%), because each added blade is another sprite edge with no same-colour neighbour under the tool's own per-pixel metric. That is the tool's documented limitation, not a regression.

**Grass measured geometrically instead**, replaying the exact deterministic prop math (`hash01`, `PROP_SPAN`, `grassClumpBlades`) the renderer uses, over one full 1400-unit prop cycle, 100 tuft instances:

| | coverage | isolated islands | max gap |
|---|---|---|---|
| before (1 stamp/instance) | 35.2% | 68 | 44 |
| after (clumped) | **46.5%** | **56** | 42 |

Fewer, larger islands at higher coverage is the "isolated blades → continuous patch" claim, made without depending on animation-phase-sensitive screenshot diffing (two same-code captures of the live dev server differ by ~488k of 1.57M pixels from animation/scroll state alone — raw pixel diffing between captures is not a valid before/after instrument here).

**Both probes fire.** Reverting `foliageNotchAt` to the old per-row roll fails `never jumps between adjacent rows the way an independent roll did` (max delta ≥3.5 vs the lobe version's bound). Reverting `grassClumpBlades` to a single stamp drops the coverage/island computation back to the "before" row above.

## 53. Sun halo is stacked solid discs, hill bands carry a base shadow and lit cap, and the far horizon shares the hills' hue — 2026-08-26

**Decision:** `sunHaloBands` (`palette.ts`) replaces `glowRingRadii`/`glowDisc` for the sun only — each band is a full filled disc (`fillDisc`, `scene.ts`) painted largest-and-dimmest first, so the glow is carried by filled area and a colour step, never by a ring of unpainted pixels. `drawHills` gains a dark base band and a lit cap on every layer, the same two-band trick `drawRange` already used. `coherentRange` derives each realm's `range` from its own `hillFar` instead of an independently authored ink.

**Why:** Gauntlet round 35 (`verdict35.md`, img-1, ranked #4/4) named the sun "a dashed/dithered ring... the single worst flaw across all four images" and the hills "flat stepped color bands (teal-green, then grey-blue, then olive) with no gradient — reads as arbitrary layering." The sun had already failed once as a dither and once as concentric ring *outlines* (`glowDisc`, round 34) — two attempts at "which pixels to leave out." `glowDisc` only ever plotted the two edge pixels of each ring per scanline, never filled between them, which is the dashed artifact by construction.

**The range mismatch was mechanical, not just a taste call.** Three of seven realms hardcoded `range: INK.grey` regardless of `hillFar` — Greenwood's teal hillFar sat behind a neutral cool grey with no shared hue at all, which computes out to `#37684e` (hillFar, post-recede) next to `#6d6c6f` (old range, post-recede): different hue families, not one more step of atmospheric perspective. `coherentRange` mixes 65% hillFar into the authored range before recession runs, so the horizon and the hills it's behind stay one family.

**Still no gradients** — DECISIONS.md #13 stands. Every new band is a hard flat fill; `sunHaloBands` and the hill cap/base are discrete value steps, the same idiom as `drawRange`'s existing "two value bands and a lit cap," never a radial or linear blend.

**`glowDisc`/`glowRingRadii` are untouched** — loot-pickup glow (`scene.ts:1795`) still uses them and was out of scope for this round.

**Evidence:**
- Deterministic: `coherentRange` and `sunHaloBands` are pure functions with unit tests in `palette.test.ts` (mix math, monotonic band ordering, empty-input edges); reverting either reds its own tests.
- Qualitative only (not measured): `.gauntlet/ours/sky-after.png` at `visual/sky@9167623` (dirty) shows the sun as one glowing disc with three visible value steps and no gap between them, and both hill layers showing a shadowed base and a lit ridge instead of a flat card.
- Gate: `npm run verify` — lint clean, typecheck clean, **Test Files 36 passed (36)**, **Tests 688 passed (688)**.

**The loot-pickup glow keeps the ring, deliberately.** `glowDisc` and `glowRingRadii` still back `scene.ts:1815`, so the dashed look survives on coins in flight. It was not changed because the two cases have opposite constraints: the sun is one large shape alone in open sky, where an outline reads as a glitch, while a dozen loot halos overlap at once and filling them turned a kill into "a 180px wall of yellow with the creature somewhere inside it". No judge has named the loot glow — the complaint was specific to open sky. Changing it now would be a speculative art change of exactly the kind that lost round 35, so it waits for a judge to name it.

## 54. Tree trunks carry a lit edge and a shadow edge, and foliage overlaps the trunk top — 2026-08-26

**Decision:** `TREE`, `TREE_TALL`, `TREE_WIDE` (`pixels.ts`) redraw the trunk with three inks instead of two — `barkDark` on the shadow side, `bark` mid-tone, and a new `barkLit` (`sceneryInk`/`foregroundInk`, `palette.ts`) on the sun-facing side — and the canopy-to-trunk transition row now interleaves a foliage glyph over the trunk's near column instead of handing off in one clean row.

**Why:** Gauntlet round 36 (`.gauntlet/verdict36.md`, img-4) named "every tree is a smooth round canopy sitting on a thin straight brown trunk line with an abrupt seam where the stick meets the blob — a 'lollipop tree,' most visible on the tall tree left-of-center." `drawGrove`'s procedural background trees (`scene.ts:1265`) already carry this exact lit-edge/shadow-edge split; the static foreground sprites in `pixels.ts` never got it.

**Same light direction as everywhere else in the scene.** The sun sits upper right; `drawGrove`'s comment at `scene.ts:1309` states the convention directly — "the lit face is the far side of the upper mass." `barkLit` is placed at the trunk's rightmost column, `barkDark` at its left, in every trunk and root-flare row of all three sprites.

**Evidence:**
- Deterministic: `spriteMapFaults` (existing sweep, `pixels.test.ts`) still passes on all three edited grids — rectangular, fully legended.
- Deterministic, draw-level: two new tests in `pixels.test.ts` read the actual `SpriteMap.rows` strings `bakeSprite` draws from (one fillRect per glyph, no branching in between) rather than a separate geometry function — `barkLit` sits strictly right of `barkDark` on every trunk row across all three sprites, and each sprite has at least one row mixing a foliage glyph with a trunk glyph, confirming the overlap actually ships rather than existing only as intent.
- Gate: `npm run verify` — lint clean, typecheck clean, **Test Files 36 passed (36)**, **Tests 690 passed (690)**.

**Not touched:** the hero sprite (owned by a different agent this round), `drawGrove`'s procedural background trees (already correct), and the background hill, ground turf, and sun halo — the other three surfaces named in the same verdict, addressed in following commits.

## 55. Background hills stop staircasing and their shadow band clears the haze behind it — 2026-08-26

**Decision:** `drawHills` moves out of the `createScene()` closure into a standalone exported function taking a narrow `FillCtx` (`fillStyle`/`fillRect` only). Two pure helpers in `palette.ts` back it: `clampHillStep` caps how far one column's height can jump from its neighbour, and `hillBaseInk` backs off its shadow-mix percentage until the base band clears `depthHaze` by `MIN_HILL_SHADOW_GAP` (0.1 lightness) instead of using a fixed 18% mix regardless of realm.

**Why:** Gauntlet round 36 (`.gauntlet/verdict36.md`, img-4) named the background hill's edge as "stepped/staircased, like a jagged EKG line" and its base shadow as "nearly merging with the shadow under the trees in front of it — you can't tell where one ends and the other begins." Both were mechanical: the raw sine profile could jump 14px between 3-4px-wide columns (steeper than the column is wide, which draws as right angles), and a fixed 18% black mix landed only 0.084 lightness above Greenwood's haze — visually indistinguishable from it.

**Same light direction as everywhere else.** The lit cap and dark base are the same two-band trick `drawRange` and the near hills already used (ADR #53); this round extends it to the far hill layer and fixes the two defects specific to it.

**Evidence:**
- Deterministic: `clampHillStep` and `hillBaseInk` are pure functions with unit tests in `palette.test.ts` — bounds in both directions, the null-prior first-column case, and a sweep over every realm's `hillFar` confirming the shadow gap holds everywhere, not just the one realm that failed at 18%.
- Deterministic, draw-level: `app/test/scene.test.ts` calls the real, now-exported `drawHills` against a fake `FillCtx` that records every `fillRect` call — confirming the shipped draw loop, not just the geometry functions it calls, fills every column, keeps the base band above the haze floor, and never lets adjacent columns jump past the clamp. This is the fake-context pattern the tree fix (ADR #54) didn't need but this surface does, since the defect lived in the loop's column-to-column stepping, not in a static sprite grid.
- Gate: `npm run verify` — lint clean, typecheck clean, **Test Files 37 passed (37)**, **Tests 699 passed (699)**.

**Not touched:** the near hill layer's cap/base logic (already correct per ADR #53, only re-used here), and the ground turf and sun halo — the remaining two surfaces from the same verdict, addressed in following commits.

## 56. Turf is stacked value bands instead of one flat fill — 2026-08-26

**Decision:** `drawGround`'s single `fillRect` for the whole turf band is replaced by `drawGroundBands` (`scene.ts`), which paints one flat tone per horizontal strip. Tones come from `depthBandTones` (`palette.ts`), a pure function that darkens toward the horizon edge and holds the true turf tone at the camera edge — `GROUND_BANDS` (4) strips per frame.

**Why:** Gauntlet round 36 (`.gauntlet/verdict36.md`, img-4) named the grass as "flat green with tufts pasted over bare gaps — no sense that the ground recedes into the distance." The blade/tuft texture already varies point-to-point, but the surface under it was one solid colour top to bottom, so nothing signalled distance across the band itself.

**Same idiom as the hills, one surface over.** `drawGroundBands` is the fixed-band loop `drawHills` already established (ADR #55) — stacked flat rects, no gradient (DECISIONS.md #13 stands) — applied to a horizontal strip instead of a silhouette.

**Evidence:**
- Deterministic: `depthBandTones` is a pure function with unit tests in `palette.test.ts` — the near band always equals the true base tone at any band count, lightness increases strictly moving from the far band to the near band, and the ordering holds across every realm's turf colour.
- Deterministic, draw-level: `app/test/scene.test.ts` calls the real, exported `drawGroundBands` against a fake `FillCtx` and asserts the emitted rects stack with no gap or overlap, in tone order, and each spans the full width — confirming the shipped loop, not just the tone function behind it.
- Gate: `npm run verify` — lint clean, typecheck clean, **Test Files 37 passed (37)**, **Tests 704 passed (704)**.

**Not touched:** the blade/tuft/strata texture loops (already varied, out of scope this round) and the sun halo — the last surface from the same verdict, addressed in the following commit.

## 57. Sun halo gets two more steps and fades toward sky colour at its edge — 2026-08-26

**Decision:** `sunHaloBands` (`palette.ts`) grows from 3 stacked discs to 5, and the outermost band's `skyMix` rises from 0.72 to 0.82 — closer to pure sky colour, so the last visible step is subtler instead of stopping on one hard-edged ring. `drawSun`/`fillDisc` (`scene.ts`) are unchanged; the loop already iterated over whatever `sunHaloBands` returned. The `sunY` clearance margin moves from `sunR * 2.15` to `sunR * 2.45` to match the new widest band (`2.3x` core radius, was `2x`).

**Why:** Gauntlet round 36 (`.gauntlet/verdict36.md`, img-4) named the sun as "3 flat value steps with a hard outer edge — a ring sticker pasted on the sky, not light falling off into the sky around it."

**Still no gradients** (DECISIONS.md #13) — five hard flat discs, same idiom as three, one step closer to sky colour at the edge instead of a blend.

**Evidence:**
- Deterministic: `sunHaloBands`'s existing pure-function tests in `palette.test.ts` are widened to loop over all 5 bands (radius and `skyMix` both strictly decreasing outward-to-inward) instead of the 3 hardcoded pairs, plus a new assertion that the outermost `skyMix` is at least 0.8.
- Draw-loop coverage carries over from ADR #53 without a new fake-context test: `drawSun`'s loop (`for (const band of sunHaloBands(sunR))`) makes no assumption about band count, so it was already proven correct for any array length the pure function returns.
- Gate: `npm run verify` — lint clean, typecheck clean, **Test Files 37 passed (37)**, **Tests 704 passed (704)**.

**Not touched:** `glowDisc`/`glowRingRadii` (loot-pickup glow, deliberately left alone per ADR #53). All four surfaces named in round 36's verdict — trees (#54), background hill (#55), turf (#56), sun (#57) — are now addressed.

## 58. The portal boss is a dungeon, not a road with a big monster on it — 2026-08-26

**Decision (Kyle, directly):** the portal boss becomes **an active gameplay trigger with its own view** — *"adventurer locked in a dungeon with a single monster."* The road diorama is not reused with a guardian standing in it.

**What is there today.** `scene.ts:1015` swaps the encounter queue for one large sprite at the road's right edge and `view.ts:271` overlays an HP bar. Its own comment concedes the gap: the guardian is *"standing in a drawn portal rather than dressing the boss as an encounter."* `DESIGN.md` §Presentation has promised *"a distinct locked-combat presentation"* since M1R.1; it was never built.

**The feel, as given.** Enclosed and claustrophobic. Stone, not sky — no horizon, no parallax, no scrolling road. One monster, large enough to dominate the space, and the hero confronting it alone. The road's whole visual argument is *travel*; this one's is *nowhere left to go*.

**Why this is not only presentation.** `witnessedBeats` (#48's sibling probe) measured the guardian felled **in the player's presence in 3 of 99 realms** — against 2.8% by chance. The fight the entire realm build exists for currently resolves while the app is closed. A dungeon view nobody is present for is set dressing for an empty room.

So "active gameplay trigger" carries a consequence this ADR names rather than buries: **the kill has to be reachable inside a session.** Guardrail 4 keeps idle-only play productive and guardrail 6 keeps offline boss progress, so the lever is not removing offline damage — it is that active fighting must close a fight a sitting can contain. The pacing bands for that are M1R.2 work and are not settled here.

**What does not change.** Manual entry, no enrage timer, no death, no retry cooldown, no income during the fight, build locked at entry, abandonment resetting only that attempt's HP (#14-#18, guardrail 6). One input, one momentum curve, hold-to-autostrike (#19).

**Supersedes** `DESIGN.md` §Presentation's one-line description of the Portal Boss screen, which is replaced by the section this ADR adds.

## 59. The dungeon room is built — walls, ceiling, torches, guardian at scale — 2026-08-26

**Decision:** `scene.ts:1778`'s `drawDungeonBackdrop`/`drawDungeonFloor` replace `drawPortal`'s rift-in-the-road with an enclosed stone room per #58's spec: a banded ceiling and coursed brick walls (`drawStoneWall`, new pure geometry `brickJointXs`/`vignetteInsets` in `palette.ts`), two torches as the only light source, a 4-band edge vignette (`drawVignette`) standing in for a gradient (#13), and a stone-toned floor. The guardian sprite scales 2x from its feet anchor (`drawSprite`'s new `scale` param) to fill the room; shadow, ground-lit pool, and boot-dust particles switch from `skin.turf` to `skin.rock` while `model.boss` is set, so nothing on the ground still reads as grass.

**Why the guardian, and only the guardian, scales:** the hero's own animation, hitbox, and combat feel are untouched — DECISIONS.md #58 asked for scale contrast, not a hero redesign, and the brief's scope explicitly excluded touching the hero sprite.

**Evidence:**
- Deterministic: `palette.test.ts` covers `vignetteInsets`, `brickJointXs`, `torchFlicker` (48 tests total, was 41). `scene.test.ts` adds `drawStoneWall`/`drawVignette` fake-`FillCtx` tests asserting actual `fillRect` calls — full-width courses stacking with no gap, staggered mortar joints, four non-overlapping rings per vignette band — not just the geometry underneath, per ADR #57's sun-halo lesson (10 tests total, was 5).
- Qualitative: `.gauntlet/ours/boss-fixed.png` (staged `?stage=late&seed=7`, boss entered via a one-off Playwright driver, `.gauntlet/boss-capture.mjs`) shows the enclosed room — stone walls and ceiling, no sky, guardian filling the frame, hero alone beneath it — against `.gauntlet/ours/road-before.png`'s open sky/hills/sun for the same run.
- Measured, with a 3-capture spread first: three repeat captures of the same commit (`boss1`/`boss2`/`boss3.png`) gave byte-identical pixel readings in a static wall/vignette corner (`mean saturation 0.324, mean brightness 0.365`, top colour `rgb(26,28,44)` at 35.8%, all three runs) — the corner is stable evidence; the combat area isn't (three different SHA-256s overall, expected from live swing/particle animation).
- Bug found by that same measurement, not by eye: the right torch (`0.84 * vw`) painted zero warm pixels across all three captures — `styles.css`'s `--dock-w` (`min(480px, 34vw)`) covers up to 34% of the canvas on desktop, and `drawSun` already keeps its own light source under `0.6 * vw` for exactly this reason. Moved both torches inside that boundary (`0.14`/`0.58`); re-measured warm-pixel clusters on both sides after the fix.
- Gate: `npm run verify` — lint clean, typecheck clean, **Test Files 37 passed (37)**, **Tests 716 passed (716)**.

**Not touched:** road scene, hero sprite/animation, economy constants, core rules. `bossSlot`/queue mechanics unchanged — the guardian is still the sole queue entry `model.boss` gates on.

## 60. Distance recedes toward the sky, never toward the layer in front of it — 2026-08-26

**Decision:** `coherentRange` mixes the authored far-range colour **30% toward `skyTop`**, not 65% toward `hillFar`. Supersedes that half of #53.

**Why, found by comparing a frame that won against a frame that lost.** Round 34 placed **#1 of 4** blind; rounds 35–37 did not. Same realm, same seed, same moment, so the frames are directly comparable. Greenwood's mountains are **grey-blue with snow** in the winning frame and **green** in the losing ones — `INK.grey` authored, then dragged 65% toward `INK.teal` by #53's version of this function.

Judges named the result twice without naming the cause: *"flat stepped colour cards stacked arbitrarily"* and *"the background hill is a single flat silhouette with no depth."* A far band mixed toward the hill in front of it stops being far.

**#53's problem was real; its direction was backwards.** Three realms did share the same neutral grey `range` regardless of their hill colour, and that seam was worth closing. Mixing toward `skyTop` closes it — every realm has its own sky — while keeping the separation that reads as distance. Aerial perspective is air between you and the rock; the rock does not take on the colour of the hill in front of it.

**The wider lesson, recorded because it cost three rounds.** Each blind verdict was treated as a bug list and patched item by item. Two of those patches *caused* the next round's complaints — a ring sun called a glitch, and this. The frame that won was already good, and the comparison that found this was *"what did the winning frame have that this one does not"*, which is a different question from *"what is wrong now"*.
## 61. Dungeon room is tighter, torches actually light stone, one HP bar, realm-tinted — 2026-08-26

**Decision:** Four fixes to `drawDungeonBackdrop`/`drawDungeonFloor` (`scene.ts`) against #59's shipped room, all through new pure geometry in `palette.ts`:

- **Room crowds the fight.** `pillarSpans` (`palette.ts`) places two coursed stone piers flanking the room; `drawPillars` (`scene.ts`) draws each with a lit inner edge facing the fight, reusing `drawStoneWall` (now parameterized on `x`/`w` instead of hardcoded to the full frame).
- **Torches light the stone.** `torchGlowBands` returns four bands stepping inward from a wide, barely-tinted ring to a small band mixed hard toward flame colour; `drawTorchGlow` paints them as filled discs under the wall and floor, and `drawTorchFlame` replaces the old `glowDisc` calls with a filled core instead of the hollow-ring shape ADR #53 already caught once on the sun.
- **One HP bar.** `drawMonsters`' floating bar is skipped entirely when `model.boss` is set (`scene.ts`); the side panel (`view.ts`, unchanged) already carries name, HP, pace, and remaining.
- **Realm-tinted stone (bonus, #5 in the brief).** Piers key off `skin.rockLight`, glow mixes off `skin.accent` — Greenwood and realm 40 no longer render the same grey room; this fell out of following #59's existing `skin.rock`-keyed pattern, not new plumbing.

**Two bugs the first pass shipped and a screenshot caught, not the tests:**
- Initial torch reach and vignette step were sized off wall/floor height (`(groundY-ceilingH)*0.62`, `VIGNETTE_STEP_FRAC=0.045`) rather than room width — torches rendered as giant overlapping spotlight circles dominating the frame, and the vignette blacked out the outer ~20% of each edge, swallowing the piers meant to be visible there. Both pure-function and draw-loop tests passed throughout; only viewing the actual capture caught it. Re-tuned both to a fraction of `vw` (`WALL_TORCH_REACH_FRAC=0.075`, `FLOOR_TORCH_REACH_FRAC=0.055`, `VIGNETTE_STEP_FRAC=0.012`, `VIGNETTE_BANDS` 6→5).
- `pillarSpans` was called with `vw` (the full canvas width `scene.ts` draws into) instead of `worldRightX` (the last column not covered by the docked side panel, `scene.ts:704`). The right pier landed entirely under the dock — present in the draw calls, invisible on screen. `drawSun` and the #59 torch positions already respect this boundary; the new pier code initially didn't.

**Evidence:**
- Deterministic: `palette.test.ts` adds `pillarSpans` (mirrored placement, no overlap on a narrow viewport) and `torchGlowBands` (radius strictly decreasing / mix strictly increasing inward, scales with reach, empty at zero reach) — 53 tests, was 48.
- Deterministic, draw-level: `scene.test.ts` adds fake-`FillCtx` tests for `drawPillars` (each course confined to its own span, lit edge on the side facing the fight), `drawTorchGlow` (recorded `fillRect` calls show stone directly under a torch measurably lighter than stone at the edge of its reach — the specific claim a lighting task has to prove from painted rects, not geometry alone), and `drawTorchFlame` (filled core across every row of both discs, not the hollow ring ADR #53 named) — 16 tests, was 10.
- Qualitative: `.gauntlet/ours/before-boss.png` (unfixed) vs `.gauntlet/ours/after-boss3.png` (final) — same `?stage=late&seed=7` capture. The room reads as narrower (lit pier edges flank the guardian instead of flat wall to both frame edges), warm light pools sit under both torches on wall and floor instead of small unlit marks, only one HP bar remains, and the stone carries a faint warm cast instead of pure grey.
- Structural pixel check (not a motion-sensitive count — walls and piers don't animate, only torch flicker does): `npm run qa:pixels` on the corrected capture shows the left pier's stone (`rgb(93,103,112)`) measurably darker than the adjacent open wall (`rgb(140,156,166)`) at the same height, confirming the pier renders distinctly rather than blending into the wall it was meant to separate from.
- Gate: `npm run verify` — lint clean, typecheck clean, **Test Files 37 passed (37)**, **Tests 727 passed (727)**.

**Not touched:** road scene, hero sprite/animation, economy constants, core rules, and `glowDisc`/`glowRingRadii` (loot-pickup glow, still deliberately left alone per ADR #53).

## 62. The engine clock lives on an integer-millisecond grid — 2026-09-27

**Decision:** `advance` snaps its `seconds` argument and every strike instant to whole milliseconds (`packages/core/src/clock.ts`: `clockMs`, `clockAfter`) and adds in integers. `timeSec` stays on that grid. `nextActionAtSec` stays absolute (#6). The client floors tick deltas and strike stamps the same way (`app/src/game.ts`).

**Why:** float seconds add non-associatively. `(t + a) + b !== t + (a + b)` for 5,206 of 20,000 random triples, so the split-invariance contract in #6 only held for exactly-representable inputs. Live ticks feed raw wall-clock fractions; an offline replay of the same span could land one ulp off and flip a boundary kill. Integers add exactly.

**Consequences:**
- Strikes had to snap too, not just the target: the sim advances exactly to an off-grid strike instant, and snapping only the target dropped half its strikes (P1 fell to 1.44×).
- Sim verdicts are unchanged (ALL PASS, 20 × 3 seeds) but 14-day trajectories moved: victories per seed 33/31/35 → 35/32/34, because strike instants now sit on the grid.
- Two thumb tests were re-fixtured, not weakened: `catchRate` samples 4000 taps (400 saw only 26 coins), and `sim/src/thumb.ts` compares frame stamps in clock ms.

**Evidence:** `packages/core/test/determinism.test.ts` adds 0.1+0.2+0.3 bracketing, a sub-ms no-op, 20 seeded random-split trials from a fractional start with strikes, and a boundary strike via `clockAfter`. Gate at merge: 44 files / 826 tests, exit 0.

**Amends #6:** the clock is still event-stepped against an absolute `nextActionAtSec`; it is now also quantized.

## 63. Feel before content: realm 0 ends inside the first session, and the screen must show progress — 2026-09-27

**Decision:** M3F, a feel milestone, precedes the rest of M3 and all of M4. It has two halves and both are binding.

*Pacing.* Realm 0 (Greenwood) is a tutorial-length realm: portal ready in **12–20 min active, 40–80 min idle**, and its guardian falls in **3–6 min active**, so a new player ascends inside one 20–30-minute session. Realm length grows with realm index and reaches the old 2–4 h active band by realm 5; the guardian band grows the same way to the old 15–90 min. Upgrade prices grow fast enough that at most two rows are affordable most of the time; a starved panel is still forbidden.

*Presentation.* The scene receives the zone index and shows every zone advance. A monster dies on screen instead of being swapped out. Coins launch from the kill, fly above the monster, and land on the road ahead where the hero collects them. A strike that misses is still seen and heard. Pending Ascendancy is visible on the Road HUD, not only inside the overlay.

**Why:** A playthrough on 2026-09-27 found zone 1 and zone 49 of Greenwood draw the same frame, tapping at 3/s was not perceptible (×1.39 label, gold/s 2.5 → 4.0), every upgrade row was affordable after 90 s, and the first permanent reward was 2–4 hours away. The simulator proved the active-vs-idle ratios in `docs/ACTIVE-PLAY.md`; nobody had played the result, and `docs/ROADMAP.md` records no playtest. A ratio band measures fairness, not fun. Zone 1 and zone 49 looked the same because nothing in `app/src/scene/` reads the zone (`SceneModel` has `region` only), monsters are `queue.shift()`ed on death, and the arc origin is the hero's feet with the landing 15–46 px right of him, which is exactly where the monster stands.

**Consequences:**
- P5, P6 and P8 in `sim/src/validators.ts` are re-banded per realm, not deleted. The old bands survive as the realm ≥ 5 clause. P10's 14-day checkpoint keeps its 1.4–2.3× band and is re-measured.
- Content end (#48) moves earlier because early realms are shorter; the new day is recorded when measured.
- `killsPerZone` and `zonesPerRealm` stop being single constants and become functions of realm index.
- Every constant change still lands with a full `npm run sim` quoted (seeds and PASS/FAIL).
- Real-phone playtest notes become a required exit artifact for M3F, recorded in `docs/PLAYTESTS.md`.

**Supersedes:** the realm-0 reading of the P5 band in #31/#39 and the fixed 50-zone realm in `constants.ts`. #34's realm-300 ceiling stands.

## 64. Realm length, guardian size and pacing bands are functions of the realm; income answers purchases — 2026-09-27

**Decision:** The single constants `killsPerZone`, `zonesPerRealm`, `bossHpMult`, `dropChance` and `leaguePerKill` are gone. `packages/core/src/pacing.ts` owns `zonesForRealm`, `killsPerZoneFor`, `dropChanceFor`, `bossHpMultFor`, `portalBand` and `bossBand`: realm 0 is 10 zones of 250 kills, realm 5 and beyond are the old 50 zones of 500, and realms 1–4 interpolate linearly. The engine, the client's zone sweep and every simulator validator read the same functions. A save whose `zone` no longer exists in its realm loads clamped onto the last zone with the portal open; a guardian mid-fight in such a save is resized to today's `bossHp(realm)`, keeping its fraction of HP, so the fight ends on today's band rather than the old road's.

The economy moved from floor-bound to DPS-bound so that the panel can be scarce at all. Before, DPS passed the idle kill floor at hero level 2 and income was a function of the zone index alone, so every row went green after 90 s whatever the prices did (#63). Now gear tracks enemy HP at 1.2 of its base instead of 2, so gear alone never reaches the floor, the kill floor is 0.7 s, and gold per zone grows at exactly the rate the zone's levels cost — `rG = rH^(ln rC / ln rD)` = 1.75 — so a reinvesting hero keeps one kill time across a realm and income responds to what was bought.

| Constant | Before | After |
|---|---|---|
| realm length | 50 zones × 1200 kills, every realm | 10 × 250 at realm 0 → 50 × 500 at realm 5 |
| `d0`, `rD` | 25, 1.12 | 10, **1.25** — two levels per zone, not four |
| `levelCostBase`, `rC` | 10, 1.15 | 100, **1.33** |
| `rG` | 1.48 | 1.75 (zero drift) |
| `gearPowerBase` | 2 | 1.2 — gear alone no longer clears the kill floor |
| `minKillTimeSec` | 0.35 | 0.7 |
| `dropChance` | 0.008 | `DROPS_PER_ZONE` 10 / kills per zone |
| skills cost / step | 35/1.12, 60/1.19, 110/1.15, 190/1.13, 300/1.21 | 60/×4, 120/×12, 250/×36, 500/×108, 1000/×324; unlock 0/0/2/6/12 |
| guardian multiple | 5600 | 1300 at realm 0 → 16000 at realm 5 |
| `ARC_CATCH_MULT` | 1.6 | 1.25 |
| catch Ascendancy | `ASC_CATCHES_PER_ZONE` 125 | `ASC_CATCH_ZONE_BONUS` 16 over `coinsPerZone(realm)` |

**Why the hero level got bigger and rarer.** The greedy bot drains the wallet at every 30 s glance, so whatever row it favours settles at a price of about one glance's income and is green at the next glance. At 1.12 damage per level the hero row was affordable at ~80% of looks and two cheap skill rows lingered beside it (their value per gold never beat the hero's, so they sat green unbought): ≤2 affordable held at 53–56% of looks. Steeper skill steps alone (two attempts, ×4–×324) moved it to 54%. Making a level worth 1.25× at 1.33× the price — with `rG` re-derived for zero drift — leaves the hero row unaffordable at most glances, and on those the bot spends the residual on the lingering skills, which then leave for a while. Lean went to 84–86% in one step.

**Why the kill floor doubled.** Momentum divides through the floor, so active play is untouched; the floor is the ceiling on how fast a bonus-laden deep realm can run. At 0.35 s the earnings bonus compounded into 123 realms in 14 days and P10 read 1.06×. Restoring 0.35 s with everything else final fails P1, P5 and P8 at 0/3 seeds. The 0.7 s floor also halves the coins in the air on a floor-speed road, which is why `thumb.test.ts` now pins catch rate at 350–450 ms latency at 0.78 rather than the 1.00 a denser road handed out through neighbour catches.

**What P8 measures now.** Only looks inside an active session, 60 s after a realm starts: ≤2 affordable at ≥80%; a row affordable or ≤60 s of income away at ≥95%; ≥5 priced always; no drought past 5 min. The old 95%-≥4-affordable clause was measured mostly on idle slices (17k of them), where the wallet grows while nobody buys, so its 99.9% said nothing about a session.

**Measured, `npm run sim -- --seeds 3`, 14 days, ALL PASS — 20 validators × 3 seeds:**

- P5: realm 0 portal-ready 17.1–17.3 min active, 41–47 min idle; realm 5 2.22 h / 11.0–11.5 h; realms 1–5 inside their ramped bands; realms past 5 run 2.9–10.0 h on the mixed schedule.
- P6: 56–57/57 realms in band per seed; realm 0 guardian 3.7–4.5 min, realm 5 26–30 min, 16–23 min by realm 50.
- P8: 6 priced at the leanest look; ≤2 affordable at 85.7–86.2% of 872–981 looks; reach 100%; longest drought 0 s.
- P10: 1.79–1.99× Ascendancy at 14 d; first ascension 22.2–23.6 min active vs 51.5–55.8 min idle (2.25–2.37× sooner).
- P1 1.83–1.90×; P2, P3, P4, P7, P9 PASS; all ten correctness validators PASS.

**Content end (#48) moves to day 51.2–51.7** on the 90-day run at 3 seeds (51.15, 51.62, 51.65; was 74.8–78.9), which also runs ALL PASS with 301/301 guardians in band: shorter early realms and a faster ladder. #34's realm-300 ceiling stands — `bossHp(300)` keeps ×1.36 headroom under `Number.MAX_VALUE` at the 16000 multiple, and `magnitude.test.ts` pins the frontier at 301 with the hero ladder at 1022/315 for realms 199/296 and every skill track priced at twice the ranks a realm's whole gold could buy.

**Consequences:**
- `docs/ECONOMY.md` and `docs/ACTIVE-PLAY.md` carry the per-realm bands and the new constants; `sim/src/shop-run.ts` (`npm run shop`) prints the look-by-look panel that found the lingering rows.
- Dev staging: `?stage=mid` is 25 min into realm 0 (zone 8 of 10, short of the portal); `?stage=late` takes each portal as it opens and ends on a Road several realms deep. `tools/qa/loop.mjs` takes `--band-min/--band-max` (minutes) and defaults to realm 0's 3–6.
- Slice A's death phase was sized to fit inside a 0.35 s kill; the floor is now 0.7 s, so it has twice the room.
- Skill values are still the asymptotic bonuses of #26; a cheap late rank of a near-capped skill is worth little and is what lingers. Making skill value commensurate with its price is the next lever if scarcity has to tighten further.

**Supersedes:** the constants table of #5 as restated in #26/#27/#32; the P8 clause of #26; the content-end day of #48. #62's integer-millisecond clock and #6's split-invariance are unchanged and covered at the new lengths across zone and realm boundaries in `determinism.test.ts`.
