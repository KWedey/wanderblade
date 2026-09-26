# Wanderblade

*One blade, one long road, and a world of monsters between you and the portal.*

Wanderblade is a mobile active-forward idle RPG about a lone swordfighter saving sequential fantasy realms from monster-producing portals. The hero builds temporary power on an endless Road, then manually commits that build to a persistent portal guardian whose HP advances online and offline. Victory triggers ascension into the next realm: run power resets, while Ascendancy, economy bonuses, and collection records persist.

The target rhythm is one or two enjoyable 15–30-minute active sessions per day with slower, meaningful offline progress between visits. The game uses a pure deterministic TypeScript engine shared by the client and simulator.

## Status

- **M0/M1a foundation:** implemented — deterministic auto-combat, gold, loot, levels, gear, skills, save/load, offline recap, and the economy simulator.
- **M1b HUD:** implemented — living counters, goal feedback, and Pixel & Parchment styling.
- **M1R active-forward rebaseline:** implemented — Road → Portal Boss → Ascension in core, sim, and client; pending/banked Ascendancy; SRD 5.2.1 boundary. The readiness-gate prototype is gone (Decisions #14–#18).
- **M2 persistence and M3 client:** built — dungeon boss view, momentum and loot arcs, recaps, Ascendancy panel. Save migration chain and real-phone playtests are the open items.
- **Next:** real-phone playtests (M3), then collections and content (M4). See `docs/ROADMAP.md`.

## Quickstart

```bash
npm install
npm run dev            # run the current prototype at http://localhost:5173
npm run dev -- --host  # expose it on the LAN for phone testing
npm run sim            # economy simulator: 3 seeds x 14 days, prints PASS/FAIL per band
npm run verify         # the gate: lint + typecheck + test
npm test               # test suite across core, simulator, and app
npm run typecheck      # strict TypeScript across all workspaces
npm run lint           # eslint: core purity + determinism guards
npm run build          # production build of the app
```

Requires Node ≥ 20.

## Current prototype walkthrough

To play the loop end to end:

1. Run `npm run dev`, then tap or press Space to Strike. Momentum speeds the swing; catching a thrown coin pays extra.
2. Buy hero levels, skills, and gear until the Road reaches its portal.
3. Enter the portal. The guardian keeps its wounds offline; hold the Abandon button to walk away.
4. Win to ascend: the realm resets, Ascendancy banks, and the tree opens.
5. Use the debug time warp (gear icon) to exercise offline reconciliation and the return recap.
6. Add `?stage=mid&seed=7` to the URL to start deep into a run.

## Layout

- `packages/core` — pure deterministic rules: seeded PRNG, event-stepped advancement, serialization, and purchases.
- `sim` — fast-forward economy harness and validators.
- `app` — Vite + TypeScript client.
- `docs` — authoritative vision, design, economy, roadmap, decision history, and SRD provenance policy.
- `docs/superpowers/plans` — implementation plans gated by approved design/economy specifications.

## Documentation

Start with `docs/VISION.md`, then read `docs/DESIGN.md`, `docs/ECONOMY.md`, and `docs/ROADMAP.md`. `docs/DECISIONS.md` preserves superseded choices rather than rewriting history. `docs/SRD-CONTENT.md` defines the SRD 5.2.1 licensing boundary and provenance requirements.
