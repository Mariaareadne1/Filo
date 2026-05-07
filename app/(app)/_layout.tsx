import { Tabs, useRouter } from 'expo-router';
import { Text, View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  PALETTE,
  ACCENT,
  FONTS,
  RADII,
  FLOAT_SHADOW,
} from '../../constants/theme';

interface TabSlotProps {
  glyph: string;
  label: string;
  focused: boolean;
}

function TabSlot({ glyph, label, focused }: TabSlotProps) {
  return (
    <View style={styles.slot}>
      <Text
        style={[
          styles.glyph,
          { color: focused ? PALETTE.ink : PALETTE.inkMute },
        ]}
      >
        {glyph}
      </Text>
      <Text
        style={[
          styles.label,
          { color: focused ? PALETTE.ink : PALETTE.inkMute },
          focused && styles.labelActive,
        ]}
      >
        {label}
      </Text>
      {focused && <View style={styles.activeDot} />}
    </View>
  );
}

function CenterFab() {
  const router = useRouter();
  return (
    <View pointerEvents="box-none" style={styles.fabWrap}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => router.push('/pin/search')}
        style={styles.fab}
      >
        <Text style={styles.fabPlus}>＋</Text>
        <Text style={styles.fabLabel}>pin</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function AppLayout() {
  const insets = useSafeAreaInsets();
  const bottomPad = Math.max(insets.bottom, 12);

  return (
    <View style={{ flex: 1, backgroundColor: PALETTE.bg }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: [
            styles.bar,
            { bottom: bottomPad, paddingBottom: 8, paddingTop: 8 },
          ],
          tabBarItemStyle: { paddingVertical: 0 },
          tabBarBackground: () => <View style={styles.barBg} />,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabSlot glyph="◉" label="map" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="discover"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabSlot glyph="✦" label="discover" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="__pin_spacer"
          options={{
            tabBarButton: () => <View style={{ flex: 1 }} />,
          }}
        />
        <Tabs.Screen
          name="feed"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabSlot glyph="☰" label="feed" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            tabBarIcon: ({ focused }) => (
              <TabSlot glyph="◯" label="you" focused={focused} />
            ),
          }}
        />

        <Tabs.Screen name="directory" options={{ href: null }} />
        <Tabs.Screen name="board/[id]" options={{ href: null }} />
        <Tabs.Screen name="user/[id]" options={{ href: null }} />
      </Tabs>

      <View
        style={[styles.fabAnchor, { bottom: bottomPad + 16 }]}
        pointerEvents="box-none"
      >
        <CenterFab />
      </View>
    </View>
  );
}

const BAR_HEIGHT = 64;

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 12,
    right: 12,
    height: BAR_HEIGHT,
    borderRadius: RADII.lg,
    borderTopWidth: 0,
    borderWidth: 1,
    borderColor: PALETTE.inkLine,
    backgroundColor: 'transparent',
    elevation: 6,
    ...FLOAT_SHADOW,
  },
  barBg: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: RADII.lg,
    overflow: 'hidden',
  },
  slot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingTop: 2,
  },
  glyph: { fontSize: 16, lineHeight: 18 },
  label: {
    fontFamily: Platform.select({ ios: FONTS.mono, default: 'monospace' }),
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'lowercase',
  },
  labelActive: { fontWeight: '700' },
  activeDot: {
    position: 'absolute',
    bottom: -4,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ACCENT.red,
  },
  fabAnchor: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  fabWrap: { alignItems: 'center' },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: ACCENT.red,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: ACCENT.red,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
    borderWidth: 2,
    borderColor: PALETTE.surface,
  },
  fabPlus: {
    fontSize: 22,
    color: PALETTE.surface,
    fontWeight: '300',
    lineHeight: 24,
    marginTop: -2,
  },
  fabLabel: {
    fontFamily: Platform.select({ ios: FONTS.mono, default: 'monospace' }),
    fontSize: 7,
    letterSpacing: 1,
    color: PALETTE.surface,
    marginTop: -1,
    textTransform: 'lowercase',
    opacity: 0.95,
  },
});