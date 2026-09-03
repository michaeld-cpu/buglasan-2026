/** Small numeric helpers. Kept separate so they can be tested in isolation. */

/** Round to `dp` decimal places, avoiding float dust like 33.33000000000001. */
export function round(n: number, dp = 4): number {
  const f = Math.pow(10, dp);
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function sum(ns: number[]): number {
  return ns.reduce((a, b) => a + b, 0);
}

export function mean(ns: number[]): number {
  return ns.length === 0 ? 0 : sum(ns) / ns.length;
}

/** Clamp into [lo, hi]. */
export function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Average-tie ranking (a.k.a. fractional ranking), descending by value:
 * values [10, 9, 9, 8] -> ranks [1, 2.5, 2.5, 4].
 *
 * Average ties rather than dense or ordinal ranks matter here: every judge's
 * sheet must sum to the same total (n(n+1)/2), otherwise a judge who ties
 * candidates gains or loses influence over the aggregate. That would be a real
 * fairness bug in a ranking-system pageant.
 */
export function averageTieRanks<T>(
  items: T[],
  valueOf: (item: T) => number
): Map<T, number> {
  const sorted = [...items].sort((a, b) => valueOf(b) - valueOf(a));
  const ranks = new Map<T, number>();

  let i = 0;
  while (i < sorted.length) {
    const v = valueOf(sorted[i]);
    let j = i;
    while (j + 1 < sorted.length && valueOf(sorted[j + 1]) === v) j++;
    // Positions i..j (0-based) are tied; ranks are i+1..j+1.
    const avg = (i + 1 + j + 1) / 2;
    for (let k = i; k <= j; k++) ranks.set(sorted[k], avg);
    i = j + 1;
  }
  return ranks;
}

/**
 * Assign places to already-sorted rows, giving equal places to equal scores.
 * `better(a, b)` returns true when a outranks b.
 */
export function assignPlaces<T extends { score: number }>(
  rows: T[],
  lowerIsBetter = false
): Array<T & { place: number }> {
  const sorted = [...rows].sort((a, b) =>
    lowerIsBetter ? a.score - b.score : b.score - a.score
  );
  const out: Array<T & { place: number }> = [];
  let place = 0;
  let prev: number | null = null;
  sorted.forEach((row, idx) => {
    if (prev === null || row.score !== prev) place = idx + 1;
    prev = row.score;
    out.push({ ...row, place });
  });
  return out;
}

/** Normalize a raw score to 0-100 against a maximum. */
export function normalize(raw: number, maxTotal: number): number {
  if (maxTotal <= 0) return 0;
  return round((raw / maxTotal) * 100);
}

/** Normalize a set of values so the largest becomes 100. Used for social metrics. */
export function normalizeToLeader(values: Map<string, number>): Map<string, number> {
  const max = Math.max(0, ...values.values());
  const out = new Map<string, number>();
  for (const [k, v] of values) out.set(k, max <= 0 ? 0 : round((v / max) * 100));
  return out;
}
