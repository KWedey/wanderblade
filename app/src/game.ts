// The controller: owns the GameState, drives the engine on a fixed tick, eases
// the gold count-up, persists to localStorage, and reconstitutes offline
// progress on return. All game math is delegated to @wanderblade/core — this
// module only orchestrates and translates state into a ViewModel.

import {
  abandonBoss,
  advance,
  bossEtaSec,
  buyAscendancyNode as coreBuyAscendancyNode,
  buyHeroLevel as coreBuyHeroLevel,
  buySkill as coreBuySkill,
  enterPortal,
  goldPerKill,
  heroDps,
  initialState,
  killsPerZone,
  killTime,
  momentumAt,
  purchaseOptions,
  summarizeEvents,
  zonesPerRealm,
  type ArcPoint,
  type GameEvent,
  type GameState,
  type GearSlot,
  type Strike,
} from '@wanderblade/core';
import { killProgress, smoothStep, zoneSweep } from './anim';
import { bossName, describeEvent, gearName, realmName, zoneNumber, type LogEntry } from './flavor';
import { formatDuration, formatPercent } from './format';
import { clearSave, readSave, writeSave } from './save';
import type { GearVM, SkillVM, View, ViewModel } from './view';

const TICK_MS = 250;
const SAVE_INTERVAL_MS = 5000;
/** Cold-load / offline gap above which the "Back on the Road" recap appears. */
const RECAP_SEC = 60;
/** A single live tick larger than this means the tab was suspended → treat as offline. */
const SUSPEND_TICK_SEC = 90;
/** How long a boss win/fail flourish stays on screen. */
const BOSS_RESULT_MS = 2600;
/**
 * Gold count-up smoothing rate in 1/s, applied as `1 - exp(-rate * dt)` per
 * frame so the counter converges identically on 60Hz and 120Hz displays.
 */
const GOLD_SMOOTH_RATE = 8;
/** Faster settle when gold drops so a purchase reads as one crisp debit. */
const GOLD_SMOOTH_RATE_DOWN = 18;
/** Cap on display-clock extrapolation past the last engine tick (throttled tabs). */
const MAX_EXTRAPOLATE_SEC = 0.6;
/** Smallest gap that keeps queued strikes strictly ordered and strictly future. */
const STRIKE_EPSILON_SEC = 1e-6;

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff) >>> 0;
}

export class Game {
  private state: GameState;
  private displayGold: number;
  private lastTickMs = 0;
  private lastFrameMs = 0;
  private lastSaveMs = 0;
  /** Current-zone kill duration/payout, cached per state change (not per frame). */
  private killDurSec = 1;
  /** Schedule the cached killDurSec was grounded against (see groundKillSchedule). */
  private killSchedAtSec = -1;
  private goldPerKill = 0;
  /** Live media query — read per frame so an OS toggle applies immediately. */
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private bossResult: 'win' | null = null;
  private bossResultUntilMs = 0;
  /** Strikes banked since the last tick, timestamped in game seconds. */
  private pendingStrikes: Strike[] = [];

  constructor(private readonly view: View) {
    const loaded = readSave();
    if (loaded) {
      this.state = loaded.state;
      const elapsedSec = Math.max(0, (Date.now() - loaded.savedAt) / 1000);
      this.applyOfflineReturn(elapsedSec);
    } else {
      this.state = initialState(randomSeed());
      this.view.pushLog([{ kind: 'info', text: 'The road opens ahead. One blade, one long walk.' }]);
    }
    this.displayGold = this.state.gold;
    this.view.setSeed(this.state.seed);
  }

  // --- Lifecycle ---------------------------------------------------------

  start(): void {
    const now = performance.now();
    this.lastTickMs = now;
    this.lastSaveMs = now;
    setInterval(this.tick, TICK_MS);
    requestAnimationFrame(this.animate);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    this.renderAll();
  }

  private readonly onVisibility = (): void => {
    // Save when leaving. On return we intentionally keep the accumulated dt so a
    // fully-suspended tab is reconciled as an offline stretch by the next tick.
    if (document.hidden) writeSave(this.state);
  };

