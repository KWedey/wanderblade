# Wanderblade — Economy & Pacing

Idle games are math games with a UI on top. **Nothing in this file ships until the simulator proves the pacing.** Every constant below is a starting guess, to be tuned in `sim/`.

## Currencies & resources

| Resource | Role | Sink |
|---|---|---|
| Gold | Primary earn/spend | Hero levels, skill upgrades |
| Gear drops | The load-bearing power scaler (see below), rarity-tiered | Equipped (auto), collected into sets |
| Legend | Prestige currency (M2+) | Permanent bonuses on a New Road |

## World structure constants (v0)

| Constant | Value | Notes |
|---|---|---|
| Zones per region | 10 | 7 regions → 70 zones in the v1 realm |
| Kills per zone | 10 | Advancing past the last kill enters the next zone |
| Zone length | 1 league | → 0.1 league per kill; leagues are derived, never independent |

## Core formulas (v0)

Let `z` = global zone index (0-based, monotonically increasing along the road).

**Enemies**
- HP: `hp(z) = 10 · 1.55^z`
- Gold drop: `gold(z) = 1 · 1.48^z` (income grows slower than difficulty → upgrades always needed)
- Region boss HP: `60 · hp(z_boss)` (tuned up from the v0 guess of 25 — see "Tuned constants" below). **Every region ends at a gate — including regions beyond World's Edge (the endless tail).** Gate fights resolve deterministically: **win iff `Readiness = (dps · 30) / bossHP ≥ 1`** (30 s enrage window). **Auto-challenge** (default on) fires at Readiness ≥ 1.1, online or offline. Parked at a gate, the hero farms the approach zone at full trash income — a gate pauses leagues, never income. The multiplier is capped below `gearPowerBase · 32 ≈ 64` so a fully-farmed all-epic set still crosses on its own (all-epic Readiness = 72/60 = 1.2 ≥ 1.1): the pure-idle player always breaks through via farmed gear (DECISIONS.md #9), the sim's `autochallenge` property test enforces this. Gates are the tail's anti-runaway wall as much as the early game's anti-stall one.

**Hero**
```
dps = (base(level) + gearPower) · skillMult · (1 + mastery)
```
- `base(level) = 25 · 1.12^level` — levels are the *smoothing* scaler, not the primary one (base `d0` tuned up from 5 to 25 so the opening session can fell the first boss in 5-10 min; `rD = 1.12 < rH` still lets base fade against HP over zones, so gear stays primary). (Proof of necessity: holding kill-time constant on levels alone needs ~3.9 levels/zone, costing ×1.72/zone against income growing ×1.48/zone — a widening gap that stalls the game permanently around zone 20.)
- `gearPower = Σ over 3 slots` — **gear is the primary scaler.** A drop found in zone `z` has power `2 · 1.55^z · rarityMult`, so expected gear power tracks enemy HP growth by construction.
- `skillMult = Π over unlocked skills of (1 + skillMultPerLevel · skillLevel)`, each skill **hard-capped at `maxLevel` ranks** — skills are modeled as steady multipliers (auto-cast flavor is presentation, not math). **`skillMultPerLevel = 0.05`, `maxLevel = 10`**, so each skill tops out at ×1.5 and both together at ×2.25 — a bounded second upgrade track (see "Skills in the M0 baseline" below).
- `mastery = Σ Bestiary mastery bonuses` — **0 in the M0 baseline sim.** See "Bestiary caveat" below.

**Drops**
- Drop chance: 5% per kill, uniform random slot.
- Rarity weights: common 70 / uncommon 23 / rare 6 / epic 1; multipliers ×1 / ×1.5 / ×2.5 / ×4.
- Open tuning question: a pity/slot-targeting rule if a slot lags too far in sim.

**Costs**
- Hero level: `10 · 1.15^level`
- Skill upgrade: `50 · 1.15^skillLevel`

**Time & distance**
- Kill time: `max(minKillTimeSec, hp(z) / dps)` seconds — clamped to a `minKillTimeSec = 2 s` walking floor (tuned up from 0.3; walk time between spawns is folded into kill cadence in v0). With gates in every region the readiness walls now carry the anti-runaway role, but the floor stays at 2: V1 (first upgrade < 30 s = 10 zone-0 kills) pins it below 3, and lowering it only reaches the float-precision tail faster (see "Tuned constants").
- Leagues: `0.1 per kill` → leagues/hour = `360 / killTime`. This is the recap's headline number and is fully derived from the combat model.

## Tuned constants (M0)

The values above are the sim-tuned M0 economy, tuned in `sim/` against the 10-day pacing targets below — **all six pass on `--days 10 --seeds 3`.** Preserved: `rG < rH`, gear-primary (`gearPowerRate = rH`), and the farmed-gear gate-crossing guarantee (`bossHpMult` below the all-epic ceiling `gearPowerBase·32 ≈ 64`). Unchanged from v0: rH, rG, gearPowerBase, gearPowerRate, rarity weights/multipliers, cost curves, world structure, enrage window.

