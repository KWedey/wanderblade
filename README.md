# Wanderblade

[![CI](https://github.com/KWedey/wanderblade/actions/workflows/ci.yml/badge.svg?branch=feat/m1r-integration)](https://github.com/KWedey/wanderblade/actions/workflows/ci.yml?query=branch%3Afeat%2Fm1r-integration)

*One blade, one long road, and a world of monsters between you and the portal.*

**[Play it](https://kwedey.github.io/wanderblade/)** in a browser; it is built for a phone. The latest end-to-end test report is at [/report/](https://kwedey.github.io/wanderblade/report/).

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
npm run e2e            # Playwright end-to-end suite (see below)
```

Requires Node ≥ 20.

## Current prototype walkthrough

To play the loop end to end:

1. Run `npm run dev`, then tap or press Space to Strike. Momentum speeds the swing; catching a thrown coin pays extra.
2. Buy hero levels and skills until the Road reaches its portal. Gear drops as you fight.
3. Enter the portal. The guardian keeps its wounds offline; hold the Abandon button to walk away, and it heals to full.
4. Win to ascend: the realm resets, Ascendancy banks, and the tree opens.
5. Use the debug time warp (gear icon) to exercise offline reconciliation and the return recap.
6. Add `?stage=mid&seed=7` to the URL to start deep into a run.

## End-to-end tests

A [Playwright Test](https://playwright.dev) suite in `e2e/` plays the walkthrough above through the real UI.

| Walkthrough step | Spec | What it proves |
| --- | --- | --- |
| 1. Strike | `strike.spec.ts` | Tap and Space both strike; momentum lifts the gold rate, then fades; a sky tap whiffs, a coin tap catches |
| 2. Buy | `shop.spec.ts` | Levels and skills buy and rank up; locked skills unlock; "in ~1m 00s" is honest; Best value buys what it names and hides when nothing is affordable; gear drops |
| 3. Portal and boss | `portal.spec.ts` | The portal opens; striking beats idling; a short press on Abandon does nothing, a full hold walks away, and the guardian heals to full |
| 4. Ascension | `ascension.spec.ts` | Victory lands no later than ten seconds past the panel's own ETA; the realm resets; Ascendancy banks and the tree spends it |
| 5. Offline | `offline.spec.ts` | Cold load, a sleeping tab, and the time warp all reconcile; a cold load and a warp over the same hour agree to the coin; the recap takes keyboard focus |
| 6. Staging | `staging.spec.ts` | `?stage=mid&seed=7` starts deep in a run and never touches the real save; `?seed=` seeds a fresh run |
| Devices | `device.spec.ts` | Each project runs at its promised width and pointer; nothing scrolls sideways |
| Pages | `pages.spec.ts` | The production build loads every asset under `/wanderblade/` and ships no debug bench |

How it stays deterministic:

- **Time** is Playwright's fake clock (`page.clock`), frozen at boot. Specs move it explicitly: `play` fires every tick and frame, `playFast` jumps a minute at a time, `sleep` suspends the tab.
- **Randomness** is seeded: every spec boots `?seed=7`, or `?stage=mid&seed=7` to start deep in a run.
- **Screenshots** cover only DOM panels and dialogs. The world canvas animates on frame timing, so it is asserted through the HUD instead.
- **Baselines** are per platform, because pixel text lands a device pixel apart on macOS and Linux. CI compares the `-linux` files, made in its own image by `npm run e2e:docker`.

Projects:

- `desktop` — Desktop Chrome, 1280px, against the Vite dev server.
- `phone` — Pixel 7 (Chromium, touch), 412px.
- `pages` — the production build at `/wanderblade/`, as GitHub Pages serves it.

```bash
npx playwright install chromium   # once
npm run e2e                       # the whole suite, all three projects
npm run e2e -- --project phone    # one project
E2E_PORT=5401 npm run e2e         # its servers on 5401-5402, if another checkout holds 5287
npm run e2e -- --ui               # watch it play, step by step
npm run e2e:docker                # in CI's Linux image (needs Docker)
npm run e2e:docker -- --update-snapshots   # refresh the -linux screenshot baselines
```

CI runs the suite on every pull request in the pinned Playwright image and uploads the HTML report as the `playwright-report` artifact. On a push to `feat/m1r-integration`, a run that passes every job also deploys the game with that report.

## Layout

- `packages/core` — pure deterministic rules: seeded PRNG, event-stepped advancement, serialization, and purchases.
- `sim` — fast-forward economy harness and validators.
- `app` — Vite + TypeScript client.
- `e2e` — Playwright end-to-end suite; `playwright.config.ts` sits at the root.
- `docs` — authoritative vision, design, economy, roadmap, decision history, and SRD provenance policy.
- `docs/superpowers/plans` — implementation plans gated by approved design/economy specifications.

## Documentation

Start with `docs/VISION.md`, then read `docs/DESIGN.md`, `docs/ECONOMY.md`, and `docs/ROADMAP.md`. `docs/DECISIONS.md` preserves superseded choices rather than rewriting history. `docs/SRD-CONTENT.md` defines the SRD 5.2.1 licensing boundary and provenance requirements.
