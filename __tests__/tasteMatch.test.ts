import { spearmanPct, MIN_OVERLAP } from '../lib/tasteMatch';

describe('spearmanPct', () => {
  test('returns 0 for fewer than 2 overlapping places', () => {
    expect(spearmanPct([])).toBe(0);
    expect(spearmanPct([[1, 1]])).toBe(0);
  });

  test('identical rankings score 100%', () => {
    // Arrange: both users rank the same 4 places in the same order.
    const pairs: [number, number][] = [
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
    ];
    // Act + Assert
    expect(spearmanPct(pairs)).toBe(100);
  });

  test('exactly reversed rankings clamp to 0% (anti-twins)', () => {
    const pairs: [number, number][] = [
      [1, 4],
      [2, 3],
      [3, 2],
      [4, 1],
    ];
    // rho = -1 → clamped to 0
    expect(spearmanPct(pairs)).toBe(0);
  });

  test('re-ranks within the overlap subset, not absolute positions', () => {
    // Absolute positions are far apart (10,20,30 vs 3,7,50) but the *order*
    // agrees, so within-subset ranks match → 100%.
    const pairs: [number, number][] = [
      [10, 3],
      [20, 7],
      [30, 50],
    ];
    expect(spearmanPct(pairs)).toBe(100);
  });

  test('one swapped adjacent pair yields a high-but-imperfect score', () => {
    // my order: A,B,C,D ; their order swaps C and D → strong positive < 100.
    const pairs: [number, number][] = [
      [1, 1],
      [2, 2],
      [3, 4],
      [4, 3],
    ];
    const pct = spearmanPct(pairs);
    expect(pct).toBeGreaterThan(50);
    expect(pct).toBeLessThan(100);
    // n=4 → 1 - 6·(0+0+1+1)/(4·15) = 1 - 12/60 = 0.8 → 80
    expect(pct).toBe(80);
  });

  test('result is always within [0, 100]', () => {
    const pairs: [number, number][] = [
      [1, 3],
      [2, 1],
      [3, 5],
      [4, 2],
      [5, 4],
    ];
    const pct = spearmanPct(pairs);
    expect(pct).toBeGreaterThanOrEqual(0);
    expect(pct).toBeLessThanOrEqual(100);
  });

  test('MIN_OVERLAP threshold is 3', () => {
    expect(MIN_OVERLAP).toBe(3);
  });
});