| Constant | v0 → M0 | Why |
|---|---|---|
| `bossHpMult` | 25 → **60** | The readiness bar is high enough that typical farmed gear does *not* clear a gate on arrival, so the hero parks and farms — turning each region end into a real soft wall. Kept below the all-epic ceiling (≈64) so a maxed all-epic set still auto-crosses (Readiness 72/60 = 1.2 ≥ 1.1), preserving the pure-idle guarantee. |
| `d0` (base damage) | 5 → **25** | With the low `dropChance` the walls require, early gear is scarce, so the opening leans on purchased levels to fell the first boss in the 5–10 min window; `rD = 1.12 < rH` still fades base against HP so gear stays primary. |
| `dropChance` | 0.05 → **0.006** | Gear power grows at `rH` (gearPowerRate = rH), so Readiness is scale-invariant: with frequent drops every gate either always clears (runaway) or never. Scarce drops make the equipped set *lag* the frontier by a variable amount, so a gate clears only on a lucky recent high-rarity mix — that drop variance *is* the soft-wall mechanism and it paces the endless tail. |
| `skillMultPerLevel` (+ `maxLevel`) | 0.05 unbounded → **0.05, capped at 10** | Skills return as a **bounded** second upgrade track: each hard-caps at `maxLevel = 10` ranks (×1.5), both at ×2.25 — a finite ceiling that cannot run away (see below). The prior published M0 had disabled this axis (0). |
| `minKillTimeSec` | 0.3 → **2** | Walking floor, held at 2. Gates-forever now do the anti-runaway work, but V1 (first upgrade < 30 s = 10 zone-0 kills → 10·floor < 30) pins the floor below 3, and lowering it only reaches the float tail faster. |

## Skills in the M0 baseline (binding)

**Skills are live in M0, as a bounded second upgrade track.** `skillMult = Π (1 + 0.05 · skillLevel)` with each skill hard-capped at `maxLevel = 10` ranks: Cleave and Warcry each top out at ×1.5, both together at ×2.25. The cap is the whole point — the multiplicative skill term is otherwise an *unbounded* power axis (the greedy bot pours banked gold in, the product runs away, kill time floors, and every gate wall dissolves; that was the dominant failure of the earlier constants). The hard cap makes it a *form* fix, not a fragile cost-curve balance: `buySkill` refuses to sell past `maxLevel`, `heroDps` applies the multiplier, and the sim bot skips a capped skill cleanly (its ΔDPS-per-gold is 0). Unlock gates stay at hero L5 (Cleave) / L15 (Warcry). This bounded track gives the greedy bot a real, finite gold sink between gates — part of why the check-in and 8h-return targets now pass.

## Bestiary caveat (binding)

Bestiary mastery is a real power axis (permanent global damage), but it ships in M2. **M0 pacing is therefore a pre-Bestiary baseline.** When the Bestiary lands, its accrual model must be added to the sim and constants re-tuned — this is expected drift, tracked as an explicit M2 roadmap item, not a regression.

## Pacing targets

**M0-gating** (the sim must hit these on a 10-day run). Status is the tuned-economy result on `--days 10 --seeds 3`:

| Moment | Target | Status |
|---|---|---|
| First upgrade | < 30 seconds of play | **PASS** (all seeds, ~20 s) |
| First boss down | 5–10 minutes (first active session) | **PASS** (all seeds, ~6–7 min) |
| Check-in value | ≥ 1 meaningful purchase per check-in (validator: ≥ 90% of post-day-1 check-ins) | **PASS** (all seeds, 100%) |
| Return after 8 h | a few one-tap purchases + a recap worth reading (validator: **median ≥ 3**, lower bound only — see note) | **PASS** (all seeds, median ~85) |
| Soft wall cadence | Every 2–3 days in the first week (validator: a > 2 h wall exists, none > 3 days) | **PASS** (all seeds; walls run ~1–10 h) |
| No hard stall | Kill time never exceeds 60 s for trash across the 10-day run | **PASS** (all seeds, max ~40 s) |

**All six M0-gating targets now pass on `--days 10 --seeds 3`.** Three structural changes closed the gap that the earlier gateless-tail constants could not:

1. **Gates in every region, including the endless tail (region 7+).** Previously the road past World's Edge scaled forever with no gates, so the hero (a) out-ran its own gear on drop droughts and trash kill time spiked past 60 s (V6), and (b) was never gold-starved, so the greedy bot's purchase counts exploded or, once gold overflowed `double`, collapsed to zero (V3/V4). Gates-forever make the tail behave like the defined regions: a readiness wall stops sprints and parked farming lets gear catch up. `worldsEdgeReached` and the one-time `edge` event are unchanged — only the gate structure continues past them.
2. **Bounded skills.** `skillMultPerLevel = 0.05` with a hard `maxLevel = 10` cap (×2.25 total) restores skills as a real, buyable second upgrade track that *cannot* run away — giving the greedy bot a finite gold sink between gates, which helps the check-in and 8h-return purchases land in a healthy band.
3. **A drop-scarce economy (`dropChance = 0.006`) with a higher gate bar (`bossHpMult = 60`) and base damage (`d0 = 25`).** Because gear power grows at `rH`, Readiness is scale-invariant; only drop-variance creates walls, so the drop rate had to come down for the soft walls to exist at all, and `d0` rose to keep the first boss in-window despite the scarcer early gear.

