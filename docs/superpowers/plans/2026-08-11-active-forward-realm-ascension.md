# Active-Forward Gameplay Prototype Implementation Roadmap

> **Superseded.** This plan was not executed checkpoint by checkpoint. The work it
> describes landed as ADRs #19–#61 in `docs/DECISIONS.md`, and `docs/ROADMAP.md`
> records what is done. The evidence ledger below is left as written; "Not started"
> means the checkpoint was never run as a checkpoint, not that the work is missing.

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans`. Complete one numbered checkpoint per session unless its stop condition explicitly says otherwise. Update only that checkpoint and the evidence ledger.

**Goal:** Deliver a playable, deterministic Road → persistent Portal Boss → Ascension prototype in which 15–30 minutes of active play is fun and materially faster, idle play remains worthwhile, and every product/economy claim has automated and human evidence.

**Architecture:** `packages/core` owns versioned rules, state, time, player commands, queries, events, summaries, and seeded randomness. The simulator and app consume the same public protocol. Product mechanics and numeric targets are approved before code; core correctness precedes tuning; the simulator must pass before client integration; browser and phone playtests close the prototype.

**Stack:** strict TypeScript, Vitest, npm workspaces, Vite, DOM/canvas client, browser `localStorage`, and a dev-only Playwright smoke harness added after the simulator gate. Production Capacitor packaging remains later work.

## Checkpoint contract

Every checkpoint must be designed/implemented, tested, human-reviewed, and committed in one focused session. Completion requires:

1. The listed deliverable exists and no unrelated behavior changed.
2. The targeted command passes, followed by root `npm run typecheck` for every code checkpoint.
3. A human performs and records the listed evaluation.
4. The checkpoint lands as one isolated commit using the suggested message.

No checkpoint may leave another workspace uncompilable. Introduce V2 as a distinctly named parallel export family, migrate every consumer, then delete legacy exports near the end. Stop on a red test, missing review evidence, unapproved economy change, unresolved medium-or-higher finding, or unmet stop gate.

After Checkpoint 31, “full automated gate” means these commands, in order: `npm run typecheck`; `npm test`; `npm run build`; the canonical simulator command frozen in `PACING-TARGETS.md`; `npm run test:e2e`. `npm run test:e2e:install` is environment setup, not a per-commit gate.

| Checkpoint | Commit SHA | Automated evidence | Human evidence | Status |
|---|---|---|---|---|
| 01 | — | — | — | Not started |
| 02 | — | — | — | Not started |
| 03 | — | — | — | Not started |
| 04 | — | — | — | Not started |
| 05 | — | — | — | Not started |
| 06 | — | — | — | Not started |
| 07 | — | — | — | Not started |
| 08 | — | — | — | Not started |
| 09 | — | — | — | Not started |
| 10 | — | — | — | Not started |
| 11 | — | — | — | Not started |
| 12 | — | — | — | Not started |
| 13 | — | — | — | Not started |
| 14 | — | — | — | Not started |
| 15 | — | — | — | Not started |
| 16 | — | — | — | Not started |
| 17 | — | — | — | Not started |
| 18 | — | — | — | Not started |
| 19 | — | — | — | Not started |
| 20 | — | — | — | Not started |
| 21 | — | — | — | Not started |
| 22 | — | — | — | Not started |
| 23 | — | — | — | Not started |
| 24 | — | — | — | Not started |
| 25 | — | — | — | Not started |
| 26 | — | — | — | Not started |
| 27 | — | — | — | Not started |
| 28 | — | — | — | Not started |
| 29 | — | — | — | Not started |
| 30 | — | — | — | Not started |
| 31 | — | — | — | Not started |
| 32 | — | — | — | Not started |
| 33 | — | — | — | Not started |
| 34 | — | — | — | Not started |
| 35 | — | — | — | Not started |
| 36 | — | — | — | Not started |
| 37 | — | — | — | Not started |
| 38 | — | — | — | Not started |
| 39 | — | — | — | Not started |
| 40 | — | — | — | Not started |
| 41 | — | — | — | Not started |
| 42 | — | — | — | Not started |
| 43 | — | — | — | Not started |
| 44 | — | — | — | Not started |
| 45 | — | — | — | Not started |
| 46 | — | — | — | Not started |
| 47 | — | — | — | Not started |

## Binding constraints

- One hero; heroic and vibrant; no management layer.
- Exactly one persisted phase: `road` or `portalBoss`; ascension is an atomic transition.
- Portal entry is always manual. Elapsed time never enters a portal.
- Road is the only income/build phase. Boss combat produces damage and nothing else.
- Boss HP persists live, offline, and across reload; no death, enrage, failure timer, cooldown, or involuntary exit.
- Abandonment loses boss damage only and returns to the same portal-ready Road/build.
- Victory banks and rewards once, resets temporary state, preserves permanent/global state, unlocks the next realm, and applies leftover elapsed time to its Road.
- Realm-completion bonuses affect gold/passive earnings only; persistent combat power is explicit Ascendancy-node power.
- Identical state, time, rules, and timestamped commands produce identical results regardless of live/offline/frame grouping.
- SRD-derived names/content require `docs/SRD-CONTENT.md` provenance; Wanderblade mechanics, stats, art, and lore remain original.
- Economy constants change only with a recorded passing canonical simulator run.
- On portal entry, freeze the remaining Road-event delay. Abandonment rebases that delay from the current Boss exit timestamp; ascension discards it and initializes the next realm's Road schedule. No stale absolute Road event may fire during or immediately after Boss mode.

## Current seams

| Area | Legacy seam to replace |
|---|---|
| Core state | `packages/core/src/types.ts:28-81` — flat state plus `GateState` |
| Core loop | `packages/core/src/engine.ts:150-349` — readiness, gate farming, auto-challenge, instant boss |
| Formulas/constants | `packages/core/src/formulas.ts:31-90`; `constants.ts:100-148` — 30-second readiness/enrage/retry assumptions |
| Simulator | `sim/src/{bot,simulate,collector,validators}.ts` — legacy gate economy |
| Save/controller | `app/src/{save,game}.ts` — v1 flat state and Challenge/readiness API |
| View | `app/src/view.ts:35-203` — one Road/gate screen |
| Tests | `packages/core/test/{boss,gate,autochallenge}.test.ts` — superseded behavior |

## Implementation file map

| Checkpoint | Create | Modify/test |
|---|---|---|
| 07 | `packages/core/src/rules.ts`, `packages/core/test/rules.test.ts` | `packages/core/src/index.ts` |
| 08 | `packages/core/src/{realm-types,realm-engine}.ts`, `packages/core/test/state-model.test.ts` | `packages/core/src/index.ts`; legacy `types.ts`/`engine.ts` remain unchanged |
| 09 | `packages/core/src/{timeline,actions}.ts`, `packages/core/test/timeline.test.ts` | `packages/core/src/{realm-types,realm-engine,index}.ts` |
| 10 | `packages/core/test/portal-entry.test.ts` | V2 actions/realm engine/types/rules |
| 11 | `packages/core/test/portal-boss.test.ts` | V2 realm engine/types/formulas |
| 12 | `packages/core/test/boss-active-input.test.ts` | V2 actions/timeline/realm engine/types |
| 13 | `packages/core/test/road-active-input.test.ts` | V2 actions/timeline/realm engine/types |
| 14 | `packages/core/test/boss-abandon.test.ts` | V2 actions/timeline/realm types |
| 15 | `packages/core/test/ascension.test.ts` | V2 realm engine/types/formulas |
| 16 | `packages/core/test/ascendancy-tree.test.ts` | V2 actions/rules/formulas/types |
| 17 | `packages/core/src/migrate.ts`, `packages/core/test/migrate.test.ts`, migration fixtures | V2 realm exports and serialization tests |
| 18 | `packages/core/test/road-earnings.test.ts` | V2 realm engine/rules/formulas/types |
| 19 | `packages/core/test/temporary-purchases.test.ts` | V2 actions/timeline/rules/types |
| 20–21 | — | `sim/src/{types,bot,simulate}.ts`, `sim/test/sim.test.ts` |
| 22 | — | `sim/src/types.ts`, `sim/test/sim.test.ts` |
| 23 | — | `sim/src/{collector,types}.ts`, `sim/test/sim.test.ts` |
| 24 | — | `sim/src/{format,run,types}.ts`, `sim/test/sim.test.ts` |
| 25–26 | validator fixtures | `sim/src/{validators,types,format}.ts`, `sim/test/sim.test.ts` |
| 27–30 | simulator regression fixtures as needed | `packages/core/src/{rules,constants,formulas}.ts`, `sim/test/sim.test.ts`, `docs/ECONOMY.md` |
| 31 | `playwright.config.ts`, `app/test/browser/smoke.spec.ts`, `app/src/runtime.ts` | `package.json`, `package-lock.json`, `app/src/game.ts` |
| 32 | save/migration fixtures | `app/src/save.ts`, `app/test/save.test.ts` |
| 33 | `app/test/game.test.ts` | `app/src/game.ts` |
| 34 | focused ViewModel tests | `app/src/{game,view}.ts` |
| 35 | active-Road browser/unit tests | `app/src/{game,view,main}.ts`, `app/src/styles.css` |
| 36 | `docs/playtests/m1r-road-active.md` | presentation fixes only when evidence requires them |
| 37–41 | focused browser/unit tests per feature | `app/src/{game,view,main}.ts`, `app/src/styles.css` |
| 42 | — | legacy `packages/core` sources/exports/tests from the removal inventory |
| 43 | — | legacy `sim`/`app` sources/types/tests from the removal inventory |
| 44 | `app/test/browser/active-realm.spec.ts` | deterministic browser fixtures |
| 45 | `docs/playtests/m1r-prototype-audit.md` | requirements evidence links and fixes |
| 46 | `docs/playtests/m1r-active-forward-phone-playtest.md` | presentation fixes only when evidence requires them |
| 47 | — | `docs/{ROADMAP,ECONOMY}.md`; append `docs/DECISIONS.md` only for new decisions |

---

## Phase A — Approve mechanics and measurable targets

No implementation begins until Checkpoint 06 is approved.

### Checkpoint 01: Requirements and evidence matrix

**Plan:** Create `docs/active-gameplay/REQUIREMENTS.md`. Give each binding rule a stable `PHASE-*`, `ROAD-*`, `BOSS-*`, `ASC-*`, `DET-*`, `ACC-*`, or `SRD-*` ID; cite exact authoritative lines; assign a future core test, simulator validator, client proof, and human scenario. Inventory superseded readiness/auto-challenge/New Road/Legend/fixed-Glints behavior.

**Success:** Every constraint has a proof owner. `npm run typecheck`, `npm test`, and `npm run build` pass on the baseline and are recorded with date/SHA.

**Human evaluation:** Reviewer samples five rows and reaches authoritative text plus a later proof without guessing. No unresolved “TBD,” “appropriate,” “meaningful,” or “works.”

**Commit:** `docs: map active gameplay requirements`

### Checkpoint 02: Select the active Road mechanic set

**Plan:** Create `docs/active-gameplay/ROAD-ACTIVE-SPEC.md`. Compare exactly three cohesive options, including a zero-new-mechanic control. Document each 15/20/30-minute arc, cadence, reward, failure/expiry, deterministic command payload, accessibility, abuse cap, cognitive load, and continuation pull. Select the smallest prototype set and define exact commands, eligibility, caps, effects, and feedback.

**Success:** The selection uses explicit timestamps, never frame/animation timing; missed actions never reduce idle baseline; rewards are visible within 15 minutes and remain Road income.

**Human evaluation:** Reviewer role-plays 15 minutes and counts actions/decisions without inventing rules; scores agency, repetition risk, phone ergonomics, determinism, and idle fairness 1–5, with all ≥3.

**Commit:** `docs: select active road gameplay`

### Checkpoint 03: Approve Boss input and accessibility

**Plan:** Create `docs/active-gameplay/BOSS-ACTIVE-SPEC.md`. Define pointer/tap commands, timestamp normalization, effect/cap/decay, multitouch, visibility/background behavior, feedback, and rejection rules. Define a keyboard/switch-friendly equivalent sharing the same effect budget. Define preview information and abandon protection.

**Success:** Inputs cannot stack beyond one cap or affect Road resources; entry and abandonment require explicit final commands.

**Human evaluation:** Reviewer traces normal, spam, two-finger, low-FPS, accessibility, hide/show, and focus-restoration cases to exact outcomes. Written mappings require no unlisted gesture.

**Commit:** `docs: define boss input and accessibility`

### Checkpoint 04: Approve pacing bands and player policies

**Plan:** Create `docs/active-gameplay/PACING-TARGETS.md`; update `docs/ECONOMY.md`. Set exact bands for portal timing, 8h/24h Road returns, 15/20/30-minute Road uplift, prepared/underprepared/overprepared Boss duration, Boss active uplift, Road/Boss Ascendancy share, purchase cadence, prompt ascension vs overfarming, and decisions/session. Define seeds, realms, schedules, policies, percentiles, and one canonical command.

**Success:** Every qualitative target in `docs/ECONOMY.md:63-78` has a value, unit, population, and boundary rule; idle, active, mixed, and accessibility policies are separate.

**Human evaluation:** Reviewer hand-checks one example and both boundaries for each band; active is visibly faster while 24h idle yields nonzero progress in both phases.

**Commit:** `docs: approve active economy targets`

### Checkpoint 05: Resolve progression and safety policy

**Plan:** Create `docs/active-gameplay/PROGRESSION-SPEC.md`. Decide realm configuration/version identity, portal conditions, boss HP/build snapshot, pending accrual, payout, prototype nodes, earnings-bonus stacking, overfarming curve, save migration, clock rollback, safe elapsed chunking, numerical caps, and leftover-time behavior. Freeze the Road's remaining time-to-next-event at portal entry; on abandonment rebase it from Boss exit time, while victory discards it and initializes the next realm schedule. Decision #8’s uncapped earnings remains default unless a new ADR supersedes it; distinguish earnings cap from technical chunking. Limit prototype collections to realm-completion identity unless explicitly expanded.

**Success:** Portal/realm behavior is data-driven; reset/persistence names every field; legacy gate saves never become Boss saves; earnings bonus and collections are absent from DPS.

**Human evaluation:** Reviewer walks normal victory, abandon, offline victory, migration, three node costs, and three realm bonuses with exact values and no ambiguity.

**Commit:** `docs: resolve realm progression policies`

### Checkpoint 06: Specification audit and freeze

**Plan:** Create `docs/active-gameplay/SPEC-AUDIT.md`. Audit 01–05 for placeholders, contradictions, inaccessible input, nondeterministic timing, hidden power, missing abuse limits, and untestable claims. Link approved specs from `DESIGN.md`, `ECONOMY.md`, and `ROADMAP.md`; append ADRs; freeze `M1R-ACTIVE-1`.

**Success:** Placeholder scan is clean; every matrix row has an approved rule/proof; independent verdict is `APPROVE` with all blockers closed.

**Human evaluation:** Fresh reviewer narrates a full Road session, entry, Boss session, abandon, offline return, victory, and next-realm reset using docs only. Stop if a mechanic/number must be invented.

**Commit:** `docs: approve active gameplay specification`

---

## Phase B — Build a versioned deterministic core beside legacy

### Checkpoint 07: Versioned rules and authoritative preview queries

**Files:** create `packages/core/src/rules.ts`, `packages/core/test/rules.test.ts`; modify `index.ts`.

**Plan:** Define versioned `GameRules`/`RealmConfig`, validation, deterministic lookup, save identity/hash, portal condition, boss formula inputs, and pure `getPortalPreview`/`estimateBossDuration` queries. App/sim may not reproduce these formulas.

**Success:** Valid/invalid configs and three preview fixtures pass; config identity is stable; targeted tests and root typecheck pass.

**Human evaluation:** Reviewer can add a second realm by data only and reconcile preview math by hand.

**Commit:** `feat(core): define versioned realm rules`

### Checkpoint 08: Parallel V2 state boundary

**Files:** create `packages/core/src/realm-types.ts`, `realm-engine.ts`, `packages/core/test/state-model.test.ts`; modify `index.ts` only to add exports.

**Plan:** Add `RealmGameState`, `createRealmState`, `advanceRealmTimeline`, and `serializeRealmState` under distinct V2 names. Keep legacy `GameState`, `initialState`, `advance`, `buyHeroLevel`, `buySkill`, and `challengeBoss` exports and implementations unchanged for current app/sim consumers. V2 owns `road`/`portalBoss`, run/persistent partitions, rules identity, Ascendancy, and minimal completion records. V2 may call pure existing formulas, but legacy code never calls or mutates V2.

**Success:** Existing app/sim compile unchanged; invalid V2 mode payloads are rejected; V2 initializes on Road and preserves RNG/kill sequence; targeted tests, full existing tests, and root typecheck pass.

**Human evaluation:** Reviewer verifies the two export families are distinct, dependency direction is V2→shared pure helpers only, and the legacy family is deleted only in Checkpoints 42–43 after every consumer uses V2.

**Commit:** `feat(core): introduce active realm state v2`

### Checkpoint 09: Canonical timeline and command protocol

**Files:** create `packages/core/src/timeline.ts`, `actions.ts`, `packages/core/test/timeline.test.ts`; modify `realm-types.ts`, `realm-engine.ts`, `index.ts`.

**Plan:** Define discriminated `GameAction`, `ActionResult { accepted, reason, events }`, absolute timestamp validation, and stable same-time ordering among passive events, purchases, active commands, entry, abandon, and victory. Define `advanceTimeline` output with exact aggregate summaries when granular events reach `EVENT_CAP`.

**Success:** Boundary, equal-time, stale/future, chunking, and event-cap fixtures pass; summaries preserve required metrics; root typecheck passes.

**Human evaluation:** Reviewer replays one equal-timestamp trace and one capped offline trace and reconciles state, event order, summary, and rejection reason.

**Commit:** `feat(core): define deterministic command timeline`

### Checkpoint 10: Portal availability and manual entry command

**Plan:** Replace gate formation inside V2 with rule-driven `portalAvailable`; implement portal-entry action through the command protocol and committed-build snapshot. Persist `roadEventDelayRemainingSec = nextRoadEventAtSec - entryAtSec`, then suspend Road scheduling. Rejections return reasons without mutation.

**Success:** Not-ready→ready is split-invariant; portal-ready Road can farm indefinitely; no `advanceRealmTimeline` call auto-enters; frozen delay is exact at three entry offsets; targeted tests/root typecheck pass.

**Human evaluation:** Reviewer searches all production callers and finds entry only through explicit adapters; snapshot matches approved fields.

**Commit:** `feat(core): add manual portal entry`

### Checkpoint 11: Passive persistent Boss advancement

**Plan:** Add Boss-mode event stepping and base attacks. Boss path must not execute Road kills, RNG draws, movement, rewards, purchases, or collection events. Clamp before victory until Checkpoint 15.

**Success:** Long vs split advance and online vs offline are byte-equal; Road/RNG snapshot is unchanged; targeted tests/root typecheck pass.

**Human evaluation:** Reviewer reconciles damage at three DPS/HP fixtures and sees damage/time-only events.

**Commit:** `feat(core): persist passive boss damage`

### Checkpoint 12: Deterministic active Boss commands

**Plan:** Implement tap and accessibility commands via the shared timeline/effect budget; enforce cap, decay, timestamp, visibility, duplicate, and multitouch rules.

**Success:** Identical traces under 30/60/irregular frames serialize equally; spam cannot exceed cap; only approved Boss fields change; targeted tests/root typecheck pass.

**Human evaluation:** Reviewer hand-replays canonical 10-second pointer and accessibility traces and gets equal capped benefit.

**Commit:** `feat(core): add bounded boss activity`

### Checkpoint 13: Deterministic active Road commands

**Plan:** Implement spec-defined Road variants through the same command timeline. Effects must flow through normal Road progression/reward paths, not direct client/sim multipliers.

**Success:** Canonical 15/20/30-minute traces are deterministic; chunking is byte-equal; zero commands equals unchanged idle baseline; targeted tests/root typecheck pass.

**Human evaluation:** Reviewer reconciles one trace’s eligibility, cap, effects, and feedback; repo search finds no alternate active multiplier.

**Commit:** `feat(core): add active road commands`

### Checkpoint 14: Boss abandonment command

**Plan:** Implement explicit abandonment through the protocol. Restore the same realm/position/build/gold/pending/portal-ready Road; discard only boss HP/activity progress. Rebase `nextRoadEventAtSec = abandonAtSec + roadEventDelayRemainingSec` so no Boss time becomes Road kill progress.

**Success:** Field-matrix fixture and entry-at-25%/75%-kill-progress rebasing fixtures pass; no stale event fires at exit; no bank/reward/unlock/RNG event; rejection is immutable; targeted tests/root typecheck pass.

**Human evaluation:** Serialized pre-entry Road and post-abandon states differ only in approved time/metadata; re-entry starts full HP.

**Commit:** `feat(core): add boss abandonment`

### Checkpoint 15: Atomic idempotent ascension

**Plan:** At exact kill timestamp, add payout, bank pending once, record completion identity, increment earnings bonus once, unlock/reset, preserve permanent/global state, discard the prior realm's frozen Road delay, initialize a fresh next-realm Road event schedule, and process leftover elapsed time.

**Success:** Full matrix, zero pending, reload/retry, duplicate advancement, and multi-realm tests pass; targeted tests/root typecheck pass.

**Human evaluation:** Reviewer sees one ordered transaction and hand-matches every before/after value.

**Commit:** `feat(core): resolve atomic realm ascension`

### Checkpoint 16: Banked Ascendancy purchases and power separation

**Plan:** Add approved nodes/costs/effects through purchase commands. Road-only; banked-only; explicit combat/economy effect paths.

**Success:** Success/failure/prerequisite/rank/Boss-mode tests pass; earnings bonus/completion records cannot change DPS; targeted tests/root typecheck pass.

**Human evaluation:** Reviewer calculates first three purchases and searches `heroDps` inputs for only temporary build plus explicit combat nodes.

**Commit:** `feat(core): add ascendancy progression`

### Checkpoint 17: Typed serialization and migration result

**Files:** create `migrate.ts`, fixtures, `migrate.test.ts`; modify serialization exports.

**Plan:** Define `ParseResult = { ok: true; state } | { ok: false; code; message }`. Validate current Road/partial Boss plus legacy Road/gate; reject malformed, non-finite, invalid rules identity, and invalid discriminants. Never infer portal entry.

**Success:** Both variants round-trip; fixtures have exact result; repeat migration is stable; pre-victory reload remains idempotent; targeted tests/root typecheck pass.

**Human evaluation:** Reviewer maps each fixture to policy and gets an actionable typed failure, never a cast/unspecified throw.

**Commit:** `feat(core): migrate active realm state`

### Checkpoint 18: Road pending accrual and realm income bonus

**Plan:** Implement approved pending-Ascendancy accrual through ordinary/active Road reward paths and apply the persistent realm-completion bonus to approved gold/passive earnings paths. Boss combat and collection identity produce neither. Keep the bonus absent from DPS.

**Success:** Ordinary/active/8h-offline Road fixtures match formulas; Boss before/after snapshots show no accrual; first three completion levels scale allowed income only; targeted tests/root typecheck pass.

**Human evaluation:** Reviewer hand-reconciles one kill, one active reward, and one offline interval before/after a realm bonus, then confirms identical DPS.

**Commit:** `feat(core): add road ascendancy earnings`

### Checkpoint 19: Temporary Road purchase commands

**Plan:** Move hero-level and temporary-skill purchases into V2 `GameAction` variants with timestamp/order/rejection results. Purchases are Road-only and use authoritative rules; leave legacy buy exports untouched until migration.

**Success:** Valid, unaffordable, Boss-mode, stale, equal-timestamp, and no-mutation rejection tests pass; simulator can use public V2 commands only; targeted tests/root typecheck pass.

**Human evaluation:** Reviewer verifies each temporary purchase has one V2 command path and no V2 consumer directly mutates gold/level/skill ranks.

**Commit:** `feat(core): route temporary purchases through commands`

---

## Phase C — Rebuild and approve the simulator

### Checkpoint 20: Idle and decision policies

**Plan:** Define deterministic Road-idle, Boss-idle, manual-entry, purchase, and abandon schedules using public commands only; support multi-realm runs.

**Success:** Same seed/rules/policy is identical; no unscheduled entry/activity; underprepared abandon returns correctly; tests/root typecheck pass.

**Human evaluation:** Reviewer matches every command timestamp in one policy log.

**Commit:** `feat(sim): model idle realm policies`

### Checkpoint 21: Active policies

**Plan:** Add 15/20/30-minute Road traces, Boss pointer/accessibility traces, and one-/two-session mixed schedules; enforce budgets.

**Success:** No policy exceeds time/action caps; accessibility stays within approved tolerance; chunking is deterministic; tests/root typecheck pass.

**Human evaluation:** Reviewer compares counts/cadence to specs and finds no unmodeled multiplier.

**Commit:** `feat(sim): model active gameplay policies`

### Checkpoint 22: Metric schema

**Plan:** Define typed realm/phase, active time/actions, income, gear/purchases, pending/banked, nodes, preview, Boss HP/duration, abandon, victory/reset, and bonus metrics.

**Success:** Schema accounts for every requirements-matrix measurement with units and ownership; type-level fixture/root typecheck pass.

**Human evaluation:** Reviewer maps every pacing band and correctness rule to a metric without overloading meanings.

**Commit:** `feat(sim): define active realm metrics`

### Checkpoint 23: Collector and reconciliation integrity

**Plan:** Collect metrics from command/timeline events and aggregate summaries; reject contradictory order, missing aggregates, double counts, and non-finite values.

**Success:** Golden complete-realm fixture reconciles every delta once; phase durations total elapsed time; capped/uncapped event streams summarize identically; tests/root typecheck pass.

**Human evaluation:** Reviewer reconciles one realm from log to metric object with zero unexplained deltas.

**Commit:** `feat(sim): collect realm evidence`

### Checkpoint 24: Human and machine simulator output

**Plan:** Emit stable JSON plus concise tables and exit codes from `format.ts`/`run.ts`; include rules/spec version and seed/config.

**Success:** Golden JSON/table fixtures pass; invalid/missing metrics cannot print a false PASS; tests/root typecheck pass.

**Human evaluation:** Reviewer can distinguish Road income, Boss damage, active time, and validator failures without source access.

**Commit:** `feat(sim): report active realm evidence`

### Checkpoint 25: Correctness validators with mutation tests

**Plan:** Encode manual entry, zero Boss income, online/offline equivalence, identical-input equivalence, abandonment isolation, exactly-once victory, leftover time, and power-source separation. Each yields name, value, expected rule, pass, diagnostic.

**Success:** One mutation fixture per invariant makes exactly its validator fail; normal multi-seed run passes correctness; tests/root typecheck pass.

**Human evaluation:** Reviewer diagnoses seeded failures from output; no validator skips missing data.

**Commit:** `test(sim): enforce realm correctness`

### Checkpoint 26: Pacing validators before tuning

**Plan:** Encode every target from `PACING-TARGETS.md` with below/boundary/inside/above fixtures. Do not tune constants.

**Success:** Every target has one named percentile-aware validator; current failures are explicit while fixture tests/root typecheck pass.

**Human evaluation:** Reviewer cross-checks all values, units, populations, boundaries, and current tuning gaps.

**Commit:** `test(sim): encode active pacing bands`

### Checkpoint 27: Tune Road idle and portal baseline

**Plan:** Tune only zero-input Road kill/income curves, portal timing, 8h/24h return value, and portal-ready overfarming through core rules/formulas. Record command, seeds, percentiles, constants, and effects in `ECONOMY.md`.

**Success:** All Road-idle/portal validators pass with active effects disabled; no non-finite/determinism regression; tests/root typecheck/canonical baseline sim pass.

**Human evaluation:** Reviewer compares realm-start, 8h, 24h, and portal-ready reports and explains each changed constant.

**Commit:** `balance: tune road idle baseline`

### Checkpoint 28: Tune active Road and pending Ascendancy

**Plan:** Holding Checkpoint 27 constants fixed unless evidence proves a conflict, tune active uplift, action cadence/value, pending accrual, and Road-versus-boss share inputs.

**Success:** 15/20/30-minute and mixed Road policies pass without pushing idle/portal validators out of band; tests/root typecheck/canonical Road sim pass.

**Human evaluation:** Reviewer sees correct idle < mixed < active ordering and reconciles pending accrual for each schedule.

**Commit:** `balance: tune active road rewards`

### Checkpoint 29: Tune Boss duration and activity

**Plan:** Tune only underprepared/prepared/overprepared Boss HP/duration plus pointer/accessibility active uplift, holding Road economy fixed.

**Success:** All Boss duration/uplift/correctness validators pass; pointer/accessibility remain equivalent; tests/root typecheck/canonical Boss sim pass.

**Human evaluation:** Reviewer compares zero-input/pointer/accessibility across all three preparation levels and explains each changed constant.

**Commit:** `balance: tune persistent boss pacing`

### Checkpoint 30: Tune Ascendancy and multi-realm rebuilds

**Plan:** Tune boss payout, node cadence, earnings-bonus stacking, and prompt-ascension advantage across at least three realms without changing approved phase uplift bands.

**Success:** Every correctness/pacing validator passes; three-realm rebuild targets pass; bonuses never affect DPS; tests/root typecheck/build/canonical full sim exit 0.

**Human evaluation:** Reviewer follows three ascensions and sees faster rebuilding, expected purchases, and no hidden combat power.

**Commit:** `balance: validate multi-realm ascension`

**STOP:** No client integration without recorded Checkpoint 30 evidence or an ADR naming an accepted validation gap.

---

## Phase D — Integrate a testable playable client

### Checkpoint 31: Browser-test foundation and runtime adapters

**Plan:** Install dev-only `@playwright/test`; add root scripts `test:e2e:install = playwright install chromium` and `test:e2e = playwright test`. Configure `playwright.config.ts` with Chromium, trace/screenshot/video retained on failure, and `webServer.command = npm run -w app dev -- --host 127.0.0.1 --port 4173`, `url = http://127.0.0.1:4173`, `reuseExistingServer = false`. Inject clock, timer, storage, visibility, and random-seed adapters into `Game`; expose deterministic rules/clock fixtures only in the test build; preserve production defaults. Do not change gameplay.

