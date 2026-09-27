// The whole single-screen view: builds the DOM once, then updates it from a
// plain ViewModel. It owns no game state and does no game math — it renders what
// the controller hands it and forwards user intents through ViewHandlers.

import {
  ASC_NODES,
  ASC_NODE_IDS,
  GEAR_SLOTS,
  SKILLS,
  SKILL_IDS,
  type ArcPoint,
  type GearSlot,
  type Rarity,
  type Recap,
} from '@wanderblade/core';
import { HOLD_STRIKE_INTERVAL_SEC } from './active';
import { createHeldAim } from './hold';
import {
  clamp01,
  formatDuration,
  formatGold,
  formatNumber,
  formatPercent,
  formatRate,
} from './format';
import type { LogEntry } from './flavor';
import { panelVars, realmSkin } from './scene/palette';
import { markPixelDirty, paintElement, repaintPixelText } from './pixeltext';
import { createScene, type SceneModel } from './scene/scene';

/**
 * Entries kept in the list. This is the whole cap: a pixel max-height cannot
 * be a whole number of entries when an entry may wrap, so it bisected the last
 * line instead. The box hugs whatever it holds.
 */
const LOG_LIMIT = 5;

export interface GearVM {
  power: number;
  rarity: Rarity;
  name: string;
}

export interface SkillVM {
  id: string;
  name: string;
  level: number;
  cost: number;
  unlocked: boolean;
  unlockLevel: number;
  canAfford: boolean;
  /** Seconds until affordable at the current rate; null when affordable or the rate is zero. */
  etaSec: number | null;
}

/**
 * The upgrade core ranks highest per gold right now. The view never computes
 * this - a second opinion about what is worth buying is a second economy.
 */
export interface BestBuyVM {
  /** `'hero'`, or the skill id, matching the row it marks. */
  id: string;
  name: string;
  cost: number;
  /** DPS the next rank adds, for the card that explains the pick. */
  dpsGain: number;
}

/** The guardian preview shown on the Road when the portal is reachable. */
export interface PortalVM {
  guardian: string;
  /** Estimated seconds to fell the guardian at the build's current DPS. */
  etaSec: number;
}

/** The committed fight. Boss HP is engine state and persists offline. */
export interface BossVM {
  guardian: string;
  hpRemaining: number;
  hpMax: number;
  etaSec: number;
}

/** One node of the persistent tree, priced and ranked by core. */
export interface AscNodeVM {
  id: string;
  name: string;
  /** What the node multiplies, in words. */
  effect: string;
  rank: number;
  cost: number;
  canAfford: boolean;
  /** The tree's current multiplier for this node's effect. */
  multiplier: number;
}

/**
 * The persistent side of the game (DECISIONS.md #17). Banked Ascendancy and
 * the tree survive ascension; `pending` is this run's earnings, which only
 * victory banks.
 */
export interface AscendancyVM {
  banked: number;
  pending: number;
  victories: number;
  /** Automatic realm-completion bonus. Multiplies gold only (guardrail 8). */
  earningsMult: number;
  nodes: AscNodeVM[];
}

/** Everything the view needs to paint one frame of the panels (not the gold count-up). */
export interface ViewModel {
  regionName: string;
  zoneInRegion: number;
  zonesPerRegion: number;
  leagues: number;
  dps: number;
  heroLevel: number;
  /**
   * The hero occupies exactly one phase (DECISIONS.md #15). `portal` is set on
   * the Road once the guardian is reachable; `boss` is set once committed.
   * They are never both non-null.
   */
  portal: PortalVM | null;
  boss: BossVM | null;
  bossResult: 'win' | 'fail' | null;
  /** Why the last action did nothing, or null. Shown in the panel, not the log. */
  refusal: string | null;
  levelCost: number;
  levelEtaSec: number | null;
  canAffordLevel: boolean;
  goldPerSec: number;
  /** Gold on hand, so an unaffordable row can show how close it is. */
  gold: number;
  /** Goal-gradient chips: the nearest road waypoint and the cheapest power buy. */
  marchGoal: string;
  /** 0..1 along the leg the march goal names, for the chip's fill. */
  marchProgress: number;
  purchaseGoal: string;
  purchaseReady: boolean;
  /** Core's answer to the panel's one job: the row worth buying next. */
  bestBuy: BestBuyVM | null;
  skills: SkillVM[];
  gear: Record<GearSlot, GearVM | null>;
  ascendancy: AscendancyVM;
}

export interface ViewHandlers {
  /** One Strike (docs/ACTIVE-PLAY.md). Core resolves it against the loot arcs. */
  onStrike: (aim: ArcPoint | null, missed: boolean) => void;
  onBuyLevel: () => void;
  onBuySkill: (id: string) => void;
  onEnterPortal: () => void;
  onAbandonBoss: () => void;
  onBuyAscendancyNode: (id: string) => void;
  onCollectRecap: () => void;
  onReset: () => void;
  /** Returns the new muted state, so the button can label itself. */
  onToggleMute: () => boolean;
  onTimeWarp: (seconds: number) => void;
}

export interface View {
  renderPanels(vm: ViewModel): void;
  /** Per-animation-frame updates: the gold odometer and the zone-bar sweep [0,1]. */
  renderFrame(gold: number, zoneSweep: number): void;
  /** Advance and paint the road scene for one frame. */
  renderScene(dtSec: number, model: SceneModel): void;
  /** Play the catch flourish for an `arcCatch` the engine resolved. */
  catchArc(bonusGold: number, upgraded: boolean): void;
  pushLog(entries: LogEntry[]): void;
  showRecap(recap: Recap, elapsedSec: number): void;
  isRecapOpen(): boolean;
  setSeed(seed: number): void;
}