  private readonly onPageHide = (): void => {
    writeSave(this.state);
  };

  // --- The engine tick ---------------------------------------------------

  private readonly tick = (): void => {
    const now = performance.now();
    // While the recap modal is up the world is paused; keep the clock fresh so no
    // dt accumulates behind it.
    if (this.view.isRecapOpen()) {
      this.lastTickMs = now;
      return;
    }

    const dtSec = (now - this.lastTickMs) / 1000;
    this.lastTickMs = now;

    if (dtSec > 0) {
      if (dtSec > SUSPEND_TICK_SEC) {
        this.applyOfflineReturn(dtSec);
      } else {
        const strikes = this.pendingStrikes;
        this.pendingStrikes = [];
        this.ingestEvents(advance(this.state, dtSec, strikes));
      }
    }

    this.renderAll();
    this.maybeSave(now);
  };

  /**
   * Display-only estimate [0,1] of progress through the current kill. The
   * engine's kill schedule is absolute (state.nextKillAtSec), so between ticks
   * we extrapolate the game clock on the wall clock; every tick re-grounds it.
   * Never feeds back into core state — pure presentation (math in anim.ts).
   */
  private currentKillProgress(): number {
    const sinceTickSec = this.view.isRecapOpen()
      ? 0 // world paused behind the recap — freeze the sweep too
      : Math.min((performance.now() - this.lastTickMs) / 1000, MAX_EXTRAPOLATE_SEC);
    return killProgress(this.state.nextActionAtSec, this.state.timeSec, sinceTickSec, this.killDurSec);
  }

  private readonly animate = (frameMs: number): void => {
    const frameDtSec =
      this.lastFrameMs > 0 ? Math.min((frameMs - this.lastFrameMs) / 1000, 0.25) : 1 / 60;
    this.lastFrameMs = frameMs;

    // The counter chases confirmed gold *plus* the current enemy's accruing
    // share, so the low digits climb continuously and glide into the exact
    // payout on the kill (enemyGold is deterministic — no snap-back). Under
    // prefers-reduced-motion the decorative glide is suppressed: the counter
    // and zone bar step once per kill instead of animating continuously.
    const reduce = this.reduceMotion.matches;
    const p = reduce ? 0 : this.currentKillProgress();
    const target = this.state.gold + this.goldPerKill * p;
    this.displayGold = reduce
      ? target
      : smoothStep(
          this.displayGold,
          target,
          target >= this.displayGold ? GOLD_SMOOTH_RATE : GOLD_SMOOTH_RATE_DOWN,
          frameDtSec,
        );

    this.view.renderFrame(
      this.displayGold,
      zoneSweep(this.state.phase === 'boss', this.state.killsInZone, p, killsPerZone),
    );
    requestAnimationFrame(this.animate);
  };

  private maybeSave(nowMs: number): void {
    if (nowMs - this.lastSaveMs >= SAVE_INTERVAL_MS) {
      writeSave(this.state);
      this.lastSaveMs = nowMs;
    }
  }

  // --- Player actions ----------------------------------------------------

  buyLevel(): void {
    if (coreBuyHeroLevel(this.state)) this.renderAll();
  }

  buySkill(id: string): void {
    if (coreBuySkill(this.state, id)) this.renderAll();
  }

  /** Manual portal entry — the only way into the boss phase (DECISIONS.md #15). */
  enterPortal(): void {
    this.ingestEvents(enterPortal(this.state).events);
    this.renderAll();
  }

  abandonBoss(): void {
    this.ingestEvents(abandonBoss(this.state).events);
    this.renderAll();
  }

  buyAscendancyNode(id: string): void {
    if (coreBuyAscendancyNode(this.state, id)) this.renderAll();
  }

  /** One Strike, stamped on the engine clock and queued for the next advance. */
  strike(aim: ArcPoint | null = null): void {
    const sinceTickSec = Math.min(
      (performance.now() - this.lastTickMs) / 1000,
      MAX_EXTRAPOLATE_SEC,
    );
    // advance() ignores strikes at or before state.timeSec, so a tap landing in
    // the same clock tick as the last advance has to be nudged past it or the
    // input is silently dropped.
    const at = this.state.timeSec + Math.max(sinceTickSec, STRIKE_EPSILON_SEC);
    const last = this.pendingStrikes[this.pendingStrikes.length - 1];
    const atSec = last !== undefined && at <= last.atSec ? last.atSec + STRIKE_EPSILON_SEC : at;
    this.pendingStrikes.push({ atSec, aim });
  }

