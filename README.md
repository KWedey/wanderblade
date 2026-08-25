# Wanderblade

*One blade, one long road, and a world of monsters between you and the portal.*

Wanderblade is a mobile active-forward idle RPG about a lone swordfighter saving sequential fantasy realms from monster-producing portals. The hero builds temporary power on an endless Road, then manually commits that build to a persistent portal guardian whose HP advances online and offline. Victory triggers ascension into the next realm: run power resets, while Ascendancy, economy bonuses, and collection records persist.

The target rhythm is one or two enjoyable 15–30-minute active sessions per day with slower, meaningful offline progress between visits. The game uses a pure deterministic TypeScript engine shared by the client and simulator.

## Status

- **M0/M1a foundation:** implemented — deterministic auto-combat, gold, loot, levels, gear, skills, save/load, offline recap, and the economy simulator.
- **M1b HUD:** implemented — living counters, goal feedback, and Pixel & Parchment styling.
- **M1R active-forward rebaseline:** documented — Road → Portal Boss → Ascension, pending/banked Ascendancy, reset/persistence rules, SRD 5.2.1 boundary, and a gated implementation plan.
- **Current playable build:** still uses the legacy readiness-gate and auto-challenge prototype. Those mechanics are retained temporarily as implementation history and are superseded by Decisions #14–#18.
- **Next:** active-play design and numeric pacing bands, followed by core/simulator rebaselining. See `docs/ROADMAP.md`.

## Quickstart

```bash
npm install
npm run dev            # run the current prototype at http://localhost:5173
npm run dev -- --host  # expose it on the LAN for phone testing
npm run sim            # run the historical M0 gate-economy simulator
npm run verify         # the gate: lint + typecheck + test
npm test               # test suite across core, simulator, and app
npm run typecheck      # strict TypeScript across all workspaces
npm run lint           # eslint: core purity + determinism guards
npm run build          # production build of the app
```

Requires Node ≥ 20.

## Current prototype walkthrough

The playable app has not yet implemented the approved redesign. To inspect the existing foundation:

1. Run `npm run dev` and watch deterministic auto-combat, gold, DPS, gear, and zone events.
2. Buy hero levels and bounded skill ranks.
3. Use the debug time warp to exercise offline reconciliation and the return recap.
4. Inspect the legacy Readiness/Challenge gate knowing it will be replaced by the persistent portal-boss state.

## Layout

- `packages/core` — pure deterministic rules: seeded PRNG, event-stepped advancement, serialization, and purchases.
- `sim` — fast-forward economy harness and validators.
- `app` — Vite + TypeScript client.
- `docs` — authoritative vision, design, economy, roadmap, decision history, and SRD provenance policy.
- `docs/superpowers/plans` — implementation plans gated by approved design/economy specifications.

## Documentation

Start with `docs/VISION.md`, then read `docs/DESIGN.md`, `docs/ECONOMY.md`, and `docs/ROADMAP.md`. `docs/DECISIONS.md` preserves superseded choices rather than rewriting history. `docs/SRD-CONTENT.md` defines the SRD 5.2.1 licensing boundary and provenance requirements.