function q<T extends HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`view: missing element ${selector}`);
  return el;
}

// Every panel write goes through one of these, so an unchanged value leaves the
// bitmap layer in place and a changed colour input flags what it recolours.
function setText(el: HTMLElement, value: string): void {
  if (el.textContent === value) return;
  el.textContent = value;
}

function setClass(el: HTMLElement, name: string, on: boolean): void {
  if (el.classList.contains(name) === on) return;
  el.classList.toggle(name, on);
  markPixelDirty(el);
}

function setHidden(el: HTMLElement, hidden: boolean): void {
  if (el.hidden === hidden) return;
  el.hidden = hidden;
  markPixelDirty(el);
}

function setDisabled(el: HTMLButtonElement, disabled: boolean): void {
  if (el.disabled === disabled) return;
  el.disabled = disabled;
  markPixelDirty(el);
}

function skillMarkup(): string {
  return SKILL_IDS.map((id) => {
    const name = SKILLS[id]?.name ?? id;
    return `
      <button class="upgrade-btn skill-btn" type="button" data-skill="${id}">
        <i class="upgrade-fill" data-role="fill" aria-hidden="true"></i>
        <span class="upgrade-name">${name}</span>
        <span class="upgrade-detail" data-role="detail"></span>
        <span class="upgrade-cost" data-role="cost"></span>
      </button>`;
  }).join('');
}

const ASC_EFFECT_LABEL: Record<string, string> = {
  damage: 'Blade damage',
  gearPower: 'Gear power',
  attackSpeed: 'Attack speed',
};

function ascNodeMarkup(): string {
  return ASC_NODE_IDS.map((id) => {
    const def = ASC_NODES[id];
    const name = def?.name ?? id;
    const effect = ASC_EFFECT_LABEL[def?.effect ?? ''] ?? '';
    return `
      <button class="upgrade-btn asc-node" type="button" data-asc="${id}">
        <span class="upgrade-name">${name}</span>
        <span class="upgrade-detail" data-role="asc-detail">${effect}</span>
        <span class="upgrade-cost" data-role="asc-cost"></span>
      </button>`;
  }).join('');
}

function gearMarkup(): string {
  const label: Record<GearSlot, string> = {
    weapon: 'Weapon',
    armor: 'Armor',
    trinket: 'Trinket',
  };
  return GEAR_SLOTS.map(
    (slot) => `
      <div class="gear-slot" data-slot="${slot}">
        <span class="gear-slot-label">${label[slot]}</span>
        <span class="gear-name" data-role="name">—</span>
        <span class="gear-power" data-role="power"></span>
      </div>`,
  ).join('');
}

/**
 * The drawer is the sound toggle for a player and the time-warp bench for a
 * dev. Only a dev build renders the bench: a shipped client has no button
 * that fabricates eight hours or wipes the run.
 */
function drawerMarkup(dev: boolean): string {
  const mute = `<button class="debug-btn" type="button" data-role="mute" aria-pressed="false">Sound: on</button>`;
  if (!dev) {
    return `
  <button class="debug-toggle" type="button" data-role="debug-toggle" aria-label="Settings" title="Settings">⚙</button>
  <div class="debug-drawer" data-role="debug-drawer" hidden>
    <div class="debug-title">Settings</div>
    <div class="debug-actions">${mute}</div>
  </div>`;
  }
  return `
  <button class="debug-toggle" type="button" data-role="debug-toggle" aria-label="Debug" title="Debug: time-warp &amp; reset">⚙</button>
  <div class="debug-drawer" data-role="debug-drawer" hidden>
    <div class="debug-title">Debug</div>
    <div class="debug-seed">seed <span data-role="seed">—</span></div>
    <div class="debug-actions">
      <button class="debug-btn" type="button" data-role="warp-1h">Time-warp +1h</button>
      <button class="debug-btn" type="button" data-role="warp-8h">Time-warp +8h</button>
      ${mute}
      <button class="debug-btn danger" type="button" data-role="reset">Reset save</button>
    </div>
  </div>`;
}