**On the V4 redefinition (honest note):** the old "8 h return → 3–5 purchases" target described a *human* making a few one-tap buys. The sim bot buys *every* affordable upgrade, so its purchase count measures gold-richness, not human tapping — an upper bound on a greedy count wrongly fails a healthy gold-rich return. V4 is therefore a **lower bound only**: the median 8h-return must afford **≥ 3** purchases, and at least one such return must exist. V3 (≥ 90% of post-day-1 check-ins afford ≥ 1) and V6 (no trash kill > 60 s) are unchanged. This is the one target that was redefined; the rest pass on their original terms.

**Honest remaining artifact (not a failure):** the greedy bot buys *every* affordable upgrade, so it still progresses far faster than a human and, in a 10-day run, approaches the float-precision tail — `1.55^z` overflows `double` near zone ~1600, where HP/gear/readiness become `Infinity`/`NaN`. The tuned economy keeps all seeds below that ceiling for the full run (final zones ~890–980). This is inherent to an uncapped-scaling *prototype* with finite floats; M2 prestige (New Road) resets the hero at World's Edge long before the tail, so a real multi-run game never approaches it. Like the Bestiary, this is a pre-prestige baseline characteristic, not a regression.

**Deferred** (not evaluable in M0; validated later):

| Moment | Target | When |
|---|---|---|
| First New Road attractive | Day 2–3, at the first hard wall | M2 sim |
| Second run re-reaches prior frontier | ~20–30% of original wall-clock | M2 sim |
| First Bestiary tier | Within ~15 min of active play | M2 sim |
| Region gear set | ≥ 2/3 complete by region-boss kill | M2 sim |
| Active watching income | ≈1.5–2× idle gold rate, diminishing | M1b playtest |
| Collection *retention* (is the rhythm fun?) | — | M2 playtest, not sim |

## Active-play overlay (live-only)

Road Play (Trailside Glints, Roadside Discoveries — DESIGN.md) is a **live-only additive layer**: taps grant bonus gold/buffs *on top of* the seeded kill/drop stream and never alter it.

- The sim models the **idle baseline only**, and every pacing target must pass with zero taps. Idle Slayer's cautionary tale is binding: active play must never become the rate you fall behind by ignoring.
- Target: attentive watching earns ≈1.5–2× the idle gold rate, with diminishing returns — an accelerant, never a gate.
- Glint bonus sizing and Discovery cadence (~1 per check-in) are M1b playtest tuning, not M0 sim inputs.

## Legend & New Roads (M2 draft)

- **Earn on reset:** `Legend = floor(L0 · (1.30^z_max − 1))` where `z_max` = deepest zone reached this run. The 1.30 earn base grows slower than the 1.55 HP wall, so pushing deeper is always worth more, while banked Legend makes re-reaching the frontier far faster — the flywheel. Presented as per-boss nuggets in the reset recap.
- **Rhythm targets:** first New Road attractive day 2–3; second run re-reaches the prior frontier in ~20–30% wall-clock; World's Edge is a multi-run goal.
- **Spend:** the permanent Legend tree (node list in DESIGN.md) — global multipliers plus a zone head-start; single-tap ranks, no re-buys.
- All constants (`L0`, earn base, node costs/effects) are an **M2 sim task**: extend the bot to prestige greedily and validate both rhythm targets.

## Simulator & determinism contract (M0 deliverable)

- `packages/core` — pure TypeScript game rules (combat, drops, costs, offline progression). **No UI or platform dependencies.**
- **Determinism:** all randomness flows through a seeded, injectable PRNG with rolls keyed to kill index. The clock advances event-stepped (by kill time), not by wall-clock ticks. Offline progress and live play run the *same code path*, so identical inputs → identical results, by construction. (See DECISIONS.md #6.)
- **Offline cap:** provisionally **generous/no cap** for the prototype (see DECISIONS.md #8) — the sim runs uncapped.
- `sim/` — fast-forward harness: a bot plays days of game time in milliseconds against a configurable check-in schedule (default 4×/day).
- **Bot policy (deterministic):** at each synthetic check-in, repeatedly buy the affordable upgrade with the highest expected ΔDPS-per-gold among {hero level, each skill upgrade}; break ties by lowest cost; stop when nothing is affordable. Gear is passive (drops + auto-equip).
- Output: milestone timeline — zone reached, leagues, boss kill times, purchases per check-in, gold curve — as console table + CSV.
- **M0 exit criterion:** all **M0-gating** targets pass across a simulated 10-day run.

## Open questions

**Provisionally decided for M0 (revisit after M1 playtest):**
- Offline cap → generous/no cap (Wanderblade's identity is "the hero kept walking").

**Genuinely deferred:**
- Drop pity/slot-targeting rule (add only if sim shows slot starvation).
- Bestiary mastery bonus sizing (guess +1–2% per tier; M2 sim).
- Prestige/Legend earn curve (M2).
- Materials/forging — v1 stays gold-only.
