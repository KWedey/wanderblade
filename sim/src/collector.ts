// Event collector: folds the deterministic event stream from advance() (and
// bot-initiated boss challenges) into the metrics the validators need.
//
// Trash kill-time measurement (validator 6) is EXACT: consecutive `kill` events
// are stamped with their absolute completion time, so the delta between adjacent
// kills is precisely the later kill's kill-time. Because DPS is monotonically
// non-decreasing over a run (gear/levels/skills only go up) while enemy HP jumps
// at each zone, every trash kill-time peak lands at a zone's first kill — and
// those first kills are captured here by construction. The driver (simulate.ts)
// sub-steps advances so each sub-step stays under EVENT_CAP; no kill event is
// ever truncated, so the delta chain is complete end-to-end.

import { zonesPerRegion, type GameEvent, type Recap } from '@wanderblade/core';
import type { GateRecord } from './types';

export class Collector {
  // Aggregate recap totals (accumulated from each advance's exact recap).
  kills = 0;
  goldEarned = 0;
  drops = 0;
  equips = 0;
  leaguesTraveled = 0;
  bossWins = 0;
  zonesEntered = 0;
  regionsEntered = 0;

  // Headline milestones.
  firstPurchaseSec: number | null = null;
  firstBossSec: number | null = null;

  // Trash kill-time peak (validator 6).
  maxTrashKillTime = 0;
  maxTrashKillTimeZone = 0;
  maxTrashKillTimeSec = 0;
  private lastKillTimeSec = 0;

  // Per-region gate wall timing (validator 5).
  private gates = new Map<number, GateRecord>();

  /** Record the first successful purchase's game-time (called by the bot). */
  notePurchase(timeSec: number): void {
    if (this.firstPurchaseSec === null) this.firstPurchaseSec = timeSec;
  }

  /** Fold an advance's exact recap into the running totals. */
  addRecap(recap: Recap): void {
    this.kills += recap.kills;
    this.goldEarned += recap.goldEarned;
    this.drops += recap.drops;
    this.equips += recap.equips;
    this.leaguesTraveled += recap.leaguesTraveled;
    this.bossWins += recap.bossWins;
    this.zonesEntered += recap.zonesEntered;
    this.regionsEntered += recap.regionsEntered;
  }

  /**
   * Process an ordered slice of events (from advance() or challengeBoss()).
   * Kill events must arrive in completion order for the delta chain to hold.
   */
  processEvents(events: readonly GameEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'kill': {
          const dur = e.timeSec - this.lastKillTimeSec;
          if (dur > this.maxTrashKillTime) {
            this.maxTrashKillTime = dur;
            this.maxTrashKillTimeZone = e.zone;
            this.maxTrashKillTimeSec = e.timeSec;
          }
          this.lastKillTimeSec = e.timeSec;
          break;
        }
        case 'gate': {
          if (!this.gates.has(e.region)) {
            this.gates.set(e.region, {
              region: e.region,
              zone: e.zone,
              formSec: e.timeSec,
              crossSec: null,
              parkedSec: 0,
              crossed: false,
            });
          }
          break;
        }
        case 'bossWin': {
          if (this.firstBossSec === null) this.firstBossSec = e.timeSec;
          const gate = this.gates.get(e.region);
          if (gate && gate.crossSec === null) {
            gate.crossSec = e.timeSec;
            gate.parkedSec = e.timeSec - gate.formSec;
            gate.crossed = true;
          }
          break;
        }
        // drop / equip / zone / region / edge / bossFail are already reflected
        // in the recap totals or are not needed for a validator.
        default:
          break;
      }
    }
  }

  /** Finalize gate records, filling parked-time for any gate never crossed. */
  gateRecords(runEndSec: number): GateRecord[] {
    const out: GateRecord[] = [];
    for (const g of this.gates.values()) {
      if (!g.crossed) g.parkedSec = runEndSec - g.formSec;
      out.push(g);
    }
    out.sort((a, b) => a.region - b.region);
    return out;
  }
}

/** Region index for a global zone. */
export function regionOf(zone: number): number {
  return Math.floor(zone / zonesPerRegion);
}
