import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Mapbox from '@rnmapbox/maps';
import type { OnPressEvent } from './mapTypes';
import { useMapPins } from '../../lib/hooks';
import { useSession } from '../../lib/session';
import { CATEGORIES, CATEGORY_META, type Category } from '../../lib/categories';
import { toUserMessage } from '../../lib/errors';
import { parseIdParam } from '../../lib/params';
import { Glass } from '../../design/Glass';
import { GlassChip, GlassIconButton, GlassSegmented } from '../../design/controls';
import { Icon, PressableScale, Text, haptic } from '../../design/primitives';
import { makeStyles, useTheme } from '../../design/theme';
import { GUTTER, RADIUS, SPACE } from '../../design/tokens';
import { useDockClearance } from '../../design/Dock';
import { MarkerLayers } from './MarkerLayers';
import { buildPlaceMarkers, filterMarkers, toFeatureCollection, type MapScope } from './mapModel';
import { useLocationAccess } from './useLocationAccess';
import { PlaceSheet } from '../places/PlaceSheet';

Mapbox.setAccessToken(process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '');

const MORNINGSIDE: [number, number] = [-73.9626, 40.8075];
const SCOPES: { value: MapScope; label: string }[] = [
  { value: 'all', label: 'Everyone' },
  { value: 'mine', label: 'Mine' },
  { value: 'friends', label: 'Friends' },
];

/**
 * The home canvas. Full-bleed map; glass chrome floats above it:
 * search capsule + avatar (top), scope + category chips, locate button,
 * and the place sheet rising from the bottom.
 */
