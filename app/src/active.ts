// Active-play input cadence (docs/ACTIVE-PLAY.md).
//
// The momentum curve itself lived here as a stand-in while `advance` could not
// accept strike timestamps. It can (DECISIONS.md #19-#25), so the curve is
// core's alone and this file holds only what the *input layer* needs.

import { sustainStrikeRate } from '@wanderblade/core';

/**
 * Auto-strike cadence while the input is held. Derived from core rather than
 * declared: the local copy said 4 strikes/sec against core's 3.29, and a local
 * MOMENTUM_MAX_BONUS of 1.2 against core's 0.75 - the client was carrying a
 * second, wrong economy beside the real one.
 */
export const HOLD_STRIKE_INTERVAL_SEC = 1 / sustainStrikeRate();
