/**
 * Rank-insertion by pairwise comparison — the binary search behind the pin
 * review flow. The user places a new item into their existing ranked list by
 * answering "better / worse / same" about a midpoint item; each answer halves
 * the remaining window, converging in ~log2(n) taps.
 */

export type CompareAnswer = 'better' | 'worse' | 'tie' | 'skip';

export interface CompareWindow {
  /** inclusive lower bound of the search window (0-indexed into the pool) */
  lo: number;
  /** exclusive upper bound */
  hi: number;
}

export type CompareResult =
  | { done: false; window: CompareWindow }
  | { done: true; rank: number };

/**
 * One binary-search step. Given the current window [lo, hi) over the existing
 * ranked pool and the user's answer about the midpoint item, returns either the
 * next window or the resolved 1-based insertion rank.
 *
 * - `better` → the new item outranks the midpoint; search the upper half.
 * - `worse` / `skip` → search the lower half (skip = "haven't been", treated as
 *   worse so it doesn't block convergence).
 * - `tie` → place immediately after the midpoint.
 */
export function nextCompareState(
  lo: number,
  hi: number,
  answer: CompareAnswer,
): CompareResult {
  const mid = Math.floor((lo + hi) / 2);

  if (answer === 'tie') {
    return { done: true, rank: mid + 1 };
  }

  let nextLo = lo;
  let nextHi = hi;
  if (answer === 'better') nextHi = mid;
  else nextLo = mid + 1; // 'worse' | 'skip'

  if (nextLo >= nextHi) {
    return { done: true, rank: nextLo + 1 };
  }
  return { done: false, window: { lo: nextLo, hi: nextHi } };
}

/**
 * Drives {@link nextCompareState} to convergence. `compare(midIndex)` answers
 * the comparison for the pool item at `midIndex`. Returns the 1-based rank at
 * which the new item should be inserted (1..poolLength+1).
 */
export function insertionRank(
  poolLength: number,
  compare: (midIndex: number) => CompareAnswer,
): number {
  if (poolLength <= 0) return 1;

  let lo = 0;
  let hi = poolLength;
  // The window strictly shrinks each step, so poolLength+2 iterations is a hard
  // upper bound; the guard only protects against a misbehaving comparator.
  for (let guard = 0; guard <= poolLength + 1; guard++) {
    const mid = Math.floor((lo + hi) / 2);
    const res = nextCompareState(lo, hi, compare(mid));
    if (res.done) return res.rank;
    lo = res.window.lo;
    hi = res.window.hi;
  }
  return lo + 1;
}
