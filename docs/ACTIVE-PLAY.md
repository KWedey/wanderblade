# Wanderblade — Active Play Specification

Closes the M1R.2 design gate. Chosen against the reference bar (Idle Slayer): one primary
input, immediately legible, materially valuable, bounded, and identical in both phases.

## The single input

**Strike** — tap (touch), click, or hold `Space` / `Enter`. One input for the whole game.
Every active mechanic below is expressed through it. No second verb in v1.

## Road: Momentum + Loot Arcs

**Momentum.** Each Strike adds momentum. Momentum multiplies **attack speed only** — never
gold, never damage per swing. It decays continuously toward zero when input stops.

- `momentum ∈ [0, 1]`, multiplier `= 1 + MOMENTUM_MAX_BONUS · momentum`
- Gain per strike: `MOMENTUM_PER_STRIKE` (default 0.10)
- Decay: exponential, half-life `MOMENTUM_HALF_LIFE_SEC` (default 2.0) → effectively zero ~6 s after last input
- `MOMENTUM_MAX_BONUS` **0.75** (so ×1.0 idle → ×1.75 at full momentum)
- Sustaining full momentum requires ~3.3 strikes/sec. Cap is reachable but not restful; that is the point.

The extra swing per Strike is expressed by this curve rather than as a separate hit. An
unbounded per-strike swing has no ceiling, so no strike rate could satisfy a bounded band
(`docs/DECISIONS.md` #19).

**Loot Arcs.** Every kill flings its gold (and any gear drop) as **several coins** on
visible arcs across the scene, so the air carries a stream of loot rather than one blip
per kill. Coins that land uncaught still credit **full base value** — idle loses nothing.
Striking a coin mid-flight **catches** it, paying `ARC_CATCH_MULT` **of that coin's own
value**: the kill already credited 1.0×, so a catch pays only the increment, and catching
some of a kill's coins is a partial catch. Gear rides the first coin and rolls one extra
rarity tier when caught.

- `ARC_FLIGHT_SEC` default 1.5 — how long a coin stays catchable
- `ARC_SPLIT_MIN` / `ARC_SPLIT_MAX` **2 / 4** coins per kill, `ARC_STAGGER_SEC` **0.12**
- `ARC_CATCH_MULT` **1.6**

Split count, stagger and landing point all come from the kill index, so they are
deterministic and the renderer never chooses them. Coin values sum to the kill's payout
**exactly** — the last coin carries the residual, so the split can neither mint nor lose
a fraction (`arcsForKill` in `packages/core/src/arcs.ts`).

The multiplier is what the band allows, not a preference, and it moved when the payout was
split. The binding constraint is the **strike rate, not the number of coins in the air**:
the reference player strikes 3.3×/s against 4.2 kills/s, so splitting across n coins
divides each catch by n and buys no extra catches. At the old 1.15 the split measured
1.75–1.76×, below the floor. At 1.6: **1.91–1.95×, mean 1.93** (`npm run sim -- --seeds 3`).

For the record, this document originally carried 2.0, written before anything was
simulated and against a single un-split arc; stacked on momentum's ×1.75 it reached ~3.5×
and broke the band it was meant to satisfy.

**A catch is a hit test, not a queue.** A Strike carries where it landed. Core computes
every live arc's position at the strike's timestamp and catches the nearest one inside
`ARC_CATCH_RADIUS`; a Strike aimed at empty sky catches nothing, and one aimed at the third
coin catches the third. A miss is still a valid Strike — it lands its swing and adds
momentum as normal. The client renders arcs from `state.arcs` and reacts to the `arcCatch`
event; it never decides a catch (`docs/DECISIONS.md` #25).

This is the contract that keeps idle honest: active play multiplies, it never gates.

## Portal Boss: the same Strike

- Strike adds momentum on the identical curve; momentum multiplies boss DPS only.
- No loot arcs (boss phase pays nothing but damage — ECONOMY.md phase contract).
- Accessibility equivalent: **hold** the input to auto-strike at the cap-sustaining rate.
  Holding reaches the same ceiling as tapping. Never require rapid repeated input.

## Pacing bands (targets the simulator must prove)

The headline band is **permanent power, not gold** (`docs/DECISIONS.md` #31). Gold is
wiped by every ascension, so a rate multiplier on it cannot beat a night of idle — idle
has all night. Ascendancy per realm is bounded, so it is the currency where a 20-minute
session and eight hours of sleep are actually comparable.

| Band | Target | Validator |
|---|---|---|
| **Ascendancy earned, active vs idle, at the 14-day checkpoint** | **1.4× – 2.3×** | P10 |
| **Time to first ascension, idle ÷ active** | **≥ 1.20× sooner** | P10 |
| Road active (20-min session) vs same span idle | 1.8× – 2.2× gold | P1 |
| Boss active vs zero-tap, same build | 1.4× – 1.8× faster | P2 |
| 8 h idle return | ≥ 1 meaningful upgrade affordable | P3 |
| 24 h idle return | ≥ 1 zone of road progress | P4 |
| Realm start → portal available | 2 – 4 h active, 8 – 16 h idle | P5 |
| Portal boss duration (prepared build) | **15 – 90 min active** | P6 |
| Ascend promptly vs farm a ready realm 2× longer | prompt ascension wins | P7 |
| Upgrade panel, any moment of Road play | ≥5 priced rows, ≥4 affordable at 95% of looks | P8 |
| Portal-ready dead time / realm cadence | ≤ 24 h waiting, ≤ 3 days per realm | P9 |

**The horizon is part of the band, not a detail.** Both players climb — and
finish — the same realm ladder, so the ratio decays as they converge: **1.84× at
14 days, 1.91× at 30, 1.17× at 90**, where 302 of the 301 winnable realms are
behind both of them.

It is a **fixed checkpoint**, not the run length, so every run reports the same
comparable number. 14 days is the default run, so `npm run sim` evaluates the
band it prints instead of judging a 14-day measurement against a 30-day bar. A
shorter run reports the ratio and says it is unbanded; the sooner-clause is
horizon-free and stays banded on every run.

**Superseded.** The 1.8–2.2× gold band was the *headline* band; it is now a supporting
one. The constants hit it exactly (2.07× in playtest, P1 passing on every seed) and the
result was still that eight hours of sleep dwarfed a 30-minute session. Hitting a band
that measures the wrong quantity is not balance. P1 survives because a Road session
should still feel richer minute-for-minute; it is no longer the claim that active play
matters.

**The guardian floor moved from 20 to 15 minutes.** A shorter first guardian is better
onboarding, not a failure: realm 0's fight measures **16.1 minutes**, so a new player
reaches their first ascension inside one session. Realms 1–94 sit between 20 and 90
minutes, so 15 is a floor for the opening realm rather than a loosening of the band.

**The catch window is constant in time, not in distance.** The radius is
`ARC_CATCH_SEC` seconds of the coin's own travel, so a player gets the same
forgiveness in milliseconds at the apex and near the ground. A fixed distance is
silently generous where a coin is slow and near-zero where it is fast, which
made *which coin you reach for* matter more than how fast you reacted
(`docs/DECISIONS.md` #35).

## Determinism

Strikes are explicit timestamped inputs into `advance`, never render-driven. Each is
`{ atSec, aim }`, where `aim` is a point in core's own arc space or `null`. Same state +
same elapsed time + same strike inputs ⇒ byte-identical result. Momentum is engine state
carried on `GameState`, not a display value. Zero strikes must reproduce today's pure-idle
results exactly.

Arc positions are deterministic and RNG-free: an arc's reach comes from its kill index
through a golden-ratio spread, so arcs in flight together are separable and the kill-keyed
random stream is untouched.
