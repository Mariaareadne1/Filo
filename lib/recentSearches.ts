import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'filo.recentSearches.v1';
const MAX = 8;

/** Device-local search history (never synced). */
export async function loadRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export async function rememberSearch(q: string): Promise<string[]> {
  const term = q.trim();
  const prev = await loadRecentSearches();
  if (!term) return prev;
  const next = [term, ...prev.filter((x) => x.toLowerCase() !== term.toLowerCase())].slice(0, MAX);
  await AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => undefined);
}
