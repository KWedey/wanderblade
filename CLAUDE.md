# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Wanderblade (idle_game)

A mobile active-forward idle RPG: a lone wandering swordfighter builds power on monster-filled Roads and commits that build to persistent portal bosses—designed for 15–30-minute active sessions with meaningful offline progress.

**Stack:** TypeScript + web UI (canvas diorama), wrapped with Capacitor for iOS/Android. npm workspaces, Node ≥ 20.
**Current milestone:** M1R — active-forward realm rebaseline. The M0/M1a deterministic foundation and M1b HUD exist; active-play design, simulator rebaselining, and Road → Portal Boss → Ascension implementation are next. See `docs/ROADMAP.md`.

## Commands

```bash
npm install
npm run dev                  # Vite dev server at http://localhost:5173
npm run dev -- --host        # expose on LAN for phone testing
npm run build                # production build of app/
npm run verify               # THE GATE: lint + typecheck + test
npm test                     # vitest across all workspaces (32 files / 556 tests)
npm run typecheck            # tsc --noEmit over core, sim, and app
npm run lint                 # eslint (type-aware); --fix for the autofixable ones
npm run sim                  # economy simulator, default 3 seeds × 10 days
npm run sim -- --days 30 --seeds 5 --csv   # writes sim/out/run-<seed>.csv
npm run sim -- --help        # full flag list
```

QA tools (`tools/qa/`, each takes `--help`; all need a dev server and print the
port they used, defaulting to 5173 or `$WB_QA_PORT`):

```bash
npm run qa:capture -- --label round17   # a judged desktop frame, mid-swing
npm run qa:mobile                       # six phone/desktop viewports: layout, type grid, safe areas
npm run qa:pixels -- <png> <x> <y> <w> <h>   # colour of a crop, in numbers
```

Single test file / single test:

```bash
npx vitest run packages/core/test/determinism.test.ts
npx vitest run -t "split-advance determinism"
npx vitest packages/core/test           # watch mode
```

**The gate is `npm run verify`.** All three stages must pass before any task is complete. `vitest.config.ts` sets only a 180 s `testTimeout` — the long-gap tests replay millions of kills on purpose — and vitest otherwise uses defaults, resolving `@wanderblade/core` through the npm-workspaces symlink, while `tsc` resolves it through `paths` in `app/tsconfig.json` and `sim/tsconfig.json`. Adding a path alias means updating both.

**A fresh worktree needs its own `npm install`.** Without the local `node_modules/@wanderblade/*` symlinks, vitest silently resolves the core from the parent checkout and the tests grade someone else's code; `tsc` and `tsx` do not, because they follow tsconfig `paths`.

**Lint is not a style checker.** `eslint.config.js` polices the two invariants `tsc` cannot express, and nothing else:

- **Determinism** — `Math.random`, `Date.now`, and `performance.now` are banned in `packages/core/src` and `sim/src`. Randomness comes from `createRng`; the clock comes from `GameState.timeSec`. Wall time is an app-layer concern only.
- **Boundaries** — core may not import `node:*` or any workspace package; app and sim may not deep-import `@wanderblade/core/*` past the public index.
- Plus `switch-exhaustiveness-check` over the `GameEvent` union (an explicit `default` opts a switch out) and type-aware `typescript-eslint` recommended rules.

`npm run sim` always exits 0: the harness succeeding is not the same as the pacing targets passing. Read the printed PASS/FAIL summary.

## Architecture

Three workspaces around one pure rules package.

```
packages/core  ──►  app   (Vite client, DOM)
       └────────►  sim   (tsx harness, Node)
```

**`packages/core` — the only place game math lives.** Pure TypeScript, no UI or platform imports. `index.ts` is the entire public surface; app and sim import from `@wanderblade/core` and never reach into `src/` files directly. Internal layering is `types.ts` (dependency-free) → `constants.ts` → `formulas.ts` → `engine.ts`.