**Success:** After the one-time `npm run test:e2e:install`, `npm run test:e2e` launches/stops its own server and passes a launch/save smoke. Unit tests, root typecheck, and build pass; failures produce artifacts under `test-results/`.

**Human evaluation:** Reviewer confirms adapters own all browser globals, deterministic fixtures cannot activate in production builds, Playwright is dev-only, and the canonical browser command needs no manually running server.

**Commit:** `test(app): add browser test foundation`

### Checkpoint 32: Save envelope and offline reconciliation

**Plan:** Version app envelope; consume `ParseResult`; preserve partial Boss state; apply rollback/chunking policy before core advancement; expose typed recovery messages.

**Success:** Legacy/current/partial/offline-victory/malformed/rollback/max-interval tests pass; reload never enters/abandons; root typecheck passes.

**Human evaluation:** Reviewer compares stored partial Boss JSON before/after reload and verifies each typed recovery message.

**Commit:** `feat(app): migrate active realm saves`

### Checkpoint 33: Controller command adapters

**Plan:** Replace Challenge/readiness methods with adapters for public core commands and `ActionResult`; no direct authoritative mutation.

**Success:** Every accepted/rejected command maps reason/events correctly; save scheduling is tested; root typecheck passes.

**Human evaluation:** Reviewer maps each controller method one-to-one to a core command and finds no duplicate rule.

