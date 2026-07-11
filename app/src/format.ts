// Presentational number & time formatting for the UI. No game math here — these
// only shape values from @wanderblade/core into short, mobile-friendly strings.

const SUFFIXES = [
  '', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc', 'Ud', 'Dd',
];

/**
 * Compact number: 42 → "42", 1234 → "1.23K", 4.5e9 → "4.50B". Values past the
 * suffix table fall back to exponential ("1.23e45"). Small values are floored so
 * counters read as clean integers ("+12 gold", not "+12.3 gold").
 */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  if (n < 0) return '-' + formatNumber(-n);
  if (n < 1000) return Math.floor(n).toString();

  const tier = Math.floor(Math.log10(n) / 3);
  if (tier < SUFFIXES.length) {
    const scaled = n / Math.pow(1000, tier);
    const decimals = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
    return scaled.toFixed(decimals) + SUFFIXES[tier];
  }
  return n.toExponential(2);
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
export function formatDuration(totalSec: number): string {
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