function template(dev: boolean): string {
  return `
  <canvas class="scene" data-role="scene" aria-hidden="true"></canvas>

  <div class="chrome">
  <div class="hud">
    <div class="hud-realm">
      <div class="wordmark">WANDERBLADE</div>
      <div class="region" data-role="region">Greenwood</div>
      <div class="header-sub">
        <span class="zone" data-role="zone">Zone 1/10</span>
        <span class="leagues" data-role="leagues">0.0 leagues</span>
      </div>
      <div class="zone-track"><div class="zone-fill" data-role="zone-fill"></div></div>
    </div>

    <div class="hud-gold" data-role="hud-gold">
      <span class="gold" data-role="gold">0</span>
      <span class="gold-sub">gold <span class="gold-rate" data-role="gold-rate"></span></span>
    </div>

    <div class="hud-dps">
      <span class="dps" data-role="dps">0</span>
      <span class="hud-label">DPS</span>
    </div>
  </div>

  <div class="screen">
    <section class="goal-strip">
      <span class="goal-chip goal-chip--meter" data-role="goal-march">
        <i class="goal-fill" data-role="goal-fill" aria-hidden="true"></i>
        <span class="goal-text" data-role="goal-march-text"></span>
      </span>
      <span class="goal-chip" data-role="goal-purchase"></span>
    </section>

    <section class="portal-panel" data-role="portal-panel" hidden>
      <div class="portal-eyebrow" data-role="portal-eyebrow">The Portal Stands Open</div>
      <div class="portal-name" data-role="portal-name">the Greenwood Warden</div>

      <div class="boss-hp" data-role="boss-hp" hidden>
        <div class="boss-hp-fill" data-role="boss-hp-fill"></div>
        <span class="boss-hp-label" data-role="boss-hp-label"></span>
      </div>

      <dl class="portal-stats">
        <div><dt data-role="portal-eta-label">Estimated</dt><dd data-role="portal-eta">—</dd></div>
        <div><dt data-role="portal-note-label">On victory</dt><dd data-role="portal-note">Realm ascends</dd></div>
      </dl>

      <button class="portal-btn" type="button" data-role="enter-portal">Enter the Portal</button>

      <div class="boss-live" data-role="boss-live" hidden>
        <p class="boss-hint">Strike to drive the blade faster. The guardian never resets.</p>
        <button class="abandon-btn" type="button" data-role="abandon">
          <span class="abandon-fill" data-role="abandon-fill"></span>
          <span class="abandon-label">Hold to abandon</span>
        </button>
      </div>

      <p class="portal-refusal" data-role="portal-refusal" role="status" hidden></p>

      <div class="boss-banner" data-role="boss-banner" hidden></div>
    </section>

    <button class="asc-open" type="button" data-role="asc-open">
      <span class="asc-open-label">Ascendancy</span>
      <span class="asc-open-bank" data-role="asc-open-bank">0</span>
    </button>

    <section class="panel upgrades">
      <h2 class="panel-title">Upgrades</h2>
      <button class="upgrade-btn hero-btn" type="button" data-role="hero-btn">
        <i class="upgrade-fill" data-role="hero-fill" aria-hidden="true"></i>
        <span class="upgrade-name" data-role="hero-level">Hero Lv 1</span>
        <span class="upgrade-detail" data-role="hero-detail">Level up your blade</span>
        <span class="upgrade-cost" data-role="hero-cost"></span>
      </button>
      ${skillMarkup()}
    </section>

    <section class="panel gear">
      <h2 class="panel-title">Gear</h2>
      <div class="gear-slots">${gearMarkup()}</div>
    </section>

    <section class="panel log">
      <h2 class="panel-title">On the Road</h2>
      <ul class="log-list" data-role="log"></ul>
    </section>

    <button class="best-buy" type="button" data-role="best-buy" hidden>
      <span class="best-buy-eyebrow">Best value</span>
      <span class="best-buy-name" data-role="best-buy-name"></span>
      <span class="best-buy-gain" data-role="best-buy-gain"></span>
      <span class="best-buy-cost" data-role="best-buy-cost"></span>
    </button>
  </div>
  </div>

  <div class="strike-hint" data-role="strike-hint">Tap the road to strike</div>

  <div class="toast" data-role="toast" hidden></div>

${drawerMarkup(dev)}

  <div class="recap-overlay asc-overlay" data-role="asc" hidden>
    <div class="recap-card asc-card">
      <div class="recap-eyebrow">Ascendancy</div>
      <div class="recap-sub" data-role="asc-sub">What you keep when the realm ends.</div>
      <ul class="recap-stats">
        <li><span class="recap-num" data-role="asc-banked">0</span><span>banked to spend</span></li>
        <li><span class="recap-num" data-role="asc-pending">0</span><span>earned this realm</span></li>
        <li><span class="recap-num" data-role="asc-victories">0</span><span>realms completed</span></li>
        <li><span class="recap-num" data-role="asc-earnings">1.00x</span><span>gold multiplier</span></li>
      </ul>
      <div class="asc-nodes">${ascNodeMarkup()}</div>
      <button class="recap-btn" type="button" data-role="asc-close">Back to the Road</button>
    </div>
  </div>

  <div class="recap-overlay" data-role="recap" hidden>
    <div class="recap-card">
      <div class="recap-eyebrow">Back on the Road</div>
      <div class="recap-sub" data-role="recap-sub">You were away for a while.</div>
      <ul class="recap-stats">
        <li><span class="recap-num" data-role="recap-leagues">0</span><span>leagues traveled</span></li>
        <li><span class="recap-num" data-role="recap-kills">0</span><span>monsters felled</span></li>
        <li><span class="recap-num" data-role="recap-gold">0</span><span>gold earned</span></li>
        <li><span class="recap-num" data-role="recap-drops">0</span><span>loot found</span></li>
        <li><span class="recap-num" data-role="recap-bosses">0</span><span>bosses slain</span></li>
      </ul>
      <button class="recap-btn" type="button" data-role="recap-collect">Collect &amp; Continue</button>
    </div>
  </div>`;
}

const RARITY_CLASS: Record<Rarity, string> = {
  common: 'rarity-common',
  uncommon: 'rarity-uncommon',
  rare: 'rarity-rare',
  epic: 'rarity-epic',
};

function formatLeagues(l: number): string {
  return l < 1000 ? l.toFixed(1) : formatNumber(l);
}

