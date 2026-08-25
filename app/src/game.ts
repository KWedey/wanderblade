// The controller: owns the GameState, drives the engine on a fixed tick, eases
// the gold count-up, persists to localStorage, and reconstitutes offline
// progress on return. All game math is delegated to @wanderblade/core — this
// module only orchestrates and translates state into a ViewModel.

import {
  advance,
  buyHeroLevel as coreBuyHeroLevel,
  buySkill as coreBuySkill,
  challengeBoss,
  enemyGold,
  heroDps,
  initialState,
  killsPerZone,
  killTime,
  levelCost,
  readiness,
  skillCost,
  SKILLS,
  SKILL_IDS,
  summarizeEvents,
  zonesPerRegion,
  type GameEvent,
  type GameState,
  type GearSlot,
} from '@wanderblade/core';
import {
  decayMomentum,
  momentumMultiplier,
  strikeMomentum,
  type Strike,
} from './active';
import { killProgress, smoothStep, zoneSweep } from './anim';
import {
  bossName,
  describeEvent,
  gearName,
  regionName,
  regionOfZone,
  zoneInRegion,
  type LogEntry,
} from './flavor';
import { formatDuration, formatPercent } from './format';
import { clearSave, readSave, writeSave } from './save';
import type { SceneModel, StrikeOutcome } from './scene/scene';
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
  /** Momentum [0,1] from Strike input (docs/ACTIVE-PLAY.md), decayed per frame. */
  private momentum = 0;
  /**
   * Strikes made since the last engine advance, stamped on the engine clock.
   * `drainStrikes` is the seam: once `advance(state, dt, strikes)` exists it
   * consumes this array and momentum becomes engine state. Until then a Strike
   * moves the meter and the scene and nothing else — no economy value is
   * invented here, and gold stays exactly what the engine says (DECISIONS.md #12).
   */
  private readonly pendingStrikes: Strike[] = [];

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
      // The strike buffer is drained on the same boundary the engine advances
      // on, so plugging it into `advance` is a one-argument change.
      this.drainStrikes();
      if (dtSec > SUSPEND_TICK_SEC) {
        this.applyOfflineReturn(dtSec);
      } else {
        this.ingestEvents(advance(this.state, dtSec));
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
    return killProgress(this.state.nextKillAtSec, this.state.timeSec, sinceTickSec, this.killDurSec);
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

    // Momentum bleeds away continuously; only Strike puts it back.
    this.momentum = decayMomentum(this.momentum, frameDtSec);

    this.view.renderFrame(
      this.displayGold,
      zoneSweep(this.state.gate.atGate, this.state.killsInZone, p, killsPerZone),
    );
    // The scene reads the same kill progress the counter does, so the monster
    // dies on the frame the engine's kill lands.
    this.view.renderScene(frameDtSec, this.buildSceneModel(progress));
    requestAnimationFrame(this.animate);
  };

  private buildSceneModel(progress: number): SceneModel {
    return {
      region: regionOfZone(this.state.zone),
      kills: this.state.lifetime.kills,
      killProgress: progress,
      goldPerKill: this.goldPerKill,
      dps: this.dps,
      momentum: this.momentum,
      momentumMult: momentumMultiplier(this.momentum),
      paused: this.view.isRecapOpen(),
      reduceMotion: this.reduceMotion.matches,
    };
  }

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

  /** One Strike: builds momentum now, and is queued for the engine that will pay it. */
  strike(outcome: StrikeOutcome): void {
    this.momentum = strikeMomentum(this.momentum);
    this.pendingStrikes.push({
      atSec: this.state.timeSec,
      caughtArc: outcome.caughtArc,
    });
  }

  /**
   * Hand the buffered Strikes to whoever consumes them and clear the buffer.
   * The engine call site is `tick`; today nothing consumes them, so they are
   * dropped rather than being allowed to grow without bound.
   */
  private drainStrikes(): Strike[] {
    return this.pendingStrikes.splice(0, this.pendingStrikes.length);
  }

  challenge(): void {
    this.ingestEvents(challengeBoss(this.state).events);
    this.renderAll();
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
    const events = advance(this.state, elapsedSec);
    const recap = summarizeEvents(events);

    // Never flood the log with an offline kill stream — surface only milestones.
    const milestones: LogEntry[] = [];
    for (const e of events) {
      if (e.type === 'region' || e.type === 'bossWin' || e.type === 'bossFail' || e.type === 'edge') {
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
      if (e.type === 'bossWin') this.setBossResult('win');
      else if (e.type === 'bossFail') this.setBossResult('fail');
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
    if (this.state.nextKillAtSec !== this.killSchedAtSec) {
      this.killDurSec = killTime(this.state);
      this.killSchedAtSec = this.state.nextKillAtSec;
    }
  }

  private renderAll(): void {
    // Every state change funnels through here, so the frame-loop caches stay
    // fresh without recomputing engine math 60× a second.
    this.groundKillSchedule();
    this.dps = heroDps(this.state);
    const g = enemyGold(this.state.zone);
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
    const region = regionOfZone(s.zone);
    const r = readiness(s);
    const onCooldown = s.gate.atGate && s.timeSec < s.gate.cooldownUntilSec;

    const skills: SkillVM[] = SKILL_IDS.map((id) => {
      const def = SKILLS[id]!;
      const level = s.hero.skills[id] ?? 0;
      const unlocked = s.hero.level >= def.unlockLevel;
      const atMax = level >= def.maxLevel;
      const cost = skillCost(level);
      return {
        id,
        name: def.name,
        level,
        cost,
        unlocked,
        atMax,
        unlockLevel: def.unlockLevel,
        canAfford: unlocked && !atMax && s.gold >= cost,
      };
    });

    const heroLevelCost = levelCost(s.hero.level);
    // Fresh killTime (not the schedule-grounded cache) so the rate and ETA
    // reflect a purchase immediately instead of lagging one kill behind.
    const goldPerSec = this.goldPerKill / killTime(s);

    // Goal gradient: the nearest waypoint on the road…
    let marchGoal: string;
    if (s.gate.atGate) {
      if (onCooldown) {
        marchGoal = `Rematch in ${formatDuration(s.gate.cooldownUntilSec - s.timeSec)}`;
      } else if (r >= 1) {
        marchGoal = 'Boss ready — challenge!';
      } else {
        marchGoal = `Farming gear — boss ${formatPercent(r)}`;
      }
    } else {
      const killsLeft = killsPerZone - s.killsInZone;
      const nextIsGate = zoneInRegion(s.zone) === zonesPerRegion;
      marchGoal = `${killsLeft} kill${killsLeft === 1 ? '' : 's'} to ${
        nextIsGate ? 'the Boss Gate' : `Zone ${zoneInRegion(s.zone) + 1}`
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
      regionName: regionName(region),
      zoneInRegion: zoneInRegion(s.zone),
      zonesPerRegion,
      leagues: s.leagues,
      dps: this.dps,
      heroLevel: s.hero.level,
      atGate: s.gate.atGate,
      bossName: bossName(region),
      readiness: r,
      readyToChallenge: s.gate.atGate && r >= 1 && !onCooldown,
      onCooldown,
      cooldownRemainingSec: Math.max(0, s.gate.cooldownUntilSec - s.timeSec),
      bossResult: this.currentBossResult(),
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
