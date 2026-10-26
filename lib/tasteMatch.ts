/**
 * Taste matching — the core of Filo's taste graph.
 *
 * Two people's lists are compared on the places BOTH ranked in a category.
 * Spearman's rho is computed as Pearson correlation on average ranks, so
 * ties and gaps are handled correctly (the previous indexOf-based version
 * gave tied items distinct ranks). Because rho on 3 shared places is mostly
 * noise, the similarity used for recommendations is SHRUNK toward 0 by the
 * amount of evidence: confidence = n / (n + SHRINK_K).
 */

export const MIN_OVERLAP = 3;
/** Pseudo-count for shrinkage; with 5 shared places confidence is 0.5. */
export const SHRINK_K = 5;

/** 1-based average ranks; ties share the mean of the positions they span. */
export function averageRanks(values: readonly number[]): number[] {
  const order = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const ranks = new Array<number>(values.length);
  let k = 0;
  while (k < order.length) {
    let j = k;
    while (j + 1 < order.length && order[j + 1].v === order[k].v) j++;
    const avg = (k + j) / 2 + 1;
    for (let t = k; t <= j; t++) ranks[order[t].i] = avg;
    k = j + 1;
  }
  return ranks;
}

function pearson(x: readonly number[], y: readonly number[]): number {
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx, dy = y[i] - my;
    sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
  }
  if (sxx === 0 || syy === 0) return 0; // no variation → no information
  return sxy / Math.sqrt(sxx * syy);
}

/** Tie-correct Spearman rho in [-1, 1] for [myPosition, theirPosition] pairs. */
export function spearmanRho(pairs: readonly [number, number][]): number {
  if (pairs.length < 2) return 0;
  return pearson(averageRanks(pairs.map((p) => p[0])), averageRanks(pairs.map((p) => p[1])));
}

/**
 * Legacy 0..100 display used by the Twins screen: rho clamped at 0
 * (anti-correlation reads as no match), now tie-correct.
 */
export function spearmanPct(pairs: [number, number][]): number {
  const rho = spearmanRho(pairs);
  return Math.max(0, Math.min(100, Math.round(rho * 100)));
}

export interface TasteMatch {
  overlap: number;
  rho: number;
  /** n / (n + SHRINK_K): how much the evidence supports rho. */
  confidence: number;
  /** Shrunk similarity used for ranking recommendations: rho × confidence. */
  similarity: number;
  /** Human label that never overstates thin evidence. */
  label: 'strong' | 'promising' | 'too_early' | 'different';
}

/** Compare two {placeId → position} lists in one category. */
export function tasteMatch(mine: ReadonlyMap<string, number>, theirs: ReadonlyMap<string, number>): TasteMatch {
  const pairs: [number, number][] = [];
  for (const [place, pos] of mine) {
    const other = theirs.get(place);
    if (other !== undefined) pairs.push([pos, other]);
  }
  const n = pairs.length;
  const rho = n >= 2 ? spearmanRho(pairs) : 0;
  const confidence = n / (n + SHRINK_K);
  const similarity = n >= MIN_OVERLAP ? rho * confidence : 0;
  let label: TasteMatch['label'] = 'too_early';
  if (n >= MIN_OVERLAP) {
    if (rho >= 0.6 && n >= 5) label = 'strong';
    else if (rho >= 0.4) label = 'promising';
    else if (rho < 0) label = 'different';
  }
  return { overlap: n, rho, confidence, similarity, label };
}
