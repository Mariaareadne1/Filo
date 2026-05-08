import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  PALETTE,
  ACCENT,
  FONTS,
  SCREEN_PAD,
} from '../../constants/theme';

/**
 * FILO WRAPPED — magazine-style year recap. Five stat blocks on a paper
 * background with mono kickers and big italic Fraunces values. Pulls
 * pins for the current year (with place name / category / coords) plus
 * the user's #1 ranked place in one round-trip pair.
 */

const NEIGHBORHOODS: { name: string; lat: number; lng: number }[] = [
  { name: 'Morningside Heights', lat: 40.8075, lng: -73.9626 },
  { name: 'Manhattanville',      lat: 40.8156, lng: -73.9580 },
  { name: 'Hamilton Heights',    lat: 40.8226, lng: -73.9495 },
  { name: 'Harlem',              lat: 40.8116, lng: -73.9465 },
  { name: 'Upper West Side',     lat: 40.7870, lng: -73.9754 },
  { name: 'Washington Heights',  lat: 40.8417, lng: -73.9393 },
];

function neighborhoodFor(lat: number, lng: number): string {
  let best = NEIGHBORHOODS[0];
  let bestD = Infinity;
  for (const n of NEIGHBORHOODS) {
    const dlat = lat - n.lat;
    const dlng = lng - n.lng;
    const d = dlat * dlat + dlng * dlng;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best.name;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const CATEGORY_MOSTLY: Record<string, string> = {
  food:       'food',
  bar:        'bars',
  beauty:     'beauty',
  experience: 'experiences',
  retail:     'shops',
};

interface YearStats {
  totalPins: number;
  topCategory: string | null;
  topNeighborhood: string | null;
  topRanked: string | null;
  topMonth: string | null;
}

const EMPTY_STATS: YearStats = {
  totalPins: 0,
  topCategory: null,
  topNeighborhood: null,
  topRanked: null,
  topMonth: null,
};

export default function WrappedScreen() {
  const router = useRouter();
  const [stats, setStats] = useState<YearStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);

  const year = new Date().getFullYear();

  // Reached only from profile, so the fallback for when the navigator's
  // history is empty (cold deep link, replace-after-auth, etc.) is the
  // profile screen — never the tab root.
  function handleBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/profile' as never);
  }

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      const yearStart = new Date(year, 0, 1).toISOString();
      const [pinsRes, topRankRes] = await Promise.all([
        supabase
          .from('pins')
          .select('created_at, places!inner(category, lat, lng)')
          .eq('user_id', user.id)
          .gte('created_at', yearStart),
        supabase
          .from('rankings')
          .select('places!inner(name)')
          .eq('user_id', user.id)
          .eq('position', 1)
          .limit(1),
      ]);

      const rows = (pinsRes.data ?? []) as any[];

      // Top category
      const catCounts = new Map<string, number>();
      for (const r of rows) {
        const place = Array.isArray(r.places) ? r.places[0] : r.places;
        if (!place?.category) continue;
        catCounts.set(place.category, (catCounts.get(place.category) ?? 0) + 1);
      }
      let bestCat: string | null = null;
      let bestCatN = 0;
      for (const [k, v] of catCounts) if (v > bestCatN) { bestCatN = v; bestCat = k; }

      // Top neighborhood
      const nbCounts = new Map<string, number>();
      for (const r of rows) {
        const place = Array.isArray(r.places) ? r.places[0] : r.places;
        if (typeof place?.lat !== 'number' || typeof place?.lng !== 'number') continue;
        const nb = neighborhoodFor(place.lat, place.lng);
        nbCounts.set(nb, (nbCounts.get(nb) ?? 0) + 1);
      }
      let bestNb: string | null = null;
      let bestNbN = 0;
      for (const [k, v] of nbCounts) if (v > bestNbN) { bestNbN = v; bestNb = k; }

      // Top month
      const monthCounts = new Map<number, number>();
      for (const r of rows) {
        const m = new Date(r.created_at).getMonth();
        monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1);
      }
      let bestMonth: number | null = null;
      let bestMonthN = 0;
      for (const [k, v] of monthCounts) if (v > bestMonthN) { bestMonthN = v; bestMonth = k; }

      // Top ranked
      let topRanked: string | null = null;
      if (topRankRes.data && topRankRes.data.length > 0) {
        const place = Array.isArray((topRankRes.data[0] as any).places)
          ? (topRankRes.data[0] as any).places[0]
          : (topRankRes.data[0] as any).places;
        topRanked = place?.name ?? null;
      }

      setStats({
        totalPins: rows.length,
        topCategory: bestCat ? (CATEGORY_MOSTLY[bestCat] ?? bestCat) : null,
        topNeighborhood: bestNb,
        topRanked,
        topMonth: bestMonth != null ? MONTHS[bestMonth] : null,
      });
      setLoading(false);
    })();
  }, [year]);

  if (loading) {
    return (
      <View style={styles.safe}>
        <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={ACCENT.red} />
        </SafeAreaView>
      </View>
    );
  }

  const blocks: { kicker: string; value: string | null }[] = [
    { kicker: 'TOTAL PINS',       value: stats.totalPins > 0 ? String(stats.totalPins) : null },
    { kicker: 'TOP CATEGORY',     value: stats.topCategory },
    { kicker: 'NEIGHBORHOOD',     value: stats.topNeighborhood },
    { kicker: 'TOP RANKED',       value: stats.topRanked },
    { kicker: 'MOST ACTIVE',      value: stats.topMonth },
  ];

  const hasAny = blocks.some((b) => b.value);

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity onPress={handleBack} hitSlop={12} style={styles.backBtn}>
            <Text style={styles.backText}>← back</Text>
          </TouchableOpacity>

          {/* Hero */}
          <View style={styles.hero}>
            <Text style={styles.heroKicker}>YOUR YEAR IN FILO</Text>
            <Text style={styles.heroYear}>
              {year}<Text style={styles.heroYearAccent}>.</Text>
            </Text>
            <Text style={styles.heroSub}>
              the places, the people, the patterns.
            </Text>
          </View>

          <View style={styles.heroRule} />

          {!hasAny ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                your year hasn't <Text style={styles.emptyTitleItalic}>started.</Text>
              </Text>
              <Text style={styles.emptySub}>
                pin a place this year and your wrapped will fill in.
              </Text>
            </View>
          ) : (
            blocks.map((b, i) => (
              <View key={b.kicker} style={styles.block}>
                <Text style={styles.blockKicker}>
                  {String(i + 1).padStart(2, '0')} · {b.kicker}
                </Text>
                <Text
                  style={styles.blockValue}
                  numberOfLines={2}
                  adjustsFontSizeToFit
                >
                  {b.value ?? '—'}
                </Text>
                {i < blocks.length - 1 && <View style={styles.blockRule} />}
              </View>
            ))
          )}

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>filo · {year}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },
  scroll: { paddingBottom: 60 },

  backBtn: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 8,
    paddingBottom: 4,
    alignSelf: 'flex-start',
  },
  backText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },

  // Hero
  hero: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 28,
    paddingBottom: 28,
    gap: 6,
  },
  heroKicker: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 2.5,
    color: PALETTE.inkSoft,
    marginBottom: 6,
  },
  heroYear: {
    fontFamily: FONTS.display,
    fontSize: 92,
    lineHeight: 96,
    color: PALETTE.ink,
    fontWeight: '400',
    fontStyle: 'italic',
    letterSpacing: -3,
  },
  heroYearAccent: {
    color: ACCENT.red,
  },
  heroSub: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: PALETTE.inkSoft,
    fontStyle: 'italic',
    marginTop: 4,
  },
  heroRule: {
    height: 1,
    backgroundColor: PALETTE.ink,
    marginHorizontal: SCREEN_PAD,
  },

  // Stat block
  block: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 32,
    paddingBottom: 32,
    gap: 14,
  },
  blockKicker: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  blockValue: {
    fontFamily: FONTS.display,
    fontStyle: 'italic',
    fontSize: 64,
    lineHeight: 70,
    color: ACCENT.red,
    fontWeight: '400',
    letterSpacing: -1.5,
  },
  blockRule: {
    height: 1,
    backgroundColor: PALETTE.inkLine,
    marginTop: 16,
  },

  // Empty state
  emptyState: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 48,
    paddingBottom: 32,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: FONTS.display,
    fontSize: 32,
    lineHeight: 36,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  emptyTitleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  emptySub: {
    fontFamily: FONTS.body,
    fontSize: 14,
    color: PALETTE.inkSoft,
    lineHeight: 20,
  },

  // Footer
  footer: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 12,
    paddingBottom: 24,
  },
  footerText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1.5,
    color: PALETTE.inkMute,
    textTransform: 'lowercase',
  },
});