  collectRecap(): void {
    // Rewards were already applied by advance(); just resume the live clock.
    this.lastTickMs = performance.now();
    this.renderAll();
  }

  timeWarp(seconds: number): void {
    this.applyOfflineReturn(seconds);
  }

  reset(): void {
    clearSave();
    this.state = initialState(randomSeed());
    this.displayGold = 0;
    this.bossResult = null;
    this.pendingStrikes = [];
    this.view.setSeed(this.state.seed);
    this.view.pushLog([{ kind: 'info', text: 'A new blade sets out. The road begins again.' }]);
    writeSave(this.state);
    this.lastTickMs = performance.now();
    this.renderAll();
  }

  // --- Offline / warp reconciliation ------------------------------------

  private applyOfflineReturn(elapsedSec: number): void {
    // Sub-2s gaps (instant reloads) have nothing worth reconciling or announcing.
    if (elapsedSec < 2) {
      this.renderAll();
      return;
    }
    // Reconciling jumps the clock past anything already queued, and advance()
    // discards a strike stamped at or before state.timeSec. Drop them here so
    // stale taps are never handed to it.
    this.pendingStrikes = [];
    const events = advance(this.state, elapsedSec);
    const recap = summarizeEvents(events);

    // Never flood the log with an offline kill stream — surface only milestones.
    const milestones: LogEntry[] = [];
    for (const e of events) {
      if (e.type === 'portalReady' || e.type === 'bossVictory' || e.type === 'ascend') {
        const line = describeEvent(e);
        if (line) milestones.push(line);
      }
    }
    this.view.pushLog(milestones.slice(-6));

    if (elapsedSec > RECAP_SEC) {
      this.view.showRecap(recap, elapsedSec);
    } else {
      this.view.pushLog([{ kind: 'info', text: `Caught up ${formatDuration(elapsedSec)} on the road.` }]);
    }

    // Snap the counter — a count-up over hours of offline gold would just crawl.
    this.displayGold = this.state.gold;
    this.renderAll();
  }

  // --- Events → log + flourishes ----------------------------------------

  private ingestEvents(events: GameEvent[]): void {
    const lines: LogEntry[] = [];
    for (const e of events) {
      if (e.type === 'bossVictory') this.setBossResult('win');
      const line = describeEvent(e);
      if (line) lines.push(line);
    }
    this.view.pushLog(lines);
  }

  private setBossResult(result: 'win'): void {
    this.bossResult = result;
    this.bossResultUntilMs = performance.now() + BOSS_RESULT_MS;
  }

  private currentBossResult(): 'win' | null {
    if (this.bossResult && performance.now() <= this.bossResultUntilMs) return this.bossResult;
    this.bossResult = null;
    return null;
  }

  // --- Rendering ---------------------------------------------------------

  /**
   * Re-ground the killProgress divisor only when the engine actually
   * rescheduled a kill. A mid-kill purchase raises DPS (shrinking
   * killTime) without moving nextKillAtSec — refreshing the divisor then
   * would snap the sweep backward and overshoot the gold debit; the stale
   * duration stays correct for the in-flight kill and self-heals on its
   * completion.
   */
  private groundKillSchedule(): void {
    if (this.state.nextActionAtSec !== this.killSchedAtSec) {
      this.killDurSec = killTime(this.state, this.momentum());
      this.killSchedAtSec = this.state.nextActionAtSec;
    }
  }

  private renderAll(): void {
    // Every state change funnels through here, so the frame-loop caches stay
    // fresh without recomputing engine math 60× a second.
    this.groundKillSchedule();
    const g = goldPerKill(this.state);
    // Finite guard: enemyGold overflows to Infinity in the deep endless tail;
    // Infinity * 0 would poison displayGold with NaN.
    this.goldPerKill = Number.isFinite(g) ? g : 0;
    this.view.renderPanels(this.buildViewModel());
  }

