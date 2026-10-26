import type { Category } from '../categories';

/**
 * Natural-language query → structured, GROUNDED filters.
 *
 * Only maps phrases onto things Filo actually stores: category, the
 * provider's real POI tags, neighborhood (as a distance filter), and the
 * social graph ("my friends saved"). Attributes Filo has NO data for —
 * noise level, price, opening hours, "romantic" — are never faked; they
 * produce an explicit `notes` entry so the UI can say what it can't know.
 *
 * Pure and deterministic (unit-tested in __tests__/parseQuery.test.ts).
 */

export interface ParsedQuery {
  /** Remaining free text for name/tag full-text matching. */
  text: string;
  /** Single-word tag synonyms to OR-match against real tags. */
  terms: string[];
  category: Category | null;
  near: { lat: number; lng: number; label: string } | null;
  radiusM: number | null;
  friendsOnly: boolean;
  /** Uses the device location (resolved by the caller). */
  nearMe: boolean;
  /** Honest caveats about attributes Filo can't verify. */
  notes: string[];
}

const CAMPUS = { lat: 40.8075, lng: -73.9626, label: 'campus' };

/** Approximate centroids; radius scales with the area's size. */
const NEIGHBORHOODS: { names: string[]; lat: number; lng: number; radius: number; label: string }[] = [
  { names: ['morningside heights', 'morningside'], lat: 40.8100, lng: -73.9625, radius: 1200, label: 'Morningside Heights' },
  { names: ['upper west side', 'uws'], lat: 40.7870, lng: -73.9754, radius: 1800, label: 'Upper West Side' },
  { names: ['upper east side', 'ues'], lat: 40.7736, lng: -73.9566, radius: 1800, label: 'Upper East Side' },
  { names: ['harlem'], lat: 40.8116, lng: -73.9465, radius: 1800, label: 'Harlem' },
  { names: ['hamilton heights'], lat: 40.8247, lng: -73.9493, radius: 1100, label: 'Hamilton Heights' },
  { names: ['manhattan valley'], lat: 40.7980, lng: -73.9680, radius: 800, label: 'Manhattan Valley' },
  { names: ['lower east side', 'les'], lat: 40.7150, lng: -73.9843, radius: 1000, label: 'Lower East Side' },
  { names: ['east village'], lat: 40.7265, lng: -73.9815, radius: 900, label: 'East Village' },
  { names: ['west village'], lat: 40.7358, lng: -74.0036, radius: 900, label: 'West Village' },
  { names: ['greenwich village', 'the village'], lat: 40.7336, lng: -73.9990, radius: 1000, label: 'Greenwich Village' },
  { names: ['soho'], lat: 40.7233, lng: -74.0030, radius: 700, label: 'SoHo' },
  { names: ['chelsea'], lat: 40.7465, lng: -74.0014, radius: 1000, label: 'Chelsea' },
  { names: ['midtown'], lat: 40.7549, lng: -73.9840, radius: 1600, label: 'Midtown' },
  { names: ['gramercy'], lat: 40.7368, lng: -73.9845, radius: 600, label: 'Gramercy' },
  { names: ['williamsburg'], lat: 40.7081, lng: -73.9571, radius: 1500, label: 'Williamsburg' },
  { names: ['brooklyn'], lat: 40.6782, lng: -73.9442, radius: 7000, label: 'Brooklyn' },
];

const CATEGORY_WORDS: { re: RegExp; category: Category; terms?: string[] }[] = [
  { re: /\b(caf[eé]s?|coffee|espresso|latte|matcha|tea\s?house|bakery|bakeries|pastr(y|ies))\b/, category: 'cafe', terms: ['coffee', 'café', 'cafe', 'bakery', 'tea'] },
  { re: /\b(bars?|drinks?|cocktails?|wine|beer|pub|speakeasy|nightlife)\b/, category: 'bar' },
  { re: /\b(dinner|lunch|brunch|breakfast|restaurants?|food|eat|pizza|ramen|tacos?|burgers?|sushi|dumplings?|bagels?|noodles?)\b/, category: 'food' },
  { re: /\b(nails?|manicure|hair|haircut|salon|barbers?|spa|brows?|lash(es)?)\b/, category: 'beauty' },
  { re: /\b(vintage|thrift|bookstores?|books?|records?|boutiques?|shops?|shopping|clothes|clothing)\b/, category: 'retail' },
  { re: /\b(museums?|galler(y|ies)|climbing|bouldering|gym|yoga|pottery|movies?|cinema|theat(er|re)|concerts?|activit(y|ies))\b/, category: 'experience' },
];

