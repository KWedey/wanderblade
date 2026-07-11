// The whole single-screen view: builds the DOM once, then updates it from a
// plain ViewModel. It owns no game state and does no game math — it renders what
// the controller hands it and forwards user intents through ViewHandlers.

import {
  GEAR_SLOTS,
  SKILLS,
  SKILL_IDS,
  type GearSlot,
  type Rarity,
  type Recap,
} from '@wanderblade/core';
import { formatDuration, formatNumber, formatPercent } from './format';
import type { LogEntry } from './flavor';

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

/** Everything the view needs to paint one frame of the panels (not the gold count-up). */
export interface ViewModel {
  regionName: string;
  zoneInRegion: number;
  zonesPerRegion: number;
  leagues: number;
  dps: number;
  heroLevel: number;
  zoneProgress: number;
  atGate: boolean;
  bossName: string;
  readiness: number;
  readyToChallenge: boolean;
  onCooldown: boolean;
  cooldownRemainingSec: number;
  bossResult: 'win' | 'fail' | null;
  levelCost: number;
  canAffordLevel: boolean;
  skills: SkillVM[];
  gear: Record<GearSlot, GearVM | null>;
  worldsEdgeReached: boolean;
}

export interface ViewHandlers {
  onBuyLevel(): void;
  onBuySkill(id: string): void;
  onChallenge(): void;
  onCollectRecap(): void;
  onReset(): void;
  onTimeWarp(seconds: number): void;
}

export interface View {
  renderPanels(vm: ViewModel): void;
  renderGold(value: number): void;
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
  <div class="screen">
    <header class="header">
      <div class="wordmark">WANDERBLADE</div>
      <div class="region" data-role="region">Greenwood</div>
      <div class="header-sub">
        <span class="zone" data-role="zone">Zone 1/10</span>
        <span class="leagues" data-role="leagues">0.0 leagues</span>
      </div>
      <div class="zone-track"><div class="zone-fill" data-role="zone-fill"></div></div>
    </header>

    <section class="stats">
      <div class="stat gold-stat">
        <span class="stat-value gold" data-role="gold">0</span>
        <span class="stat-label">gold</span>
      </div>
      <div class="stat dps-stat">
        <span class="stat-value dps" data-role="dps">0</span>
        <span class="stat-label">DPS</span>
      </div>
    </section>

    <section class="boss-panel" data-role="boss-panel" hidden>
      <div class="boss-title">Boss Gate</div>
      <div class="boss-name" data-role="boss-name">the Greenwood Warden</div>
      <div class="readiness-track">
        <div class="readiness-fill" data-role="readiness-fill"></div>
        <span class="readiness-label" data-role="readiness-label">0%</span>
      </div>
      <button class="challenge-btn" type="button" data-role="challenge">Challenge</button>
      <div class="boss-cooldown" data-role="cooldown" hidden></div>
      <div class="boss-banner" data-role="boss-banner" hidden></div>
    </section>

    <section class="panel upgrades">
      <h2 class="panel-title">Upgrades</h2>
      <button class="upgrade-btn hero-btn" type="button" data-role="hero-btn">
        <span class="upgrade-name">Hero Level <span data-role="hero-level">0</span></span>
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

  <button class="debug-toggle" type="button" data-role="debug-toggle" aria-label="Debug" title="Debug: time-warp & reset">⚙</button>
  <div class="debug-drawer" data-role="debug-drawer" hidden>
    <div class="debug-title">Debug</div>
    <div class="debug-seed">seed <span data-role="seed">—</span></div>
    <div class="debug-actions">
      <button class="debug-btn" type="button" data-role="warp-1h">Time-warp +1h</button>
      <button class="debug-btn" type="button" data-role="warp-8h">Time-warp +8h</button>
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

  // Static refs.
  const regionEl = q(root, '[data-role="region"]');
  const zoneEl = q(root, '[data-role="zone"]');
  const leaguesEl = q(root, '[data-role="leagues"]');
  const zoneFillEl = q(root, '[data-role="zone-fill"]');
  const goldEl = q(root, '[data-role="gold"]');
  const dpsEl = q(root, '[data-role="dps"]');

  const bossPanelEl = q(root, '[data-role="boss-panel"]');
  const bossNameEl = q(root, '[data-role="boss-name"]');
  const readinessFillEl = q(root, '[data-role="readiness-fill"]');
  const readinessLabelEl = q(root, '[data-role="readiness-label"]');
  const challengeBtn = q<HTMLButtonElement>(root, '[data-role="challenge"]');
  const cooldownEl = q(root, '[data-role="cooldown"]');
  const bossBannerEl = q(root, '[data-role="boss-banner"]');
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
  challengeBtn.addEventListener('click', handlers.onChallenge);

  const debugToggle = q<HTMLButtonElement>(root, '[data-role="debug-toggle"]');
  const debugDrawer = q(root, '[data-role="debug-drawer"]');
  debugToggle.addEventListener('click', () => {
    debugDrawer.hidden = !debugDrawer.hidden;
  });
  q(root, '[data-role="warp-1h"]').addEventListener('click', () => handlers.onTimeWarp(3600));
  q(root, '[data-role="warp-8h"]').addEventListener('click', () => handlers.onTimeWarp(8 * 3600));
  q(root, '[data-role="reset"]').addEventListener('click', handlers.onReset);

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

  function renderPanels(vm: ViewModel): void {
    regionEl.textContent = vm.regionName;
    zoneEl.textContent = vm.atGate
      ? 'At the Gate'
      : `Zone ${vm.zoneInRegion}/${vm.zonesPerRegion}`;
    leaguesEl.textContent = `${formatLeagues(vm.leagues)} leagues`;
    zoneFillEl.style.width = `${Math.min(1, Math.max(0, vm.zoneProgress)) * 100}%`;
    dpsEl.textContent = formatNumber(vm.dps);

    // Boss gate.
    bossPanelEl.hidden = !vm.atGate;
    if (vm.atGate) {
      bossNameEl.textContent = vm.bossName;
      const fill = Math.min(1, Math.max(0, vm.readiness));
      readinessFillEl.style.width = `${fill * 100}%`;
      readinessLabelEl.textContent = vm.readiness >= 1 ? 'READY' : formatPercent(vm.readiness);
      readinessFillEl.classList.toggle('ready', vm.readiness >= 1);
      challengeBtn.disabled = vm.onCooldown;
      challengeBtn.classList.toggle('ready', vm.readyToChallenge);
      cooldownEl.hidden = !vm.onCooldown;
      if (vm.onCooldown) {
        cooldownEl.textContent = `Retry in ${formatDuration(vm.cooldownRemainingSec)}`;
      }
      const showFail = vm.bossResult === 'fail';
      bossBannerEl.hidden = !showFail;
      if (showFail) bossBannerEl.textContent = 'Too strong… for now';
    }

    // Victory toast (the gate panel is gone by the time a win lands).
    const showWin = vm.bossResult === 'win';
    toastEl.hidden = !showWin;
    if (showWin) toastEl.textContent = 'Victory! The gate opens.';

    // Hero level.
    heroLevelEl.textContent = String(vm.heroLevel);
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
  }

  function renderGold(value: number): void {
    goldEl.textContent = formatNumber(value);
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
    recapBosses.textContent = formatNumber(recap.bossWins);
    recapOverlay.hidden = false;
  }

  function isRecapOpen(): boolean {
    return !recapOverlay.hidden;
  }

  function setSeed(seed: number): void {
    seedEl.textContent = String(seed);
  }

  return { renderPanels, renderGold, pushLog, showRecap, isRecapOpen, setSeed };
}
