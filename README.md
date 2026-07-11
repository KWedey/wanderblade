# Wanderblade

*One blade, one long road, and a whole realm of monsters between you and legend.*

A mobile idle RPG proof of concept: a lone wandering swordfighter auto-battles across a transforming fantasy realm (Greenwood → World's Edge, 7 regions), earning loot and levels and pushing through region **boss gates**. Built for 30–90 second check-ins with **offline progress** as the core hook. TypeScript monorepo; the game rules are a pure, deterministic, seeded engine shared by the playable app and the economy simulator — offline progress and live play run the same code path.

## Status

- **M0 (economy simulator): complete** — all six pacing targets PASS across 3 seeds × 10 simulated days (`npm run sim`).
- **M1a (playable minimal-UI loop): playable now** — auto-battle, gold/loot, hero levels, bounded skills, auto-equip gear, boss gates with a Readiness meter, offline "Back on the Road" recap.
- Next: M1b road renderer + Road Play. See `docs/ROADMAP.md`.

## Quickstart

```bash
npm install
npm run dev            # play the app at http://localhost:5173
npm run dev -- --host  # expose on your LAN to open it on a real phone
npm run sim            # run the economy simulator (prints M0 PASS/FAIL table)
npm test               # test suite across core + sim
npm run typecheck      # strict TS, all three packages
npm run build          # production build of the app
```

Requires Node ≥ 20 (Vite 6 / Vitest 3).

## Demo script (30 seconds)

1. `npm run dev`, open the app — the hero auto-battles on its own; gold and DPS climb while loot and zone/region events stream into the **On the Road** log.
2. Tap the glowing **Hero Level** / skill buttons to spend gold; watch the numbers jump.
3. Open the **gear icon (bottom-right corner)** → **Time-warp +8h** to trigger the **"Back on the Road"** offline recap — this is the core pitch: the hero kept walking while you were away.
4. When the hero parks at a boss **Gate**, the Readiness meter fills as gear is farmed; hit **Challenge** when it glows Ready.
5. **Reset save** in the debug drawer starts a fresh run.

## Layout

- `packages/core` — pure, deterministic game rules (seeded PRNG, event-stepped engine). No UI or platform imports.
- `sim` — fast-forward economy harness + pacing validators (`npm run sim -- --help` for flags).
- `app` — Vite + TypeScript playable client (single-screen minimal UI; the M1b renderer comes later).
- `docs` — the authoritative spec: VISION, DESIGN, ECONOMY, ROADMAP, DECISIONS.

## Docs

Start with `docs/VISION.md` (the fantasy and pillars), then `docs/DESIGN.md` (systems) and `docs/ECONOMY.md` (the math and the simulator contract). `docs/DECISIONS.md` records every design decision and why.