/** Single-word tags worth OR-matching for a matched word. */
const TAG_HINTS: Record<string, string[]> = {
  pizza: ['pizza'], ramen: ['ramen', 'noodle'], tacos: ['mexican', 'taco'], taco: ['mexican', 'taco'],
  sushi: ['sushi', 'japanese'], burger: ['burger'], burgers: ['burger'], bagel: ['bagel'], bagels: ['bagel'],
  vintage: ['vintage', 'thrift'], thrift: ['thrift', 'vintage'], books: ['bookstore', 'book'], bookstore: ['bookstore', 'book'],
  records: ['record', 'music'], wine: ['wine'], cocktail: ['cocktail'], cocktails: ['cocktail'], beer: ['beer', 'brewery'],
  climbing: ['climbing'], bouldering: ['climbing'], museum: ['museum'], museums: ['museum'], nails: ['nail'], nail: ['nail'],
};

const STOP = new Set(
  ('a an the and or of in on at to for with near me my i we some somewhere something place places spot spots ' +
   'good great best nice where could can should would like want find show any around that this have has ' +
   'friends friend saved liked love loves is are be it its').split(' '),
);

export function parseQuery(raw: string): ParsedQuery {
  let q = ` ${raw.toLowerCase().replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim()} `;
  const notes: string[] = [];
  const terms = new Set<string>();
  let category: Category | null = null;
  let near: ParsedQuery['near'] = null;
  let radiusM: number | null = null;
  let friendsOnly = false;
  let nearMe = false;

  const take = (re: RegExp): boolean => {
    if (!re.test(q)) return false;
    q = q.replace(re, ' ');
    return true;
  };

  // Social filter — the one "preference" Filo can verify directly.
  if (take(/\b(my )?friends?( have| has|'ve)? (saved|pinned|liked|love|been to|go to)\b|\bsaved by (my )?friends\b|\bfriends like\b/)) {
    friendsOnly = true;
  }

  // Location.
  if (take(/\bnear (campus|columbia|barnard)\b|\bby (campus|columbia)\b|\baround campus\b/)) {
    near = CAMPUS; radiusM = 1500;
  } else if (take(/\bnear me\b|\bnearby\b|\bclose by\b|\baround here\b/)) {
    nearMe = true; radiusM = 1500;
  } else {
    for (const n of NEIGHBORHOODS) {
      const name = n.names.find((x) => q.includes(` ${x} `) || q.includes(` in ${x} `) || q.includes(` around ${x} `));
      if (name) {
        q = q.replace(new RegExp(`\\b(in |around |near )?(the )?${name}\\b`), ' ');
        near = { lat: n.lat, lng: n.lng, label: n.label };
        radiusM = n.radius;
        break;
      }
    }
  }

  // Attributes Filo cannot verify → honest notes (and sensible real-data proxies).
  if (take(/\b(quiet|calm|chill|cozy|peaceful)\b/)) {
    notes.push("Filo doesn't know noise levels — friends' notes are the best signal.");
  }
  if (take(/\b(work|study|studying|laptop|wifi|wi-fi|read|reading)\b/)) {
    if (!category) category = 'cafe';
    ['coffee', 'café', 'cafe', 'bakery', 'tea'].forEach((t) => terms.add(t));
    notes.push("Wi-fi and outlets aren't tracked; showing cafes.");
  }
  if (take(/\b(first date|date night|date spot|date|romantic)\b/)) {
    if (!category) category = 'bar';
    ['cocktail', 'wine'].forEach((t) => terms.add(t));
    notes.push('“Date-worthy” is subjective — leaning on cocktail and wine bars.');
  }
  if (take(/\b(cheap|affordable|budget|inexpensive|under \$?\d+|\$+)\b/)) {
    notes.push("Prices aren't available yet, so results aren't filtered by cost.");
  }
  if (take(/\b(open late|late night|late-night|tonight|right now|open now|in the (afternoon|morning|evening)|afternoon|morning|evening)\b/)) {
    notes.push("Opening hours aren't available yet — check before you go.");
  }
  if (take(/\b(fun|cool|cute|vibey|trendy|hidden|underrated|best)\b/)) {
    // Subjective words: rely on friends' rankings rather than claiming it.
  }

  // Category + tag hints from content words.
  for (const c of CATEGORY_WORDS) {
    const m = q.match(c.re);
    if (!m) continue;
    if (!category) category = c.category;
    for (const word of m[0].split(' ')) TAG_HINTS[word]?.forEach((t) => terms.add(t));
    if (c.category === 'cafe' && category === 'cafe') c.terms?.forEach((t) => terms.add(t));
    // Keep specific dish/shop words as searchable text; drop generic ones.
    if (/\b(food|eat|restaurants?|shops?|shopping|drinks?|bars?|caf[eé]s?|activit(y|ies)|place)\b/.test(m[0])) {
      q = q.replace(c.re, ' ');
    }
  }

  const text = q
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .join(' ')
    .trim();

  return {
    text,
    terms: Array.from(terms).filter((t) => /^[a-zé]+$/.test(t)),
    category,
    near,
    radiusM,
    friendsOnly,
    nearMe,
    notes,
  };
}
