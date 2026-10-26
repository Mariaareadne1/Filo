import { useEffect, useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Glass, GlassGroup } from './Glass';
import { Icon, PressableScale, Text, haptic } from './primitives';
import { makeStyles, useTheme } from './theme';
import { DOCK, GUTTER, MOTION } from './tokens';

export interface DockItem {
  route: string;
  label: string;
  symbol: string;
  symbolActive: string;
  fallback: string;
}

export const DOCK_ITEMS: DockItem[] = [
  { route: 'map', label: 'Map', symbol: 'map', symbolActive: 'map.fill', fallback: '◉' },
  { route: 'discover', label: 'Discover', symbol: 'sparkle.magnifyingglass', symbolActive: 'sparkle.magnifyingglass', fallback: '✦' },
  { route: 'boards', label: 'Boards', symbol: 'square.stack', symbolActive: 'square.stack.fill', fallback: '▤' },
  { route: 'profile', label: 'You', symbol: 'person.crop.circle', symbolActive: 'person.crop.circle.fill', fallback: '○' },
];

const ADD_SIZE = DOCK.height;

/** Bottom inset screens must leave clear of the floating dock. */
export function useDockClearance(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, 12) + DOCK.bottomGap + DOCK.height + 12;
}

/**
 * Floating glass dock. A tab bar replacement for expo-router <Tabs>: only
 * routes listed in DOCK_ITEMS get a slot; everything else is a hidden route.
 * The separate "+" capsule opens place search (save a place from anywhere).
 */
export function Dock({ state, navigation }: BottomTabBarProps) {
  const s = useStyles();
  const { colors, reduceMotion } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [width, setWidth] = useState(0);

  const current = state.routes[state.index]?.name;
  const activeIndex = DOCK_ITEMS.findIndex((d) => d.route === current);
  const slot = width / DOCK_ITEMS.length;

  const x = useSharedValue(0);
  const visible = useSharedValue(activeIndex >= 0 ? 1 : 0);
  useEffect(() => {
    if (activeIndex < 0 || slot === 0) {
      visible.value = withTiming(0, { duration: MOTION.fadeMs });
      return;
    }
    const target = activeIndex * slot;
    x.value = reduceMotion ? target : withSpring(target, MOTION.snappy);
    visible.value = withTiming(1, { duration: MOTION.fadeMs });
  }, [activeIndex, slot, reduceMotion, x, visible]);

  const pill = useAnimatedStyle(() => ({
    width: slot - 8,
    opacity: visible.value,
    transform: [{ translateX: x.value + 4 }],
  }));

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  return (
    <View pointerEvents="box-none" style={[s.wrap, { bottom: Math.max(insets.bottom, 12) + DOCK.bottomGap - 8 }]}>
      <GlassGroup spacing={10} style={s.row}>
        <Glass radius={DOCK.height / 2} interactive style={s.dock}>
          <View style={s.items} onLayout={onLayout} accessibilityRole="tablist">
            <Animated.View pointerEvents="none" style={[s.pill, { backgroundColor: colors.threadSoft }, pill]} />
            {DOCK_ITEMS.map((item, i) => {
              const focused = i === activeIndex;
              const route = state.routes.find((r) => r.name === item.route);
              return (
                <PressableScale
                  key={item.route}
                  style={s.item}
                  pressedScale={0.9}
                  accessibilityRole="tab"
                  accessibilityLabel={item.label}
                  accessibilityState={{ selected: focused }}
                  testID={`dock-${item.route}`}
                  onPress={() => {
                    if (!route) return;
                    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                    if (!focused && !event.defaultPrevented) {
                      haptic.select();
                      navigation.navigate(item.route as never);
                    }
                  }}
                >
                  <Icon
                    name={focused ? item.symbolActive : item.symbol}
                    fallback={item.fallback}
                    size={21}
                    color={focused ? colors.thread : colors.ink}
                  />
                  <Text variant="caption" tone={focused ? 'thread' : 'secondary'} style={s.label} numberOfLines={1}>
                    {item.label}
                  </Text>
                </PressableScale>
              );
            })}
          </View>
        </Glass>
        <Glass radius={ADD_SIZE / 2} interactive tint={colors.thread} style={s.add}>
          <PressableScale
            style={s.addHit}
            pressedScale={0.88}
            hapticOnPress
            accessibilityLabel="Save a place"
            accessibilityHint="Search for a place to add to your map"
            testID="dock-add"
            onPress={() => router.push('/pin/search')}
          >
            <Icon name="plus" fallback="+" size={24} weight="semibold" color={colors.onThread} />
          </PressableScale>
        </Glass>
      </GlassGroup>
    </View>
  );
}

const useStyles = makeStyles(() =>
  StyleSheet.create({
    wrap: { position: 'absolute', left: GUTTER, right: GUTTER },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dock: { flex: 1, height: DOCK.height },
    items: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    pill: { position: 'absolute', top: 6, bottom: 6, left: 0, borderRadius: 999 },
    item: { flex: 1, height: DOCK.height, alignItems: 'center', justifyContent: 'center', gap: 2 },
    label: { fontSize: 10, lineHeight: 12, fontWeight: '600' },
    add: { width: ADD_SIZE, height: ADD_SIZE },
    addHit: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  }),
);