**Commit:** `feat(app): connect realm commands`

### Checkpoint 34: Discriminated ViewModel and offline flow

**Plan:** Produce Road/Boss ViewModel union, pure presentation builders, mode-specific recaps, and authoritative query values. Keep interpolation display-only.

**Success:** Road model cannot expose Boss controls and vice versa; affordability/HP/rewards use core truth; tests/root typecheck pass.

**Human evaluation:** Reviewer inspects both models and reconciles Road/Boss offline examples.

**Commit:** `feat(app): add mode-specific view models`

### Checkpoint 35: Active Road UI implementation

**Plan:** Render approved active Road controls/feedback/session progress and keyboard/switch equivalent; normalize to core commands; no client reward multiplier.

**Success:** Unit/Playwright tests prove eligibility, rejection, caps, background policy, wiring; root typecheck/build pass.

**Human evaluation:** Five-minute smoke confirms next action/effect is understandable and baseline continues when ignored.

**Commit:** `feat(app): add active road gameplay`

### Checkpoint 36: Active Road session evaluation

**Plan:** Run scripted 15/20/30-minute browser sessions; record actions, rewards, uplift, clarity, repetition, fatigue, and continuation desire in `docs/playtests/m1r-road-active.md`. Fix only presentation defects; economy changes return to Checkpoint 27.

