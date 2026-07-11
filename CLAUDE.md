# Wanderblade (idle_game)

A mobile idle RPG: a lone wandering swordfighter crosses a transforming fantasy realm on foot — auto-battle, loot, upgrades, region bosses — built for 30–90 second check-ins with offline progress at its heart.

**Stack:** TypeScript + web UI (canvas diorama), wrapped with Capacitor for iOS/Android.
**Current milestone:** M1 — M0 (economy sim) complete with all pacing targets passing; M1a (playable minimal-UI loop) built; M1b (road renderer + Road Play) next. See `docs/ROADMAP.md`.

## Source of truth

`docs/` is authoritative and must evolve with the code:

- `docs/VISION.md` — the fantasy, pillars, anti-goals
- `docs/DESIGN.md` — systems, screens, open questions
- `docs/ECONOMY.md` — formulas, pacing targets, simulator contract
- `docs/ROADMAP.md` — milestones; keep checkboxes current
- `docs/DECISIONS.md` — ADR log; add an entry when a decision lands, supersede rather than edit history

## Design guardrails (binding — from explicit user corrections)

1. The player IS the hero — one growing character. Never a manager, never a base/town to run.
2. Heroic adventure tone — vibrant and dangerous. Never grimdark, never cozy-cute.
3. Classic idle RPG structure, excellently executed — no gimmick-led design.
4. Check-ins stay light: 30–90 s, no loadout math, no spreadsheet min-maxing.
5. Numbers-go-up + collection/mastery (Bestiary, gear sets, zone stars) are the twin dopamine engines.
6. Active play (Road Play, boss challenges) is always an optional, live-only, additive bonus — the idle baseline must hit every pacing target with zero taps.

## Engineering conventions

- Game rules live in `packages/core` — pure TypeScript, deterministic, no UI or platform imports. All randomness flows through a seeded, injectable PRNG keyed to kill index (DECISIONS.md #6). The game client and `sim/` both consume it; offline progress and live play must produce identical results from the same inputs.
- Economy constants change only alongside a sim run that passes the pacing targets in `docs/ECONOMY.md`.
- TypeScript strict mode; type-check must pass before any task is called complete.
