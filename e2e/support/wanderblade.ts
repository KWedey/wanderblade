// The game as a player meets it. Time is Playwright's fake clock, frozen at
// boot: nothing moves until a spec calls play, playFast or sleep.

import { expect, type Locator, type Page } from '@playwright/test';
import { parseAmount, parseDuration } from './amounts';

export const SECOND = 1000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;

/**
 * The longest jump the game still plays as a live tick. Past 90 s it treats
 * the gap as a suspended tab (SUSPEND_TICK_SEC in app/src/game.ts).
 */
const LIVE_STEP = MINUTE;

export interface Start {
  /** Seeds the run; the same seed and the same inputs replay the same game. */
  seed: number;
  /** Dev staging (app/src/devstage.ts): `mid` is 25 engine-minutes into realm 0. */
  stage?: 'mid';
}

export class Wanderblade {
  readonly region: Locator;
  readonly zone: Locator;
  readonly gold: Locator;
  readonly goldRate: Locator;
  readonly dps: Locator;
  readonly scene: Locator;
  readonly strikeHint: Locator;
  readonly log: Locator;
  readonly gear: Locator;

  readonly upgrades: Locator;
  readonly heroLevel: Locator;
  readonly bestValue: Locator;

  readonly portalOpen: Locator;
  readonly guardianName: Locator;
  readonly enterPortal: Locator;
  readonly abandon: Locator;
  readonly bossEta: Locator;
  readonly bossRemaining: Locator;
  readonly bossHolds: Locator;
  readonly victory: Locator;

  readonly openAscendancy: Locator;
  readonly ascendancy: Locator;
  readonly recap: Locator;

  readonly settings: Locator;
  readonly seed: Locator;

  constructor(
    readonly page: Page,
    private readonly touch: boolean,
  ) {
    // Live readouts have no role or label of their own; the app's data-role
    // hooks are the test ids (testIdAttribute in playwright.config.ts).
    this.region = page.getByTestId('region');
    this.zone = page.getByTestId('zone');
    this.gold = page.getByTestId('gold');
    this.goldRate = page.getByTestId('gold-rate');
    this.dps = page.getByTestId('dps');
    this.scene = page.getByTestId('scene');
    this.strikeHint = page.getByText('Tap the road to strike');
    this.log = panel(page, 'On the Road').getByRole('listitem');
    this.gear = panel(page, 'Gear');

    this.upgrades = panel(page, 'Upgrades').getByRole('button');
    this.heroLevel = page.getByRole('button', { name: /^Hero Lv \d+/ });
    this.bestValue = page.getByRole('button', { name: /^Best value/ });

    this.portalOpen = page.getByText('The Portal Stands Open');
    this.guardianName = page.getByTestId('portal-name');
    this.enterPortal = page.getByRole('button', { name: 'Enter the Portal' });
    this.abandon = page.getByRole('button', { name: 'Hold to abandon' });
    this.bossEta = page.getByTestId('portal-eta');
    this.bossRemaining = page.getByTestId('portal-note');
    this.bossHolds = page.getByText('The guardian holds. Return stronger.');
    this.victory = page.getByText('Victory! The gate opens.');

    this.openAscendancy = page.getByRole('button', { name: /^Ascendancy/ });
    this.ascendancy = page.getByRole('dialog', { name: 'Ascendancy' });
    this.recap = page.getByRole('dialog', { name: 'Back on the Road' });

    this.settings = page.getByRole('button', { name: 'Debug' });
    this.seed = page.getByTestId('seed');
  }

  /** Boot a run at the frozen instant the fixture installed. */
  async start({ seed, stage }: Start): Promise<void> {
    const query = new URLSearchParams({ ...(stage ? { stage } : {}), seed: String(seed) });
    await this.page.goto(`./?${query}`);
    await expect(this.seed).toHaveText(String(seed));
  }

  // --- Time --------------------------------------------------------------

  /** A live session: every tick and every animation frame in `ms` fires. */
  async play(ms: number): Promise<void> {
    await this.page.clock.runFor(ms);
  }

  /** Live play compressed: whole minutes at a time, never a gap the game reads as offline. */
  async playFast(ms: number): Promise<void> {
    for (let left = ms; left > 0; left -= LIVE_STEP) {
      await this.page.clock.fastForward(Math.min(left, LIVE_STEP));
    }
  }

  /** The tab sleeps for `ms`; the next tick wakes to one gap and reconciles it offline. */
  async sleep(ms: number): Promise<void> {
    await this.page.clock.fastForward(ms);
  }

  /** Close the game, stay away for `ms`, and open it again: a cold load from the save. */
  async leaveAndReturnAfter(ms: number): Promise<void> {
    const url = this.page.url();
    await this.page.goto('about:blank');
    await this.page.clock.fastForward(ms);
    await this.page.goto(url);
  }

  /**
   * Play `step` at a time until `target` is visible and enabled. The bound is
   * the assertion: a portal that never opens, or a fight that outlasts its own
   * ETA, fails here rather than in a timeout.
   */
  async playUntilReady(
    target: Locator,
    { within, step = LIVE_STEP }: { within: number; step?: number },
  ): Promise<void> {
    for (let elapsed = 0; elapsed < within; elapsed += step) {
      if ((await target.isVisible()) && (await target.isEnabled())) return;
      await (step >= LIVE_STEP ? this.playFast(step) : this.play(step));
    }
    const why = `not ready after ${within / SECOND}s of game time`;
    await expect(target, why).toBeVisible({ timeout: 1 });
    await expect(target, why).toBeEnabled({ timeout: 1 });
  }

