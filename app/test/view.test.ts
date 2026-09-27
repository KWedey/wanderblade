// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILL_IDS, SKILLS } from '@wanderblade/core';

import { formatDuration, formatPercent } from '../src/format';
import { createView, type View, type ViewHandlers, type ViewModel } from '../src/view';

// The road scene is a canvas renderer; jsdom has no 2D context and the view's
// job under test is the panel DOM, so the scene is a recorder of what the view
// tells it.
vi.mock('../src/scene/scene', () => ({
  createScene: () => ({
    frame: () => {},
    strikeAt: () => ({ aim: null, missed: false }),
    catchArc: () => {},
    setSceneTop: () => {},
    setSceneRight: () => {},
    setCollectAnchor: () => {},
    dispose: () => {},
  }),
}));

function handlers(): ViewHandlers {
  let muted = false;
  return {
    onStrike: vi.fn(),
    onBuyLevel: vi.fn(),
    onBuySkill: vi.fn(),
    onEnterPortal: vi.fn(),
    onAbandonBoss: vi.fn(),
    onBuyAscendancyNode: vi.fn(),
    onCollectRecap: vi.fn(),
    onReset: vi.fn(),
    onToggleMute: vi.fn(() => (muted = !muted)),
    onTimeWarp: vi.fn(),
  };
}

function vm(over: Partial<ViewModel> = {}): ViewModel {
  return {
    regionName: 'Greenwood',
    zoneInRegion: 1,
    zonesPerRegion: 10,
    leagues: 0,
    dps: 10,
    heroLevel: 1,
    portal: null,
    boss: null,
    bossResult: null,
    refusal: null,
    levelCost: 100,
    levelEtaSec: 25,
    canAffordLevel: false,
    goldPerSec: 2,
    gold: 50,
    marchGoal: 'Zone 2 in ~1m',
    marchProgress: 0.3,
    purchaseGoal: 'Hero Lv 2 in ~25s',
    purchaseReady: false,
    bestBuy: null,
    skills: SKILL_IDS.map((id) => ({
      id,
      name: SKILLS[id]!.name,
      level: 0,
      cost: 200,
      unlocked: true,
      unlockLevel: 0,
      canAfford: false,
      etaSec: 75,
    })),
    gear: { weapon: null, armor: null, trinket: null },
    ascendancy: { banked: 0, pending: 0, victories: 0, earningsMult: 1, nodes: [] },
    ...over,
  };
}

let root: HTMLElement;

function mount(): { view: View; h: ViewHandlers } {
  const h = handlers();
  const view = createView(root, h);
  return { view, h };
}

function role<T extends HTMLElement = HTMLElement>(name: string): T | null {
  return root.querySelector<T>(`[data-role="${name}"]`);
}

function must<T extends HTMLElement = HTMLElement>(name: string): T {
  const el = role<T>(name);
  if (!el) throw new Error(`missing role ${name}`);
  return el;
}

beforeEach(() => {
  root = document.createElement('div');
  document.body.appendChild(root);
});

afterEach(() => {
  root.remove();
  vi.unstubAllEnvs();
});

describe('the debug drawer', () => {
  it('carries time-warp and reset in a dev build, wired to their handlers', () => {
    const { h } = mount();
    must('warp-1h').click();
    must('warp-8h').click();
    must('reset').click();
    expect(h.onTimeWarp).toHaveBeenNthCalledWith(1, 3600);
    expect(h.onTimeWarp).toHaveBeenNthCalledWith(2, 8 * 3600);
    expect(h.onReset).toHaveBeenCalledTimes(1);
    expect(role('seed')).not.toBeNull();
  });

  it('ships to players with the sound toggle and nothing that fabricates time', () => {
    vi.stubEnv('DEV', false);
    const { view, h } = mount();
    for (const name of ['warp-1h', 'warp-8h', 'reset', 'seed']) {
      expect(role(name), name).toBeNull();
    }
    expect(root.textContent).not.toContain('Time-warp');
    expect(root.textContent).not.toContain('Reset save');

    const mute = must('mute');
    expect(mute.textContent).toBe('Sound: on');
    mute.click();
    expect(h.onToggleMute).toHaveBeenCalledTimes(1);
    expect(mute.textContent).toBe('Sound: off');
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    expect(() => view.setSeed(42)).not.toThrow();
  });

  it('opens and closes from its toggle in either build', () => {
    vi.stubEnv('DEV', false);
    mount();
    const drawer = must('debug-drawer');
    expect(drawer.hidden).toBe(true);
    must('debug-toggle').click();
    expect(drawer.hidden).toBe(false);
  });
});

