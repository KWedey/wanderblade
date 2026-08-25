# Wanderblade — Roadmap

**Current milestone: M1R — Active-Forward Realm Rebaseline.** The July grey-box work proved the deterministic engine and basic UI. The August design pivot replaces short optional-active check-ins, readiness gates, and voluntary New Roads with an active-forward Road → Portal Boss → Ascension structure.

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

## M1R — Active-Forward Realm Rebaseline *(current)*

### M1R.1 — Product and documentation contract

- [x] Approve 15–30-minute active sessions once or twice daily with slower, meaningful idle progress
- [x] Approve mutually exclusive Road and persistent Portal Boss phases
- [x] Approve boss-victory ascension, reset/persistence rules, and pending/banked Ascendancy
- [x] Approve SRD 5.2.1 monster inspiration under CC-BY-4.0
- [x] Rewrite VISION, DESIGN, ECONOMY, ROADMAP, binding guardrails, and append superseding ADRs
- [x] Produce an [implementation plan](superpowers/plans/2026-08-11-active-forward-realm-ascension.md) with explicit design/simulation gates and verification criteria

**Exit:** the repository describes one coherent current game and clearly labels the old economy as historical.

### M1R.2 — Active-play design and pacing bands *(next)*

- [ ] Design the 15–30-minute Road session arc and compare 2–3 mechanic sets
- [ ] Design portal-boss tapping, cap/decay, feedback, and an accessibility-equivalent input
- [ ] Select numeric Road-active, Road-idle, Boss-active, and Boss-idle pacing bands
- [ ] Define realm length, portal-availability conditions, boss-duration bands, and abandonment UX
- [ ] Define Ascendancy accrual, boss payout, tree shape, and realm-completion earnings bonus

**Exit:** active play is approved as a complete interaction and economy specification; no mechanics are invented during implementation.

### M1R.3 — Core contract + simulator rebaseline *(complete)*

- [x] Replace gate/readiness/auto-challenge with the minimal Road/Boss/Ascension core state required by the simulator
- [x] Lock manual entry, zero boss income, offline boss damage, abandonment, victory, and reset/persistence with deterministic core tests
- [x] Add Road/Boss/Ascension states and multi-realm runs to the sim model
- [x] Add idle and active policies for both Road and Boss
- [x] Add pending/banked Ascendancy, tree purchases, automatic earnings bonuses, and abandon strategy
- [x] Tune constants until all approved pacing and numerical-safety validators pass across multiple seeds

**Exit:** the minimal authoritative core and the new economy—not the legacy M0 economy—have passing evidence.

## M2 — Persistence and client integration

- [ ] Harden the core state model and public actions for client consumption
- [ ] Version and migrate the save schema; preserve partial boss progress across close/reload
- [ ] Integrate manual portal entry, active boss inputs, abandonment, and atomic/idempotent victory into the controller
- [ ] Integrate realm reset, pending-to-banked Ascendancy, tree state, and earnings bonuses
- [ ] Complete serialization, recap, controller, and migration coverage around the state machine

**Exit:** core, simulator, save, and controller tests prove the full Road → Boss → Ascension lifecycle before UI polish.

## M3 — Active Road and portal-boss client

- [ ] Build the Road diorama scene spine with SRD-verified placeholder monster roster
- [ ] Implement the approved active Road mechanics and session feedback
- [ ] Build portal preview, committed boss screen, attack-speed interaction, and protected Abandon flow
- [ ] Build road-return and boss-damage offline recaps
- [ ] Surface pending/banked Ascendancy, ascension summary, earnings bonus, and tree purchases
- [ ] Conduct real-phone playtests for 15-, 20-, and 30-minute sessions plus overnight returns

**Exit:** active play is fun and materially valuable; idle returns and multi-hour bosses still feel worthwhile.

## M4 — Collections, realms, and content

- [ ] Bestiary, gear-set records, realm stars, and boss trophies
- [ ] SRD provenance roster, required CC-BY-4.0 attribution/NOTICE, and content review
- [ ] Original realm, portal, monster, gear, and boss presentation through the v1 finale
- [ ] Collection cadence added to the simulator and retention evaluated in playtests
- [ ] Revisit future companions only after the solo-hero loop is proven; no v1 party commitment

**Exit:** the long-horizon collection and world-saving journey support multi-realm retention.

## M5 — Art, audio, and ship decision

- [ ] Production biome art, hero/monster animation, boss set-pieces, sound, and recap polish
- [ ] Decide whether the prototype has earned store investment
- [ ] If approved: Capacitor packaging, notifications, cloud save, accessibility pass, and store listing

**Exit:** either a validated prototype concludes cleanly or a production candidate is ready for store preparation.
