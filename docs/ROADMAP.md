# Wanderblade — Roadmap

**Current milestone: M1 (M1a complete, M1b next).** Every milestone ends in something you can feel — pacing in a sim, a build on a phone.

## M0 — Vision + Economy Simulator *(complete)*

- [x] Concept chosen (Wanderblade — see DECISIONS.md #3)
- [x] Design docs scaffolded and reviewed (3-lens review applied)
- [x] `packages/core` — pure TS game rules (deterministic, seeded PRNG — DECISIONS.md #6)
- [x] `sim/` — fast-forward harness with the deterministic bot policy from ECONOMY.md
- [x] Tune constants until all **M0-gating** pacing targets pass on a 10-day run

**Exit: MET** — `npm run sim` prints `OVERALL M0 EXIT: PASS (all targets, all seeds)` on 3 seeds × 10 days. (M0 pacing is a pre-Bestiary baseline — re-tuned in M2 by design.)

## M1 — Grey-box core loop *(now)*

Ordered deliberately: prove the fun with the cheapest possible UI *before* building the renderer — the loop's pull must survive without spectacle.

- [x] **M1a — Loop with minimal UI:** counters, upgrade buttons, log feed — no animation. Auto-fight math, gold/loot, hero levels, gear + auto-equip, 1–2 skills, first two regions + first **boss gate** (Readiness meter, Challenge button, auto-challenge — DESIGN.md).
- [x] Save/load (local persistence; prestige-persistent vs run-local state separated from day one — see DESIGN.md Prestige)
- [x] Offline progress + "Back on the Road" recap

**M1b — "The Living Road"** (re-scoped 2026-07-11 after the M1a playtest verdict: dead numbers, no character on screen, wrong art register — DECISIONS.md #12/#13). Everything below is display-layer work; economy constants unchanged, no sim re-run needed. Cheap number/tone wins land before renderer spend, with the playtest gate between them:

- [x] **Phase 0 — Render driver:** frame-rate-independent smoothing (dt-based), single RAF path, compositor-only meter sweeps.
- [x] **Phase 1 — Living counter + goal-gradient HUD:** full-digit gold odometer with intra-kill accrual (low digits always rolling), gold/sec readout, DPS punch on purchase, "next" strip (waypoint + cheapest-buy ETA).
- [x] **Phase 2 — Pixel & Parchment re-skin:** DB32 palette, hard edges, carved-wood panels, pixel fonts (Pixelify Sans UI / VT323 numerals), log demoted to a ticker.
- [ ] **GATE — phone playtest:** on a real phone → **is the pull real** with living numbers and a visible goal, before any renderer spend? Green-lights Phases 3–5.
- [ ] **Phase 3 — Scene spine:** canvas pixel diorama — hero walks and auto-fights, monsters spawn and pop, draining HP bar, floating damage/gold numbers (display-synthesized). Greenwood only; CC0 placeholder sprites, hero hand-authored.
- [ ] **Phase 4 — Set-pieces:** region-transition cards, rarity loot-slam, boss set-piece (hitstop, shake, shatter), purchase feedback.
- [ ] **Phase 5 — Tap layer (Road Play v1):** hero-tap **Rally** (capped, decaying, additive bonus gold via a gold-only helper outside `advance()`), Trailside Glints (auto-collected at reduced value if missed), Roadside Discoveries. Idle baseline still passes every pacing target with zero taps.

**Exit:** the "one more upgrade" pull is real when we playtest on a phone — proven at the gate with numbers + goals alone, then amplified by the scene.

## M2 — Meta systems

- [ ] Bestiary with mastery tiers
- [ ] **Re-run economy sim with Bestiary mastery accrual; re-tune constants** (expected drift — ECONOMY.md "Bestiary caveat")
- [ ] Gear sets + zone stars (collection ledger)
- [ ] Remaining v1 regions through World's Edge
- [ ] Prestige v1 ("New Road" — design decided: many-roads rhythm, Legend tree, unearned-Legend preview — DECISIONS.md #7/#11; extend the sim with a prestige-greedy bot and tune Legend constants)
- [ ] Achievements/titles
- [ ] Collection-cadence targets validated in sim; collection *retention* validated by playtest

**Exit:** a week-long retention loop exists (for us, at least).

## M3 — Art & juice

- [ ] Diorama biome art + transitions
- [ ] Hero/monster animation, hit effects, number-pops
- [ ] Sound (sfx + ambient)
- [ ] Recap/boss moments polished into events — boss set-pieces get the full treatment (camera lock, telegraphed attacks, cinematic kill)

**Exit:** passes the "show a friend and they say *ooh*" bar.

## M4 — Ship prep *(optional — prototype-first ambition, decide after M2/M3)*

- [ ] Capacitor packaging (iOS/Android)
- [ ] Notifications (respectful, off by default)
- [ ] Cloud save
- [ ] Store listing

**Exit:** on the stores.
