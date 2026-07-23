import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useEffect, useState } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '../../lib/supabase';
import {
  PALETTE,
  ACCENT,
  FONTS,
  RADII,
  SCREEN_PAD,
  TAB_CLEARANCE,
} from '../../constants/theme';

/**
 * RANKINGS — ordered list of one user's ranked places in a given category.
 * Reachable from any profile's Rankings pill row. Reads `category` and
 * optional `userId` from URL params; defaults to the signed-in user.
 *
 * Tappable scroll of the same five categories at the top so you can flip
 * between lists without bouncing back to the profile.
 */

type CatKey = 'cafes' | 'food' | 'bars' | 'shops' | 'experiences';

const CATEGORIES: { key: CatKey; label: string }[] = [
  { key: 'cafes',       label: 'cafes'       },
  { key: 'food',        label: 'food'        },
  { key: 'bars',        label: 'bars'        },
  { key: 'shops',       label: 'shops'       },
  { key: 'experiences', label: 'experiences' },
];

interface RankedPlace {
  place_id: string;
  place_name: string;
  position: number;
}

export default function RankingsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ category?: string; userId?: string }>();

  const [activeCat, setActiveCat] = useState<string>(params.category ?? 'cafes');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [items, setItems] = useState<RankedPlace[]>([]);
  const [ownerName, setOwnerName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  const targetUserId = params.userId ?? currentUserId;
  const isOwn = !params.userId || params.userId === currentUserId;

  // Resolve owner display name once when viewing someone else's rankings.
  useEffect(() => {
    if (isOwn || !targetUserId) { setOwnerName(null); return; }
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('username, display_name')
        .eq('id', targetUserId)
        .single();
      if (data) setOwnerName(data.display_name?.split(' ')[0] ?? data.username);
    })();
  }, [targetUserId, isOwn]);

  // Fetch ranked places whenever target or category changes.
  useEffect(() => {
    if (!targetUserId) return;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('rankings')
        .select('position, place_id, places!inner(name)')
        .eq('user_id', targetUserId)
        .eq('category', activeCat)
        .order('position', { ascending: true });

      if (!error && data) {
        const mapped: RankedPlace[] = data.map((row: any) => {
          const place = Array.isArray(row.places) ? row.places[0] : row.places;
          return {
            place_id: row.place_id,
            place_name: place?.name ?? '(unknown)',
            position: row.position,
          };
        });
        setItems(mapped);
      } else {
        setItems([]);
      }
      setLoading(false);
    })();
  }, [targetUserId, activeCat]);

  const possessive = isOwn ? 'your' : ownerName ? `${ownerName}'s` : 'their';

  // Source-aware fallback: when the back stack is empty we'd otherwise
  // bounce to the tab root. Resolve to user/[id] for friend rankings,
  // own profile otherwise.
  function handleBack() {
    if (router.canGoBack()) { router.back(); return; }
    if (params.userId && params.userId !== currentUserId) {
      router.replace(`/(app)/user/${params.userId}` as never);
    } else {
      router.replace('/(app)/profile' as never);
    }
  }

  return (
    <View style={styles.safe}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} hitSlop={12}>
            <Text style={styles.backText}>← back</Text>
          </TouchableOpacity>

          <Text style={styles.metaLabel}>RANKINGS · {activeCat.toUpperCase()}</Text>
          <Text style={styles.title}>
            {possessive}{' '}
            <Text style={styles.titleItalic}>{activeCat}.</Text>
          </Text>
          <Text style={styles.subtitle}>
            ranked from best to worst.
          </Text>
        </View>

        {/* Category chips */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsRow}
        >
          {CATEGORIES.map((c) => {
            const active = c.key === activeCat;
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setActiveCat(c.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* List */}
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={ACCENT.red} size="large" />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.place_id}
            contentContainerStyle={
              items.length === 0 ? styles.emptyContainer : styles.list
            }
            ItemSeparatorComponent={() => <View style={styles.separator} />}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              items.length > 0 ? (
                <View style={styles.listHead}>
                  <Text style={styles.listHeadCount}>
                    <Text style={styles.listHeadCountNum}>{items.length}</Text>{' '}
                    ranked
                  </Text>
                </View>
              ) : null
            }
            renderItem={({ item }) => (
              <View style={styles.row}>
                <View style={styles.rankWrap}>
                  <Text style={styles.rankNum}>#{item.position}</Text>
                </View>
                <View style={styles.rowInfo}>
                  <Text style={styles.placeName} numberOfLines={1}>
                    {item.place_name}
                  </Text>
                  <Text style={styles.placeCategory}>{activeCat}</Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <View style={styles.emptyRing} />
                <Text style={styles.emptyTitle}>
                  {isOwn ? 'no rankings ' : 'nothing ranked '}
                  <Text style={styles.emptyTitleItalic}>yet.</Text>
                </Text>
                <Text style={styles.emptySub}>
                  {isOwn
                    ? `tap a place on the map and pick "rank it" to add to your ${activeCat} list.`
                    : `${ownerName ?? 'they'} hasn't ranked any ${activeCat} yet.`}
                </Text>
              </View>
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: PALETTE.bg },

  // Header
  header: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 8,
    paddingBottom: 14,
    gap: 6,
  },
  backText: {
    fontFamily: FONTS.mono,
    fontSize: 11,
    letterSpacing: 1.5,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },
  metaLabel: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
    marginTop: 6,
  },
  title: {
    fontFamily: FONTS.display,
    fontSize: 32,
    lineHeight: 34,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  titleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  subtitle: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
    marginTop: 2,
  },

  // Chips
  chipsRow: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 6,
    paddingBottom: 14,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: PALETTE.inkLine,
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: PALETTE.ink,
    borderColor: PALETTE.ink,
  },
  chipText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.ink,
  },
  chipTextActive: {
    color: PALETTE.bg,
  },

  // List
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingBottom: TAB_CLEARANCE },
  emptyContainer: { flex: 1 },
  separator: {
    height: 1,
    backgroundColor: PALETTE.inkLine,
    marginLeft: SCREEN_PAD + 56,
  },

  listHead: {
    paddingHorizontal: SCREEN_PAD,
    paddingTop: 6,
    paddingBottom: 12,
  },
  listHeadCount: {
    fontFamily: FONTS.mono,
    fontSize: 10,
    letterSpacing: 1.2,
    color: PALETTE.inkSoft,
    textTransform: 'uppercase',
  },
  listHeadCountNum: {
    fontFamily: FONTS.display,
    fontSize: 13,
    color: ACCENT.red,
    fontStyle: 'italic',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SCREEN_PAD,
    paddingVertical: 14,
    gap: 14,
    backgroundColor: PALETTE.bg,
  },
  rankWrap: {
    width: 44,
    alignItems: 'flex-start',
  },
  rankNum: {
    fontFamily: FONTS.display,
    fontSize: 22,
    fontStyle: 'italic',
    fontWeight: '400',
    color: ACCENT.red,
    lineHeight: 24,
  },
  rowInfo: { flex: 1, gap: 2 },
  placeName: {
    fontFamily: FONTS.display,
    fontSize: 17,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  placeCategory: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 1.2,
    color: PALETTE.inkSoft,
    textTransform: 'lowercase',
  },

  // Empty
  emptyState: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
    gap: 12,
  },
  emptyRing: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: ACCENT.red,
    opacity: 0.4,
    marginBottom: 4,
  },
  emptyTitle: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: PALETTE.ink,
    fontWeight: '400',
    textAlign: 'center',
  },
  emptyTitleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  emptySub: {
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.inkSoft,
    textAlign: 'center',
    lineHeight: 18,
  },
});
