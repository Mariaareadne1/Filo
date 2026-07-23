/**
 * Taste-twin matching — the core of Filo's taste graph.
 *
 * Two users are candidate twins in a category when their ranked lists overlap
 * on at least MIN_OVERLAP places; the match strength is the Spearman rank
 * correlation of those overlapping ranks, mapped to 0..100.
 */

export const MIN_OVERLAP = 3;

/**
 * Spearman rank correlation of the overlapping ranks, as a 0..100 percentage.
 *
 * Each side is re-ranked *within the overlap subset* first (so absolute list
 * positions don't distort a small overlap), then
 *   rho = 1 - 6·Σd² / (n·(n²-1))
 * and clamped to [0,100] so an anti-correlation reads as 0 rather than negative.
 *
 * `pairs` is a list of [myRank, theirRank] for each shared place.
 */
export function spearmanPct(pairs: [number, number][]): number {
  const n = pairs.length;
  if (n < 2) return 0;

  const myAbsSorted = pairs.map((p) => p[0]).sort((a, b) => a - b);
  const fAbsSorted = pairs.map((p) => p[1]).sort((a, b) => a - b);

  let sumD2 = 0;
  for (const [m, f] of pairs) {
    const myR = myAbsSorted.indexOf(m) + 1;
    const fR = fAbsSorted.indexOf(f) + 1;
    const d = myR - fR;
    sumD2 += d * d;
  }

  const denom = n * (n * n - 1);
  if (denom === 0) return 0;
  const rho = 1 - (6 * sumD2) / denom;
  return Math.max(0, Math.min(100, Math.round(rho * 100)));
}