**Success:** Results stay in bands; no clarity/comfort score <3; automated gates remain green.

**Human evaluation:** Reviewer verifies recorded timestamps and simulator comparison; any out-of-band result blocks progress.

**Commit:** `test: evaluate active road sessions`

### Checkpoint 37: Portal preview and manual commitment UI

**Plan:** Show guardian, committed DPS, authoritative idle/active duration range, pending amount, zero-income warning, Cancel, and explicit Enter.

**Success:** Playwright proves preview/cancel/time never enter and Enter changes exactly one mode; root typecheck/build pass.

**Human evaluation:** Before entry reviewer can answer what stops/persists/how long/how to leave.

**Commit:** `feat(app): add portal commitment preview`

### Checkpoint 38: Portal Boss UI and accessible activity

**Plan:** Render locked Boss screen with authoritative HP/DPS/estimate, interpolation-only feedback, pointer and accessibility controls; omit Road controls.

**Success:** Unit/Playwright tests prove illegal controls absent, shared cap, background/reload preservation; root typecheck/build pass.

**Human evaluation:** Five minutes per input method; measured uplift stays in band and comfort/clarity each ≥3.

**Commit:** `feat(app): add persistent boss combat`

### Checkpoint 39: Protected abandonment UI

**Plan:** Implement exact two-stage protection/loss disclosure from spec; only final action sends abandon command.