/** Build the view into `root` and wire user intents to `handlers`. */
export function createView(root: HTMLElement, handlers: ViewHandlers): View {
  const dev = import.meta.env.DEV;
  root.innerHTML = template(dev);

  const sceneCanvas = q<HTMLCanvasElement>(root, '[data-role="scene"]');
  const scene = createScene(sceneCanvas);

  // Static refs.
  const regionEl = q(root, '[data-role="region"]');
  const zoneEl = q(root, '[data-role="zone"]');
  const leaguesEl = q(root, '[data-role="leagues"]');
  const zoneFillEl = q(root, '[data-role="zone-fill"]');
  const goldEl = q(root, '[data-role="gold"]');
  const goldRateEl = q(root, '[data-role="gold-rate"]');
  const dpsEl = q(root, '[data-role="dps"]');
  const goalMarchEl = q(root, '[data-role="goal-march"]');
  const goalMarchTextEl = q(root, '[data-role="goal-march-text"]');
  const goalFillEl = q(root, '[data-role="goal-fill"]');
  const goalPurchaseEl = q(root, '[data-role="goal-purchase"]');

  const portalPanelEl = q(root, '[data-role="portal-panel"]');
  const portalEyebrowEl = q(root, '[data-role="portal-eyebrow"]');
  const portalNameEl = q(root, '[data-role="portal-name"]');
  const portalEtaEl = q(root, '[data-role="portal-eta"]');
  const portalEtaLabelEl = q(root, '[data-role="portal-eta-label"]');
  const portalNoteLabelEl = q(root, '[data-role="portal-note-label"]');
  const portalNoteEl = q(root, '[data-role="portal-note"]');
  const enterPortalBtn = q<HTMLButtonElement>(root, '[data-role="enter-portal"]');
  const bossHpEl = q(root, '[data-role="boss-hp"]');
  const bossHpFillEl = q(root, '[data-role="boss-hp-fill"]');
  const bossHpLabelEl = q(root, '[data-role="boss-hp-label"]');
  const bossLiveEl = q(root, '[data-role="boss-live"]');
  const abandonBtn = q<HTMLButtonElement>(root, '[data-role="abandon"]');
  const abandonFillEl = q(root, '[data-role="abandon-fill"]');
  const bossBannerEl = q(root, '[data-role="boss-banner"]');
  const portalRefusalEl = q(root, '[data-role="portal-refusal"]');
  const toastEl = q(root, '[data-role="toast"]');

  const heroBtn = q<HTMLButtonElement>(root, '[data-role="hero-btn"]');
  const bestBuyBtn = q<HTMLButtonElement>(root, '[data-role="best-buy"]');
  const bestBuyNameEl = q(root, '[data-role="best-buy-name"]');
  const bestBuyGainEl = q(root, '[data-role="best-buy-gain"]');
  const bestBuyCostEl = q(root, '[data-role="best-buy-cost"]');
  const heroLevelEl = q(root, '[data-role="hero-level"]');
  const heroCostEl = q(root, '[data-role="hero-cost"]');
  const heroFillEl = q(root, '[data-role="hero-fill"]');
  const heroDetailEl = q(root, '.hero-btn .upgrade-detail');
  const logEl = q<HTMLUListElement>(root, '[data-role="log"]');
  const seedEl = root.querySelector<HTMLElement>('[data-role="seed"]');

  // Per-skill refs.
  const skillRefs = new Map<
    string,
    { btn: HTMLButtonElement; detail: HTMLElement; cost: HTMLElement; fill: HTMLElement }
  >();
  for (const btn of root.querySelectorAll<HTMLButtonElement>('.skill-btn')) {
    const id = btn.dataset.skill;
    if (!id) continue;
    skillRefs.set(id, {
      btn,
      detail: q(btn, '[data-role="detail"]'),
      cost: q(btn, '[data-role="cost"]'),
      fill: q(btn, '[data-role="fill"]'),
    });
    btn.addEventListener('click', () => handlers.onBuySkill(id));
  }

  // Per-slot gear refs.
  const gearRefs = new Map<GearSlot, { slot: HTMLElement; name: HTMLElement; power: HTMLElement }>();
  for (const el of root.querySelectorAll<HTMLElement>('.gear-slot')) {
    const slot = el.dataset.slot as GearSlot | undefined;
    if (!slot) continue;
    gearRefs.set(slot, { slot: el, name: q(el, '[data-role="name"]'), power: q(el, '[data-role="power"]') });
  }

  // Static handlers.
  heroBtn.addEventListener('click', handlers.onBuyLevel);
  // The card is a shortcut to the row it marks, never a second purchase path:
  // it dispatches the same two handlers, keyed by the id core named.
  bestBuyBtn.addEventListener('click', () => {
    const id = bestBuyBtn.dataset['buy'];
    if (!id) return;
    if (id === 'hero') handlers.onBuyLevel();
    else handlers.onBuySkill(id);
  });
  enterPortalBtn.addEventListener('click', handlers.onEnterPortal);

  // Abandon forfeits the whole attempt's damage, so it is a deliberate hold —
  // never a mis-tap next to the strike surface.
  const ABANDON_HOLD_MS = 900;
  let abandonStartMs = 0;
  let abandonRaf = 0;

  function abandonTick(now: number): void {
    const progress = Math.min(1, (now - abandonStartMs) / ABANDON_HOLD_MS);
    abandonFillEl.style.transform = `scaleX(${progress})`;
    if (progress >= 1) {
      endAbandonHold();
      handlers.onAbandonBoss();
      return;
    }
    abandonRaf = requestAnimationFrame(abandonTick);
  }

  function endAbandonHold(): void {
    if (abandonRaf) cancelAnimationFrame(abandonRaf);
    abandonRaf = 0;
    abandonFillEl.style.transform = 'scaleX(0)';
  }

  abandonBtn.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
    abandonStartMs = performance.now();
    abandonRaf = requestAnimationFrame(abandonTick);
  });
  for (const evt of ['pointerup', 'pointerleave', 'pointercancel'] as const) {
    abandonBtn.addEventListener(evt, endAbandonHold);
  }

  const debugToggle = q<HTMLButtonElement>(root, '[data-role="debug-toggle"]');
  const debugDrawer = q(root, '[data-role="debug-drawer"]');
  debugToggle.addEventListener('click', () => {
    debugDrawer.hidden = !debugDrawer.hidden;
  });
  if (dev) {
    q(root, '[data-role="warp-1h"]').addEventListener('click', () => handlers.onTimeWarp(3600));
    q(root, '[data-role="warp-8h"]').addEventListener('click', () => handlers.onTimeWarp(8 * 3600));
    q(root, '[data-role="reset"]').addEventListener('click', handlers.onReset);
  }
  const muteBtn = q(root, '[data-role="mute"]');
  muteBtn.addEventListener('click', () => {
    const muted = handlers.onToggleMute();
    muteBtn.textContent = muted ? 'Sound: off' : 'Sound: on';
    muteBtn.setAttribute('aria-pressed', String(muted));
    repaintPixelText(muteBtn.parentElement ?? muteBtn);
  });

  // Loot streaks home on the gold readout, so the scene needs its live position.
  const hudGoldEl = q(root, '[data-role="hud-gold"]');
  const chromeEl = q(root, '.chrome');
  function syncCollectAnchor(): void {
    const r = hudGoldEl.getBoundingClientRect();
    scene.setCollectAnchor(r.left + r.width / 2, r.top + r.height / 2);
    const d = dpsEl.getBoundingClientRect();
    scene.setComboAnchor(d.right, d.bottom);
    // Landmarks for the browser probes, in client pixels: where a tap hits a coin and where it hits sky.
    const { killPoint, landing } = scene.probeAnchors();
    sceneCanvas.dataset['killPoint'] = `${Math.round(killPoint.x)},${Math.round(killPoint.y)}`;
    sceneCanvas.dataset['landing'] = `${Math.round(landing.x0)},${Math.round(landing.x1)},${Math.round(landing.y)}`;
  }
  /**
   * The view owns layout, so it is the view that tells the scene how much
   * chrome sits above the road. In portrait that is the whole panel column;
   * in landscape the panel is docked right and the scene ignores it.
   */
  function syncSceneBand(): void {
    const portrait = window.innerWidth < window.innerHeight;
    scene.setSceneTop(portrait ? chromeEl.getBoundingClientRect().bottom : 0);
    // Landscape docks the panel *over* the canvas, so the world it hides has to
    // be fenced off or the queue walks creatures in behind it.
    const dock = root.querySelector('.screen');
    scene.setSceneRight(
      portrait || !dock
        ? 0
        : Math.max(0, window.innerWidth - dock.getBoundingClientRect().left),
    );
    syncCollectAnchor();
  }
  syncSceneBand();
  // Layout moves the band, so layout drives it: a viewport change, or the
  // chrome growing when a panel appears. A resize drag fires many times per
  // frame, so the pass is coalesced to one per frame.
  let layoutFrame = 0;
  function onLayout(): void {
    if (layoutFrame !== 0) return;
    layoutFrame = requestAnimationFrame(() => {
      layoutFrame = 0;
      syncSceneBand();
      repaintAll();
    });
  }
  window.addEventListener('resize', onLayout);
  window.addEventListener('orientationchange', onLayout);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(syncSceneBand).observe(chromeEl);

  // --- Strike input ------------------------------------------------------
  // One verb for the whole game: tap, click, or hold Space/Enter. Holding
  // auto-strikes at the cap-sustaining rate so momentum never demands mashing.
  const strikeHintEl = q(root, '[data-role="strike-hint"]');
  let hintDismissed = false;
  // Counted on the canvas so a browser probe can see a whiff and a catch happen.
  let misses = 0;
  let catches = 0;
  sceneCanvas.dataset['misses'] = '0';
  sceneCanvas.dataset['catches'] = '0';
  let holdTimer: number | null = null;
  const heldAim = createHeldAim();

  /** Chrome (panels, buttons, modals) is not the road — never a strike. */
  function isChrome(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      target.closest('.screen, .debug-toggle, .debug-drawer, .recap-overlay, .hud') !== null
    );
  }

  function fireStrike(clientX: number | null, clientY: number | null): void {
    if (!hintDismissed) {
      hintDismissed = true;
      strikeHintEl.classList.add('gone');
    }
    const result = scene.strikeAt(clientX, clientY);
    if (result.missed) sceneCanvas.dataset['misses'] = String(++misses);
    handlers.onStrike(result.aim, result.missed);
  }

  function startHold(clientX: number | null, clientY: number | null): void {
    stopHold();
    heldAim.begin(clientX === null || clientY === null ? null : { x: clientX, y: clientY });
    holdTimer = window.setInterval(() => {
      // Read at fire time, not at pointerdown: the point captured when the
      // thumb landed kept striking there however far it slid afterwards.
      const at = heldAim.target();
      fireStrike(at?.x ?? null, at?.y ?? null);
    }, HOLD_STRIKE_INTERVAL_SEC * 1000);
  }

  function stopHold(): void {
    heldAim.end();
    if (holdTimer !== null) {
      clearInterval(holdTimer);
      holdTimer = null;
    }
  }

  root.addEventListener('pointerdown', (event) => {
    if (isChrome(event.target) || isRecapOpen() || !ascOverlay.hidden) return;
    event.preventDefault();
    fireStrike(event.clientX, event.clientY);
    startHold(event.clientX, event.clientY);
  });
  window.addEventListener('pointermove', (event) => {
    if (!heldAim.held()) return;
    heldAim.moved(event.clientX, event.clientY);
  });
  window.addEventListener('pointerup', stopHold);
  window.addEventListener('pointercancel', stopHold);
  // The release never arrives once focus is gone, and a hold that outlives the
  // tab is idle play at the active rate.
  window.addEventListener('blur', stopHold);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopHold();
  });

  window.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    if (isChrome(event.target) || isRecapOpen() || !ascOverlay.hidden) return;
    event.preventDefault();
    if (event.repeat) return;
    fireStrike(null, null);
    startHold(null, null);
  });
  window.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') stopHold();
  });

  // The persistent tree lives behind an overlay, not in the road column: it is
  // read between realms, and the road panel is already the densest thing here.
  const ascOverlay = q(root, '[data-role="asc"]');
  const ascOpenBank = q(root, '[data-role="asc-open-bank"]');
  const ascBanked = q(root, '[data-role="asc-banked"]');
  const ascPending = q(root, '[data-role="asc-pending"]');
  const ascVictories = q(root, '[data-role="asc-victories"]');
  const ascEarnings = q(root, '[data-role="asc-earnings"]');
  const ascNodeEls = new Map<string, { btn: HTMLButtonElement; detail: HTMLElement; cost: HTMLElement }>();
  for (const id of ASC_NODE_IDS) {
    const btn = q<HTMLButtonElement>(root, `[data-asc="${id}"]`);
    ascNodeEls.set(id, {
      btn,
      detail: q(btn, '[data-role="asc-detail"]'),
      cost: q(btn, '[data-role="asc-cost"]'),
    });
    btn.addEventListener('click', () => handlers.onBuyAscendancyNode(id));
  }
  q(root, '[data-role="asc-open"]').addEventListener('click', () => {
    ascOverlay.hidden = false;
    // Closed overlays sit out layout changes, so the tree measures afresh.
    markPixelDirty(ascOverlay);
  });
  q(root, '[data-role="asc-close"]').addEventListener('click', () => {
    ascOverlay.hidden = true;
  });

  const recapOverlay = q(root, '[data-role="recap"]');
  const recapSub = q(root, '[data-role="recap-sub"]');
  const recapLeagues = q(root, '[data-role="recap-leagues"]');
  const recapKills = q(root, '[data-role="recap-kills"]');
  const recapGold = q(root, '[data-role="recap-gold"]');
  const recapDrops = q(root, '[data-role="recap-drops"]');
  const recapBosses = q(root, '[data-role="recap-bosses"]');
  q(root, '[data-role="recap-collect"]').addEventListener('click', () => {
    recapOverlay.hidden = true;
    handlers.onCollectRecap();
  });

  // The zone bar is driven per-frame by renderFrame (not renderPanels), so the
  // sweep stays smooth; DPS is tracked across paints to punch on increases.
  let lastDps = -1;
  // The punch keyframe tints the number, so a repaint mid-flight bakes that
  // tint into the bitmap; the settled colour is measured once the punch ends.
  dpsEl.addEventListener('animationend', () => markPixelDirty(dpsEl));

  const panelRoot = q(root, '.screen');
  // The HUD sits outside .screen but wears the same type. Leaving it on the
  // webfont put soft glyphs under a 2px shadow next to crisp panel bitmap.
  const hudRoot = q(root, '.hud');

  /**
   * An unaffordable row has to read as "not yet", not as "off". Those are
   * different messages: disabled says never, too-expensive says keep playing,
   * and in an idle game the second is the hook. The row carries a fill showing
   * how near the price is and says how long the wait is.
   */
  function showReach(
    fill: HTMLElement,
    detail: HTMLElement,
    base: string,
    cost: number,
    canAfford: boolean,
    etaSec: number | null,
    gold: number,
  ): void {
    // Core's answer, carried on the row: the view holds no second opinion
    // about what is buyable or how long the wait is.
    if (canAfford) {
      fill.style.width = '100%';
      setText(detail, base);
      return;
    }
    fill.style.width = `${(clamp01(gold / cost) * 100).toFixed(1)}%`;
    setText(detail, etaSec !== null ? `${base} \u00b7 in ~${formatDuration(etaSec)}` : base);
  }

  /** Every leaf, measured afresh: the answer to a viewport or pixel-ratio change. */
  function repaintAll(): void {
    repaintPixelText(panelRoot);
    repaintPixelText(hudRoot);
    if (!ascOverlay.hidden) repaintPixelText(ascOverlay);
    if (!recapOverlay.hidden) repaintPixelText(recapOverlay);
  }

  function renderPanels(vm: ViewModel): void {
    setText(regionEl, vm.regionName);
    setText(
      zoneEl,
      vm.boss
        ? 'In the Portal'
        : vm.portal
          ? 'Portal reached'
          : `Zone ${vm.zoneInRegion}/${vm.zonesPerRegion}`,
    );
    setText(leaguesEl, `${formatLeagues(vm.leagues)} leagues`);
    setText(dpsEl, formatNumber(vm.dps));
    if (vm.dps > lastDps && lastDps >= 0) {
      // Restart the punch even if it's mid-flight (rapid purchases).
      dpsEl.classList.remove('punch');
      void dpsEl.offsetWidth;
      dpsEl.classList.add('punch');
    }
    lastDps = vm.dps;

    setText(goldRateEl, formatRate(vm.goldPerSec));
    setText(goalMarchTextEl, vm.marchGoal);
    goalFillEl.style.width = `${(vm.marchProgress * 100).toFixed(1)}%`;
    // The bar is decoration; the chip carries the reading for a screen reader.
    goalMarchEl.setAttribute('aria-label', `${vm.marchGoal}, ${formatPercent(vm.marchProgress)}`);
    setText(goalPurchaseEl, vm.purchaseGoal);
    setClass(goalPurchaseEl, 'ready', vm.purchaseReady);

    // Portal / boss. One panel, two states — the hero is in exactly one phase.
    const stage = vm.boss ?? vm.portal;
    setHidden(portalPanelEl, stage === null);
    setClass(portalPanelEl, 'committed', vm.boss !== null);
    if (stage) {
      setText(portalNameEl, stage.guardian);
      setText(portalEtaEl, formatDuration(stage.etaSec));
    }

    setHidden(portalRefusalEl, vm.refusal === null);
    if (vm.refusal) setText(portalRefusalEl, vm.refusal);

    setHidden(bossHpEl, vm.boss === null);
    setHidden(bossLiveEl, vm.boss === null);
    setHidden(enterPortalBtn, vm.boss !== null);

    if (vm.boss) {
      setText(portalEyebrowEl, 'Guardian');
      // The preview is priced at sustained momentum and the fight at the
      // hero's actual pace, so the same guardian quotes a longer time the
      // instant you commit. Label both: the jump is the tapping, and a number
      // that worsens on an irreversible step has to say why on its own.
      setText(portalEtaLabelEl, 'At this pace');
      setText(portalNoteLabelEl, 'Remaining');
      setText(portalNoteEl, formatNumber(vm.boss.hpRemaining));
      const frac = vm.boss.hpMax > 0 ? vm.boss.hpRemaining / vm.boss.hpMax : 0;
      bossHpFillEl.style.transform = `scaleX(${Math.min(1, Math.max(0, frac))})`;
      setText(bossHpLabelEl, formatPercent(frac));
    } else if (vm.portal) {
      setText(portalEyebrowEl, 'The Portal Stands Open');
      setText(portalEtaLabelEl, 'Blade in hand');
      setText(portalNoteLabelEl, 'On victory');
      setText(portalNoteEl, 'The realm ascends');
    }

    const showFail = vm.bossResult === 'fail';
    setHidden(bossBannerEl, !showFail);
    if (showFail) setText(bossBannerEl, 'The guardian holds. Return stronger.');

    // Victory toast (the gate panel is gone by the time a win lands).
    const showWin = vm.bossResult === 'win';
    setHidden(toastEl, !showWin);
    if (showWin) setText(toastEl, 'Victory! The gate opens.');

    // Hero level — the button names the level being BOUGHT (the reward),
    // matching the goal chip's "Hero Lv N" framing.
    setText(heroLevelEl, `Hero Lv ${vm.heroLevel + 1}`);
    setText(heroCostEl, `${formatNumber(vm.levelCost)} G`);
    setDisabled(heroBtn, !vm.canAffordLevel);
    setClass(heroBtn, 'affordable', vm.canAffordLevel);
    setClass(heroBtn, 'best', vm.bestBuy?.id === 'hero');
    showReach(
      heroFillEl,
      heroDetailEl,
      'Level up your blade',
      vm.levelCost,
      vm.canAffordLevel,
      vm.levelEtaSec,
      vm.gold,
    );

    // Skills.
    for (const skill of vm.skills) {
      const refs = skillRefs.get(skill.id);
      if (!refs) continue;
      setClass(refs.btn, 'best', vm.bestBuy?.id === skill.id);
      if (!skill.unlocked) {
        setText(refs.detail, `Unlocks at Level ${skill.unlockLevel}`);
        setText(refs.cost, '');
        setDisabled(refs.btn, true);
        setClass(refs.btn, 'affordable', false);
        setClass(refs.btn, 'locked', true);
        refs.fill.style.width = '0';
      } else {
        setText(refs.cost, `${formatNumber(skill.cost)} G`);
        setDisabled(refs.btn, !skill.canAfford);
        setClass(refs.btn, 'affordable', skill.canAfford);
        setClass(refs.btn, 'locked', false);
        showReach(
          refs.fill,
          refs.detail,
          `Level ${skill.level}`,
          skill.cost,
          skill.canAfford,
          skill.etaSec,
          vm.gold,
        );
      }
    }

    // The panel's one job, answered in the space it was wasting. Core ranked it;
    // this only draws the winner and routes the tap to the same handler the
    // marked row uses.
    const best = vm.bestBuy;
    setHidden(bestBuyBtn, best === null);
    if (best) {
      bestBuyBtn.dataset['buy'] = best.id;
      setText(bestBuyNameEl, best.name === 'Hero Level' ? `Hero Lv ${vm.heroLevel + 1}` : best.name);
      setText(bestBuyGainEl, `+${formatNumber(best.dpsGain)} DPS`);
      setText(bestBuyCostEl, `${formatNumber(best.cost)} G`);
    }

    // Gear.
    for (const slot of GEAR_SLOTS) {
      const refs = gearRefs.get(slot);
      if (!refs) continue;
      const item = vm.gear[slot];
      for (const cls of Object.values(RARITY_CLASS)) {
        setClass(refs.slot, cls, item !== null && cls === RARITY_CLASS[item.rarity]);
      }
      setClass(refs.slot, 'filled', item !== null);
      if (item) {
        setText(refs.name, item.name);
        setText(refs.power, `power ${formatNumber(item.power)}`);
      } else {
        setText(refs.name, '—');
        setText(refs.power, 'empty');
      }
    }
    renderAscendancy(vm.ascendancy);
    repaintPixelText(panelRoot, true);
    repaintPixelText(hudRoot, true);
    if (!ascOverlay.hidden) repaintPixelText(ascOverlay, true);
  }

  // Per-frame path: only touch the DOM when the rendered string/scale actually
  // changed, so 60–120Hz updates cost nothing while a digit isn't moving.
  let lastGoldText = '';
  let lastSweep = -1;

  function renderFrame(gold: number, zoneSweep: number): void {
    const text = formatGold(gold);
    if (text !== lastGoldText) {
      lastGoldText = text;
      goldEl.textContent = text;
      paintElement(goldEl);
    }
    if (Math.abs(zoneSweep - lastSweep) > 0.0005) {
      lastSweep = zoneSweep;
      zoneFillEl.style.transform = `scaleX(${zoneSweep})`;
    }
  }

  function pushLog(entries: LogEntry[]): void {
    if (entries.length === 0) return;
    // Newest on top: prepend in reverse so the last event ends up first.
    const fragment = document.createDocumentFragment();
    for (let i = entries.length - 1; i >= 0; i--) {
      const entry = entries[i]!;
      const li = document.createElement('li');
      li.className = `log-line log-${entry.kind}`;
      li.textContent = entry.text;
      fragment.appendChild(li);
    }
    logEl.prepend(fragment);
    while (logEl.childElementCount > LOG_LIMIT) {
      logEl.lastElementChild?.remove();
    }
  }

  function showRecap(recap: Recap, elapsedSec: number): void {
    recapSub.textContent = `The hero walked on for ${formatDuration(elapsedSec)}.`;
    recapLeagues.textContent = formatLeagues(recap.leaguesTraveled);
    recapKills.textContent = formatNumber(recap.kills);
    recapGold.textContent = formatNumber(recap.goldEarned);
    recapDrops.textContent = formatNumber(recap.drops);
    recapBosses.textContent = formatNumber(recap.victories);
    recapOverlay.hidden = false;
    // Outside .screen, so it needs its own repaint or it keeps a webfont the
    // rest of the product does not use.
    repaintPixelText(recapOverlay);
  }

  let dressedRegion = -1;

  function catchArc(bonusGold: number, upgraded: boolean): void {
    sceneCanvas.dataset['catches'] = String(++catches);
    scene.catchArc(bonusGold, upgraded);
  }

  function renderScene(dtSec: number, model: SceneModel): void {
    // The panel wears the realm the player is standing in. Set from the same
    // skin the scene paints with, so the two halves cannot drift apart.
    if (model.region !== dressedRegion) {
      dressedRegion = model.region;
      const vars = panelVars(realmSkin(model.region));
      for (const [name, value] of Object.entries(vars)) {
        root.style.setProperty(name, value);
      }
    }
    scene.frame(dtSec, model);
  }

  function isRecapOpen(): boolean {
    return !recapOverlay.hidden;
  }

  function renderAscendancy(asc: AscendancyVM): void {
    // Real text, not a ::after. The bitmap layer reads textContent, so a
    // pseudo-element's mark stayed webfont and printed over the number.
    // Pending rides the button too: a run that has earned 3 A and shows 0 A
    // for two hours reads as a realm that pays nothing.
    setText(
      ascOpenBank,
      asc.pending > 0 ? `${formatNumber(asc.banked)} A \u00b7 +${formatNumber(asc.pending)}` : `${formatNumber(asc.banked)} A`,
    );
    setText(ascBanked, formatNumber(asc.banked));
    setText(ascPending, formatNumber(asc.pending));
    setText(ascVictories, formatNumber(asc.victories));
    setText(ascEarnings, `${asc.earningsMult.toFixed(2)}x`);
    for (const node of asc.nodes) {
      const els = ascNodeEls.get(node.id);
      if (!els) continue;
      // Rank and the multiplier it already bought, so a node reads as a thing
      // that did something rather than as a price with a name on it.
      const effect = ASC_EFFECT_LABEL[node.effect] ?? node.effect;
      setText(
        els.detail,
        node.rank > 0
          ? `${effect} - rank ${node.rank}, ${node.multiplier.toFixed(2)}x`
          : `${effect} - not yet`,
      );
      setText(els.cost, `${formatNumber(node.cost)} a`);
      setClass(els.btn, 'affordable', node.canAfford);
      setDisabled(els.btn, !node.canAfford);
    }
  }

  function setSeed(seed: number): void {
    if (seedEl) seedEl.textContent = String(seed);
  }

  return {
    renderPanels,
    renderFrame,
    renderScene,
    catchArc,
    pushLog,
    showRecap,
    isRecapOpen,
    setSeed,
  };
}