export function MapScreen() {
  const s = useStyles();
  const { colors, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const dockClearance = useDockClearance();
  const { height: screenH } = useWindowDimensions();
  const { userId } = useSession();
  const params = useLocalSearchParams<{ place?: string }>();

  const camera = useRef<Mapbox.Camera>(null);
  const source = useRef<Mapbox.ShapeSource>(null);
  const [scope, setScope] = useState<MapScope>('all');
  const [cats, setCats] = useState<ReadonlySet<Category>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const location = useLocationAccess();

  const pins = useMapPins();
  const markers = useMemo(() => (userId && pins.data ? buildPlaceMarkers(pins.data, userId) : []), [pins.data, userId]);
  const visible = useMemo(() => filterMarkers(markers, scope, cats), [markers, scope, cats]);
  const shape = useMemo(() => toFeatureCollection(visible), [visible]);

  const flyTo = useCallback((lng: number, lat: number, zoom = 15.5) => {
    camera.current?.setCamera({
      centerCoordinate: [lng, lat],
      zoomLevel: zoom,
      animationDuration: 650,
      animationMode: 'flyTo',
      // Keep the selected place visible above the sheet's medium detent.
      padding: { paddingTop: 140, paddingLeft: 0, paddingRight: 0, paddingBottom: screenH * 0.5 },
    });
  }, [screenH]);

  // Deep link / search result: /(app)/map?place=<uuid>
  const deepLinked = parseIdParam(params.place);
  useEffect(() => {
    if (!deepLinked) return;
    setSelected(deepLinked);
    const m = markers.find((x) => x.placeId === deepLinked);
    if (m) flyTo(m.lng, m.lat);
  }, [deepLinked, markers, flyTo]);

  const onPress = useCallback(async (e: OnPressEvent) => {
    const f = e.features?.[0];
    if (!f) return;
    const props = f.properties ?? {};
    if (props.point_count) {
      // Cluster: zoom to the level where it splits.
      const zoom = await source.current?.getClusterExpansionZoom(f as GeoJSON.Feature).catch(() => null);
      const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
      camera.current?.setCamera({ centerCoordinate: [lng, lat], zoomLevel: (zoom ?? 14) + 0.3, animationDuration: 450 });
      haptic.tap();
      return;
    }
    const placeId = props.placeId as string | undefined;
    if (!placeId) return;
    haptic.select();
    setSelected(placeId);
    const [lng, lat] = (f.geometry as GeoJSON.Point).coordinates;
    flyTo(lng, lat, 15.8);
  }, [flyTo]);

  const locate = useCallback(async () => {
    if (!(await location.request())) return;
    const here = await location.current();
    if (here) flyTo(here.lng, here.lat, 15);
  }, [location, flyTo]);

  const toggleCat = (c: Category) =>
    setCats((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  const statusLine = pins.isError
    ? toUserMessage(pins.error, "Couldn't load your map.")
    : pins.isSuccess && visible.length === 0
      ? emptyCopy(scope, markers.length, cats.size > 0)
      : null;

  return (
    <View style={s.root}>
      <Mapbox.MapView
        style={StyleSheet.absoluteFill}
        styleURL={dark ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Light}
        logoEnabled
        logoPosition={{ bottom: dockClearance - 4, left: 18 }}
        attributionEnabled
        attributionPosition={{ bottom: dockClearance - 4, right: 18 }}
        scaleBarEnabled={false}
        compassEnabled
        compassPosition={{ top: insets.top + 148, right: 18 }}
        onPress={() => selected && setSelected(null)}
        accessibilityLabel={`Map with ${visible.length} places`}
      >
        <Mapbox.Camera ref={camera} defaultSettings={{ centerCoordinate: MORNINGSIDE, zoomLevel: 13.6 }} />
        {location.access === 'granted' ? <Mapbox.LocationPuck puckBearingEnabled={false} pulsing={{ isEnabled: true, color: colors.thread }} /> : null}
        <MarkerLayers ref={source} shape={shape} selectedPlaceId={selected} onPress={onPress} />
      </Mapbox.MapView>

      {/* Top chrome */}
      <View pointerEvents="box-none" style={[s.top, { paddingTop: insets.top + SPACE.sm }]}>
        <View style={s.searchRow}>
          <PressableScale
            style={s.searchHit}
            pressedScale={0.98}
            onPress={() => router.push('/pin/search')}
            accessibilityRole="search"
            accessibilityLabel="Search places and people"
            testID="map-search"
          >
            <Glass interactive style={s.search}>
              <Icon name="magnifyingglass" fallback="⌕" size={17} color={colors.inkSecondary} />
              <Text variant="body" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
                Search places, vibes, friends
              </Text>
            </Glass>
          </PressableScale>
          <GlassIconButton
            symbol="person.crop.circle"
            fallback="○"
            label="Your profile"
            onPress={() => router.navigate('/(app)/profile')}
          />
        </View>

        <View style={s.scopeRow}>
          <GlassSegmented value={scope} options={SCOPES} onChange={setScope} accessibilityLabel="Whose places to show" />
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chips}
          style={s.chipsScroller}
        >
          {CATEGORIES.map((c) => (
            <GlassChip
              key={c}
              label={CATEGORY_META[c].short}
              symbol={CATEGORY_META[c].symbol}
              fallback={CATEGORY_META[c].glyph}
              selected={cats.has(c)}
              onPress={() => toggleCat(c)}
              testID={`chip-${c}`}
            />
          ))}
        </ScrollView>

        {statusLine ? (
          <Glass radius={14} style={s.status} pointerEvents="none">
            <Text variant="callout" accessibilityLiveRegion="polite">{statusLine}</Text>
          </Glass>
        ) : null}
      </View>

      {/* Locate */}
      <View pointerEvents="box-none" style={[s.locate, { bottom: dockClearance + SPACE.sm }]}>
        <GlassIconButton
          symbol={location.access === 'granted' ? 'location.fill' : 'location'}
          fallback="➤"
          label="Center on my location"
          onPress={locate}
          testID="map-locate"
        />
      </View>

      {/* The sheet lives in a box that ends above the dock, so it floats as a
          card over the map and the dock never covers its content. */}
      <View pointerEvents="box-none" style={[s.sheetBox, { bottom: dockClearance - 6 }]}>
        <PlaceSheet placeId={selected} onClose={() => setSelected(null)} />
      </View>
    </View>
  );
}

function emptyCopy(scope: MapScope, total: number, filtered: boolean): string {
  if (filtered && total > 0) return 'Nothing here with those filters.';
  if (scope === 'mine') return 'Your map is empty. Tap + to save your first place.';
  if (scope === 'friends') return "Follow friends to see the places they'd send you.";
  return 'No places yet. Tap + to save one, or find friends in Discover.';
}

const useStyles = makeStyles((c) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    top: { position: 'absolute', top: 0, left: 0, right: 0, gap: SPACE.sm },
    searchRow: { flexDirection: 'row', gap: SPACE.sm, paddingHorizontal: GUTTER, alignItems: 'center' },
    searchHit: { flex: 1 },
    search: { height: 48, flexDirection: 'row', alignItems: 'center', gap: SPACE.sm, paddingHorizontal: SPACE.lg },
    scopeRow: { paddingHorizontal: GUTTER, flexDirection: 'row' },
    chipsScroller: { flexGrow: 0 },
    chips: { paddingHorizontal: GUTTER, gap: SPACE.sm },
    status: { marginHorizontal: GUTTER, paddingHorizontal: SPACE.lg, paddingVertical: SPACE.md, alignSelf: 'flex-start' },
    locate: { position: 'absolute', right: GUTTER },
    // Clip: gorhom sizes the sheet to its tallest detent and translates it,
    // so without clipping it would bleed below the box (under the dock).
    sheetBox: {
      position: 'absolute', top: 0, left: 8, right: 8, overflow: 'hidden',
      borderBottomLeftRadius: RADIUS.xl, borderBottomRightRadius: RADIUS.xl,
    },
  }),
);