**Success:** Tests cover cancel/confirm at full, half, and one-attack-remaining HP; state matrix matches; root typecheck/build pass.

**Human evaluation:** Reviewer predicts exact lost/preserved progress before each confirm.

**Commit:** `feat(app): protect boss abandonment`

### Checkpoint 40: Road/Boss return recaps

**Plan:** Render separate Road and Boss recaps, including partial Boss, offline victory, and leftover next-Road progress. Boss recap reports zero Road income.

**Success:** Fixtures/Playwright reconcile every value and mode; root typecheck/build pass.

**Human evaluation:** Reviewer closes/returns during Road, partial Boss, and post-victory; every recap matches stored/event evidence.

**Commit:** `feat(app): add phase-specific return recaps`

### Checkpoint 41: Ascension summary and Ascendancy tree UI

**Plan:** Show one-time payout/bank/bonus/reset/unlock summary and Road-only approved tree purchases.

**Success:** Tests cover atomic summary, reload dismissal/idempotence, valid/rejected purchases, and absence in Boss; root typecheck/build pass.

**Human evaluation:** Reviewer reconciles summary by hand and explains next permanent choice without coaching.

**Commit:** `feat(app): surface ascension progression`

### Checkpoint 42: Remove legacy core exports and tests

**Plan:** After app and sim use only V2, delete legacy `GameState`, `initialState`, `advance`, direct buy methods, `challengeBoss`, readiness/auto-challenge/cooldown/enrage/gate-farming/World's Edge/Legend code and superseded core tests. Preserve reusable pure Road/gear/skill helpers now consumed by V2.

