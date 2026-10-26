/**
 * The ONE category vocabulary shared by places, pins, rankings, filters and
 * discovery. Before Filo 2.0 places used food|bar|… while rankings used
 * cafes|bars|shops|…, so a bar ranked from the map never appeared on the
 * Rankings screen. The database now CHECKs this exact set on both tables
 * (migration 20261026000000_filo2_integrity.sql).
 */

export const CATEGORIES = ['cafe', 'food', 'bar', 'beauty', 'experience', 'retail'] as const;

export type Category = (typeof CATEGORIES)[number];

export interface CategoryMeta {
  /** Short lowercase chip/filter label. */
  short: string;
  /** Plural for headings ("your cafes."). */
  plural: string;
  /** Long label for detail screens. */
  label: string;
  /** SF Symbol name (iOS) used by the glass UI. */
  symbol: string;
  /** Fallback glyph where SF Symbols are unavailable. */
  glyph: string;
}

export const CATEGORY_META: Record<Category, CategoryMeta> = {
  cafe:       { short: 'cafes',       plural: 'cafes',       label: 'Cafe & Coffee',     symbol: 'cup.and.saucer.fill', glyph: '◒' },
  food:       { short: 'food',        plural: 'restaurants', label: 'Food & Drink',      symbol: 'fork.knife',          glyph: '◆' },
  bar:        { short: 'bars',        plural: 'bars',        label: 'Bars & Nightlife',  symbol: 'wineglass.fill',      glyph: '○' },
  beauty:     { short: 'beauty',      plural: 'beauty spots', label: 'Beauty & Grooming', symbol: 'scissors',           glyph: '◇' },
  experience: { short: 'experiences', plural: 'experiences', label: 'Experiences',       symbol: 'sparkles',            glyph: '✦' },
  retail:     { short: 'shops',       plural: 'shops',       label: 'Taste Retail',      symbol: 'bag.fill',            glyph: '◉' },
};

export function isCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORIES as readonly string[]).includes(value);
}

/**
 * Accepts any historical spelling (old discover vocab, plural, Google-ish)
 * and returns the canonical category, or null if unrecognised. Used to read
 * route params and legacy rows defensively.
 */
export function normalizeCategory(value: unknown): Category | null {
  if (typeof value !== 'string') return null;
  const v = value.trim().toLowerCase();
  if (isCategory(v)) return v;
  const legacy: Record<string, Category> = {
    cafes: 'cafe',
    coffee: 'cafe',
    bars: 'bar',
    shops: 'retail',
    shop: 'retail',
    experiences: 'experience',
    restaurants: 'food',
  };
  return legacy[v] ?? null;
}

/** Google Places (legacy `types`) → Filo category. Order matters: a place
 *  tagged both `cafe` and `restaurant` is a cafe; `bar`+`restaurant` a bar. */
export function categoryFromGoogleTypes(types: readonly string[]): Category {
  const has = (...t: string[]) => types.some((x) => t.includes(x));
  if (has('cafe', 'coffee_shop')) return 'cafe';
  if (has('bar', 'night_club', 'brewery', 'wine_bar', 'pub')) return 'bar';
  if (has('restaurant', 'bakery', 'meal_takeaway', 'meal_delivery', 'food')) return 'food';
  if (has('beauty_salon', 'hair_care', 'spa', 'nail_salon', 'barber_shop')) return 'beauty';
  if (has('clothing_store', 'book_store', 'shoe_store', 'jewelry_store', 'home_goods_store',
          'furniture_store', 'store', 'shopping_mall')) return 'retail';
  return 'experience';
}
