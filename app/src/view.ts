// The whole single-screen view: builds the DOM once, then updates it from a
// plain ViewModel. It owns no game state and does no game math — it renders what
// the controller hands it and forwards user intents through ViewHandlers.

import {
  GEAR_SLOTS,
  SKILLS,
  SKILL_IDS,
  type ArcPoint,
  type GearSlot,
  type Rarity,
  type Recap,
} from '@wanderblade/core';
import { HOLD_STRIKE_INTERVAL_SEC } from './active';
import { formatDuration, formatGold, formatNumber, formatPercent, formatRate } from './format';
import type { LogEntry } from './flavor';
import { panelVars, realmSkin } from './scene/palette';
import { paintElement, repaintPixelText } from './pixeltext';
import { createScene, type SceneModel } from './scene/scene';

const LOG_LIMIT = 40;

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
  /** Skill is at its hard rank cap — no further ranks buyable (see SkillDef.maxLevel). */
  atMax: boolean;
  unlockLevel: number;
  canAfford: boolean;
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
  canAffordLevel: boolean;
  goldPerSec: number;
  /** Goal-gradient chips: the nearest road waypoint and the cheapest power buy. */
  marchGoal: string;
  purchaseGoal: string;
  purchaseReady: boolean;
  skills: SkillVM[];
  gear: Record<GearSlot, GearVM | null>;
}

