import type { Category } from './categories';

export interface YearPin {
  created_at: string;
  status: 'visited' | 'want_to_go';
  category: Category;
  /** Provider neighborhood; null when unknown (never guessed). */
  neighborhood: string | null;
}

export interface YearStats {
  total: number;
  visited: number;
  topCategory: Category | null;
  topNeighborhood: string | null;
  topMonth: number | null; // 0-11
  distinctNeighborhoods: number;
}

function argmax<K>(counts: Map<K, number>): K | null {
  let best: K | null = null;
  let n = 0;
  for (const [k, v] of counts) if (v > n) { n = v; best = k; }
  return best;
}

/** Pure year recap over the caller's own pins for `year` (local time). */
export function computeYearStats(pins: readonly YearPin[], year: number): YearStats {
  const inYear = pins.filter((p) => new Date(p.created_at).getFullYear() === year);
  const cat = new Map<Category, number>();
  const hood = new Map<string, number>();
  const month = new Map<number, number>();
  for (const p of inYear) {
    cat.set(p.category, (cat.get(p.category) ?? 0) + 1);
    if (p.neighborhood) hood.set(p.neighborhood, (hood.get(p.neighborhood) ?? 0) + 1);
    const m = new Date(p.created_at).getMonth();
    month.set(m, (month.get(m) ?? 0) + 1);
  }
  return {
    total: inYear.length,
    visited: inYear.filter((p) => p.status === 'visited').length,
    topCategory: argmax(cat),
    topNeighborhood: argmax(hood),
    topMonth: argmax(month),
    distinctNeighborhoods: hood.size,
  };
}
