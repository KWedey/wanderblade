# Wanderblade — Active Play Specification

Closes the M1R.2 design gate. Chosen against the reference bar (Idle Slayer): one primary
input, immediately legible, materially valuable, bounded, and identical in both phases.

## The single input

**Strike** — tap (touch), click, or hold `Space` / `Enter`. One input for the whole game.
Every active mechanic below is expressed through it. No second verb in v1.

## Road: Momentum + Loot Arcs

**Momentum.** Each Strike lands an extra swing and adds momentum. Momentum multiplies
attack speed and gold. It decays continuously toward zero when input stops.

- `momentum ∈ [0, 1]`, multiplier `= 1 + MOMENTUM_MAX_BONUS · momentum`
- Gain per strike: `MOMENTUM_PER_STRIKE` (default 0.10)
- Decay: exponential, half-life `MOMENTUM_HALF_LIFE_SEC` (default 2.0) → effectively zero ~6 s after last input
- `MOMENTUM_MAX_BONUS` default 1.2 (so ×1.0 idle → ×2.2 at full momentum)
- Sustaining full momentum requires ~4 strikes/sec. Cap is reachable but not restful; that is the point.

**Loot Arcs.** Every kill flings its gold (and any gear drop) on a visible arc across the
scene. An arc that lands uncaught still credits **full base value** — idle loses nothing.
Striking an arc mid-flight **catches** it for `ARC_CATCH_MULT` (default 2.0) and adds
momentum. Gear arcs caught in flight roll one extra rarity tier.

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

## Determinism

Strikes are explicit timestamped inputs into `advance`, never render-driven. Same state +
same elapsed time + same strike timestamps ⇒ byte-identical result. Momentum is engine
state carried on `GameState`, not a display value. Zero strikes must reproduce today's
pure-idle results exactly.
