import { ReactNode, useCallback } from 'react';
import {
  AccessibilityActionEvent,
  AccessibilityActionInfo,
  AccessibilityRole,
  AccessibilityState,
  Platform,
  Pressable,
  StyleProp,
  Text as RNText,
  TextProps as RNTextProps,
  TextStyle,
  ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { SymbolView, SymbolWeight } from 'expo-symbols';
import { useTheme } from './theme';
import { MOTION, TYPE } from './tokens';

// ─── Haptics ──────────────────────────────────────────────────────────
// Meaningful moments only: selection change, save/commit, rank drop.
export const haptic = {
  select: () => { Haptics.selectionAsync().catch(() => {}); },
  tap: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); },
  commit: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
  warn: () => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); },
};

// ─── PressableScale ───────────────────────────────────────────────────
interface PressableScaleProps {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Scale at full press; 1 disables compression. */
  pressedScale?: number;
  hitSlop?: number;
  accessibilityRole?: AccessibilityRole;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  /** Non-gesture alternatives (VoiceOver rotor actions). */
  accessibilityActions?: AccessibilityActionInfo[];
  onAccessibilityAction?: (e: AccessibilityActionEvent) => void;
  testID?: string;
  /** Fire a light impact on press-in. */
  hapticOnPress?: boolean;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Button primitive: spring press-compression (fade under Reduce Motion). */
export function PressableScale({
  children,
  onPress,
  onLongPress,
  disabled,
  style,
  pressedScale = MOTION.pressScale,
  hitSlop,
  accessibilityRole = 'button',
  accessibilityLabel,
  accessibilityHint,
  accessibilityState,
  accessibilityActions,
  onAccessibilityAction,
  testID,
  hapticOnPress = false,
}: PressableScaleProps) {
  const { reduceMotion } = useTheme();
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    if (reduceMotion) return { opacity: 1 - pressed.value * 0.25 };
    return { transform: [{ scale: 1 - (1 - pressedScale) * pressed.value }] };
  });

  const onPressIn = useCallback(() => {
    pressed.value = reduceMotion ? withTiming(1, { duration: 80 }) : withSpring(1, MOTION.press);
    if (hapticOnPress) haptic.tap();
  }, [pressed, reduceMotion, hapticOnPress]);
  const onPressOut = useCallback(() => {
    pressed.value = reduceMotion ? withTiming(0, { duration: 120 }) : withSpring(0, MOTION.press);
  }, [pressed, reduceMotion]);

  return (
    <AnimatedPressable
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled, ...accessibilityState }}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      style={[style, animatedStyle, disabled && { opacity: 0.45 }]}
    >
      {children}
    </AnimatedPressable>
  );
}

// ─── Icon ─────────────────────────────────────────────────────────────
interface IconProps {
  /** SF Symbol name. */
  name: string;
  /** Text glyph used where SF Symbols don't exist (Android/web). */
  fallback: string;
  size?: number;
  color?: string;
  weight?: SymbolWeight;
}

export function Icon({ name, fallback, size = 20, color, weight = 'medium' }: IconProps) {
  const { colors } = useTheme();
  const tint = color ?? colors.ink;
  if (Platform.OS === 'ios') {
    return (
      <SymbolView
        name={name as never}
        size={size}
        tintColor={tint}
        weight={weight}
        resizeMode="scaleAspectFit"
        style={{ width: size, height: size }}
        fallback={<RNText style={{ fontSize: size * 0.9, color: tint }}>{fallback}</RNText>}
      />
    );
  }
  return (
    <RNText
      accessible={false}
      style={{ fontSize: size * 0.9, lineHeight: size, color: tint, width: size, textAlign: 'center' }}
    >
      {fallback}
    </RNText>
  );
}

// ─── Text ─────────────────────────────────────────────────────────────
type Variant = keyof typeof TYPE;
type Tone = 'primary' | 'secondary' | 'tertiary' | 'thread' | 'onThread' | 'danger';

interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  italic?: boolean;
  style?: StyleProp<TextStyle>;
}

/** Themed text. Dynamic Type stays on; very large sizes are capped. */
export function Text({ variant = 'body', tone = 'primary', italic, style, ...rest }: TextProps) {
  const { colors } = useTheme();
  const color = {
    primary: colors.ink,
    secondary: colors.inkSecondary,
    tertiary: colors.inkTertiary,
    thread: colors.thread,
    onThread: colors.onThread,
    danger: colors.danger,
  }[tone];
  const base = TYPE[variant];
  const italicStyle: TextStyle | undefined = italic
    ? base.fontFamily?.startsWith('Fraunces')
      ? { fontFamily: 'Fraunces-Italic' }
      : { fontStyle: 'italic' }
    : undefined;
  return (
    <RNText
      maxFontSizeMultiplier={variant === 'hero' || variant === 'title' ? 1.3 : 1.8}
      {...rest}
      style={[base, { color }, italicStyle, style]}
    />
  );
}
