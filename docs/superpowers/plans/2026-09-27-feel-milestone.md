# M3F — Feel Milestone Plan

Authority: ADR #63. Verdict that motivated it: playing the game is not fun.

**Goal:** a first-time player ascends inside one 20–30 minute session, sees the road change as they go, and can say what tapping did.

## What is broken today (measured 2026-09-27, seed 7, desktop 1280×720)

| Symptom | Cause | Where |
|---|---|---|
| Zone 1 and zone 49 draw the same frame | `SceneModel` carries `region` only; nothing in `app/src/scene/` reads a zone | `app/src/scene/frame.ts:14-45`, `app/src/game.ts:258-275` |
| Monster never dies, it is replaced | `killMonster` does `queue.shift()` after a particle burst | `app/src/scene/world.ts:351-367` |
| Coins hide the fight | Arcs launch at the hero's feet and land 15–46 px right of him, through the monster's body; drawn after monsters, sprite never hidden | `app/src/scene/world.ts:415-431`, `actors.ts:182`, `scene.ts:211-213` |
| Landed coins vanish | `world.rests` is never fed; `drawRests` and the fly-to-counter streaks are dead | `overlay.ts:59-94`, `world.ts:623-643` |
| A miss shows nothing | No miss visual or sound; engine returns silently | `world.ts:456-470`, `engine.ts:446-453` |
| Tapping is imperceptible | Combo label is 5 px tall in a gutter; momentum multiplies attack speed only, max ×1.75 | `scene/combo.ts`, `overlay.ts:13-57` |
| All rows green after 90 s | DPS passes the 0.35 s kill floor at hero level 2; income flat ~2.9–5 G/s for 1200 kills while prices grow 1.12–1.21× from 10–190 G | `packages/core/src/constants.ts:27-32,111,122`, `formulas.ts:109-118,217-222` |
| First payoff hours away | 50 zones × 1200 kills × 0.35 s = 5.8 h idle / 3.3 h at full momentum, minimum | `constants.ts:111,113` |
| Ascendancy shows 0 A all realm | HUD button shows banked, pending only in the overlay | `app/src/view.ts:994` |

## Slices

Two slices run in parallel in separate worktrees under `.worktrees/`. Each lands as its own PR against `feat/m1r-integration`. The gate for both is `npm run verify`; the economy slice also quotes `npm run sim` (3 seeds, 14 days).

### Slice A — Presentation (`app/` only, no core change)

1. **Zone into the scene.** Add `zone`, `zonesInRealm` to `SceneModel`. Per-zone backdrop drift across the realm (sky and light shift from dawn toward dusk as `zone / zonesInRealm` rises; prop density hash keyed on zone). A signpost sprite scrolls past on every `zone` event carrying the zone number; a short banner in the text lane.
2. **Death on screen.** A dying monster stays in the queue for a death phase (fall or dissolve, ≤ 0.15 s so it fits inside the 0.35 s kill floor), then leaves. Under offline catch-up only one death plays, as today.
3. **Arcs re-based.** Presentation mapping only: origin at the kill point (the lead monster's centre), 1 arc unit ≈ 50 scene px so the apex clears a 30 px sprite, landing on the road ahead of the monster. `arcSpaceFromScene` / `sceneFromArcSpace` and the tap-aim conversion must stay inverses of each other; a test asserts round-trip. Core `arcs.ts` is untouched, so catches are unchanged.
4. **Landed coins.** Feed `world.rests` from arcs that expire uncaught; rests scroll toward the hero with the ground and fly to the gold counter when they reach him (the existing dead streak code).
5. **Miss feedback.** A whiff sound and a small slash spark at the tap point when a strike catches nothing and no monster was in reach. Distinct from the hit thud.
6. **Momentum legible.** Combo label at scale 2 near the DPS readout, plus a visible stride change (already scales; make the walk-speed gain steeper on screen only).
7. **Kill payout floater.** Use the unused `payout` floater type: `+N gold` rises from the kill point.
8. **Pending Ascendancy on the HUD.** Button reads `banked A · +pending` on the Road.

Verification: `npm run qa:capture` at zone 1 and zone 10 of a staged run must differ; `npm run qa:loop` still passes; a Playwright check that a tap on empty sky produces the miss cue class.

### Slice B — Pacing (`packages/core`, `sim`, docs)

1. **Realm length as a function of realm.** `zonesForRealm(r)` and `killsPerZone(r)` replace the two constants. Targets: realm 0 portal-ready **12–20 min active, 40–80 min idle**; realm 5+ keeps **2–4 h active, 8–16 h idle**; realms 1–4 interpolate.
2. **Guardian band per realm.** Realm 0 **3–6 min active**; realm 5+ keeps 15–90 min; 1–4 interpolate. Retune `bossHpMult` / `BOSS_REALM_GAIN` as needed.
3. **Scarcity.** Price growth and zone gold growth retuned so that, over Road play, **≤ 2 rows are affordable at ≥ 80 % of looks**, **≥ 1 row affordable or ≤ 60 s of income away at 95 % of looks**, ≥ 5 priced rows always. Replace P8's clauses with these.
4. **Validators re-banded, not removed.** P5, P6, P8 take the realm index. P10 and P1/P2 unchanged. `sim/test/gate.test.ts` still requires ALL PASS.
5. **Determinism tests** for every new formula (split-invariance across a zone and a realm boundary at the new lengths).
6. **Save compatibility.** Existing saves may carry `zone ≥ zonesForRealm(realm)`; load clamps and marks portalReady, with a test.
7. **Docs.** `docs/ECONOMY.md` and `docs/ACTIVE-PLAY.md` bands updated; content-end day re-measured and recorded against #48.

Verification: `npm run sim -- --seeds 3` ALL PASS with the new bands, quoted in the commit; `npm run sim -- --days 90` to re-measure content end.

### After both land

- Merge B, then A (A only reads `zonesPerRegion` from the ViewModel, already present).
- `/code-review xhigh --fix` on each PR before opening it.
- Real-phone playtest, 20 min, recorded in `docs/PLAYTESTS.md`: time to portal, time to first ascension, one sentence on what tapping felt like. That record is the exit.

## Not in scope

Collection UI, new realms or species, hero sprite rework, big-number arithmetic (#34), Capacitor.