**Success:** `rg` finds no legacy gameplay symbol in `packages/core/src`; legacy core tests are replaced, not skipped; core tests, root typecheck, build, canonical sim, and E2E pass.

**Human evaluation:** Reviewer confirms all public core consumers import V2 and the diff deletes behavior rather than hiding it behind flags.

**Commit:** `refactor(core): remove legacy gate engine`

### Checkpoint 43: Remove legacy simulator and app surfaces

**Plan:** Delete legacy gate/readiness/Challenge fields, policies, formatters, handlers, markup, styles, and compatibility fixtures from `sim/` and `app/`. Keep migration fixtures/history required to load old saves.

**Success:** Repository-wide production-code `rg` finds legacy terms only in intentional migration/history text; full automated gate passes.

**Human evaluation:** Reviewer opens both phases and simulator tables and finds no dormant or contradictory legacy affordance; every evidence row points to current proof.

**Commit:** `refactor: remove legacy gate surfaces`

---

## Phase E — End-to-end audit and prototype closure

### Checkpoint 44: Automated browser journey

**Plan:** Add one Playwright journey: fresh save → active Road command → portal availability/preview/manual entry → Boss activity → partial reload → abandon/re-enter → victory → ascension → tree purchase → next Road. Use deterministic rules/clock fixtures, not state editing after setup.

