import {
  nextCompareState,
  insertionRank,
  CompareAnswer,
} from '../lib/rankInsert';

describe('nextCompareState', () => {
  test('"better" searches the upper half', () => {
    // window [0,4), mid=2, better → [0,2)
    expect(nextCompareState(0, 4, 'better')).toEqual({
      done: false,
      window: { lo: 0, hi: 2 },
    });
  });

  test('"worse" searches the lower half', () => {
    // window [0,4), mid=2, worse → [3,4)
    expect(nextCompareState(0, 4, 'worse')).toEqual({
      done: false,
      window: { lo: 3, hi: 4 },
    });
  });

  test('"skip" behaves like "worse"', () => {
    expect(nextCompareState(0, 4, 'skip')).toEqual(
      nextCompareState(0, 4, 'worse'),
    );
  });

  test('"tie" resolves immediately after the midpoint (1-based)', () => {
    // window [0,4), mid=2 → rank 3
    expect(nextCompareState(0, 4, 'tie')).toEqual({ done: true, rank: 3 });
  });

  test('collapsing window resolves to a 1-based rank', () => {
    // window [2,3), mid=2, better → [2,2) collapses → rank 3
    expect(nextCompareState(2, 3, 'better')).toEqual({ done: true, rank: 3 });
    // window [2,3), mid=2, worse → [3,3) collapses → rank 4
    expect(nextCompareState(2, 3, 'worse')).toEqual({ done: true, rank: 4 });
  });
});

describe('insertionRank', () => {
  test('empty pool inserts at rank 1', () => {
    expect(insertionRank(0, () => 'better')).toBe(1);
  });

  test('"better than everything" lands at rank 1', () => {
    // Always outrank the midpoint → converge to the top.
    expect(insertionRank(5, () => 'better')).toBe(1);
  });

  test('"worse than everything" lands at the bottom (poolLength+1)', () => {
    expect(insertionRank(5, () => 'worse')).toBe(6);
  });

  test('converges to the correct slot against a sorted pool', () => {
    // Pool is a sorted ascending list of "scores"; the new item scores 33.
    // "better" means the new item outranks (is above) the pool item.
    // Model ranks as best-first: index 0 is the best (highest score).
    const poolBestFirst = [90, 70, 50, 30, 10];
    const newScore = 33;
    const compare = (mid: number): CompareAnswer =>
      newScore > poolBestFirst[mid] ? 'better' : 'worse';

    // 33 sits between 50 (idx2) and 30 (idx3) → insert at rank 4 (1-based).
    expect(insertionRank(poolBestFirst.length, compare)).toBe(4);
  });

  test('converges in at most ~log2(n)+1 comparisons', () => {
    const poolBestFirst = Array.from({ length: 64 }, (_, i) => 64 - i);
    let calls = 0;
    const compare = (mid: number): CompareAnswer => {
      calls++;
      return 10 > poolBestFirst[mid] ? 'better' : 'worse';
    };
    insertionRank(poolBestFirst.length, compare);
    expect(calls).toBeLessThanOrEqual(Math.ceil(Math.log2(64)) + 1);
  });

  test('a "tie" short-circuits to just after the tied item', () => {
    // First comparison (mid of [0,4) = 2) answers tie → rank 3, one call.
    let calls = 0;
    const rank = insertionRank(4, () => {
      calls++;
      return 'tie';
    });
    expect(rank).toBe(3);
    expect(calls).toBe(1);
  });
});