export interface ViewHandlers {
  /** One Strike (docs/ACTIVE-PLAY.md). Core resolves it against the loot arcs. */
  onStrike: (aim: ArcPoint | null) => void;
  onBuyLevel: () => void;
  onBuySkill: (id: string) => void;
  onEnterPortal: () => void;
  onAbandonBoss: () => void;
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

function skillMarkup(): string {
  return SKILL_IDS.map((id) => {
    const name = SKILLS[id]?.name ?? id;
    return `
      <button class="upgrade-btn skill-btn" type="button" data-skill="${id}">
        <span class="upgrade-name">${name}</span>
        <span class="upgrade-detail" data-role="detail"></span>
        <span class="upgrade-cost" data-role="cost"></span>
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

function template(): string {
  return `
  <canvas class="scene" data-role="scene" aria-hidden="true"></canvas>

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

  <div class="strike-hint" data-role="strike-hint">Tap the road to strike</div>

  <div class="screen">
    <section class="goal-strip">
      <span class="goal-chip" data-role="goal-march"></span>
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
        <div><dt>Estimated</dt><dd data-role="portal-eta">—</dd></div>
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

    <section class="panel upgrades">
      <h2 class="panel-title">Upgrades</h2>
      <button class="upgrade-btn hero-btn" type="button" data-role="hero-btn">
        <span class="upgrade-name" data-role="hero-level">Hero Lv 1</span>
        <span class="upgrade-detail">Level up your blade</span>
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
  </div>

  <div class="toast" data-role="toast" hidden></div>

  <button class="debug-toggle" type="button" data-role="debug-toggle" aria-label="Debug" title="Debug: time-warp &amp; reset">⚙</button>
  <div class="debug-drawer" data-role="debug-drawer" hidden>
    <div class="debug-title">Debug</div>
    <div class="debug-seed">seed <span data-role="seed">—</span></div>
    <div class="debug-actions">
      <button class="debug-btn" type="button" data-role="warp-1h">Time-warp +1h</button>
      <button class="debug-btn" type="button" data-role="warp-8h">Time-warp +8h</button>
      <button class="debug-btn" type="button" data-role="mute" aria-pressed="false">Sound: on</button>
      <button class="debug-btn danger" type="button" data-role="reset">Reset save</button>
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
  root.innerHTML = template();

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
  const goalPurchaseEl = q(root, '[data-role="goal-purchase"]');

  const portalPanelEl = q(root, '[data-role="portal-panel"]');
  const portalEyebrowEl = q(root, '[data-role="portal-eyebrow"]');
  const portalNameEl = q(root, '[data-role="portal-name"]');
  const portalEtaEl = q(root, '[data-role="portal-eta"]');
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
  const heroLevelEl = q(root, '[data-role="hero-level"]');
  const heroCostEl = q(root, '[data-role="hero-cost"]');
  const logEl = q<HTMLUListElement>(root, '[data-role="log"]');
  const seedEl = q(root, '[data-role="seed"]');

  // Per-skill refs.
  const skillRefs = new Map<
    string,
    { btn: HTMLButtonElement; detail: HTMLElement; cost: HTMLElement }
  >();
  for (const btn of root.querySelectorAll<HTMLButtonElement>('.skill-btn')) {
    const id = btn.dataset.skill;
    if (!id) continue;
    skillRefs.set(id, {
      btn,
      detail: q(btn, '[data-role="detail"]'),
      cost: q(btn, '[data-role="cost"]'),
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
  q(root, '[data-role="warp-1h"]').addEventListener('click', () => handlers.onTimeWarp(3600));
  q(root, '[data-role="warp-8h"]').addEventListener('click', () => handlers.onTimeWarp(8 * 3600));
  q(root, '[data-role="reset"]').addEventListener('click', handlers.onReset);
  const muteBtn = q(root, '[data-role="mute"]');
  muteBtn.addEventListener('click', () => {
    const muted = handlers.onToggleMute();
    muteBtn.textContent = muted ? 'Sound: off' : 'Sound: on';
    muteBtn.setAttribute('aria-pressed', String(muted));
    repaintPixelText(muteBtn.parentElement ?? muteBtn);
  });

  // Loot streaks home on the gold readout, so the scene needs its live position.
  const hudGoldEl = q(root, '[data-role="hud-gold"]');
  function syncCollectAnchor(): void {
    const r = hudGoldEl.getBoundingClientRect();
    scene.setCollectAnchor(r.left + r.width / 2, r.top + r.height / 2);
  }
  syncCollectAnchor();
  window.addEventListener('resize', syncCollectAnchor);

  // --- Strike input ------------------------------------------------------
  // One verb for the whole game: tap, click, or hold Space/Enter. Holding
  // auto-strikes at the cap-sustaining rate so momentum never demands mashing.
  const strikeHintEl = q(root, '[data-role="strike-hint"]');
  let hintDismissed = false;
  let holdTimer: number | null = null;

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
    handlers.onStrike(scene.strikeAt(clientX, clientY));
  }

  function startHold(clientX: number | null, clientY: number | null): void {
    stopHold();
    holdTimer = window.setInterval(
      () => fireStrike(clientX, clientY),
      HOLD_STRIKE_INTERVAL_SEC * 1000,
    );
  }

  function stopHold(): void {
    if (holdTimer !== null) {
      clearInterval(holdTimer);
      holdTimer = null;
    }
  }

  root.addEventListener('pointerdown', (event) => {
    if (isChrome(event.target) || isRecapOpen()) return;
    event.preventDefault();
    fireStrike(event.clientX, event.clientY);
    startHold(event.clientX, event.clientY);
  });
  window.addEventListener('pointerup', stopHold);
  window.addEventListener('pointercancel', stopHold);

  window.addEventListener('keydown', (event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    if (isChrome(event.target) || isRecapOpen()) return;
    event.preventDefault();
    if (event.repeat) return;
    fireStrike(null, null);
    startHold(null, null);
  });
  window.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') stopHold();
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

  const panelRoot = q(root, '.screen');
  // The HUD sits outside .screen but wears the same type. Leaving it on the
  // webfont put soft glyphs under a 2px shadow next to crisp panel bitmap.
  const hudRoot = q(root, '.hud');

  function renderPanels(vm: ViewModel): void {
    regionEl.textContent = vm.regionName;
    zoneEl.textContent = vm.boss
      ? 'In the Portal'
      : vm.portal
        ? 'Portal reached'
        : `Zone ${vm.zoneInRegion}/${vm.zonesPerRegion}`;
    leaguesEl.textContent = `${formatLeagues(vm.leagues)} leagues`;
    dpsEl.textContent = formatNumber(vm.dps);
    if (vm.dps > lastDps && lastDps >= 0) {
      // Restart the punch even if it's mid-flight (rapid purchases).
      dpsEl.classList.remove('punch');
      void dpsEl.offsetWidth;
      dpsEl.classList.add('punch');
    }
    lastDps = vm.dps;

    goldRateEl.textContent = formatRate(vm.goldPerSec);
    goalMarchEl.textContent = vm.marchGoal;
    goalPurchaseEl.textContent = vm.purchaseGoal;
    goalPurchaseEl.classList.toggle('ready', vm.purchaseReady);

    // Portal / boss. One panel, two states — the hero is in exactly one phase.
    const stage = vm.boss ?? vm.portal;
    portalPanelEl.hidden = stage === null;
    portalPanelEl.classList.toggle('committed', vm.boss !== null);
    if (stage) {
      portalNameEl.textContent = stage.guardian;
      portalEtaEl.textContent = formatDuration(stage.etaSec);
    }

    portalRefusalEl.hidden = vm.refusal === null;
    if (vm.refusal) portalRefusalEl.textContent = vm.refusal;

    bossHpEl.hidden = vm.boss === null;
    bossLiveEl.hidden = vm.boss === null;
    enterPortalBtn.hidden = vm.boss !== null;

    if (vm.boss) {
      portalEyebrowEl.textContent = 'Guardian';
      portalNoteLabelEl.textContent = 'Remaining';
      portalNoteEl.textContent = formatNumber(vm.boss.hpRemaining);
      const frac = vm.boss.hpMax > 0 ? vm.boss.hpRemaining / vm.boss.hpMax : 0;
      bossHpFillEl.style.transform = `scaleX(${Math.min(1, Math.max(0, frac))})`;
      bossHpLabelEl.textContent = formatPercent(frac);
    } else if (vm.portal) {
      portalEyebrowEl.textContent = 'The Portal Stands Open';
      portalNoteLabelEl.textContent = 'On victory';
      portalNoteEl.textContent = 'The realm ascends';
    }

    const showFail = vm.bossResult === 'fail';
    bossBannerEl.hidden = !showFail;
    if (showFail) bossBannerEl.textContent = 'The guardian holds. Return stronger.';

    // Victory toast (the gate panel is gone by the time a win lands).
    const showWin = vm.bossResult === 'win';
    toastEl.hidden = !showWin;
    if (showWin) toastEl.textContent = 'Victory! The gate opens.';

    // Hero level — the button names the level being BOUGHT (the reward),
    // matching the goal chip's "Hero Lv N" framing.
    heroLevelEl.textContent = `Hero Lv ${vm.heroLevel + 1}`;
    heroCostEl.textContent = `${formatNumber(vm.levelCost)} g`;
    heroBtn.disabled = !vm.canAffordLevel;
    heroBtn.classList.toggle('affordable', vm.canAffordLevel);

    // Skills.
    for (const skill of vm.skills) {
      const refs = skillRefs.get(skill.id);
      if (!refs) continue;
      if (!skill.unlocked) {
        refs.detail.textContent = `Unlocks at Level ${skill.unlockLevel}`;
        refs.cost.textContent = '';
        refs.btn.disabled = true;
        refs.btn.classList.remove('affordable', 'maxed');
        refs.btn.classList.add('locked');
      } else if (skill.atMax) {
        // Bounded multiplier reached its cap: show MAX, hide the cost, no buy.
        refs.detail.textContent = `Level ${skill.level} · MAX`;
        refs.cost.textContent = '';
        refs.btn.disabled = true;
        refs.btn.classList.remove('affordable', 'locked');
        refs.btn.classList.add('maxed');
      } else {
        refs.detail.textContent = `Level ${skill.level}`;
        refs.cost.textContent = `${formatNumber(skill.cost)} g`;
        refs.btn.disabled = !skill.canAfford;
        refs.btn.classList.toggle('affordable', skill.canAfford);
        refs.btn.classList.remove('locked', 'maxed');
      }
    }

    // Gear.
    for (const slot of GEAR_SLOTS) {
      const refs = gearRefs.get(slot);
      if (!refs) continue;
      const item = vm.gear[slot];
      refs.slot.classList.remove(
        'rarity-common',
        'rarity-uncommon',
        'rarity-rare',
        'rarity-epic',
        'filled',
      );
      if (item) {
        refs.name.textContent = item.name;
        refs.power.textContent = `power ${formatNumber(item.power)}`;
        refs.slot.classList.add(RARITY_CLASS[item.rarity], 'filled');
      } else {
        refs.name.textContent = '—';
        refs.power.textContent = 'empty';
      }
    }
    repaintPixelText(panelRoot);
    repaintPixelText(hudRoot);
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
    // Outside .screen, so it needs its own repaint or it keeps the webfont the
    // rest of the product no longer uses.
    repaintPixelText(recapOverlay);
  }

  let dressedRegion = -1;

  function catchArc(bonusGold: number, upgraded: boolean): void {
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

  function setSeed(seed: number): void {
    seedEl.textContent = String(seed);
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