**Success:** Journey asserts zero Boss income, persisted HP, exact reset/persistence, one-time rewards, and next-Road progress; full automated gate passes.

**Human evaluation:** Reviewer watches trace/screenshots and matches every transition to requirements IDs.

**Commit:** `test: cover active realm browser journey`

### Checkpoint 45: Independent prototype audit

**Plan:** Create `docs/playtests/m1r-prototype-audit.md`. Run full gate and edge cases: max interval, mid-offline victory, partial reload, termination around victory, one-HP abandon, zero pending, purchase-before-entry, days of portal farming, rollback, spam, multitouch, accessibility parity. Audit direct mutation, stale controls, non-finite values, SRD boundary, and evidence coverage.

**Success:** Tests/typecheck/build/canonical sim/Playwright exit 0; no critical/high or unresolved core-loop medium finding; every in-scope matrix row has fresh evidence.

**Human evaluation:** Independent reviewer returns `APPROVE` and records build/SHA/browser/device plus finding disposition.

**Commit:** `test: audit active gameplay prototype`

### Checkpoint 46: Phone-form-factor session validation

**Plan:** Create `docs/playtests/m1r-active-forward-phone-playtest.md`. Run one 15-, 20-, and 30-minute active Road observation across representative iOS/Android physical devices when the wrapper exists; otherwise record browser device emulation as an explicit gap. Use injected clock/save timestamps to fast-forward separate 8h/24h Road returns and long Boss intervals in minutes; do not wait wall-clock hours. Exercise partial reload, pointer/accessibility activity, abandon/re-entry, victory, ascension, purchase, and next Road.

