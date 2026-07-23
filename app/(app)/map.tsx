import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  TextInput,
} from 'react-native';
import { memo, useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapboxGL from '@rnmapbox/maps';
import * as Location from 'expo-location';
import { usePins, MapMode } from '../../hooks/usePins';
import { useCurrentUserId } from '../../hooks/useCurrentUserId';
import { MapPin } from '../../types';
import { PinDetailSheet } from '../../components/PinDetailSheet';
import { useFocusEffect } from 'expo-router';
import {
  PALETTE,
  ACCENT,
  FONTS,
  RADII,
  STICKER_SHADOW,
  STICKER_SHADOW_LG,
  SCREEN_PAD,
} from '../../constants/theme';

MapboxGL.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN!);

const MORNINGSIDE = [-73.9626, 40.8075];

const MODES: { key: MapMode; label: string }[] = [
  { key: 'my',      label: 'mine'     },
  { key: 'friends', label: 'friends'  },
  { key: 'campus',  label: 'columbia' },
];

const SCOPE_LABEL: Record<MapMode, string> = {
  my: 'your map',
  friends: 'your circle',
  campus: 'columbia',
};

const CATEGORY_GLYPH: Record<string, string> = {
  food: '◆',
  bar: '○',
  beauty: '◇',
  experience: '✦',
  retail: '◉',
};

// Discover-vocab filter chip → places.category values, mirroring
// discover.tsx so the same labels match the same pins.
const CATEGORY_FILTERS: { key: string | null; label: string }[] = [
  { key: null,          label: 'all' },
  { key: 'cafes',       label: 'cafes' },
  { key: 'food',        label: 'food' },
  { key: 'bars',        label: 'bars' },
  { key: 'shops',       label: 'shops' },
  { key: 'experiences', label: 'experiences' },
];

const DISCOVER_TO_PLACE_CATEGORIES: Record<string, string[]> = {
  cafes:       ['food'],
  food:        ['food'],
  bars:        ['bar'],
  shops:       ['retail'],
  experiences: ['experience'],
};

function pinMatches(
  pin: MapPin,
  catFilter: string | null,
  searchLower: string,
): boolean {
  if (catFilter) {
    const allowed = DISCOVER_TO_PLACE_CATEGORIES[catFilter] ?? [];
    if (!allowed.includes(pin.category)) return false;
  }
  if (searchLower) {
    if (!pin.place_name.toLowerCase().includes(searchLower)) return false;
  }
  return true;
}

/**
 * StickerPin — white square with ink border + sticker shadow, category
 * glyph in inkSoft, no photo. Selected state gets a red bottom bar and
 * a slightly thicker border (no other tint). When `visitCount > 1`, a
 * small red count pill rides the bottom-right corner of the marker.
 */
const StickerPin = memo(function StickerPin({
  pin,
  selected,
  visitCount,
}: {
  pin: MapPin;
  selected: boolean;
  visitCount: number;
}) {
  const size = selected ? 44 : 36;
  const borderWidth = selected ? 2 : 1.5;
  const showCount = visitCount > 1;

  return (
    <View style={[styles.pinWrap, { width: size, height: size }]}>
      <View
        style={[
          styles.pinBox,
          { width: size, height: size, borderWidth },
          selected ? STICKER_SHADOW_LG : STICKER_SHADOW,
        ]}
      >
        <Text
          allowFontScaling={false}
          style={[
            styles.pinGlyph,
            {
              fontSize: selected ? 18 : 15,
              color: selected ? ACCENT.red : PALETTE.inkSoft,
            },
          ]}
        >
          {CATEGORY_GLYPH[pin.category] ?? '◉'}
        </Text>
        {selected && <View style={styles.selectedBar} />}
      </View>

      {showCount && (
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>{visitCount}</Text>
        </View>
      )}
    </View>
  );
});

/**
 * One map marker. Memoized so a filter/search/selection change only re-renders
 * the markers whose props actually changed — not all of them on every keystroke.
 * `onSelect` is a stable callback, so the per-marker press handler doesn't churn.
 */
const MarkerItem = memo(function MarkerItem({
  pin,
  selected,
  visitCount,
  matches,
  onSelect,
}: {
  pin: MapPin;
  selected: boolean;
  visitCount: number;
  matches: boolean;
  onSelect: (pin: MapPin) => void;
}) {
  return (
    <MapboxGL.MarkerView coordinate={[pin.lng, pin.lat]}>
      <TouchableOpacity onPress={() => onSelect(pin)} activeOpacity={0.85}>
        <View style={matches ? undefined : styles.dimmed}>
          <StickerPin pin={pin} selected={selected} visitCount={visitCount} />
        </View>
      </TouchableOpacity>
    </MapboxGL.MarkerView>
  );
});

