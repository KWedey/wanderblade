# Wanderblade — Roadmap

**Current milestone: M3 phone playtests, then M4 collections and content.** The Road → Portal Boss → Ascension loop is built end to end in core, sim, and client (ADRs #14–#61). What remains before M4 is evidence from real phones and the save-migration chain.

Box legend: `[x]` done, `[~]` partly done with the gap named, `[ ]` not started.

## Completed foundation

### M0 — Vision + economy simulator *(complete for the legacy gate design)*

- [x] Original Wanderblade concept and source-of-truth docs
- [x] Pure deterministic TypeScript rules in `packages/core`
- [x] Fast-forward simulation harness sharing the core rules
- [x] Legacy 10-day gate-economy targets passing across three seeds

The M0 evidence remains valuable for determinism and simulator architecture. Its pacing results are historical and must not be used to validate the redesigned economy.

### M1a — Grey-box loop *(complete; implementation now partially superseded)*

- [x] Auto-combat, gold, loot, levels, gear, skills, save/load, and offline recap
- [x] Minimal Road UI and deterministic live/offline advancement
- [x] Legacy readiness gate, challenge, cooldown, and auto-challenge behavior

### M1b — Living Road HUD *(Phases 0–2 complete)*

- [x] Frame-rate-independent render driver and a single RAF path
- [x] Living gold counter, gold/sec, purchase feedback, and goal strip
- [x] Vibrant 16-bit Pixel & Parchment reskin

The former Phase 3–5 sequence is superseded. The scene renderer remains useful, but the old Rally/Glints/Discoveries bundle is no longer the assumed active layer.

## M1R — Active-Forward Realm Rebaseline *(design mostly landed; M1R.2 session arc still open)*

### M1R.1 — Product and documentation contract

- [x] Approve 15–30-minute active sessions once or twice daily with slower, meaningful idle progress
- [x] Approve mutually exclusive Road and persistent Portal Boss phases
- [x] Approve boss-victory ascension, reset/persistence rules, and pending/banked Ascendancy
- [x] Approve SRD 5.2.1 monster inspiration under CC-BY-4.0
- [x] Rewrite VISION, DESIGN, ECONOMY, ROADMAP, binding guardrails, and append superseding ADRs
- [x] Produce an [implementation plan](superpowers/plans/2026-08-11-active-forward-realm-ascension.md) with explicit design/simulation gates and verification criteria

**Exit:** the repository describes one coherent current game and clearly labels the old economy as historical.

### M1R.2 — Active-play design and pacing bands *(one item open)*

- [ ] Design the 15–30-minute Road session arc and compare 2–3 mechanic sets
- [ ] Design portal-boss tapping, cap/decay, feedback, and an accessibility-equivalent input
- [ ] Select numeric Road-active, Road-idle, Boss-active, and Boss-idle pacing bands
- [ ] Define realm length, portal-availability conditions, boss-duration bands, and abandonment UX
- [ ] Define Ascendancy accrual, boss payout, tree shape, and realm-completion earnings bonus

**Exit:** active play is approved as a complete interaction and economy specification; no mechanics are invented during implementation.

**Status — awaiting approval, not awaiting design.** The specification landed as `docs/ACTIVE-PLAY.md` plus ADRs #19–#48 rather than as one document, so the boxes above understate what exists. Every box stays open because each is phrased *design and approve*, and approval is the owner's word. What is left to decide, rather than to sign off:

| Item | State | Where it lives |
|---|---|---|
| Road session arc + mechanic sets | **Mechanic set decided** — Momentum + Loot Arcs, one input. Alternatives are on record as supersession (Rally/Glints/Discoveries), not a side-by-side. **The session arc itself was never designed.** | `docs/ACTIVE-PLAY.md`; ADRs #19, #25, #30, #35, #44, #46, #47. Prior sets: #10 (Glints + Discoveries, Perfect Parry rejected), superseded by the #14 pivot |
| Boss tapping, cap/decay, feedback, accessibility | **Input, cap, decay and accessibility decided** — same Strike, same momentum curve, hold-to-autostrike. **Feedback was never designed** and is client work. | `docs/ACTIVE-PLAY.md`; P2 passing |
| Road/Boss × active/idle pacing bands | **Complete.** Ten validators, passing across seeds. Headline band is Ascendancy, not gold (#31), at a fixed 14-day checkpoint (#39). | `sim/src/validators.ts`; ADRs #31, #39, #48 |
| Realm length, portal availability, boss duration, abandonment UX | **Bands complete** — P5 2–4 h active / 8–16 h idle, P6 15–90 min, P9 ≤3 days per realm. **Abandonment rules decided; its UX is undesigned** and is client work. | `sim/src/validators.ts`; `docs/DESIGN.md` §Abandonment |
| Ascendancy accrual, boss payout, tree shape, earnings bonus | **Complete.** Three uncapped nodes on a linear price curve; P7 proves prompt ascension beats overfarming. | `packages/core/src/constants.ts`; ADRs #27, #28 |

**Genuinely still open:** the **session arc** — what opens a 15–30-minute sitting, what marks its middle, what makes it a good place to stop. `P1` measures a flat 20-minute window, which is a rate, not an arc.

**Miscategorised here:** boss-fight feedback and the protected abandonment flow are M3 client work, not M1R.2 design. They are listed under M3 in `docs/DESIGN.md` §Open design work.

### M1R.3 — Core contract + simulator rebaseline *(complete)*

- [x] Replace gate/readiness/auto-challenge with the minimal Road/Boss/Ascension core state required by the simulator
- [x] Lock manual entry, zero boss income, offline boss damage, abandonment, victory, and reset/persistence with deterministic core tests
- [x] Add Road/Boss/Ascension states and multi-realm runs to the sim model
- [x] Add idle and active policies for both Road and Boss
- [x] Add pending/banked Ascendancy, tree purchases, automatic earnings bonuses, and abandon strategy
- [x] Tune constants until all approved pacing and numerical-safety validators pass across multiple seeds

**Exit:** the minimal authoritative core and the new economy—not the legacy M0 economy—have passing evidence.

## M2 — Persistence and client integration *(complete except save migration)*

- [x] Harden the core state model and public actions for client consumption — `enterPortal`, `abandonBoss`, `buyAscendancyNode` on the public index
- [~] Version and migrate the save schema; preserve partial boss progress across close/reload — **in progress.** The envelope is versioned and boss progress survives reload; a migration chain is landing on a separate branch
- [x] Integrate manual portal entry, active boss inputs, abandonment, and atomic/idempotent victory into the controller — `app/src/game.ts`, `hold.ts`, `active.ts`
- [x] Integrate realm reset, pending-to-banked Ascendancy, tree state, and earnings bonuses — `packages/core/src/engine.ts` ascension path
- [~] Complete serialization, recap, controller, and migration coverage around the state machine — serialize, save, game and recap tests exist; migration coverage lands with the chain above

**Exit:** core, simulator, save, and controller tests prove the full Road → Boss → Ascension lifecycle before UI polish.

## M3F — Feel milestone *(current — ADR #63)*

Verdict on 2026-09-27: the game is not fun. Nothing on screen changes between zone 1 and zone 49, a tap is imperceptible, every upgrade is affordable after 90 s, and the first ascension is hours away. This milestone fixes feel and pacing before any more content. Plan: `docs/superpowers/plans/2026-09-27-feel-milestone.md`.

- [x] Scene reads the zone index; each zone advance is visible (signpost, backdrop shift, banner)
- [x] Monsters die on screen; coins launch from the kill, fly above the monster, land ahead and are collected
- [x] A miss is seen and heard; momentum is legible at a glance; kill payout is shown
- [x] Pending Ascendancy on the Road HUD
- [ ] Realm 0 portal-ready in 12–20 min active, guardian 3–6 min; realm length and boss band grow per realm
- [ ] Upgrade scarcity: ≤ 2 affordable rows most of the time, never starved; P5/P6/P8 re-banded per realm, full sim quoted
- [ ] Real-phone playtest recorded in `docs/PLAYTESTS.md`: first session reaches ascension

**Exit:** a first-time player ascends inside one session and can say what tapping did.

## M3 — Active Road and portal-boss client *(built; phone playtests outstanding; paused behind M3F)*

- [x] Build the Road diorama scene spine with SRD-verified placeholder monster roster — `app/src/scene/`, 35 named species plus a fallback in `app/src/species.ts`
- [x] Implement the approved active Road mechanics and session feedback — momentum, loot arcs, `feel.ts` audio/haptics, `scene/fx.ts`
- [x] Build portal preview, committed boss screen, attack-speed interaction, and protected Abandon flow — dungeon view (ADR #58–#61), hold-to-abandon in `view.ts`
- [x] Build road-return and boss-damage offline recaps — `recap` on the event array, rendered by `view.ts`
- [x] Surface pending/banked Ascendancy, ascension summary, earnings bonus, and tree purchases — Ascendancy panel in `view.ts`
- [ ] Conduct real-phone playtests for 15-, 20-, and 30-minute sessions plus overnight returns — **no playtest record exists**

**Exit:** active play is fun and materially valuable; idle returns and multi-hour bosses still feel worthwhile.

## M4 — Collections, realms, and content *(next; provenance done)*

- [~] Bestiary, gear-set records, realm stars, and boss trophies — core counts species kills, gear found, zones cleared and trophies in `collection`; **no Collection UI yet**
- [x] SRD provenance roster, required CC-BY-4.0 attribution/NOTICE, and content review — `docs/SRD-CONTENT.md`, `THIRD_PARTY_NOTICES.md`, ADR #49
- [ ] Original realm, portal, monster, gear, and boss presentation through the v1 finale
- [ ] Collection cadence added to the simulator and retention evaluated in playtests
- [ ] Revisit future companions only after the solo-hero loop is proven; no v1 party commitment
- [ ] **An ending at or before realm 300.** The realm ladder has a hard arithmetic horizon and the world must reach a designed conclusion — or a defined endless mode — before a player reaches it. See "The realm-300 horizon" below.

**Exit:** the long-horizon collection and world-saving journey support multi-realm retention, and no player can walk off the end of the number line.

### The realm-300 horizon

⚠️ **Realm 300 is the last winnable realm.** At 301 `bossHp` is `Infinity`, `enterPortal` refuses with `reason: 'unwinnable'`, and there is nothing further to play (`docs/DECISIONS.md` #34). A simulated player reaches it around **day 88** of steady play. This is an arithmetic wall, not an ending, and M4 owes the world a real one first.

**A big-number representation is the only thing that removes the wall, and it has to cover all five points, not one:**

| Quantity | Overflows at realm |
|---|---|
| `bossHp` | **301** |
| `enemyHp` | 330 |
| `gearPower` | 331 |
| `enemyGold` | 333 |
| `levelCost` | 341 |

Widening `bossHp` alone buys thirty realms and leaves the wall standing. A real fix is a mantissa/exponent layer through the whole economy **with its own determinism contract** — `advance(s, a + b)` must stay byte-identical to `advance(advance(s, a), b)` under the new arithmetic, and that contract is the load-bearing invariant of this project (`docs/DECISIONS.md` #6). That is why M1R chose a defined finite horizon instead. Anyone reopening this should start here rather than re-deriving the five numbers.

`packages/core/test/magnitude.test.ts` pins every frontier above, so the wall cannot move without a test going red.

## M5 — Art, audio, and ship decision

- [ ] Production biome art, hero/monster animation, boss set-pieces, sound, and recap polish
- [ ] Decide whether the prototype has earned store investment
- [ ] If approved: Capacitor packaging, notifications, cloud save, accessibility pass, and store listing

**Exit:** either a validated prototype concludes cleanly or a production candidate is ready for store preparation.
