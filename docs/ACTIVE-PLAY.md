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

| Band | Target |
|---|---|
| Road active (20-min session) vs same span idle | 1.8× – 2.2× gold |
| Boss active vs zero-tap, same build | 1.4× – 1.8× faster |
| 8 h idle return | ≥ 1 meaningful upgrade affordable |
| 24 h idle return | ≥ 1 zone of road progress |
| Realm start → portal available | 2 – 4 h active, 8 – 16 h idle |
| Portal boss duration (prepared build) | 20 – 90 min active |
| Ascend promptly vs farm a ready realm 2× longer | prompt ascension wins |
| Upgrade panel, any moment of Road play | ≥5 priced rows, ≥4 affordable at 95% of looks |

## Determinism

Strikes are explicit timestamped inputs into `advance`, never render-driven. Each is
`{ atSec, aim }`, where `aim` is a point in core's own arc space or `null`. Same state +
same elapsed time + same strike inputs ⇒ byte-identical result. Momentum is engine state
carried on `GameState`, not a display value. Zero strikes must reproduce today's pure-idle
results exactly.

Arc positions are deterministic and RNG-free: an arc's reach comes from its kill index
through a golden-ratio spread, so arcs in flight together are separable and the kill-keyed
random stream is untouched.