**The determinism contract is the load-bearing invariant** (`docs/DECISIONS.md` #6, enforced by `packages/core/test/determinism.test.ts`):

- `advance(s, a + b)` must produce byte-identical state *and* events to `advance(advance(s, a), b)`.
- All randomness flows through the seeded mulberry32 in `rng.ts`, consumed once per kill in kill-index order. The 32-bit stream position lives on `GameState.rngState` so a save reconstructs the stream exactly.
- The clock is event-stepped against an **absolute** `nextActionAtSec` — the next Road kill or the next boss swing, depending on `phase`. A relative "time remaining" carry would drift under float re-accumulation and break split-invariance — do not refactor it into one.
- Strikes are `{ atSec, aim }` inputs merged into that same schedule. Momentum is a lazily-decayed `(value, atSec)` pair, and loot-arc positions are pure functions of stored numbers, so nothing is integrated across an interval and every split sees identical operands.
- Offline progress is not a separate code path. A 10-day gap is the same `advance` call as a live tick, which is why `EVENT_CAP` (50,000) truncates the raw event stream while the aggregate `recap` attached to the returned array stays exact.

**`app` — controller/view split, no game math in either.**

- `main.ts` mounts `#app`, wires `ViewHandlers`, starts the loop. Only module touching the DOM entry point.
- `game.ts` (`Game`) owns `GameState`, drives `advance` on a 250 ms tick, eases the gold count-up, saves every 5 s, and translates state into a `ViewModel`. Detects tab suspension (`SUSPEND_TICK_SEC`) and treats it as offline.
- `view.ts` builds DOM once, then paints from the plain `ViewModel`. Owns no state.
- `save.ts` wraps the core's serialized string in a versioned envelope with a wall-clock `savedAt`; a cold load computes the offline gap from it. Loads are validated field-by-field — a malformed save is discarded, not trusted.
- `flavor.ts` / `format.ts` / `anim.ts` are display-only. Naming, number formatting, and interpolation never feed back into the economy (`docs/DECISIONS.md` #12).

**`sim` — the economy evidence, consuming the same core.** `run.ts` → `simulate.ts` runs a deterministic bot (`bot.ts`) per seed, `collector.ts` records milestones, `validators.ts` holds the numbered PASS/FAIL pacing validators from `docs/ECONOMY.md`, `format.ts` prints the report and CSV. The simulator reports honest results; it never tunes constants.

**The readiness-gate prototype is gone.** `GateState`, `readiness`, `challengeBoss`, and `autoChallengeReadiness` were deleted in M1R.3; the core is Road → Portal Boss → Ascension per Decisions #14–#18, with the active layer in #19–#25. `packages/core/test/phase.test.ts` is what replaced the old gate/boss/auto-challenge tests.

## Source of truth

`docs/` is authoritative and must evolve with the code:

- `docs/VISION.md` — the fantasy, pillars, anti-goals
- `docs/DESIGN.md` — systems, screens, open questions
- `docs/ECONOMY.md` — formulas, pacing targets, simulator contract
- `docs/ROADMAP.md` — milestones; keep checkboxes current
- `docs/DECISIONS.md` — ADR log; add an entry when a decision lands, supersede rather than edit history
- `docs/SRD-CONTENT.md` — SRD 5.2.1 licensing boundary, attribution, and monster provenance roster
- `docs/superpowers/plans/` — implementation plans, gated by approved design/economy specs

## Design guardrails (binding — from explicit user corrections)

1. The player IS the hero — one growing character. Never a manager, never a base/town to run.
2. Heroic adventure tone — vibrant and dangerous. Never grimdark, never cozy-cute.
3. Classic idle RPG structure, excellently executed — no gimmick-led design.
4. Active sessions target 15–30 minutes once or twice daily. Active play is fun and materially faster; idle-only play remains meaningfully productive at a slower rate.
5. Numbers-go-up + collection/mastery (Bestiary, gear sets, zone stars) are the twin dopamine engines.
6. The hero occupies exactly one phase: Road or Portal Boss. Portal entry is manual; boss progress persists offline, grants no income, has no failure timer, and victory triggers realm ascension.
7. Ascension resets gold, level, gear, temporary upgrades, and road position. Banked Ascendancy, its tree, realm-completion earnings bonuses, and collection records persist.
8. Automatic realm bonuses accelerate gold and passive earnings only. Persistent combat power must be explicit in Ascendancy skills/passives.
9. D&D-inspired monsters must come from the SRD 5.2.1 CC-BY-4.0 whitelist with provenance and attribution; Wanderblade art, lore, stats, and encounters remain original.

## Engineering conventions

- Game rules live in `packages/core` — pure TypeScript, deterministic, no UI or platform imports. All randomness flows through a seeded, injectable PRNG keyed to kill index (DECISIONS.md #6). The game client and `sim/` both consume it; offline progress and live play must produce identical results from the same inputs.
- Economy constants change only alongside a sim run that passes the pacing targets in `docs/ECONOMY.md`. Quote the seeds and the PASS/FAIL summary in the commit.
- TypeScript strict mode, plus `noUncheckedIndexedAccess` and `noFallthroughCasesInSwitch` (`tsconfig.base.json`). Type-check must pass before any task is called complete.
- New core behavior needs a determinism test alongside the behavior test — split-invariance is the thing that silently regresses.
