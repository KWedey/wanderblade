// Active-play input cadence (docs/ACTIVE-PLAY.md). The momentum curve is core's;
// this is the one number the input layer needs off it, kept apart from the view
// so it stays derivable and testable without a DOM.

import { sustainStrikeRate } from '@wanderblade/core';

/** Auto-strike cadence while the input is held: core's sustain rate, inverted. */
export const HOLD_STRIKE_INTERVAL_SEC = 1 / sustainStrikeRate();