  private gearVM(slot: GearSlot): GearVM | null {
    const item = this.state.gear[slot];
    if (!item) return null;
    return { power: item.power, rarity: item.rarity, name: gearName(slot, item.rarity) };
  }

  /** Live momentum on the engine clock, for display and schedule grounding. */
  private momentum(): number {
    return momentumAt(this.state.momentum, this.state.timeSec);
  }

  private buildViewModel(): ViewModel {
    const s = this.state;
    const inBoss = s.phase === 'boss';

    // The panel prices and gates nothing itself: core's shop rows are the same
    // rows the simulator counts and the engine will actually accept.
    const rows = purchaseOptions(s);
    const skills: SkillVM[] = rows
      .filter((r) => r.kind === 'skill')
      .map((r) => ({
        id: r.id,
        name: r.name,
        level: r.rank,
        cost: r.cost,
        unlocked: r.unlocked,
        unlockLevel: r.unlockLevel,
        canAfford: r.affordable,
      }));

    const heroRow = rows.find((r) => r.kind === 'hero')!;
    const heroLevelCost = heroRow.cost;
    // Fresh killTime (not the schedule-grounded cache) so the rate and ETA
    // reflect a purchase immediately instead of lagging one kill behind.
    const goldPerSec = inBoss ? 0 : this.goldPerKill / killTime(s, this.momentum());

    let marchGoal: string;
    if (inBoss) {
      marchGoal = `${bossName(s.realm)} — ${formatPercent(1 - s.boss.hpRemaining / s.boss.hpMax)} felled`;
    } else if (s.portalReady) {
      marchGoal = 'The portal stands open — enter when ready';
    } else {
      const killsLeft = killsPerZone - s.killsInZone;
      const lastZone = s.zone === zonesPerRealm - 1;
      marchGoal = `${killsLeft} kill${killsLeft === 1 ? '' : 's'} to ${
        lastZone ? 'the portal' : `Zone ${zoneNumber(s.zone) + 1}`
      }`;
    }

    // …and the cheapest buyable power bump, with a live ETA.
    let purchaseName = `Hero Lv ${s.hero.level + 1}`;
    let purchaseCost = heroLevelCost;
    for (const skill of skills) {
      if (!skill.unlocked || skill.cost >= purchaseCost) continue;
      purchaseCost = skill.cost;
      purchaseName = `${skill.name} ${skill.level + 1}`;
    }
    const purchaseReady = !inBoss && s.gold >= purchaseCost;
    let purchaseGoal: string;
    if (inBoss) purchaseGoal = 'Purchases locked during the fight';
    else if (purchaseReady) purchaseGoal = `${purchaseName} ready — tap it!`;
    else purchaseGoal = `${purchaseName} in ~${formatDuration((purchaseCost - s.gold) / goldPerSec)}`;

    return {
      realmName: realmName(s.realm),
      zone: zoneNumber(s.zone),
      zonesPerRealm,
      leagues: s.leagues,
      dps: heroDps(s),
      heroLevel: s.hero.level,
      phase: s.phase,
      portalReady: s.portalReady,
      bossName: bossName(s.realm),
      bossRemainingFrac: inBoss && s.boss.hpMax > 0 ? s.boss.hpRemaining / s.boss.hpMax : 1,
      bossEtaSec: inBoss ? bossEtaSec(s, this.momentum()) : null,
      canEnterPortal: !inBoss && s.portalReady,
      momentum: this.momentum(),
      pendingAscendancy: s.ascendancy.pending,
      bankedAscendancy: s.ascendancy.banked,
      bossResult: this.currentBossResult(),
      levelCost: heroLevelCost,
      canAffordLevel: heroRow.affordable,
      goldPerSec,
      marchGoal,
      purchaseGoal,
      purchaseReady,
      skills,
      gear: {
        weapon: this.gearVM('weapon'),
        armor: this.gearVM('armor'),
        trinket: this.gearVM('trinket'),
      },
    };
  }
}