  // --- Readouts ----------------------------------------------------------

  /** A HUD or panel number, e.g. "5.42K" or "+117/s". */
  async amount(readout: Locator): Promise<number> {
    return parseAmount(await readout.textContent());
  }

  /** What a shop row costs: the "5.42K G" its button ends with. */
  async price(row: Locator): Promise<number> {
    const cost = /([\d.,]+[A-Za-z]*) G\s*$/.exec((await row.textContent()) ?? '');
    if (!cost?.[1]) throw new Error(`${row.toString()} shows no price`);
    return parseAmount(cost[1]);
  }

  // --- Striking ----------------------------------------------------------

  async strikeWithSpace(): Promise<void> {
    await this.page.keyboard.press('Space');
  }

  /** Hold Space: the game auto-strikes at the momentum-sustaining rate. */
  async holdSpace(ms: number): Promise<void> {
    await this.page.keyboard.down('Space');
    await this.play(ms);
    await this.page.keyboard.up('Space');
  }

  /** A thumb (or a mouse, on desktop) on the duel between the hero and the monster. */
  async tapRoad(): Promise<void> {
    const [x, y] = (await this.landmark('data-kill-point', 2)) as [number, number];
    await this.tap(x, y);
  }

  /** Empty air behind the hero: no monster, no coin. */
  async tapSky(): Promise<void> {
    const [, y] = (await this.landmark('data-kill-point', 2)) as [number, number];
    const box = await this.scene.boundingBox();
    if (!box) throw new Error('the scene canvas has no box');
    await this.tap(box.x + 8, y - 40);
  }

  /** `count` taps spread along the span where thrown coins come down. */
  async tapAlongLanding(count: number, gapMs: number): Promise<void> {
    const [x0, x1, y] = (await this.landmark('data-landing', 3)) as [number, number, number];
    for (let i = 0; i < count; i++) {
      await this.tap(x0 + ((x1 - x0) * (i % 8)) / 7, y - 6);
      await this.play(gapMs);
    }
  }

  async tap(x: number, y: number): Promise<void> {
    if (this.touch) await this.page.touchscreen.tap(x, y);
    else await this.page.mouse.click(x, y);
  }

  /** Client-pixel landmarks the scene publishes on its canvas for probes (app/src/view.ts). */
  private async landmark(attribute: string, count: number): Promise<number[]> {
    const shape = new RegExp(`^-?\\d+(,-?\\d+){${count - 1}}$`);
    await expect(this.scene).toHaveAttribute(attribute, shape);
    return (await this.scene.getAttribute(attribute))!.split(',').map(Number);
  }

  // --- Shop --------------------------------------------------------------

  skill(name: string): Locator {
    return this.page.getByRole('button', { name: new RegExp(`^${name} `) });
  }

  /** A gear slot. They have no role, so this keys on the slot id the markup carries. */
  gearSlot(slot: 'weapon' | 'armor' | 'trinket'): Locator {
    return this.gear.locator(`[data-slot="${slot}"]`);
  }

  /** Take the game's own Best value pick until nothing is affordable. */
  async spendGold(): Promise<number> {
    let bought = 0;
    while (await this.bestValue.isVisible()) {
      await this.bestValue.click();
      bought += 1;
      if (bought > 100) throw new Error('Best value still showing after 100 purchases');
    }
    return bought;
  }

  // --- Portal and boss ---------------------------------------------------

  /** Walk the Road until the portal opens. Realm 0 is tuned to open inside 80 minutes. */
  async walkToPortal(): Promise<void> {
    await this.playUntilReady(this.enterPortal, { within: 80 * MINUTE });
  }

  /** Press and hold the Abandon button for `ms` of game time, then let go. */
  async holdAbandon(ms: number): Promise<void> {
    const box = await this.abandon.boundingBox();
    if (!box) throw new Error('the Abandon button has no box');
    await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await this.page.mouse.down();
    await this.play(ms);
    await this.page.mouse.up();
  }

  /** The panel's own estimate of the fight, in seconds. */
  async etaSec(): Promise<number> {
    return parseDuration(await this.bossEta.textContent());
  }

  // --- Debug drawer (dev builds only) ------------------------------------

  async timeWarp(label: '+1h' | '+8h'): Promise<void> {
    await this.settings.click();
    await this.page.getByRole('button', { name: `Time-warp ${label}` }).click();
  }

  /** The return recap's five tallies, in the order the card lists them. */
  recapTallies(): Locator {
    return this.recap.getByRole('listitem');
  }

  /**
   * Tab `presses` times and name every stop outside `dialog`. Leaving the
   * document between laps is fine; landing on the page behind it is not.
   */
  async tabStopsOutside(dialog: Locator, presses: number): Promise<string[]> {
    const handle = await dialog.elementHandle();
    const strays: string[] = [];
    for (let i = 0; i < presses; i++) {
      await this.page.keyboard.press('Tab');
      const stray = await this.page.evaluate((box) => {
        const at = document.activeElement;
        if (!at || at === document.body || box?.contains(at)) return null;
        return at.getAttribute('aria-label') ?? at.textContent?.trim() ?? at.tagName;
      }, handle);
      if (stray !== null) strays.push(stray);
    }
    return strays;
  }
}

/** A panel section, found by its heading. */
function panel(page: Page, heading: string): Locator {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: heading }) });
}
