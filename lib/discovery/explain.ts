import { CATEGORY_META, type Category } from '../categories';

/** The evidence a search/lens row carries (all from real rows). */
export interface Evidence {
  category: Category;
  friendCount?: number;
  friendNames?: string[];
  friendTopRank?: number | null;
  myStatus?: 'visited' | 'want_to_go' | null;
  distanceM?: number | null;
  matchedTags?: string[];
  tasteFrom?: { username: string; overlap: number; position: number; label: 'strong' | 'promising' } | null;
}

const WALK_M_PER_MIN = 80;

/**
 * Up to three short reasons, most social first. Every phrase maps to a
 * concrete field; absent evidence yields no phrase (never "Popular near
 * you" without counts, never a friend who didn't pin it).
 */
export function explain(e: Evidence): string[] {
  const out: string[] = [];
  const names = (e.friendNames ?? []).filter(Boolean);
  const n = e.friendCount ?? 0;
  if (n === 1 && names[0]) out.push(`Saved by @${names[0]}`);
  else if (n === 2 && names.length >= 2) out.push(`Saved by @${names[0]} and @${names[1]}`);
  else if (n > 2) out.push(names[0] ? `Saved by @${names[0]} and ${n - 1} other friends` : `Saved by ${n} friends`);

  if (e.tasteFrom) {
    const strength = e.tasteFrom.label === 'strong' ? 'who ranks like you' : 'whose taste overlaps yours';
    out.push(`#${e.tasteFrom.position} for @${e.tasteFrom.username}, ${strength} (${e.tasteFrom.overlap} shared)`);
  } else if (e.friendTopRank && e.friendTopRank <= 3) {
    out.push(`Top ${e.friendTopRank === 1 ? 'pick' : '3'} on a friend's ${CATEGORY_META[e.category].plural} list`);
  }

  if (e.myStatus === 'want_to_go') out.push('On your want-to-go list');
  else if (e.myStatus === 'visited') out.push("You've been");

  if (e.distanceM != null && e.distanceM < 4000) {
    const mins = Math.max(1, Math.round(e.distanceM / WALK_M_PER_MIN));
    out.push(`${mins} min walk`);
  }
  if (out.length < 3 && e.matchedTags && e.matchedTags.length > 0) {
    out.push(`Tagged “${e.matchedTags[0]}”`);
  }
  return out.slice(0, 3);
}
