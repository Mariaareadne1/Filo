import { parseQuery } from '../lib/discovery/parseQuery';

describe('parseQuery — grounded filters only', () => {
  test('“Quiet cafes where I could work in the afternoon” → cafe + coffee tags + honest notes', () => {
    const p = parseQuery('Quiet cafes where I could work in the afternoon');
    expect(p.category).toBe('cafe');
    expect(p.terms).toEqual(expect.arrayContaining(['coffee', 'cafe']));
    expect(p.notes.join(' ')).toMatch(/noise/i);
    expect(p.notes.join(' ')).toMatch(/hours/i);
    expect(p.text).toBe('');
  });

  test('“Somewhere fun to take a first date in Brooklyn” → bar, cocktail/wine, Brooklyn radius', () => {
    const p = parseQuery('Somewhere fun to take a first date in Brooklyn');
    expect(p.category).toBe('bar');
    expect(p.terms).toEqual(expect.arrayContaining(['cocktail', 'wine']));
    expect(p.near?.label).toBe('Brooklyn');
    expect(p.radiusM).toBeGreaterThan(3000);
    expect(p.notes.join(' ')).toMatch(/subjective/i);
  });

  test('“Vintage shops around the Lower East Side” → retail + vintage tag + LES', () => {
    const p = parseQuery('Vintage shops around the Lower East Side');
    expect(p.category).toBe('retail');
    expect(p.terms).toEqual(expect.arrayContaining(['vintage']));
    expect(p.near?.label).toBe('Lower East Side');
    expect(p.text).toContain('vintage');
  });

  test('“Affordable dinner near campus that my friends have saved” → food, campus, friends-only, price caveat', () => {
    const p = parseQuery('Affordable dinner near campus that my friends have saved');
    expect(p.category).toBe('food');
    expect(p.near?.label).toBe('campus');
    expect(p.radiusM).toBe(1500);
    expect(p.friendsOnly).toBe(true);
    expect(p.notes.join(' ')).toMatch(/prices/i);
  });

  test('a plain venue name passes through as text with no invented filters', () => {
    const p = parseQuery('Hungarian Pastry Shop');
    expect(p.text).toContain('hungarian');
    expect(p.friendsOnly).toBe(false);
    expect(p.near).toBeNull();
    expect(p.notes).toEqual([]);
  });

  test('“near me” asks the caller for device location instead of guessing', () => {
    const p = parseQuery('ramen near me');
    expect(p.nearMe).toBe(true);
    expect(p.near).toBeNull();
    expect(p.terms).toEqual(expect.arrayContaining(['ramen']));
  });

  test('empty and punctuation-only input is safe', () => {
    expect(parseQuery('').text).toBe('');
    expect(parseQuery('!!! ???').category).toBeNull();
  });

  test('terms are single lowercase words (safe for tsquery)', () => {
    const p = parseQuery('cocktails and wine in the West Village');
    for (const t of p.terms) expect(t).toMatch(/^[a-zé]+$/);
  });
});

import { normalizeEmail } from '../lib/validation';
test('email normalization strips invisible characters from autofill/paste', () => {
  expect(normalizeEmail(' You@Columbia.edu ')).toBe('you@columbia.edu');
  expect(normalizeEmail('you​@columbia.edu')).toBe('you@columbia.edu');
  expect(normalizeEmail('you@ columbia.edu')).toBe('you@columbia.edu');
});
