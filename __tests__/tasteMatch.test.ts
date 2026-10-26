import { averageRanks, MIN_OVERLAP, SHRINK_K, spearmanPct, spearmanRho, tasteMatch } from '../lib/tasteMatch';

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

describe('tie-correct Spearman + shrinkage', () => {
  test('average ranks share the mean position for ties', () => {
    expect(averageRanks([10, 20, 20, 30])).toEqual([1, 2.5, 2.5, 4]);
  });

  test('perfect agreement and perfect disagreement', () => {
    expect(spearmanRho([[1, 1], [2, 2], [3, 3], [4, 4]])).toBeCloseTo(1);
    expect(spearmanRho([[1, 4], [2, 3], [3, 2], [4, 1]])).toBeCloseTo(-1);
  });

  test('ties no longer produce impossible ranks (old indexOf bug)', () => {
    // Two of their positions tie; rho must stay within [-1, 1] and be finite.
    const rho = spearmanRho([[1, 2], [2, 2], [3, 5]]);
    expect(Number.isFinite(rho)).toBe(true);
    expect(rho).toBeLessThanOrEqual(1);
  });

  test('no variation on one side carries no information', () => {
    expect(spearmanRho([[1, 3], [2, 3], [3, 3]])).toBe(0);
  });

  test('three shared places never reads as a strong match', () => {
    const m = tasteMatch(new Map([['a', 1], ['b', 2], ['c', 3]]), new Map([['a', 1], ['b', 2], ['c', 3]]));
    expect(m.rho).toBeCloseTo(1);
    expect(m.confidence).toBeCloseTo(3 / (3 + SHRINK_K));
    expect(m.similarity).toBeLessThan(0.5);
    expect(m.label).toBe('promising');
  });

  test('strong requires evidence (≥5 shared) and agreement', () => {
    const mine = new Map(['a', 'b', 'c', 'd', 'e', 'f'].map((p, i) => [p, i + 1] as const));
    const theirs = new Map(['a', 'b', 'c', 'e', 'd', 'f'].map((p, i) => [p, i + 1] as const));
    expect(tasteMatch(mine, theirs).label).toBe('strong');
  });

  test('below minimum overlap → too early, zero similarity', () => {
    const m = tasteMatch(new Map([['a', 1], ['b', 2]]), new Map([['a', 2], ['b', 1]]));
    expect(m.label).toBe('too_early');
    expect(m.similarity).toBe(0);
  });
});
