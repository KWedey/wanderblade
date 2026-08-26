// The controller: owns the GameState, drives the engine on a fixed tick, eases
// the gold count-up, persists to localStorage, and reconstitutes offline
// progress on return. All game math is delegated to @wanderblade/core — this
// module only orchestrates and translates state into a ViewModel.

import {
  abandonBoss as coreAbandonBoss,
  advance,
  buyHeroLevel as coreBuyHeroLevel,
  buySkill as coreBuySkill,
  bossEtaSec,
  enemyGold,
  enterPortal as coreEnterPortal,
  heroDps,
  initialState,
  killsPerZone,
  killTime,
  levelCost,
  momentumAt,
  momentumMultiplier,
  purchaseOptions,
  summarizeEvents,
  zonesPerRealm,
  type GameEvent,
  type ArcPoint,
  type GameState,
  type GearSlot,
  type Strike,
} from '@wanderblade/core';
import { stageFromQuery } from './devstage';
import { killProgress, smoothStep, zoneSweep } from './anim';
import { bossName, describeEvent, gearName, regionName, type LogEntry } from './flavor';
import { formatDuration } from './format';
import { clearSave, readSave, writeSave } from './save';
import type { SceneModel } from './scene/scene';
import type { BossVM, GearVM, PortalVM, SkillVM, View, ViewModel } from './view';

const TICK_MS = 250;
const SAVE_INTERVAL_MS = 5000;
/** Cold-load / offline gap above which the "Back on the Road" recap appears. */
const RECAP_SEC = 60;
/** A single live tick larger than this means the tab was suspended → treat as offline. */
const SUSPEND_TICK_SEC = 90;
/** How long a boss win/fail flourish stays on screen. */
const BOSS_RESULT_MS = 2600;
/** How long a refused action explains itself in the panel. */
const REFUSAL_MS = 4000;
/** Smallest gap between two strike stamps, so a burst stays strictly ordered. */
const STRIKE_EPSILON_SEC = 1e-4;
/**
 * Gold count-up smoothing rate in 1/s, applied as `1 - exp(-rate * dt)` per
 * frame so the counter converges identically on 60Hz and 120Hz displays.
 */
const GOLD_SMOOTH_RATE = 8;
/** Faster settle when gold drops so a purchase reads as one crisp debit. */
const GOLD_SMOOTH_RATE_DOWN = 18;
/** Cap on display-clock extrapolation past the last engine tick (throttled tabs). */
const MAX_EXTRAPOLATE_SEC = 0.6;

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
  /** Cached with goldPerKill so the 60Hz scene never calls into engine math. */
  private dps = 0;
  /** Live media query — read per frame so an OS toggle applies immediately. */
  private readonly reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private bossResult: 'win' | 'fail' | null = null;
  private bossResultUntilMs = 0;
  private refusal: string | null = null;
  private refusalUntilMs = 0;
