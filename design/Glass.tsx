import { ReactNode } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { GlassContainer, GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { useTheme } from './theme';
import { RADIUS } from './tokens';

/**
 * Filo's glass material, in three honest tiers (see docs/GLASS.md):
 *
 *  1. NATIVE LIQUID GLASS — iOS 26+: expo-glass-effect renders UIKit's
 *     UIGlassEffect. Real lensing/refraction of the map underneath,
 *     system specular highlights, and (with `interactive`) the system's
 *     touch-driven shimmer. Nothing here fakes those optics.
 *  2. BLUR FALLBACK — older iOS / Android: a UIVisualEffect / RenderEffect
 *     blur, a light tint for legibility over busy map tiles, a hairline
 *     border and a top-edge highlight. Frosted, not refractive — and we
 *     don't pretend otherwise.
 *  3. SOLID — when Reduce Transparency is on: opaque surface + hairline.
 *
 * Use glass for floating chrome only (search capsule, dock, chips, sheet
 * header). Long-form content sits on solid surfaces.
 */

export type GlassTier = 'native' | 'blur' | 'solid';

let nativeGlass: boolean | null = null;
export function supportsNativeGlass(): boolean {
  if (nativeGlass === null) {
    try {
      nativeGlass = Platform.OS === 'ios' && isLiquidGlassAvailable();
    } catch {
      nativeGlass = false;
    }
  }
  return nativeGlass;
}

export function useGlassTier(): GlassTier {
  const { reduceTransparency } = useTheme();
  if (reduceTransparency) return 'solid';
  return supportsNativeGlass() ? 'native' : 'blur';
}

interface GlassProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Corner radius; defaults to a capsule. */
  radius?: number;
  /** 'clear' lets more of the map through (chips over imagery). */
  variant?: 'regular' | 'clear';
  /** Native touch response (buttons, dock). */
  interactive?: boolean;
  /** Tint layered into the material, e.g. the thread for a selected state. */
  tint?: string;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
  testID?: string;
}

export function Glass({
  children,
  style,
  radius = RADIUS.capsule,
  variant = 'regular',
  interactive = false,
  tint,
  pointerEvents,
  testID,
}: GlassProps) {
  const tier = useGlassTier();
  const { colors, dark } = useTheme();
  const shape: ViewStyle = { borderRadius: radius, overflow: 'hidden' };

  if (tier === 'native') {
    return (
      <GlassView
        testID={testID}
        pointerEvents={pointerEvents}
        glassEffectStyle={variant}
        isInteractive={interactive}
        tintColor={tint}
        colorScheme={dark ? 'dark' : 'light'}
        style={[shape, style]}
      >
        {children}
      </GlassView>
    );
  }

  if (tier === 'solid') {
    return (
      <View
        testID={testID}
        pointerEvents={pointerEvents}
        style={[
          shape,
          { backgroundColor: tint ?? colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.hairline },
          style,
        ]}
      >
        {children}
      </View>
    );
  }

  return (
    <View testID={testID} pointerEvents={pointerEvents} style={[shape, style]}>
      <BlurView
        tint={dark ? 'systemThinMaterialDark' : 'systemThinMaterialLight'}
        intensity={variant === 'clear' ? 40 : 70}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: tint ?? colors.glassTint,
            opacity: variant === 'clear' ? 0.6 : 1,
            borderRadius: radius,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.hairline,
            borderTopColor: colors.glassEdge,
          },
        ]}
      />
      {children}
    </View>
  );
}

/**
 * Groups adjacent glass shapes so iOS 26 can blend/morph them as one
 * material (e.g. the dock + its separate "add" button). A plain View
 * elsewhere.
 */
export function GlassGroup({
  children,
  spacing = 12,
  style,
}: {
  children: ReactNode;
  spacing?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const tier = useGlassTier();
  if (tier === 'native') {
    return (
      <GlassContainer spacing={spacing} style={style}>
        {children}
      </GlassContainer>
    );
  }
  return <View style={style}>{children}</View>;
}
