# Wanderblade — Roadmap

**Current milestone: M0.** Every milestone ends in something you can feel — pacing in a sim, a build on a phone.

## M0 — Vision + Economy Simulator *(now)*

- [x] Concept chosen (Wanderblade — see DECISIONS.md #3)
- [x] Design docs scaffolded and reviewed (3-lens review applied)
- [ ] `packages/core` — pure TS game rules (deterministic, seeded PRNG — DECISIONS.md #6)
- [ ] `sim/` — fast-forward harness with the deterministic bot policy from ECONOMY.md
- [ ] Tune constants until all **M0-gating** pacing targets pass on a 10-day run

**Exit:** every M0-gating target in ECONOMY.md passes in simulation. (M0 pacing is a pre-Bestiary baseline — re-tuned in M2 by design.)

## M1 — Grey-box core loop

Ordered deliberately: prove the fun with the cheapest possible UI *before* building the renderer — the loop's pull must survive without spectacle.

- [ ] **M1a — Loop with minimal UI:** counters, upgrade buttons, log feed — no animation. Auto-fight math, gold/loot, hero levels, gear + auto-equip, 1–2 skills, first two regions + first **boss gate** (Readiness meter, Challenge button, auto-challenge — DESIGN.md).
- [ ] Save/load (local persistence; prestige-persistent vs run-local state separated from day one — see DESIGN.md Prestige)
- [ ] Offline progress + "Back on the Road" recap
- [ ] Playable in a mobile browser on a real phone → **playtest checkpoint: is the pull real?**
- [ ] **M1b — Road renderer v0:** simple-shapes diorama (hero walks, monsters spawn, numbers pop). The single biggest build in M1, started only after the loop proves out.
- [ ] **M1b — Road Play v1:** Trailside Glints + Roadside Discoveries as live-only overlays on the renderer; tune the active-income multiplier by playtest.

**Exit:** the "one more upgrade" pull is real when we playtest on a phone — with the minimal UI.

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
