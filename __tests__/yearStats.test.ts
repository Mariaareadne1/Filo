import { computeYearStats, type YearPin } from '../lib/yearStats';

const pin = (created_at: string, over: Partial<YearPin> = {}): YearPin => ({
  created_at, status: 'visited', category: 'cafe', neighborhood: 'Morningside Heights', ...over,
});

test('counts only the requested year', () => {
  const s = computeYearStats([pin('2026-03-01T12:00:00'), pin('2025-12-31T12:00:00')], 2026);
  expect(s.total).toBe(1);
});

test('uses the real neighborhood, never snapping to the nearest uptown one', () => {
  const s = computeYearStats([
    pin('2026-05-01T12:00:00', { neighborhood: 'Lower East Side' }),
    pin('2026-05-02T12:00:00', { neighborhood: 'Lower East Side' }),
    pin('2026-05-03T12:00:00', { neighborhood: 'Upper West Side' }),
  ], 2026);
  expect(s.topNeighborhood).toBe('Lower East Side');
  expect(s.distinctNeighborhoods).toBe(2);
});

test('unknown neighborhoods are ignored rather than guessed', () => {
  const s = computeYearStats([pin('2026-01-01T12:00:00', { neighborhood: null })], 2026);
  expect(s.topNeighborhood).toBeNull();
});

test('top category, top month and visited count', () => {
  const s = computeYearStats([
    pin('2026-02-01T12:00:00', { category: 'bar', status: 'want_to_go' }),
    pin('2026-02-03T12:00:00', { category: 'bar' }),
    pin('2026-07-01T12:00:00', { category: 'cafe' }),
  ], 2026);
  expect(s.topCategory).toBe('bar');
  expect(s.topMonth).toBe(1);
  expect(s.visited).toBe(2);
});

test('empty year', () => {
  expect(computeYearStats([], 2026)).toMatchObject({ total: 0, topCategory: null, topMonth: null });
});
