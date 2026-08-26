// Presentational number & time formatting for the UI. No game math here — these
// only shape values from @wanderblade/core into short, mobile-friendly strings.

const SUFFIXES = [
  '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd',
  'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod', 'Vg',
];

const ALPHA = 'abcdefghijklmnopqrstuvwxyz';

/**
 * Suffix for a power-of-1000 tier. Past the named ladder it rolls into
 * two-letter pairs (aa, ab, ...) rather than falling back to exponentials:
 * a staged realm-199 run reads 1e278, and "1.0637e+278" is not a number a
 * player can compare against a price.
 */
export function suffixFor(tier: number): string | null {
  if (tier < 0) return null;
  if (tier < SUFFIXES.length) return SUFFIXES[tier] ?? null;
  const i = tier - SUFFIXES.length;
  const hi = Math.floor(i / ALPHA.length);
  const lo = i % ALPHA.length;
  if (hi >= ALPHA.length) return null;
  return `${ALPHA[hi]!}${ALPHA[lo]!}`;
}

/**
 * Compact number: 42 → "42", 1234 → "1.23K", 4.5e9 → "4.50B". Values past the
 * suffix table fall back to exponential ("1.23e45"). Small values are floored so
 * counters read as clean integers ("+12 gold", not "+12.3 gold").
 */
/** Drops a trailing decimal point and any zeros behind it. */
function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + formatNumber(-n);
  // Two significant digits under 10, so a real payout never prints as "0".
  // An arc catch pays 15% of a kill, which at realm 0 is a fraction of a gold.
  if (n > 0 && n < 10) {
    const digits = Math.max(0, 1 - Math.floor(Math.log10(n)));
    return trimZeros(n.toFixed(Math.min(6, digits)));
  }
  if (n < 1000) return Math.floor(n).toString();

  let tier = Math.floor(Math.log10(n) / 3);
  let scaled = n / Math.pow(1000, tier);
  // Both fixups are the same fault: the precision is chosen from the raw value
  // and then rounding moves it into the next bracket. 9.999e12 printed
  // "10.00T" and 9.9999e14 printed "1000T", four significant digits in a
  // column where every neighbouring value shows three.
  if (Number(scaled.toFixed(0)) >= 1000) {
    tier += 1;
    scaled = n / Math.pow(1000, tier);
  }
  const suffix = suffixFor(tier);
  if (suffix === null) return n.toExponential(2);
  let decimals = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  while (decimals > 0 && Number(scaled.toFixed(decimals)) >= (decimals === 2 ? 10 : 100)) {
    decimals--;
  }
  return scaled.toFixed(decimals) + suffix;
}

/**
 * Odometer format for the live gold counter — tuned so low-order digits visibly
 * churn at every scale (the "numbers go fast" fix, DECISIONS.md #12):
 *   0..999       → one decimal ("42.7") so the tail moves even at ~0.5 gold/s
 *   1e3..1e6-1   → full digits with separators ("12,847")
 *   ≥1e6         → ~6 significant figures + suffix ("1.23456M", "123.456M")
 * Costs and stats keep the compact `formatNumber`; only the counter churns.
 */
export function formatGold(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + formatGold(-n);
  if (n < 1000) {
    // Round before branching: 999.97.toFixed(1) would print "1000.0".
    const r = Math.round(n * 10) / 10;
    return r < 1000 ? r.toFixed(1) : '1,000';
  }
  if (n < 1_000_000) return Math.floor(n).toLocaleString('en-US');

  let tier = Math.floor(Math.log10(n) / 3);
  let suffix = suffixFor(tier);
  if (suffix === null) return n.toExponential(4);
  let scaled = n / Math.pow(1000, tier);
  // toFixed rounds the mantissa up to 1000.000 at the very top of a tier —
  // promote to the next suffix so the display never shows 4 integer digits.
  if (scaled >= 999.9995) {
    tier += 1;
    suffix = suffixFor(tier);
    if (suffix === null) return n.toExponential(4);
    scaled = n / Math.pow(1000, tier);
  }
  const intDigits = scaled >= 100 ? 3 : scaled >= 10 ? 2 : 1;
  return scaled.toFixed(6 - intDigits) + suffix;
}

/** Compact per-second rate: "+0.5/s", "+12.4/s", "+1.23K/s". */
export function formatRate(perSec: number): string {
  if (!Number.isFinite(perSec)) return '∞';
  const body = perSec < 100 ? perSec.toFixed(1) : formatNumber(perSec);
  return `+${body}/s`;
}

/** Whole-number percent for meters/readouts: 0.78 → "78%". */
export function formatPercent(ratio: number): string {
  if (!Number.isFinite(ratio)) return '∞';
  return Math.round(ratio * 100) + '%';
}

/**
 * Human duration for cooldowns and recap spans:
 * 45 → "45s", 130 → "2m 10s", 7400 → "2h 3m", 90000 → "1d 1h".
 */
/**
 * Shown when the duration is not a number the game can represent. Deep realms
 * overflow boss HP past a double, so no estimate exists to print; a bare dash
 * read as an empty field.
 */
export const NO_ESTIMATE = 'beyond reckoning';

export function formatDuration(totalSec: number): string {
  if (!Number.isFinite(totalSec)) return NO_ESTIMATE;
  const s = Math.max(0, Math.floor(totalSec));
  if (s < 60) return `${s}s`;

  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
}
