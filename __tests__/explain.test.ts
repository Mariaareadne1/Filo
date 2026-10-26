import { explain } from '../lib/discovery/explain';

describe('explain — only evidence-backed reasons', () => {
  test('no evidence → no reasons (no generic filler)', () => {
    expect(explain({ category: 'cafe' })).toEqual([]);
  });
  test('names real friends and counts the rest', () => {
    expect(explain({ category: 'cafe', friendCount: 1, friendNames: ['ada'] })).toEqual(['Saved by @ada']);
    expect(explain({ category: 'cafe', friendCount: 2, friendNames: ['ada', 'cal'] })[0]).toBe('Saved by @ada and @cal');
    expect(explain({ category: 'cafe', friendCount: 4, friendNames: ['ada'] })[0]).toBe('Saved by @ada and 3 other friends');
  });
  test('taste match states the overlap it is based on', () => {
    const r = explain({ category: 'cafe', tasteFrom: { username: 'dee', overlap: 6, position: 2, label: 'strong' } });
    expect(r[0]).toBe('#2 for @dee, who ranks like you (6 shared)');
  });
  test('friend rank only claimed when it is actually top 3', () => {
    expect(explain({ category: 'bar', friendTopRank: 7 })).toEqual([]);
    expect(explain({ category: 'bar', friendTopRank: 1 })[0]).toBe("Top pick on a friend's bars list");
  });
  test('walking time from real distance; far places get none', () => {
    expect(explain({ category: 'food', distanceM: 800 })).toEqual(['10 min walk']);
    expect(explain({ category: 'food', distanceM: 9000 })).toEqual([]);
  });
  test('at most three reasons', () => {
    const r = explain({ category: 'cafe', friendCount: 2, friendNames: ['a', 'b'], friendTopRank: 1, myStatus: 'want_to_go', distanceM: 100, matchedTags: ['coffee'] });
    expect(r).toHaveLength(3);
  });
});
