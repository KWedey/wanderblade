// The HUD prints numbers the way app/src/format.ts does: "12,288", "1.23K",
// "+117/s", "4m 12s". Tests compare magnitudes, so they read them back.

const SUFFIX: Record<string, number> = { '': 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 };

/** "12,288" → 12288, "1.23K" → 1230, "+117/s" → 117. Throws on anything else. */
export function parseAmount(text: string | null): number {
  const match = /^\+?([\d,]+(?:\.\d+)?)([A-Za-z]*)(?:\/s)?$/.exec((text ?? '').trim());
  const multiplier = SUFFIX[match?.[2] ?? '?'];
  if (!match?.[1] || multiplier === undefined) throw new Error(`not an amount: ${JSON.stringify(text)}`);
  return Number(match[1].replace(/,/g, '')) * multiplier;
}

const SECONDS: Record<string, number> = { d: 86_400, h: 3600, m: 60, s: 1 };

/** "4m 12s" → 252, "1h 05m" → 3900, "38s" → 38. The readout floors, so this is a lower bound. */
export function parseDuration(text: string | null): number {
  const trimmed = (text ?? '').trim();
  if (!/^(\d+[dhms])( \d+[dhms])*$/.test(trimmed)) throw new Error(`not a duration: ${JSON.stringify(text)}`);
  return [...trimmed.matchAll(/(\d+)([dhms])/g)].reduce(
    (sum, [, n, unit]) => sum + Number(n) * SECONDS[unit!]!,
    0,
  );
}