/** Strikes made since the last engine advance, stamped on the engine clock. */
  private readonly pendingStrikes: Strike[] = [];

  /**
   * A staged run must never reach localStorage. Without this the autosave
   * writes realm 199 over a real save the moment a capture is taken, and the
   * next plain load comes back staged.
   */
  private staged = false;

  constructor(private readonly view: View) {
    // Dev-only: `?stage=late` boots a staged run so captures show the game deep
    // in, not thirty seconds in. It never touches the save.
    const staged = import.meta.env.DEV ? stageFromQuery(window.location.search) : null;
    if (staged) {
      this.staged = true;
      this.state = staged;
      this.displayGold = this.state.gold;
      this.view.setSeed(this.state.seed);
      return;
    }
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
    if (document.hidden && !this.staged) writeSave(this.state);
  };

  private readonly onPageHide = (): void => {
    if (!this.staged) writeSave(this.state);
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
      const strikes = this.drainStrikes();
      if (dtSec > SUSPEND_TICK_SEC) {
        this.applyOfflineReturn(dtSec);
      } else {
        this.ingestEvents(advance(this.state, dtSec, strikes));
      }
    }

    this.renderAll();
    this.maybeSave(now);
  };

  /**
   * Display-only estimate [0,1] of progress through the current kill. The
   * engine's action schedule is absolute (state.nextActionAtSec), so between ticks
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
    const progress = this.currentKillProgress();
    const p = reduce ? 0 : progress;
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
      zoneSweep(this.state.portalReady, this.state.killsInZone, p, killsPerZone),
    );
    // The scene reads the same kill progress the counter does, so the monster
    // dies on the frame the engine's kill lands.
    this.view.renderScene(frameDtSec, this.buildSceneModel(progress));
    requestAnimationFrame(this.animate);
  };

  /** Display-clock overshoot past the last engine tick; zero while paused. */
  private sinceTickSec(): number {
    if (this.view.isRecapOpen()) return 0;
    return Math.min((performance.now() - this.lastTickMs) / 1000, MAX_EXTRAPOLATE_SEC);
  }

  /** Momentum extrapolated to the display clock; core owns the value itself. */
  private liveMomentum(): number {
    return momentumAt(this.state.momentum, this.state.timeSec + this.sinceTickSec());
  }

  private buildSceneModel(progress: number): SceneModel {
    const momentum = this.liveMomentum();
    return {
      region: this.state.realm,
      kills: this.state.lifetime.kills,
      killProgress: progress,
      goldPerKill: this.goldPerKill,
      dps: this.dps,
      momentum,
      momentumMult: momentumMultiplier(momentum),
      arcs: this.state.arcs,
      timeSec: this.state.timeSec + this.sinceTickSec(),
      paused: this.view.isRecapOpen(),
      reduceMotion: this.reduceMotion.matches,
    };
  }

  private maybeSave(nowMs: number): void {
    if (nowMs - this.lastSaveMs >= SAVE_INTERVAL_MS) {
      if (!this.staged) writeSave(this.state);
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

  /**
   * One Strike, aimed in core's arc space. The stamp must land strictly inside
   * the interval `advance` will process: `state.timeSec` is the *last*
   * boundary and core ignores anything at or before it, so a tap in the same
   * instant as the tick would be silently swallowed. Bursts inside one frame
   * share a wall clock, so each is nudged past the one before it.
   */
  strike(aim: ArcPoint | null): void {
    const sinceTickSec = Math.min(
      (performance.now() - this.lastTickMs) / 1000,
      MAX_EXTRAPOLATE_SEC,
    );
    const floor = this.state.timeSec + STRIKE_EPSILON_SEC;
    const last = this.pendingStrikes[this.pendingStrikes.length - 1];
    const atSec = Math.max(
      this.state.timeSec + sinceTickSec,
      last ? last.atSec + STRIKE_EPSILON_SEC : floor,
    );
    this.pendingStrikes.push({ atSec, aim });
  }

  /** Hand the buffered Strikes to `advance` and clear the buffer. */
  private drainStrikes(): Strike[] {
    return this.pendingStrikes.splice(0, this.pendingStrikes.length);
  }

  /**
   * Commit to the guardian (DESIGN.md "Phase 2 — Portal Boss"). The engine owns
   * the fight; this is the single call site that starts it.
   */
  enterPortal(): void {
    const { entered, events } = coreEnterPortal(this.state);
    this.ingestEvents(events);
    if (!entered) this.refuse('The road is not yet walked to its end.');
    this.renderAll();
  }

  /** Forfeit nothing but the walk back: the guardian keeps its wounds. */
  abandonBoss(): void {
    const { abandoned, events } = coreAbandonBoss(this.state);
    this.ingestEvents(events);
    if (!abandoned) this.refuse('There is no guardian to leave.');
    this.renderAll();
  }

  /**
   * Why an action did nothing, shown in the panel rather than the log — kill
   * spam pushes a log line off screen in about two seconds.
   */
  private refuse(reason: string): void {
    this.refusal = reason;
    this.refusalUntilMs = performance.now() + REFUSAL_MS;
  }

  private currentRefusal(): string | null {
    if (this.refusal && performance.now() <= this.refusalUntilMs) return this.refusal;
    this.refusal = null;
    return null;
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
    this.view.setSeed(this.state.seed);
    this.view.pushLog([{ kind: 'info', text: 'A new blade sets out. The road begins again.' }]);
    if (!this.staged) writeSave(this.state);
    this.lastTickMs = performance.now();
    this.renderAll();
  }

  // --- Offline / warp reconciliation ------------------------------------

  private applyOfflineReturn(elapsedSec: number): void {
    // Reconciling a gap moves timeSec past every queued stamp, so the buffer is
    // dropped rather than replayed as input advance() can only discard.
    this.pendingStrikes.length = 0;
    // Sub-2s gaps (instant reloads) have nothing worth reconciling or announcing.
    if (elapsedSec < 2) {
      this.renderAll();
      return;
    }
    const events = advance(this.state, elapsedSec);
    const recap = summarizeEvents(events);

    // Never flood the log with an offline kill stream — surface only milestones.
    const milestones: LogEntry[] = [];
    for (const e of events) {
      if (
        e.type === 'zone' ||
        e.type === 'portalReady' ||
        e.type === 'portalEnter' ||
        e.type === 'abandon' ||
        e.type === 'bossVictory' ||
        e.type === 'ascend'
      ) {
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
      else if (e.type === 'abandon') this.setBossResult('fail');
      else if (e.type === 'arcCatch') this.view.catchArc(e.bonusGold, e.upgraded);
      const line = describeEvent(e);
      if (line) lines.push(line);
    }
    this.view.pushLog(lines);
  }

  private setBossResult(result: 'win' | 'fail'): void {
    this.bossResult = result;
    this.bossResultUntilMs = performance.now() + BOSS_RESULT_MS;
  }

  private currentBossResult(): 'win' | 'fail' | null {
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
      this.killDurSec = killTime(this.state, this.liveMomentum());
      this.killSchedAtSec = this.state.nextActionAtSec;
    }
  }

  private renderAll(): void {
    // Every state change funnels through here, so the frame-loop caches stay
    // fresh without recomputing engine math 60× a second.
    this.groundKillSchedule();
    this.dps = heroDps(this.state);
    const g = enemyGold(this.state.realm, this.state.zone);
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

  private buildViewModel(): ViewModel {
    const s = this.state;
    const momentum = this.liveMomentum();
    const guardian = bossName(s.realm);

    // The hero occupies exactly one phase (DECISIONS.md #15), so these are
    // never both set. The preview is the fight at sustained momentum, which is
    // the number ADR #24 says P6 measures.
    const portal: PortalVM | null =
      s.phase === 'road' && s.portalReady ? { guardian, etaSec: bossEtaSec(s, 1) } : null;
    const boss: BossVM | null =
      s.phase === 'boss'
        ? {
            guardian,
            hpRemaining: s.boss.hpRemaining,
            hpMax: s.boss.hpMax,
            etaSec: bossEtaSec(s, momentum),
          }
        : null;

    // Every track core knows about, capped or not, so the panel is full rather
    // than one buyable row over two greyed locks.
    const skills: SkillVM[] = purchaseOptions(s)
      .filter((o) => o.kind === 'skill')
      .map((o) => ({
        id: o.id,
        name: o.name,
        level: o.rank,
        cost: o.cost,
        unlocked: o.unlocked,
        atMax: o.atMax,
        unlockLevel: o.unlockLevel,
        canAfford: o.affordable,
      }));

    const heroLevelCost = levelCost(s.hero.level, s.realm);
    // Fresh killTime (not the schedule-grounded cache) so the rate and ETA
    // reflect a purchase immediately instead of lagging one kill behind.
    const goldPerSec = this.goldPerKill / killTime(s, momentum);

    // Goal gradient: the nearest waypoint on the road…
    let marchGoal: string;
    if (boss) {
      marchGoal = `${guardian} stands before you`;
    } else if (portal) {
      marchGoal = `${guardian} awaits`;
    } else {
      const killsLeft = killsPerZone - s.killsInZone;
      const lastZone = s.zone >= zonesPerRealm - 1;
      marchGoal = `${killsLeft} kill${killsLeft === 1 ? '' : 's'} to ${
        lastZone ? 'the portal' : `Zone ${s.zone + 2}`
      }`;
    }

    // …and the cheapest buyable power bump, with a live ETA.
    let purchaseName = `Hero Lv ${s.hero.level + 1}`;
    let purchaseCost = heroLevelCost;
    for (const skill of skills) {
      if (!skill.unlocked || skill.atMax || skill.cost >= purchaseCost) continue;
      purchaseCost = skill.cost;
      purchaseName = `${skill.name} ${skill.level + 1}`;
    }
    const purchaseReady = s.gold >= purchaseCost;
    const purchaseGoal = purchaseReady
      ? `${purchaseName} ready — tap it!`
      : `${purchaseName} in ~${formatDuration((purchaseCost - s.gold) / goldPerSec)}`;

    return {
      regionName: regionName(s.realm),
      zoneInRegion: s.zone + 1,
      zonesPerRegion: zonesPerRealm,
      leagues: s.leagues,
      dps: this.dps,
      heroLevel: s.hero.level,
      portal,
      boss,
      bossResult: this.currentBossResult(),
      refusal: this.currentRefusal(),
      levelCost: heroLevelCost,
      canAffordLevel: s.gold >= heroLevelCost,
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