describe('the portal panel wears the phase', () => {
  it('is hidden on the open road', () => {
    const { view } = mount();
    view.renderPanels(vm());
    expect(must('portal-panel').hidden).toBe(true);
    expect(must('zone').textContent).toBe('Zone 1/10');
  });

  it('offers the portal, and the enter button, once the guardian is reachable', () => {
    const { view, h } = mount();
    view.renderPanels(vm({ portal: { guardian: 'the Greenwood Warden', etaSec: 90 } }));
    const panel = must('portal-panel');
    expect(panel.hidden).toBe(false);
    expect(panel.classList.contains('committed')).toBe(false);
    expect(must('zone').textContent).toBe('Portal reached');
    expect(must('portal-name').textContent).toBe('the Greenwood Warden');
    expect(must('portal-eta').textContent).toBe(formatDuration(90));
    expect(must('boss-hp').hidden).toBe(true);
    expect(must('boss-live').hidden).toBe(true);
    const enter = must<HTMLButtonElement>('enter-portal');
    expect(enter.hidden).toBe(false);
    enter.click();
    expect(h.onEnterPortal).toHaveBeenCalledTimes(1);
  });

  it('shows the fight, the HP bar and the abandon hold once committed', () => {
    const { view } = mount();
    view.renderPanels(
      vm({ boss: { guardian: 'the Greenwood Warden', hpRemaining: 250, hpMax: 1000, etaSec: 40 } }),
    );
    const panel = must('portal-panel');
    expect(panel.hidden).toBe(false);
    expect(panel.classList.contains('committed')).toBe(true);
    expect(must('zone').textContent).toBe('In the Portal');
    expect(must('enter-portal').hidden).toBe(true);
    expect(must('boss-hp').hidden).toBe(false);
    expect(must('boss-live').hidden).toBe(false);
    expect(must('boss-hp-label').textContent).toBe(formatPercent(0.25));
    expect(must('boss-hp-fill').style.transform).toBe('scaleX(0.25)');
    expect(must('portal-eyebrow').textContent).toBe('Guardian');
  });

  it('flips back to the road when the fight ends', () => {
    const { view } = mount();
    view.renderPanels(
      vm({ boss: { guardian: 'the Greenwood Warden', hpRemaining: 1, hpMax: 1000, etaSec: 1 } }),
    );
    view.renderPanels(vm({ bossResult: 'win' }));
    expect(must('portal-panel').hidden).toBe(true);
    expect(must('portal-panel').classList.contains('committed')).toBe(false);
    expect(must('toast').hidden).toBe(false);
    expect(must('boss-banner').hidden).toBe(true);
  });
});

describe('core\'s best buy routes to the row it marks', () => {
  it('marks the hero row and the card buys a level', () => {
    const { view, h } = mount();
    view.renderPanels(
      vm({ bestBuy: { id: 'hero', name: 'Hero Level', cost: 100, dpsGain: 3 }, canAffordLevel: true, gold: 500 }),
    );
    expect(must('hero-btn').classList.contains('best')).toBe(true);
    const card = must<HTMLButtonElement>('best-buy');
    expect(card.hidden).toBe(false);
    expect(must('best-buy-name').textContent).toBe('Hero Lv 2');
    card.click();
    expect(h.onBuyLevel).toHaveBeenCalledTimes(1);
    expect(h.onBuySkill).not.toHaveBeenCalled();
  });

  it('marks the skill row and the card buys that skill', () => {
    const { view, h } = mount();
    const id = SKILL_IDS[0]!;
    view.renderPanels(vm({ bestBuy: { id, name: SKILLS[id]!.name, cost: 200, dpsGain: 5 } }));
    expect(must('hero-btn').classList.contains('best')).toBe(false);
    expect(root.querySelector(`[data-skill="${id}"]`)!.classList.contains('best')).toBe(true);
    expect(must('best-buy-name').textContent).toBe(SKILLS[id]!.name);
    must('best-buy').click();
    expect(h.onBuySkill).toHaveBeenCalledWith(id);
    expect(h.onBuyLevel).not.toHaveBeenCalled();
  });

  it('hides the card and clears every mark when nothing is affordable', () => {
    const { view } = mount();
    const id = SKILL_IDS[0]!;
    view.renderPanels(vm({ bestBuy: { id, name: SKILLS[id]!.name, cost: 200, dpsGain: 5 } }));
    view.renderPanels(vm({ bestBuy: null }));
    expect(must('best-buy').hidden).toBe(true);
    expect(root.querySelectorAll('.best')).toHaveLength(0);
  });
});

describe('the goal chip and the row waits are painted, not computed', () => {
  it('shows the controller\'s purchase goal and readiness verbatim', () => {
    const { view } = mount();
    view.renderPanels(vm({ purchaseGoal: 'Edge 3 ready — tap it!', purchaseReady: true }));
    const chip = must('goal-purchase');
    expect(chip.textContent).toBe('Edge 3 ready — tap it!');
    expect(chip.classList.contains('ready')).toBe(true);
    view.renderPanels(vm({ purchaseGoal: 'Edge 3 in ~4m', purchaseReady: false }));
    expect(chip.classList.contains('ready')).toBe(false);
  });

  it('formats the wait the view model carries for each row', () => {
    const { view } = mount();
    view.renderPanels(vm({ levelEtaSec: 25 }));
    expect(must('hero-detail').textContent).toBe(`Level up your blade · in ~${formatDuration(25)}`);
    const id = SKILL_IDS[0]!;
    const detail = root.querySelector(`[data-skill="${id}"] [data-role="detail"]`)!;
    expect(detail.textContent).toBe(`Level 0 · in ~${formatDuration(75)}`);
  });

  it('names no wait when the row carries none', () => {
    const { view } = mount();
    const skills = vm().skills.map((k) => ({ ...k, etaSec: null }));
    view.renderPanels(vm({ levelEtaSec: null, skills }));
    expect(must('hero-detail').textContent).toBe('Level up your blade');
    const id = SKILL_IDS[0]!;
    expect(root.querySelector(`[data-skill="${id}"] [data-role="detail"]`)!.textContent).toBe('Level 0');
  });
});

describe('a repaint of an unchanged panel costs no layout', () => {
  it('reads no computed style when the view model is the same', () => {
    const { view } = mount();
    view.renderPanels(vm());
    const styles = vi.spyOn(window, 'getComputedStyle');
    view.renderPanels(vm());
    expect(styles).not.toHaveBeenCalled();
  });

  it('measures the rows whose colour flipped even though their text did not', () => {
    const { view } = mount();
    view.renderPanels(vm());
    const styles = vi.spyOn(window, 'getComputedStyle');
    view.renderPanels(vm({ canAffordLevel: true, gold: 500 }));
    const measured = new Set(styles.mock.calls.map((c) => c[0]));
    expect(measured.has(must('hero-cost'))).toBe(true);
    expect(measured.has(must('region'))).toBe(false);
  });
});