const EMPTY_MESSAGES: Record<MapMode, { title: string; italic: string; sub: string }> = {
  my:      { title: 'no pins',  italic: 'yet.',     sub: 'tap + to pin your first place.' },
  friends: { title: 'follow',   italic: 'people.',  sub: "see your circle's pins on the map." },
  campus:  { title: 'be',       italic: 'first.',   sub: 'pin something near campus.' },
};

export default function MapScreen() {
  const userId = useCurrentUserId() ?? null;
  const [mode, setMode] = useState<MapMode>('my');
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const insets = useSafeAreaInsets();

  const { pins, loading, error, refetch } = usePins(userId, mode);

  // Visit-count map: how many pins in the current view target each
  // place_id. Friends mode shows counts ≥ 2 wherever multiple friends
  // pinned the same place; my mode collapses to 1 (UNIQUE constraint)
  // so the badge stays hidden.
  const visitCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pins) {
      m.set(p.place_id, (m.get(p.place_id) ?? 0) + 1);
    }
    return m;
  }, [pins]);

  // Debounce the search text before it drives marker filtering so typing a
  // query doesn't re-render every marker on each keystroke. The input stays
  // bound to `searchQuery` for immediate responsiveness.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery), 200);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const trimmedSearch = debouncedSearch.trim().toLowerCase();
  const filterActive = categoryFilter !== null || trimmedSearch.length > 0;

  const handleSelectPin = useCallback((pin: MapPin) => setSelectedPin(pin), []);

  // Count of pins matching the active filter/search — drives the
  // overlay chip text. When neither is active we don't show the chip.
  const matchCount = useMemo(() => {
    if (!filterActive) return pins.length;
    let n = 0;
    for (const p of pins) {
      if (pinMatches(p, categoryFilter, trimmedSearch)) n++;
    }
    return n;
  }, [pins, categoryFilter, trimmedSearch, filterActive]);

  // Refetch only when returning to the screen. usePins already owns the
  // initial load and mode/userId reactivity via its own effect, so we skip
  // the first focus to avoid a duplicate fetch on mount and on every mode
  // toggle. A ref holds the latest refetch so the focus effect stays stable.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const skipFirstFocusRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (skipFirstFocusRef.current) {
        skipFirstFocusRef.current = false;
        return;
      }
      if (userIdRef.current) refetchRef.current();
    }, []),
  );

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      setLocationGranted(status === 'granted');
    })();
  }, []);

  const empty = EMPTY_MESSAGES[mode];

  // Compose the count-chip text based on which filters are active.
  const countText = (() => {
    if (!filterActive) return '';
    const filterLabel = categoryFilter ?? 'pins';
    const rawSearch = searchQuery.trim();
    if (rawSearch && categoryFilter) {
      return `${matchCount} ${filterLabel} matching "${rawSearch}"`;
    }
    if (rawSearch) {
      return `${matchCount} matching "${rawSearch}"`;
    }
    return `${matchCount} ${filterLabel} in ${SCOPE_LABEL[mode]}`;
  })();

  return (
    <View style={styles.container}>
      <MapboxGL.MapView
        style={StyleSheet.absoluteFill}
        styleURL={MapboxGL.StyleURL.Street}
        logoEnabled={false}
        attributionEnabled={false}
        compassEnabled
      >
        <MapboxGL.Camera
          defaultSettings={{ centerCoordinate: MORNINGSIDE, zoomLevel: 14 }}
        />
        {locationGranted && <MapboxGL.UserLocation visible animated />}
        {pins.map((pin) => (
          <MarkerItem
            key={pin.pin_id}
            pin={pin}
            selected={selectedPin?.pin_id === pin.pin_id}
            visitCount={visitCounts.get(pin.place_id) ?? 1}
            matches={!filterActive || pinMatches(pin, categoryFilter, trimmedSearch)}
            onSelect={handleSelectPin}
          />
        ))}
      </MapboxGL.MapView>

      {/* Top stack: mode toggle → category chips → search → count overlay */}
      <View
        style={[styles.topBar, { paddingTop: insets.top + 12 }]}
        pointerEvents="box-none"
      >
        <View style={styles.toggleContainer}>
          {MODES.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.toggleBtn, mode === key && styles.toggleBtnActive]}
              onPress={() => setMode(key)}
              activeOpacity={0.85}
            >
              <Text style={[styles.toggleText, mode === key && styles.toggleTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipsScroll}
          style={styles.chipsRow}
        >
          {CATEGORY_FILTERS.map((c) => {
            const active = c.key === categoryFilter;
            return (
              <TouchableOpacity
                key={c.label}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setCategoryFilter(c.key)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {c.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.searchWrap}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>⌕</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="search a place…"
              placeholderTextColor={PALETTE.inkMute}
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={8}>
                <Text style={styles.searchClear}>×</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {filterActive && (
          <View style={styles.countWrap} pointerEvents="box-none">
            <View style={styles.countChip}>
              <Text style={styles.countChipText} numberOfLines={1}>{countText}</Text>
            </View>
          </View>
        )}
      </View>

      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <ActivityIndicator color={ACCENT.red} size="small" />
        </View>
      )}
      {error && !loading && (
        <View style={styles.errorToast} pointerEvents="none">
          <Text style={styles.errorToastText}>{error}</Text>
        </View>
      )}
      {!loading && !error && pins.length === 0 && (
        <View style={styles.emptyState} pointerEvents="none">
          <Text style={styles.emptyKicker}>{mode.toUpperCase()} MAP</Text>
          <Text style={styles.emptyTitle}>
            {empty.title} <Text style={styles.emptyTitleItalic}>{empty.italic}</Text>
          </Text>
          <Text style={styles.emptySub}>{empty.sub}</Text>
        </View>
      )}

      <PinDetailSheet pin={selectedPin} onClose={() => setSelectedPin(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PALETTE.bg },

  pinWrap: { alignItems: 'center', justifyContent: 'center' },
  pinBox: {
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinGlyph: { includeFontPadding: false },
  dimmed: { opacity: 0.3 },

  selectedBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 3,
    backgroundColor: ACCENT.red,
  },

  countBadge: {
    position: 'absolute',
    bottom: -6,
    right: -6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: ACCENT.red,
    borderWidth: 1,
    borderColor: PALETTE.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeText: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    fontWeight: '700',
    color: PALETTE.surface,
    lineHeight: 11,
    includeFontPadding: false,
  },

  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },

  toggleContainer: {
    alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: PALETTE.surface,
    borderRadius: RADII.pill,
    padding: 3,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW_LG,
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: RADII.pill,
  },
  toggleBtnActive: {
    backgroundColor: PALETTE.ink,
  },
  toggleText: {
    fontFamily: FONTS.body,
    fontSize: 12,
    fontWeight: '600',
    color: PALETTE.ink,
    letterSpacing: 0.2,
  },
  toggleTextActive: {
    color: PALETTE.bg,
  },

  // Category chips
  chipsRow: {
    marginTop: 10,
    flexGrow: 0,
  },
  chipsScroll: {
    paddingHorizontal: SCREEN_PAD,
    gap: 6,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    backgroundColor: PALETTE.surface,
    ...STICKER_SHADOW,
  },
  chipActive: {
    backgroundColor: PALETTE.ink,
  },
  chipText: {
    fontFamily: FONTS.body,
    fontSize: 11,
    fontWeight: '600',
    color: PALETTE.ink,
  },
  chipTextActive: {
    color: PALETTE.bg,
  },

  // Search bar
  searchWrap: {
    marginTop: 8,
    paddingHorizontal: SCREEN_PAD,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: PALETTE.surface,
    borderRadius: RADII.pill,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    ...STICKER_SHADOW,
  },
  searchIcon: {
    fontSize: 13,
    color: PALETTE.inkSoft,
  },
  searchInput: {
    flex: 1,
    fontFamily: FONTS.body,
    fontSize: 13,
    color: PALETTE.ink,
    padding: 0,
  },
  searchClear: {
    fontSize: 18,
    color: PALETTE.inkSoft,
    lineHeight: 18,
  },

  // Count overlay
  countWrap: {
    marginTop: 8,
    paddingHorizontal: SCREEN_PAD,
    alignItems: 'flex-start',
  },
  countChip: {
    backgroundColor: PALETTE.surface,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: '95%',
    ...STICKER_SHADOW,
  },
  countChipText: {
    fontFamily: FONTS.body,
    fontSize: 11,
    fontWeight: '600',
    color: PALETTE.ink,
    letterSpacing: 0.2,
  },

  loadingOverlay: {
    position: 'absolute',
    top: '50%',
    alignSelf: 'center',
    backgroundColor: PALETTE.surface,
    padding: 12,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW,
  },

  errorToast: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    backgroundColor: PALETTE.surface,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: ACCENT.red,
    ...STICKER_SHADOW,
  },
  errorToastText: {
    fontFamily: FONTS.body,
    color: ACCENT.red,
    fontSize: 12,
    fontWeight: '600',
  },

  emptyState: {
    position: 'absolute',
    bottom: 130,
    left: 32,
    right: 32,
    backgroundColor: PALETTE.surface,
    padding: 18,
    borderWidth: 1,
    borderColor: PALETTE.ink,
    ...STICKER_SHADOW_LG,
    alignItems: 'flex-start',
    gap: 4,
  },
  emptyKicker: {
    fontFamily: FONTS.mono,
    fontSize: 9,
    letterSpacing: 2,
    color: PALETTE.inkSoft,
  },
  emptyTitle: {
    fontFamily: FONTS.display,
    fontSize: 22,
    color: PALETTE.ink,
    fontWeight: '400',
  },
  emptyTitleItalic: {
    fontStyle: 'italic',
    color: ACCENT.red,
  },
  emptySub: {
    fontFamily: FONTS.body,
    fontSize: 12,
    color: PALETTE.inkSoft,
    lineHeight: 17,
    marginTop: 2,
  },
});
