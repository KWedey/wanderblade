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