**Success:** Fresh save reaches next Road without state editing after initial deterministic fixture setup; measured results stay in bands or return to Checkpoints 27–30; no high usability/accessibility defect; full automated gate remains green.

**Human evaluation:** Three session-length observations are recorded; median clarity, comfort, and continuation desire each ≥4/5; fast-forwarded recaps reconcile with simulator and reviewer explains the full loop without coaching.

**Commit:** `test: validate phone active sessions`

### Checkpoint 47: Evidence audit and milestone close

**Plan:** Review every evidence-ledger row, unresolved playtest finding, emulator/physical-device gap, canonical simulator result, and full automated gate. Update `docs/ROADMAP.md` checkboxes only where evidence exists, update final measurements in `docs/ECONOMY.md`, and append `docs/DECISIONS.md` only for genuinely new decisions.

**Success:** All 47 ledger rows have commit/evidence/status; no blocker remains; M1R/M2/M3 prototype items claimed complete link to proof; full automated gate passes on the final SHA.

**Human evaluation:** Independent reviewer returns final `APPROVE` and confirms the playable prototype exit definition below without relying on developer explanation.

**Commit:** `docs: close active gameplay prototype milestone`

## Prototype exit definition

A fresh player can actively play the Road, progress faster within approved bounds, remain productive while idle, manually commit to a persistent zero-income Boss, accelerate it through either supported input, close/reload, abandon knowingly, win/ascend exactly once, spend banked Ascendancy, and begin the next Road. Core determinism, save integrity, simulator pacing, browser journey, independent audit, and human evaluation all pass.

Production realm breadth, complete Bestiary/gear-set/star/trophy content, final art/audio, notifications, cloud save, monetization, and store packaging remain M4/M5.

## Audit improvements applied

- Decomposed coarse lifecycle/simulator/controller/UI work into 47 one-session checkpoints.
- Added stable requirements-to-evidence ownership and a completion ledger.
- Added explicit human evaluation to every checkpoint.
- Added the missing authoritative active Road core command.
- Added one canonical command/timeline/result/event-summary protocol with same-time ordering and `EVENT_CAP` behavior.
- Added versioned/injected realm rules and authoritative preview queries.
- Kept every commit root-type-clean through distinct legacy/V2 export families; legacy deletion now follows all consumer migrations.
- Added Road pending accrual, earnings-bonus application, and Road-only temporary purchase commands as explicit core checkpoints.
- Froze/rebased partial Road-event timing across Boss entry and abandonment.
- Defined the exact Playwright install/script/web-server/artifact lifecycle.
- Split simulator schema, collection, output, correctness, pacing, and tuning.
- Added typed parse/load failures and separated uncapped earnings from safe elapsed chunking.
- Added browser runtime adapters, Playwright foundation, and an automated full journey.
- Split active Road implementation from long session evaluation, and split abandonment, recaps, and tree UI.
- Clarified prototype collection scope and preserved SRD provenance boundaries.

## Risks and stop rules

- If mechanics are not fun on paper, revise Phase A; do not compensate with larger rewards.
- If bands conflict, change the product contract before validators.
- If deterministic command ordering fails, stop in Phase B; never move rules into app/sim.
- If pacing passes only lucky seeds, adjust formulas until percentile validators pass.
- If client and sim diverge, diagnose at the shared command trace; UI-only multipliers are forbidden.
- If migration cannot preserve a field, apply the approved typed fallback; never guess.
- If playtests miss bands, return to tuning, rerun all gates, and supersede evidence.
- If SRD provenance is incomplete, use original placeholders or stop adoption.

## Recommended execution lane

Use one durable sequential owner for checkpoint order and the evidence ledger. Parallel work is safe only for non-overlapping review/test slices inside a checkpoint. The owner integrates, runs the full checkpoint gate, records evidence, and commits.
